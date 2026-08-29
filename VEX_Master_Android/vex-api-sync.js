/**
 * VEX API 通信模块 (vex-api-sync.js) — Android 版
 * 
 * 功能：与 VEX Events API 通信，获取赛事、比赛数据和排名
 * 环境：HBuilderX 容器 + H5+ 原生生态
 * 
 * v2.1 新增：多赛区动态遍历、排名抓取、赛区名称净化
 * 
 * API 端点：
 * - GET /events?sku={sku}                              -> 获取赛事信息 (含 divisions)
 * - GET /events/{eventId}/divisions/{divId}/matches    -> 获取某赛区比赛数据
 * - GET /events/{eventId}/divisions/{divId}/rankings   -> 获取某赛区排名
 */

(function() {
  'use strict';

  const API_BASE = 'https://events.vex.com/api/v2';
  const LOG_PREFIX = '[VexApiSync]';

  function log(message, ...args) { console.log(`${LOG_PREFIX} ${message}`, ...args); }
  function logError(message, ...args) { console.error(`${LOG_PREFIX} ❌ ${message}`, ...args); }
  function logSuccess(message, ...args) { console.log(`${LOG_PREFIX} ✅ ${message}`, ...args); }

  // ============================================================
  // 赛区名称极简格式化
  // ============================================================

  function formatDivisionName(eventName, divName) {
    let level = '';
    const ev = eventName || '';
    if (/小学|ES/i.test(ev)) level = '小学组';
    else if (/初中|MS/i.test(ev)) level = '初中组';
    else if (/高中|HS/i.test(ev)) level = '高中组';

    let div = '';
    const dn = divName || '';
    if (/Final/i.test(dn)) div = 'Final';
    else if (/Division\s+/i.test(dn)) div = dn.replace(/Division\s+/i, '').trim() + '区';
    else if (dn) div = dn;

    if (level && div) return level + ' ' + div;
    if (level) return level;
    if (div) return div;
    return (divName || '默认赛区').substring(0, 15);
  }

  // ============================================================
  // API 通信模块
  // ============================================================

  /**
   * 通过 SKU 获取赛事信息（含赛区列表）
   * @returns {Promise<{id: number, name: string, divisions: Array}>}
   */
  async function fetchEventId(sku, token) {
    log(`开始获取赛事信息: SKU = ${sku}`);
    if (!sku || typeof sku !== 'string') throw new Error('SKU 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');

    const url = `${API_BASE}/events?sku=${encodeURIComponent(sku)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) { const errorText = await response.text(); throw new Error(`HTTP ${response.status}: ${errorText}`); }
    const data = await response.json();
    if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) throw new Error(`未找到 SKU 为 ${sku} 的赛事`);

    const firstEvent = data.data[0];
    const eventId = firstEvent.id;
    if (!eventId || typeof eventId !== 'number') throw new Error('无法提取有效的赛事 ID');
    const divisions = (firstEvent.divisions && Array.isArray(firstEvent.divisions))
      ? firstEvent.divisions
      : [{ id: 1, name: 'Division 1' }];

    const eventInfo = { id: eventId, name: firstEvent.name || '未知赛事', divisions };
    logSuccess(`获取赛事信息成功: ${eventInfo.name} (${divisions.length} 个赛区)`);
    return eventInfo;
  }

  /**
   * 获取指定赛区的所有比赛数据（支持自动分页）
   */
  async function fetchMatchesData(eventId, divisionId, token) {
    log(`获取比赛数据: eventId=${eventId}, divisionId=${divisionId}`);
    if (!eventId || typeof eventId !== 'number') throw new Error('EventId 参数无效');
    if (!divisionId || typeof divisionId !== 'number') throw new Error('DivisionId 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');

    let allMatches = []; let currentPage = 1; let lastPage = 1;
    do {
      const url = `${API_BASE}/events/${eventId}/divisions/${divisionId}/matches?page=${currentPage}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) { const errorText = await response.text(); throw new Error(`HTTP ${response.status}: ${errorText}`); }
      const data = await response.json();
      if (!data || !data.data || !Array.isArray(data.data)) break;
      allMatches = allMatches.concat(data.data);
      if (data.meta && data.meta.last_page) lastPage = data.meta.last_page;
      currentPage++;
    } while (currentPage <= lastPage);

    logSuccess(`赛区 ${divisionId} 比赛数据获取完成: 共 ${allMatches.length} 场`);
    return allMatches;
  }

  /**
   * 获取指定赛区的排名数据
   */
  async function fetchRankings(eventId, divisionId, token) {
    log(`获取赛区排名: eventId=${eventId}, divisionId=${divisionId}`);
    if (!eventId || typeof eventId !== 'number') throw new Error('EventId 参数无效');
    if (!divisionId || typeof divisionId !== 'number') throw new Error('DivisionId 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');
    try {
      const url = `${API_BASE}/events/${eventId}/divisions/${divisionId}/rankings`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) { const errorText = await response.text(); throw new Error(`HTTP ${response.status}: ${errorText}`); }
      const data = await response.json();
      const rankings = (data && data.data && Array.isArray(data.data)) ? data.data : [];
      logSuccess(`赛区 ${divisionId} 排名获取完成: ${rankings.length} 条`);
      return rankings;
    } catch (e) { logError(`赛区 ${divisionId} 排名获取失败:`, e.message); return []; }
  }

  // ============================================================
  // 数据合并模块
  // ============================================================

  function syncScoresToLocal(apiMatchesData) {
    log('开始同步比分到本地...');
    if (!apiMatchesData || !Array.isArray(apiMatchesData)) { logError('API 比赛数据无效'); return 0; }
    let scoresDb = {}; let doneDb = {};
    try {
      const scoresJson = localStorage.getItem('vex_scores');
      const doneJson = localStorage.getItem('vex_done');
      if (scoresJson) scoresDb = JSON.parse(scoresJson);
      if (doneJson) doneDb = JSON.parse(doneJson);
    } catch (e) { logError('读取 LocalStorage 失败:', e); }

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
      localStorage.setItem('vex_scores', JSON.stringify(scoresDb));
      localStorage.setItem('vex_done', JSON.stringify(doneDb));
      logSuccess(`同步完成: 更新了 ${updatedCount} 条比分记录`);
    } catch (e) { logError('写入 LocalStorage 失败:', e); }
    return updatedCount;
  }

  function mergeRankingsToLocalStorage(apiRankingsData) {
    if (!apiRankingsData || !Array.isArray(apiRankingsData)) return;
    let rankingsDb = {};
    try { const existing = localStorage.getItem('vex_rankings'); if (existing) rankingsDb = JSON.parse(existing); } catch (e) {}
    for (const entry of apiRankingsData) {
      const teamName = entry.team ? entry.team.name : (entry.team_name || '');
      const rank = entry.rank || entry.rankingsort1 || 0;
      if (teamName && rank > 0) rankingsDb[teamName] = rank;
    }
    try { localStorage.setItem('vex_rankings', JSON.stringify(rankingsDb)); logSuccess(`排名合并完成: ${Object.keys(rankingsDb).length} 条`); } catch (e) { logError('写入排名失败:', e); }
  }

  /**
   * 一键同步完整流程（单个 SKU，多赛区 + 排名）
   */
  async function runFullSync(sku, token) {
    log('开始一键同步...');
    if (!sku || sku.trim() === '') return { success: false, count: 0, message: 'SKU 参数无效' };
    if (!token || token.trim() === '') return { success: false, count: 0, message: 'Token 参数无效' };
    try {
      const eventInfo = await fetchEventId(sku, token);
      let allMatches = [];
      for (const div of eventInfo.divisions) {
        const matches = await fetchMatchesData(eventInfo.id, div.id, token);
        matches.forEach(m => { m._divisionName = formatDivisionName(eventInfo.name, div.name); });
        allMatches = allMatches.concat(matches);
        try { const rankings = await fetchRankings(eventInfo.id, div.id, token); mergeRankingsToLocalStorage(rankings); } catch (e) { logError(`赛区 ${div.name} 排名失败:`, e.message); }
      }
      const count = syncScoresToLocal(allMatches);
      return { success: true, count, message: `同步成功，共 ${eventInfo.divisions.length} 个赛区，更新了 ${count} 条比分记录` };
    } catch (error) {
      return { success: false, count: 0, message: `同步失败: ${error.message}` };
    }
  }

  // ============================================================
  // 云端赛程生成模块
  // ============================================================

  function generateScheduleFromApi(apiMatchesData) {
    log('开始从 API 生成赛程...');
    if (!apiMatchesData || !Array.isArray(apiMatchesData)) { logError('API 比赛数据无效'); return 0; }
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
      const division = apiMatch._divisionName || '默认赛区';
      newGlobalMatches.push({ matchId, field, time, timeValue: 0, team1, team2, division });
    }
    log(`生成了 ${newGlobalMatches.length} 场比赛`);
    try { localStorage.setItem('vex_matches', JSON.stringify(newGlobalMatches)); logSuccess('赛程已写入 LocalStorage'); } catch (e) { logError('写入 LocalStorage 失败:', e); }
    syncScoresToLocal(apiMatchesData);
    return newGlobalMatches.length;
  }

  // ============================================================
  // 公开 API
  // ============================================================
  window.VexApiSync = {
    fetchEventId, fetchMatchesData, fetchRankings,
    syncScoresToLocal, mergeRankingsToLocalStorage,
    runFullSync, generateScheduleFromApi, formatDivisionName
  };

  log('API 通信模块已加载 (Android v2.1 多赛区+排名版)');
})();
