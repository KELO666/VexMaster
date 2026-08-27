/**
 * VEX API 通信模块 (vex-api-sync.js)
 * 
 * 功能：与 VEX Events API 通信，获取赛事和比赛数据
 * 环境：纯前端，兼容 iOS Safari / 老款 iPad
 * 
 * 架构说明：
 * - 纯异步网络请求封装
 * - 自动分页逻辑
 * - Bearer Token 认证
 * 
 * API 端点：
 * - GET /events?sku={sku} -> 获取赛事 ID
 * - GET /events/{eventId}/divisions/1/matches -> 获取比赛数据
 */

(function() {
  'use strict';

  // ============================================================
  // 配置常量
  // ============================================================
  const API_BASE = 'https://events.vex.com/api/v2';
  const LOG_PREFIX = '[VexApiSync]';

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
  // API 通信模块
  // ============================================================

  /**
   * 通过 SKU 获取赛事 ID
   * 
   * @param {string} sku - 赛事 SKU (如 "RE-VIQRC-26-5111")
   * @param {string} token - API Bearer Token
   * @returns {Promise<number>} 赛事 ID
   * 
   * @example
   * const eventId = await fetchEventId('RE-VIQRC-26-5111', 'your-token');
   * console.log('赛事 ID:', eventId);
   */
  async function fetchEventId(sku, token) {
    log(`开始获取赛事 ID: SKU = ${sku}`);

    // 参数校验
    if (!sku || typeof sku !== 'string') {
      throw new Error('SKU 参数无效');
    }
    if (!token || typeof token !== 'string') {
      throw new Error('Token 参数无效');
    }

    // 构建请求 URL
    const url = `${API_BASE}/events?sku=${encodeURIComponent(sku)}`;
    log(`请求 URL: ${url}`);

    try {
      // 发起 GET 请求
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      // 检查响应状态
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // 解析 JSON
      const data = await response.json();
      log('API 响应数据:', data);

      // 提取赛事 ID
      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error(`未找到 SKU 为 ${sku} 的赛事`);
      }

      const firstEvent = data.data[0];
      const eventId = firstEvent.id;

      if (!eventId || typeof eventId !== 'number') {
        throw new Error('无法提取有效的赛事 ID');
      }

      logSuccess(`获取赛事 ID 成功: ${eventId} (${firstEvent.name || '未知赛事'})`);
      return eventId;

    } catch (error) {
      logError(`获取赛事 ID 失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取赛事的所有比赛数据（支持自动分页）
   * 
   * @param {number} eventId - 赛事 ID
   * @param {string} token - API Bearer Token
   * @returns {Promise<Array>} 比赛数据数组
   * 
   * @example
   * const matches = await fetchMatchesData(12345, 'your-token');
   * console.log('比赛数量:', matches.length);
   */
  async function fetchMatchesData(eventId, token) {
    log(`开始获取赛事比赛数据: eventId = ${eventId}`);

    // 参数校验
    if (!eventId || typeof eventId !== 'number') {
      throw new Error('EventId 参数无效');
    }
    if (!token || typeof token !== 'string') {
      throw new Error('Token 参数无效');
    }

    let allMatches = [];
    let currentPage = 1;
    let lastPage = 1;

    try {
      // 循环获取所有页面的数据
      do {
        // 构建请求 URL
        const url = `${API_BASE}/events/${eventId}/divisions/1/matches?page=${currentPage}`;
        log(`请求第 ${currentPage}/${lastPage} 页: ${url}`);

        // 发起 GET 请求
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        // 检查响应状态
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // 解析 JSON
        const data = await response.json();
        log(`第 ${currentPage} 页响应数据长度: ${JSON.stringify(data).length}`);

        // 提取比赛数据
        if (!data || !data.data || !Array.isArray(data.data)) {
          log(`第 ${currentPage} 页无数据，停止分页`);
          break;
        }

        // 追加到总数组
        allMatches = allMatches.concat(data.data);
        log(`第 ${currentPage} 页数据: ${data.data.length} 场比赛，累计: ${allMatches.length} 场`);

        // 更新分页信息
        if (data.meta && data.meta.last_page) {
          lastPage = data.meta.last_page;
          log(`分页信息: 当前页 ${currentPage}/${lastPage}`);
        }

        // 下一页
        currentPage++;

      } while (currentPage <= lastPage);

      logSuccess(`获取赛事比赛数据完成: 共 ${allMatches.length} 场比赛`);
      return allMatches;

    } catch (error) {
      logError(`获取赛事比赛数据失败: ${error.message}`);
      throw error;
    }
  }

  // ============================================================
  // 数据合并模块
  // ============================================================

  /**
   * 将 API 比赛数据静默合并到本地 LocalStorage
   * 
   * @param {Array} apiMatchesData - 从 fetchMatchesData 获取的全量 JSON 数组
   * @returns {number} 更新的比赛场次数量
   * 
   * 本地存储格式:
   * - vex_scores_ios: { "Q1_53168C": "236", "Q2_12345A": "100", ... }
   * - vex_done_ios: { "Q1": true, "Q2": true, ... }
   */
  function syncScoresToLocal(apiMatchesData) {
    log('开始同步比分到本地...');

    // 参数校验
    if (!apiMatchesData || !Array.isArray(apiMatchesData)) {
      logError('API 比赛数据无效');
      return 0;
    }

    // 1. 从 localStorage 读取现有数据
    let scoresDb = {};
    let doneDb = {};

    try {
      const scoresJson = localStorage.getItem('vex_scores_ios');
      const doneJson = localStorage.getItem('vex_done_ios');

      if (scoresJson) {
        scoresDb = JSON.parse(scoresJson);
        log(`读取现有比分数据: ${Object.keys(scoresDb).length} 条`);
      }
      if (doneJson) {
        doneDb = JSON.parse(doneJson);
        log(`读取现有完赛状态: ${Object.keys(doneDb).length} 条`);
      }
    } catch (e) {
      logError('读取 LocalStorage 失败:', e);
      // 继续执行，使用空对象
    }

    let updatedCount = 0;

    // 2. 遍历 API 比赛数据
    for (const apiMatch of apiMatchesData) {
      // 提取 matchnum，拼接为本地格式 matchId
      // API 返回的 matchnum 是数字（如 1），本地格式是 "Q1"
      let matchId = '';
      if (apiMatch.matchnum) {
        matchId = `Q${apiMatch.matchnum}`;
      } else if (apiMatch.name) {
        // 如果没有 matchnum，尝试使用 name 字段
        matchId = apiMatch.name;
      } else {
        log('跳过无编号的比赛:', apiMatch);
        continue;
      }

      // 遍历该场比赛的 alliances（红、蓝联盟）
      if (!apiMatch.alliances || !Array.isArray(apiMatch.alliances)) {
        log(`比赛 ${matchId} 无联盟数据，跳过`);
        continue;
      }

      for (const alliance of apiMatch.alliances) {
        // 获取该联盟的 score
        const score = alliance.score || 0;

        // 获取该联盟下的 teams
        if (!alliance.teams || !Array.isArray(alliance.teams)) {
          continue;
        }

        // 遍历队伍，更新比分
        for (const team of alliance.teams) {
          // 提取队伍号 team.name（如 "53168C"）
          const teamName = team.team ? team.team.name : (team.name || '');
          if (!teamName) {
            continue;
          }

          // 关键覆盖：将比分写入本地比分对象
          const scoreKey = `${matchId}_${teamName}`;
          scoresDb[scoreKey] = String(score);
          log(`更新比分: ${scoreKey} = ${score}`);

          updatedCount++;
        }

        // 状态更新：如果 score 大于 0，将完赛状态写入本地对象
        if (score > 0) {
          doneDb[matchId] = true;
          log(`更新完赛状态: ${matchId} = true`);
        }
      }
    }

    // 3. 将更新后的数据写回 localStorage
    try {
      localStorage.setItem('vex_scores_ios', JSON.stringify(scoresDb));
      localStorage.setItem('vex_done_ios', JSON.stringify(doneDb));
      logSuccess(`同步完成: 更新了 ${updatedCount} 条比分记录`);
    } catch (e) {
      logError('写入 LocalStorage 失败:', e);
    }

    return updatedCount;
  }

  /**
   * 一键同步完整流程
   * 
   * @param {string} sku - 赛事 SKU (如 "RE-VIQRC-26-5111")
   * @param {string} token - API Bearer Token
   * @returns {Promise<object>} 同步结果 { success: boolean, count: number, message: string }
   * 
   * @example
   * const result = await VexApiSync.runFullSync('RE-VIQRC-26-5111', 'your-token');
   * console.log(result.message); // "同步成功，更新了 45 场比赛的比分"
   */
  async function runFullSync(sku, token) {
    log('开始一键同步...');

    // 1. 校验 sku 和 token 是否为空
    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
      const msg = 'SKU 参数无效';
      logError(msg);
      return { success: false, count: 0, message: msg };
    }
    if (!token || typeof token !== 'string' || token.trim() === '') {
      const msg = 'Token 参数无效';
      logError(msg);
      return { success: false, count: 0, message: msg };
    }

    try {
      // 2. 获取赛事 ID
      log('步骤 1/3: 获取赛事 ID...');
      const eventId = await fetchEventId(sku, token);
      log(`获取到赛事 ID: ${eventId}`);

      // 3. 获取完整赛程
      log('步骤 2/3: 获取完整赛程...');
      const matches = await fetchMatchesData(eventId, token);
      log(`获取到 ${matches.length} 场比赛数据`);

      // 4. 执行静默写入
      log('步骤 3/3: 同步比分到本地...');
      const count = syncScoresToLocal(matches);

      // 返回成功标识
      const msg = `同步成功，更新了 ${count} 条比分记录`;
      logSuccess(msg);
      return { success: true, count, message: msg };

    } catch (error) {
      const msg = `同步失败: ${error.message}`;
      logError(msg);
      return { success: false, count: 0, message: msg };
    }
  }

  // ============================================================
  // 云端赛程生成模块
  // ============================================================

  /**
   * 从 API 数据生成本地赛程
   * 
   * @param {Array} apiMatchesData - 从 fetchMatchesData 获取的全量 JSON 数组
   * @returns {number} 生成的比赛场次数量
   * 
   * 本地存储格式:
   * vex_matches_ios: [
   *   { matchId: "Q1", field: "Field A", time: "周六 10:00 AM", team1: "53168C", team2: "12345A", division: "初中" },
   *   ...
   * ]
   */
  function generateScheduleFromApi(apiMatchesData) {
    log('开始从 API 生成赛程...');

    // 参数校验
    if (!apiMatchesData || !Array.isArray(apiMatchesData)) {
      logError('API 比赛数据无效');
      return 0;
    }

    let newGlobalMatches = [];

    // 遍历 API 比赛数据
    for (const apiMatch of apiMatchesData) {
      // 1. 提取 matchnum，转为本地格式 matchId
      let matchId = '';
      if (apiMatch.matchnum) {
        matchId = `Q${apiMatch.matchnum}`;
      } else if (apiMatch.name) {
        matchId = apiMatch.name;
      } else {
        log('跳过无编号的比赛:', apiMatch);
        continue;
      }

      // 2. 提取 field（场地）
      let field = '';
      if (apiMatch.field) {
        field = apiMatch.field;
      } else if (apiMatch.fieldname) {
        field = apiMatch.fieldname;
      } else {
        field = '默认场地';
      }

      // 3. 提取 scheduled 时间，格式化为友好的展示时间
      let time = '';
      if (apiMatch.scheduled) {
        try {
          const scheduledDate = new Date(apiMatch.scheduled);
          const hours = scheduledDate.getHours();
          const minutes = scheduledDate.getMinutes();
          const dayOfWeek = scheduledDate.getDay();
          
          // 星期映射
          const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
          const dayStr = dayNames[dayOfWeek];
          
          // 时间格式化
          const period = hours >= 12 ? 'PM' : 'AM';
          const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
          const displayMinutes = minutes.toString().padStart(2, '0');
          
          time = `周${dayStr} ${displayHours}:${displayMinutes} ${period}`;
        } catch (e) {
          logError('时间解析失败:', e);
          time = '待定';
        }
      } else {
        time = '待定';
      }

      // 4. 遍历 alliances，提取队伍号
      let team1 = '';
      let team2 = '';

      if (apiMatch.alliances && Array.isArray(apiMatch.alliances)) {
        // 收集所有队伍号
        let allTeams = [];

        for (const alliance of apiMatch.alliances) {
          if (alliance.teams && Array.isArray(alliance.teams)) {
            for (const team of alliance.teams) {
              const teamName = team.team ? team.team.name : (team.name || '');
              if (teamName) {
                allTeams.push(teamName);
              }
            }
          }
        }

        // 拼装成本地需要的对阵格式
        if (allTeams.length >= 2) {
          team1 = allTeams[0];
          team2 = allTeams[1];
        } else if (allTeams.length === 1) {
          team1 = allTeams[0];
          team2 = 'TBD';
        } else {
          team1 = 'TBD';
          team2 = 'TBD';
        }
      } else {
        team1 = 'TBD';
        team2 = 'TBD';
      }

      // 5. 组装本地单场比赛对象
      const matchObj = {
        matchId: matchId,
        field: field,
        time: time,
        timeValue: 0, // 可后续扩展
        team1: team1,
        team2: team2,
        division: '' // 可后续扩展
      };

      newGlobalMatches.push(matchObj);
    }

    log(`生成了 ${newGlobalMatches.length} 场比赛`);

    // 6. 将组装好的赛程覆盖写入 LocalStorage
    try {
      localStorage.setItem('vex_matches_ios', JSON.stringify(newGlobalMatches));
      logSuccess('赛程已写入 LocalStorage');
    } catch (e) {
      logError('写入 LocalStorage 失败:', e);
    }

    // 7. 顺便调用 syncScoresToLocal 更新比分
    log('同时更新比分数据...');
    syncScoresToLocal(apiMatchesData);

    return newGlobalMatches.length;
  }

  // ============================================================
  // 公开 API
  // ============================================================
  window.VexApiSync = {
    fetchEventId,
    fetchMatchesData,
    syncScoresToLocal,
    runFullSync,
    generateScheduleFromApi
  };

  // 日志提示
  log('API 通信模块已加载');
  log('可用函数:');
  log('  - VexApiSync.fetchEventId(sku, token)');
  log('  - VexApiSync.fetchMatchesData(eventId, token)');
  log('  - VexApiSync.syncScoresToLocal(apiMatchesData)');
  log('  - VexApiSync.runFullSync(sku, token)');
  log('  - VexApiSync.generateScheduleFromApi(apiMatchesData)');

})();
