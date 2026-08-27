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
  // 公开 API
  // ============================================================
  window.VexApiSync = {
    fetchEventId,
    fetchMatchesData
  };

  // 日志提示
  log('API 通信模块已加载');
  log('可用函数: VexApiSync.fetchEventId(sku, token), VexApiSync.fetchMatchesData(eventId, token)');

})();
