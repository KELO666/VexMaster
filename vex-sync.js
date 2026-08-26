/**
 * VEX 赛程同步模块 (vex-sync.js)
 * 
 * 功能：从 VEX Events API 获取实时比分数据，与本地数据安全合并
 * 环境：纯前端，兼容 iOS Safari / 老款 iPad
 * 
 * 架构说明：
 * - API 通信层：带 Bearer Token 的 fetch 请求
 * - 数据合并层：安全的比分覆盖逻辑
 * - UI 交互层：SKU 绑定框和同步按钮
 * 
 * 使用方式：
 * 1. 在 index.html 中引入此脚本
 * 2. 调用 window.vexSync.bindSKU('RE-VIQRC-26-5111') 绑定赛事
 * 3. 调用 window.vexSync.syncScores() 同步比分
 */

(function() {
  'use strict';

  // ============================================================
  // 配置常量
  // ============================================================
  const API_BASE = 'https://events.vex.com/api/v2';
  const STORAGE_KEY = 'vex_sync_config';
  const LOG_PREFIX = '[VexSync]';

  // ============================================================
  // 内部状态
  // ============================================================
  let config = {
    sku: '',
    eventId: '',
    authToken: ''
  };

  // ============================================================
  // 日志工具
  // ============================================================
  function log(message, ...args) {
    console.log(`${LOG_PREFIX} ${message}`, ...args);
  }

  function logError(message, ...args) {
    console.error(`${LOG_PREFIX} ❌ ${message}`, ...args);
  }

  function logSuccess(message, ...args) {
    console.log(`${LOG_PREFIX} ✅ ${message}`, ...args);
  }

  // ============================================================
  // 配置管理
  // ============================================================
  function loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        config = JSON.parse(saved);
        log('已加载配置:', config);
      }
    } catch (e) {
      logError('加载配置失败:', e);
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      log('配置已保存');
    } catch (e) {
      logError('保存配置失败:', e);
    }
  }

  // ============================================================
  // API 通信层
  // ============================================================
  
  /**
   * 通用 API 请求函数
   * @param {string} endpoint - API 端点
   * @param {object} options - 请求选项
   * @returns {Promise<object>} 响应数据
   */
  async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.authToken}`,
      ...options.headers
    };

    log(`发送请求: ${options.method || 'GET'} ${url}`);

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      log(`请求成功，数据长度: ${JSON.stringify(data).length}`);
      return data;
    } catch (error) {
      logError(`请求失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 通过 SKU 获取 Event ID
   * @param {string} sku - 赛事 SKU
   * @returns {Promise<object>} 事件数据
   */
  async function getEventBySKU(sku) {
    log(`通过 SKU 获取事件: ${sku}`);
    
    const data = await apiRequest(`/events/search?sku[]=${encodeURIComponent(sku)}`);
    
    if (!data || !data.data || data.data.length === 0) {
      throw new Error(`未找到 SKU 为 ${sku} 的赛事`);
    }

    const event = data.data[0];
    logSuccess(`找到事件: ${event.name} (ID: ${event.id})`);
    
    config.eventId = event.id;
    saveConfig();
    
    return event;
  }

  /**
   * 获取赛事的所有比赛数据（支持分页）
   * @param {string} eventId - 事件 ID
   * @returns {Promise<Array>} 比赛数据数组
   */
  async function getEventMatches(eventId) {
    log(`获取赛事比赛数据: ${eventId}`);
    
    let allMatches = [];
    let page = 1;
    let lastPage = 1;

    do {
      log(`获取第 ${page}/${lastPage} 页数据...`);
      
      const data = await apiRequest(`/events/${eventId}/matches?page=${page}&per_page=100`);
      
      if (!data || !data.data) {
        logError('获取比赛数据失败');
        break;
      }

      allMatches = allMatches.concat(data.data);
      
      // 解析分页信息
      if (data.meta) {
        lastPage = data.meta.last_page || 1;
        log(`分页信息: 当前页 ${page}/${lastPage}, 本页数据 ${data.data.length} 条`);
      }
      
      page++;
    } while (page <= lastPage);

    logSuccess(`共获取 ${allMatches.length} 场比赛数据`);
    return allMatches;
  }

  // ============================================================
  // 数据合并层
  // ============================================================

  /**
   * 从 API 返回的比赛中提取分数
   * @param {object} apiMatch - API 返回的比赛对象
   * @returns {object} 提取的分数数据
   */
  function extractScoresFromAPIMatch(apiMatch) {
    const scores = {
      matchId: '',
      redScore: 0,
      blueScore: 0,
      redTeams: [],
      blueTeams: []
    };

    // 提取比赛编号
    if (apiMatch.matchnum) {
      scores.matchId = `Q${apiMatch.matchnum}`;
    } else if (apiMatch.name) {
      scores.matchId = apiMatch.name;
    }

    // 提取红蓝方数据
    if (apiMatch.alliances) {
      apiMatch.alliances.forEach(alliance => {
        if (alliance.color === 'red') {
          scores.redScore = alliance.score || 0;
          scores.redTeams = (alliance.teams || []).map(t => t.team ? t.team.number : t.team_id);
        } else if (alliance.color === 'blue') {
          scores.blueScore = alliance.score || 0;
          scores.blueTeams = (alliance.teams || []).map(t => t.team ? t.team.number : t.team_id);
        }
      });
    }

    return scores;
  }

  /**
   * 安全合并比分数据到本地 scoresDb
   * @param {Array} apiMatches - API 返回的比赛数据
   * @returns {number} 更新的比赛数量
   */
  function mergeScoresToLocalStorage(apiMatches) {
    log('开始合并比分数据...');
    
    // 获取全局变量
    const globalMatches = window.globalMatches || [];
    const scoresDb = window.scoresDb || {};
    const myTeams = window.myTeams || [];

    if (!globalMatches || globalMatches.length === 0) {
      logError('本地没有比赛数据，请先导入 PDF');
      return 0;
    }

    let updatedCount = 0;

    // 遍历 API 返回的比赛
    for (const apiMatch of apiMatches) {
      const apiData = extractScoresFromAPIMatch(apiMatch);
      
      if (!apiData.matchId) {
        log('跳过无编号的比赛:', apiMatch);
        continue;
      }

      // 在本地比赛中查找匹配
      const localMatch = globalMatches.find(m => {
        // 匹配比赛编号
        if (m.matchId !== apiData.matchId) return false;

        // 二次校验：检查队伍号是否匹配
        const localTeams = [m.team1, m.team2].map(t => t.replace(/[^A-Z0-9]/gi, ''));
        const apiTeams = [...apiData.redTeams, ...apiData.blueTeams].map(t => String(t).replace(/[^A-Z0-9]/gi, ''));
        
        // 检查是否有重叠的队伍
        const hasOverlap = localTeams.some(lt => apiTeams.some(at => 
          lt.toLowerCase() === at.toLowerCase()
        ));

        return hasOverlap;
      });

      if (!localMatch) {
        log(`未找到本地匹配: ${apiData.matchId}`);
        continue;
      }

      // 更新红方分数
      if (apiData.redTeams.length > 0) {
        const redTeam = apiData.redTeams[0];
        const redKey = `${localMatch.matchId}_${localMatch.team1}`;
        
        // 校验队伍号是否匹配
        if (String(redTeam).toLowerCase() === localMatch.team1.toLowerCase()) {
          scoresDb[redKey] = String(apiData.redScore);
          log(`更新红方得分: ${redKey} = ${apiData.redScore}`);
        }
      }

      // 更新蓝方分数
      if (apiData.blueTeams.length > 0) {
        const blueTeam = apiData.blueTeams[0];
        const blueKey = `${localMatch.matchId}_${localMatch.team2}`;
        
        // 校验队伍号是否匹配
        if (String(blueTeam).toLowerCase() === localMatch.team2.toLowerCase()) {
          scoresDb[blueKey] = String(apiData.blueScore);
          log(`更新蓝方得分: ${blueKey} = ${apiData.blueScore}`);
        }
      }

      updatedCount++;
    }

    logSuccess(`合并完成，更新了 ${updatedCount} 场比赛的比分`);
    return updatedCount;
  }

  // ============================================================
  // UI 交互层
  // ============================================================

  /**
   * 创建同步按钮和 SKU 绑定框
   */
  function createSyncUI() {
    log('创建同步 UI...');

    // 查找大师总表页面
    const masterPage = document.getElementById('page-master');
    if (!masterPage) {
      logError('未找到大师总表页面');
      return;
    }

    // 创建同步控制区
    const syncContainer = document.createElement('div');
    syncContainer.className = 'card';
    syncContainer.style.cssText = 'margin-bottom: 12px; padding: 12px;';
    syncContainer.innerHTML = `
      <div class="card-title">
        <span>🌐 云端同步</span>
        <button id="vex-sync-btn" class="btn-primary" style="background: #10b981; font-size: 13px; padding: 6px 12px;">
          同步比分
        </button>
      </div>
      <div class="input-group" style="margin-top: 8px;">
        <input type="text" id="vex-sku-input" placeholder="赛事 SKU (如 RE-VIQRC-26-5111)" 
               style="font-size: 14px; padding: 8px 12px;" value="${config.sku || ''}">
        <button id="vex-bind-btn" class="btn-primary" style="background: #3b82f6; font-size: 13px; padding: 6px 12px;">
          绑定
        </button>
      </div>
      <div id="vex-sync-status" style="margin-top: 8px; font-size: 12px; color: #666; display: none;">
        状态: <span id="vex-sync-status-text">就绪</span>
      </div>
    `;

    // 插入到大师总表页面顶部
    masterPage.insertBefore(syncContainer, masterPage.firstChild);

    // 绑定事件
    document.getElementById('vex-sync-btn').addEventListener('click', handleSyncClick);
    document.getElementById('vex-bind-btn').addEventListener('click', handleBindClick);

    logSuccess('同步 UI 创建完成');
  }

  /**
   * 处理同步按钮点击
   */
  async function handleSyncClick() {
    const btn = document.getElementById('vex-sync-btn');
    const statusDiv = document.getElementById('vex-sync-status');
    const statusText = document.getElementById('vex-sync-status-text');

    if (!config.sku) {
      alert('请先绑定赛事 SKU');
      return;
    }

    if (!config.authToken) {
      alert('请先设置 API Token\n\n获取方式:\n1. 访问 https://events.vex.com/api/v2\n2. 点击 "Request Access"\n3. 获取 Bearer Token');
      return;
    }

    // 显示状态
    statusDiv.style.display = 'block';
    statusText.innerText = '同步中...';
    statusText.style.color = '#f59e0b';
    btn.disabled = true;
    btn.innerText = '同步中...';

    try {
      // 1. 获取 Event ID（如果还没有）
      if (!config.eventId) {
        statusText.innerText = '正在获取赛事信息...';
        await getEventBySKU(config.sku);
      }

      // 2. 获取比赛数据
      statusText.innerText = '正在获取比赛数据...';
      const apiMatches = await getEventMatches(config.eventId);

      // 3. 合并比分
      statusText.innerText = '正在合并比分...';
      const updatedCount = mergeScoresToLocalStorage(apiMatches);

      // 4. 保存数据并刷新 UI
      if (window.saveData) window.saveData();
      if (window.renderSingleTeam) window.renderSingleTeam();
      if (window.renderMasterTimeline) window.renderMasterTimeline();

      // 成功
      statusText.innerText = `同步完成，更新了 ${updatedCount} 场比赛`;
      statusText.style.color = '#10b981';
      logSuccess(`同步完成，更新了 ${updatedCount} 场比赛`);

    } catch (error) {
      statusText.innerText = `同步失败: ${error.message}`;
      statusText.style.color = '#ef4444';
      logError('同步失败:', error);
    } finally {
      btn.disabled = false;
      btn.innerText = '同步比分';
    }
  }

  /**
   * 处理绑定按钮点击
   */
  async function handleBindClick() {
    const skuInput = document.getElementById('vex-sku-input');
    const statusDiv = document.getElementById('vex-sync-status');
    const statusText = document.getElementById('vex-sync-status-text');

    const sku = skuInput.value.trim();
    if (!sku) {
      alert('请输入赛事 SKU');
      return;
    }

    // 提示输入 Token
    const token = prompt('请输入 VEX Events API Token:\n\n获取方式:\n1. 访问 https://events.vex.com/api/v2\n2. 点击 "Request Access"\n3. 获取 Bearer Token');
    
    if (!token) {
      alert('需要 API Token 才能访问数据');
      return;
    }

    // 更新配置
    config.sku = sku;
    config.authToken = token;
    config.eventId = ''; // 重置 Event ID
    saveConfig();

    // 显示状态
    statusDiv.style.display = 'block';
    statusText.innerText = '正在验证 SKU...';
    statusText.style.color = '#f59e0b';

    try {
      // 验证 SKU
      await getEventBySKU(sku);
      statusText.innerText = `绑定成功: ${config.eventId}`;
      statusText.style.color = '#10b981';
      logSuccess(`绑定成功: ${sku} -> ${config.eventId}`);
    } catch (error) {
      statusText.innerText = `绑定失败: ${error.message}`;
      statusText.style.color = '#ef4444';
      logError('绑定失败:', error);
    }
  }

  // ============================================================
  // 公开 API
  // ============================================================
  window.vexSync = {
    /**
     * 绑定赛事 SKU
     * @param {string} sku - 赛事 SKU
     * @param {string} token - API Token（可选）
     */
    async bindSKU(sku, token) {
      config.sku = sku;
      if (token) config.authToken = token;
      config.eventId = '';
      saveConfig();
      
      if (config.authToken) {
        await getEventBySKU(sku);
      }
    },

    /**
     * 同步比分数据
     */
    async syncScores() {
      await handleSyncClick();
    },

    /**
     * 获取当前配置
     */
    getConfig() {
      return { ...config };
    },

    /**
     * 清除配置
     */
    clearConfig() {
      config = { sku: '', eventId: '', authToken: '' };
      localStorage.removeItem(STORAGE_KEY);
      log('配置已清除');
    }
  };

  // ============================================================
  // 初始化
  // ============================================================
  function init() {
    log('模块初始化...');
    loadConfig();
    
    // 等待 DOM 加载完成后创建 UI
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createSyncUI);
    } else {
      createSyncUI();
    }
  }

  // 启动初始化
  init();

})();
