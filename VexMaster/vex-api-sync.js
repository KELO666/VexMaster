/**
 * VEX API 通信模块 (vex-api-sync.js)
 * 
 * 功能：与 VEX Events API 通信，获取赛事、比赛数据和排名
 * 环境：纯前端，兼容 iOS Safari / 老款 iPad
 * 
 * 架构说明：
 * - 纯异步网络请求封装
 * - 自动分页逻辑
 * - Bearer Token 认证
 * - 多赛区动态遍历
 * - 排名数据抓取
 * 
 * API 端点：
 * - GET /events?sku={sku}                        -> 获取赛事信息 (含 divisions)
 * - GET /events/{eventId}/divisions/{divId}/matches  -> 获取某赛区比赛数据
 * - GET /events/{eventId}/divisions/{divId}/rankings -> 获取某赛区排名
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
   * 通过 SKU 获取赛事信息（含赛区列表）
   * 
   * @param {string} sku - 赛事 SKU
   * @param {string} token - API Bearer Token
   * @returns {Promise<{id: number, name: string, divisions: Array}>} 赛事信息对象
   * 
   * @example
   * const info = await fetchEventId('RE-VIQRC-26-5111', 'your-token');
   * console.log(info.id, info.name, info.divisions);
   */
  async function fetchEventId(sku, token) {
    log(`开始获取赛事信息: SKU = ${sku}`);

    if (!sku || typeof sku !== 'string') {
      throw new Error('SKU 参数无效');
    }
    if (!token || typeof token !== 'string') {
      throw new Error('Token 参数无效');
    }

    const url = `${API_BASE}/events?sku=${encodeURIComponent(sku)}`;
    log(`请求 URL: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error(`未找到 SKU 为 ${sku} 的赛事`);
      }

      const firstEvent = data.data[0];
      const eventId = firstEvent.id;
      if (!eventId || typeof eventId !== 'number') {
        throw new Error('无法提取有效的赛事 ID');
      }

      // 提取赛区列表，若无 divisions 字段则回退为默认赛区
      const divisions = (firstEvent.divisions && Array.isArray(firstEvent.divisions))
        ? firstEvent.divisions
        : [{ id: 1, name: 'Division 1' }];

      const eventInfo = {
        id: eventId,
        name: firstEvent.name || '未知赛事',
        divisions: divisions
      };

      logSuccess(`获取赛事信息成功: ${eventInfo.name} (ID: ${eventId}, ${divisions.length} 个赛区)`);
      return eventInfo;

    } catch (error) {
      logError(`获取赛事信息失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取指定赛区的所有比赛数据（支持自动分页）
   * 
   * @param {number} eventId - 赛事 ID
   * @param {number} divisionId - 赛区 ID
   * @param {string} token - API Bearer Token
   * @returns {Promise<Array>} 比赛数据数组
   */
  async function fetchMatchesData(eventId, divisionId, token) {
    log(`开始获取赛事比赛数据: eventId = ${eventId}, divisionId = ${divisionId}`);

    if (!eventId || typeof eventId !== 'number') {
      throw new Error('EventId 参数无效');
    }
    if (!divisionId || typeof divisionId !== 'number') {
      throw new Error('DivisionId 参数无效');
    }
    if (!token || typeof token !== 'string') {
      throw new Error('Token 参数无效');
    }

    let allMatches = [];
    let currentPage = 1;
    let lastPage = 1;

    try {
      do {
        const url = `${API_BASE}/events/${eventId}/divisions/${divisionId}/matches?page=${currentPage}`;
        log(`请求第 ${currentPage}/${lastPage} 页: ${url}`);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (!data || !data.data || !Array.isArray(data.data)) {
          log(`第 ${currentPage} 页无数据，停止分页`);
          break;
        }

        allMatches = allMatches.concat(data.data);
        log(`第 ${currentPage} 页: ${data.data.length} 场，累计: ${allMatches.length} 场`);

        if (data.meta && data.meta.last_page) {
          lastPage = data.meta.last_page;
        }

        currentPage++;
      } while (currentPage <= lastPage);

      logSuccess(`赛区 ${divisionId} 比赛数据获取完成: 共 ${allMatches.length} 场`);
      return allMatches;

    } catch (error) {
      logError(`赛区 ${divisionId} 比赛数据获取失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取指定赛区的排名数据（自动分页，与比赛接口同一套 meta.last_page 协议）
   *
   * 注意：排名接口按页返回，不翻页会静默丢失第 2 页之后所有队伍的排名
   * （大赛区队伍数超过单页上限时表现为"排名获取不到"）。
   *
   * @param {number} eventId - 赛事 ID
   * @param {number} divisionId - 赛区 ID
   * @param {string} token - API Bearer Token
   * @returns {Promise<Array>} 排名数据数组
   */
  async function fetchRankings(eventId, divisionId, token) {
    log(`开始获取赛区排名: eventId = ${eventId}, divisionId = ${divisionId}`);

    if (!eventId || typeof eventId !== 'number') {
      throw new Error('EventId 参数无效');
    }
    if (!divisionId || typeof divisionId !== 'number') {
      throw new Error('DivisionId 参数无效');
    }
    if (!token || typeof token !== 'string') {
      throw new Error('Token 参数无效');
    }

    let allRankings = [];
    let currentPage = 1;
    let lastPage = 1;

    try {
      do {
        const url = `${API_BASE}/events/${eventId}/divisions/${divisionId}/rankings?page=${currentPage}`;
        log(`请求第 ${currentPage}/${lastPage} 页排名: ${url}`);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (!data || !data.data || !Array.isArray(data.data)) {
          log(`第 ${currentPage} 页无排名数据，停止分页`);
          break;
        }

        allRankings = allRankings.concat(data.data);
        log(`第 ${currentPage} 页: ${data.data.length} 条，累计: ${allRankings.length} 条`);

        if (data.meta && data.meta.last_page) {
          lastPage = data.meta.last_page;
        }

        currentPage++;
      } while (currentPage <= lastPage);

      logSuccess(`赛区 ${divisionId} 排名数据获取完成: 共 ${allRankings.length} 条`);
      return allRankings;

    } catch (error) {
      logError(`赛区 ${divisionId} 排名数据获取失败: ${error.message}`);
      return []; // 排名获取失败时返回空数组，不影响主流程
    }
  }

  // ============================================================
  // 数据合并模块
  // ============================================================

  /**
   * 将 API 比赛数据静默合并到本地 LocalStorage
   */
  function syncScoresToLocal(apiMatchesData) {
    log('开始同步比分到本地...');

    if (!apiMatchesData || !Array.isArray(apiMatchesData)) {
      logError('API 比赛数据无效');
      return 0;
    }

    let scoresDb = {};
    let doneDb = {};

    try {
      const scoresJson = localStorage.getItem('vex_scores_ios');
      const doneJson = localStorage.getItem('vex_done_ios');
      if (scoresJson) scoresDb = JSON.parse(scoresJson);
      if (doneJson) doneDb = JSON.parse(doneJson);
    } catch (e) {
      logError('读取 LocalStorage 失败:', e);
    }

    let updatedCount = 0;

    for (const apiMatch of apiMatchesData) {
      let matchId = apiMatch.matchnum ? `Q${apiMatch.matchnum}` : (apiMatch.name || '');
      if (!matchId) continue;
      if (!apiMatch.alliances || !Array.isArray(apiMatch.alliances)) continue;

      for (const alliance of apiMatch.alliances) {
        const score = alliance.score || 0;
        if (!alliance.teams || !Array.isArray(alliance.teams)) continue;

        for (const team of alliance.teams) {
          const teamName = team.team ? team.team.name : (team.name || '');
          if (!teamName) continue;
          scoresDb[`${matchId}_${teamName}`] = String(score);
          updatedCount++;
        }

        if (score > 0) doneDb[matchId] = true;
      }
    }

    try {
      localStorage.setItem('vex_scores_ios', JSON.stringify(scoresDb));
      localStorage.setItem('vex_done_ios', JSON.stringify(doneDb));
      logSuccess(`同步完成: 更新了 ${updatedCount} 条比分记录`);
    } catch (e) {
      logError('写入 LocalStorage 失败:', e);
    }

    return updatedCount;
  }

  // 内存缓存: 队伍号 -> 当前库中该排名来源赛区的队伍总数
  // 用于同一队伍出现在多个赛区时的冲突仲裁（见 mergeRankingsToLocalStorage）
  const rankSourceSize = {};

  /**
   * 将排名数组转换为 { 队伍号: 排名数字 } 字典格式，并存入 LocalStorage
   *
   * 排名修正:
   * 1. 只信任 entry.rank 字段。rankingsort1 是排序用的积分值而非名次，
   *    旧兜底逻辑会把积分当排名显示，导致"排名不准确"。
   * 2. 同一队伍出现在多个赛区时（如 Division A + Final），保留队伍总数
   *    更多的赛区（资格赛大分区）的排名，防止被 Final 小名单覆盖。
   *
   * 分区官方榜单 (v2.2): 传入 divisionName 时，额外把整个分区的完整排名
   * （名次/队伍号/队名/平均分）原样存入 vex_rankings_detail_ios，
   * 供排行榜页渲染官方积分榜（VEX Via 样式）。每次同步整赛区覆盖 → 实时刷新。
   * 平均分取值优先级: entry.avg_score > entry.average > entry.rankingsort1
   * （VIQRC 的 rankingsort1 即官方 Avg. Points）
   */
  function mergeRankingsToLocalStorage(apiRankingsData, divisionName) {
    log('开始合并排名数据...');

    if (!apiRankingsData || !Array.isArray(apiRankingsData)) return;

    let rankingsDb = {};

    try {
      const existing = localStorage.getItem('vex_rankings_ios');
      if (existing) rankingsDb = JSON.parse(existing);
    } catch (e) {
      logError('读取排名数据失败:', e);
    }

    // 先解析有效条目；rank 无效（缺失/0/非数字）的条目跳过
    const parsed = [];
    for (const entry of apiRankingsData) {
      const teamName = (entry.team && entry.team.name) || entry.team_name || '';
      const rank = parseInt(entry.rank, 10);
      if (teamName && Number.isFinite(rank) && rank > 0) {
        parsed.push({ teamName, rank });
      }
    }

    for (const p of parsed) {
      const sourceSize = rankSourceSize[p.teamName];
      // 首次出现直接写入；已有时仅当本次赛区规模不小于来源赛区时才覆盖
      if (sourceSize === undefined || parsed.length >= sourceSize) {
        rankingsDb[p.teamName] = p.rank;
        rankSourceSize[p.teamName] = parsed.length;
      }
    }

    try {
      localStorage.setItem('vex_rankings_ios', JSON.stringify(rankingsDb));
      logSuccess(`排名数据合并完成: 本次 ${parsed.length} 条, 库中共 ${Object.keys(rankingsDb).length} 条`);
    } catch (e) {
      logError('写入排名数据失败:', e);
    }

    // 分区官方榜单（完整排名明细，按赛区存储）
    if (divisionName) {
      // 队名映射 (来自赛事队伍接口), 排名接口本身不含队名
      let nameMap = {};
      try { nameMap = JSON.parse(localStorage.getItem('vex_team_names_ios')) || {}; } catch (e) { nameMap = {}; }

      const standings = [];
      for (const entry of apiRankingsData) {
        const team = (entry.team && entry.team.name) || entry.team_name || '';
        const rank = parseInt(entry.rank, 10);
        if (!team || !Number.isFinite(rank) || rank <= 0) continue;
        // 官方 Avg. Points: 真实字段为 average_points（VIQRC/VRC 均适用），其余为兜底
        const avgRaw = (entry.average_points !== undefined && entry.average_points !== null)
          ? entry.average_points
          : (entry.avg_score !== undefined && entry.avg_score !== null)
            ? entry.avg_score
            : (entry.average !== undefined && entry.average !== null)
              ? entry.average
              : entry.rankingsort1;
        const avg = parseFloat(avgRaw);
        standings.push({ rank, team, name: nameMap[team] || '', avg: Number.isFinite(avg) ? avg : null });
      }
      standings.sort((a, b) => a.rank - b.rank);

      let detail = {};
      try { detail = JSON.parse(localStorage.getItem('vex_rankings_detail_ios')) || {}; } catch (e) { detail = {}; }
      detail[divisionName] = standings;
      try {
        localStorage.setItem('vex_rankings_detail_ios', JSON.stringify(detail));
        logSuccess(`分区榜单已更新: ${divisionName} (${standings.length} 队)`);
      } catch (e) {
        logError('写入分区榜单失败:', e);
      }
    }
  }

  /**
   * 拉取赛事全部队伍（自动分页），返回 { 队号: 队名 } 映射
   * 排名接口不含队名，队名只能从这里拿
   */
  async function fetchTeamNames(eventId, token) {
    if (!eventId || typeof eventId !== 'number') throw new Error('EventId 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');

    const nameMap = {};
    let currentPage = 1;
    let lastPage = 1;
    try {
      do {
        const url = `${API_BASE}/events/${eventId}/teams?page=${currentPage}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        const data = await response.json();
        if (!data || !data.data || !Array.isArray(data.data)) break;
        for (const t of data.data) {
          if (t && t.number) nameMap[t.number] = t.team_name || t.organization || '';
        }
        if (data.meta && data.meta.last_page) lastPage = data.meta.last_page;
        currentPage++;
      } while (currentPage <= lastPage);
      logSuccess(`队伍名称获取完成: ${Object.keys(nameMap).length} 队`);
      return nameMap;
    } catch (error) {
      logError(`队伍名称获取失败: ${error.message}`);
      return {}; // 失败不影响主流程, 榜单队名列显示为空
    }
  }

  /**
   * 队名映射合并入库（多赛事累积 merge，不清空旧数据）
   */
  function mergeTeamNamesToLocalStorage(apiNameMap) {
    if (!apiNameMap || typeof apiNameMap !== 'object') return;
    let nameMap = {};
    try { nameMap = JSON.parse(localStorage.getItem('vex_team_names_ios')) || {}; } catch (e) { nameMap = {}; }
    Object.assign(nameMap, apiNameMap);
    try {
      localStorage.setItem('vex_team_names_ios', JSON.stringify(nameMap));
      logSuccess(`队名映射已入库: 共 ${Object.keys(nameMap).length} 队`);
    } catch (e) {
      logError('写入队名映射失败:', e);
    }
  }

  /**
   * 赛区名称极简格式化
   * 输入: eventName (如 '明德启智杯...VIQRC...'), divName (如 'Division A')
   * 输出: 如 '小学组 A区', '初中组 Final'
   */
  function formatDivisionName(eventName, divName) {
    // 1. 提取学段
    let level = '';
    const ev = eventName || '';
    if (/小学|ES/i.test(ev)) level = '小学组';
    else if (/初中|MS/i.test(ev)) level = '初中组';
    else if (/高中|HS/i.test(ev)) level = '高中组';

    // 2. 提取分区
    let div = '';
    const dn = divName || '';
    if (/Final/i.test(dn)) {
      div = 'Final';
    } else if (/Division\s+/i.test(dn)) {
      div = dn.replace(/Division\s+/i, '').trim() + '区';
    } else if (dn) {
      div = dn;
    }

    // 3. 组合返回
    if (level && div) return level + ' ' + div;
    if (level) return level;
    if (div) return div;
    // 兜底: 截断原名
    return (divName || '默认赛区').substring(0, 15);
  }

  /**
   * 一键同步完整流程（单个 SKU，多赛区）
   */
  async function runFullSync(sku, token) {
    log('开始一键同步...');

    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
      return { success: false, count: 0, message: 'SKU 参数无效' };
    }
    if (!token || typeof token !== 'string' || token.trim() === '') {
      return { success: false, count: 0, message: 'Token 参数无效' };
    }

    try {
      // 1. 获取赛事信息（含赛区列表）
      log('步骤 1/4: 获取赛事信息...');
      const eventInfo = await fetchEventId(sku, token);
      log(`赛事: ${eventInfo.name}, ${eventInfo.divisions.length} 个赛区`);

      // 1.5 抓取全赛事队名映射（榜单名称列数据源，失败不影响主流程）
      try {
        mergeTeamNamesToLocalStorage(await fetchTeamNames(eventInfo.id, token));
      } catch (e) { logError('队名抓取失败:', e.message); }

      let allMatches = [];

      // 2. 遍历每个赛区
      for (const div of eventInfo.divisions) {
        log(`拉取赛区: ${div.name} (ID: ${div.id})...`);
        const matches = await fetchMatchesData(eventInfo.id, div.id, token);

        // 在每场比赛上标注极简赛区名称
        matches.forEach(m => { m._divisionName = formatDivisionName(eventInfo.name, div.name); });

        allMatches = allMatches.concat(matches);

        // 3. 同步该赛区的排名（同时存整分区官方榜单）
        try {
          const rankings = await fetchRankings(eventInfo.id, div.id, token);
          mergeRankingsToLocalStorage(rankings, formatDivisionName(eventInfo.name, div.name));
        } catch (e) {
          logError(`赛区 ${div.name} 排名获取失败:`, e.message);
        }
      }

      // 4. 同步比分
      log('同步比分到本地...');
      const count = syncScoresToLocal(allMatches);

      const msg = `同步成功，共 ${eventInfo.divisions.length} 个赛区，更新了 ${count} 条比分记录`;
      logSuccess(msg);
      return { success: true, count, message: msg };

    } catch (error) {
      return { success: false, count: 0, message: `同步失败: ${error.message}` };
    }
  }

  // ============================================================
  // 云端赛程生成模块
  // ============================================================

  /**
   * 从 API 数据生成本地赛程
   * 注意：每场比赛的 division 字段由调用者在调用前设置（通过 _divisionName）
   */
  function generateScheduleFromApi(apiMatchesData) {
    log('开始从 API 生成赛程...');

    if (!apiMatchesData || !Array.isArray(apiMatchesData)) {
      logError('API 比赛数据无效');
      return 0;
    }

    let newGlobalMatches = [];

    for (const apiMatch of apiMatchesData) {
      let matchId = apiMatch.matchnum ? `Q${apiMatch.matchnum}` : (apiMatch.name || '');
      if (!matchId) continue;

      let field = apiMatch.field || apiMatch.fieldname || '默认场地';

      let time = '待定';
      if (apiMatch.scheduled) {
        try {
          const d = new Date(apiMatch.scheduled);
          const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
          const period = d.getHours() >= 12 ? 'PM' : 'AM';
          const h = d.getHours() > 12 ? d.getHours() - 12 : (d.getHours() === 0 ? 12 : d.getHours());
          time = `周${dayNames[d.getDay()]} ${h}:${d.getMinutes().toString().padStart(2, '0')} ${period}`;
        } catch (e) { time = '待定'; }
      }

      let team1 = 'TBD', team2 = 'TBD';
      if (apiMatch.alliances && Array.isArray(apiMatch.alliances)) {
        let allTeams = [];
        for (const alliance of apiMatch.alliances) {
          if (alliance.teams && Array.isArray(alliance.teams)) {
            for (const team of alliance.teams) {
              const teamName = team.team ? team.team.name : (team.name || '');
              if (teamName) allTeams.push(teamName);
            }
          }
        }
        if (allTeams.length >= 2) { team1 = allTeams[0]; team2 = allTeams[1]; }
        else if (allTeams.length === 1) { team1 = allTeams[0]; team2 = 'TBD'; }
      }

      // 优先使用调用者设置的 _divisionName，否则回退为默认
      const division = apiMatch._divisionName || '默认赛区';

      newGlobalMatches.push({ matchId, field, time, timeValue: 0, team1, team2, division });
    }

    log(`生成了 ${newGlobalMatches.length} 场比赛`);

    try {
      localStorage.setItem('vex_matches_ios', JSON.stringify(newGlobalMatches));
      logSuccess('赛程已写入 LocalStorage');
    } catch (e) {
      logError('写入 LocalStorage 失败:', e);
    }

    syncScoresToLocal(apiMatchesData);
    return newGlobalMatches.length;
  }

  // ============================================================
  // 公开 API
  // ============================================================
  window.VexApiSync = {
    fetchEventId,
    fetchMatchesData,
    fetchRankings,
    fetchTeamNames,
    mergeTeamNamesToLocalStorage,
    syncScoresToLocal,
    mergeRankingsToLocalStorage,
    runFullSync,
    generateScheduleFromApi,
    formatDivisionName
  };

  log('API 通信模块已加载 (多赛区 + 排名版)');
  log('可用函数:');
  log('  - VexApiSync.fetchEventId(sku, token)        -> { id, name, divisions }');
  log('  - VexApiSync.fetchMatchesData(eventId, divId, token)');
  log('  - VexApiSync.fetchRankings(eventId, divId, token)');
  log('  - VexApiSync.syncScoresToLocal(apiMatchesData)');
  log('  - VexApiSync.mergeRankingsToLocalStorage(apiRankingsData)');
  log('  - VexApiSync.runFullSync(sku, token)');
  log('  - VexApiSync.generateScheduleFromApi(apiMatchesData)');

})();
