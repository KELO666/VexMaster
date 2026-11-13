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
    else if (/Default/i.test(dn)) div = ''; // 单赛区赛事 (Default Division) 不显示分区名, 只保留学段
    else if (/Division\s+/i.test(dn)) div = dn.replace(/Division\s+/i, '').trim() + '区';
    else if (dn) div = dn;

    if (level && div) return level + ' ' + div;
    if (level) return level;
    if (div) return div;
    // 兜底 (无分区信息/Default 单赛区)
    return '默认赛区';
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
   * 获取指定赛区的排名数据（自动分页，与比赛接口同一套 meta.last_page 协议）
   * 注意：不翻页会静默丢失第 2 页之后所有队伍的排名
   */
  async function fetchRankings(eventId, divisionId, token) {
    log(`获取赛区排名: eventId=${eventId}, divisionId=${divisionId}`);
    if (!eventId || typeof eventId !== 'number') throw new Error('EventId 参数无效');
    if (!divisionId || typeof divisionId !== 'number') throw new Error('DivisionId 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');
    try {
      let allRankings = []; let currentPage = 1; let lastPage = 1;
      do {
        const url = `${API_BASE}/events/${eventId}/divisions/${divisionId}/rankings?page=${currentPage}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) { const errorText = await response.text(); throw new Error(`HTTP ${response.status}: ${errorText}`); }
        const data = await response.json();
        if (!data || !data.data || !Array.isArray(data.data)) break;
        allRankings = allRankings.concat(data.data);
        if (data.meta && data.meta.last_page) lastPage = data.meta.last_page;
        currentPage++;
      } while (currentPage <= lastPage);
      logSuccess(`赛区 ${divisionId} 排名获取完成: ${allRankings.length} 条`);
      return allRankings;
    } catch (e) { logError(`赛区 ${divisionId} 排名获取失败:`, e.message); return []; }
  }

  // ============================================================
  // 场次 ID 解析与时间格式化 (v2.3 决赛独立编号)
  // ============================================================

  /**
   * 为 API 比赛数据解析本地场次 ID (写入 m._matchId, 幂等可重复调用)
   *
   * 背景: matchnum 在每个赛区各自从 1 开始编号。决赛 (round=15) 的 matchnum
   * 会与资格赛撞号 —— 旧逻辑把决赛第 1 场编成 Q1, 比分键 Q1_队号 与资格赛
   * 第 1 场互相覆盖, 决赛场次也无法在赛程中正确呈现 (v2.3 前的根本缺陷)。
   *
   * 规则 (2026-11 用真实赛事 VE-IQ-26-66973 / VE-IQ-26-65732 验证):
   * - 资格赛 (round=2): Q{matchnum} — 与 PDF 导入及历史数据兼容, 保持不变
   * - 决赛 (round=15, 或名称/赛区名含 Final):
   *   单赛区 → F{matchnum} (如 F1..F12)
   *   多赛区 → F{赛区序号}-{matchnum} (同一队伍可能同时打本赛区决赛和跨赛区
   *   总决赛, 两边 matchnum 都从 1 重编, 必须带赛区维度消歧)
   * - 同赛区决赛重号兜底 (VRC 淘汰赛多轮): 追加 (2)(3) 序号
   */
  function resolveMatchIds(apiMatchesData) {
    if (!apiMatchesData || !Array.isArray(apiMatchesData)) return;

    // 扫描出现的赛区 (按首次出现顺序), 判断是否多赛事区
    const divIds = [];
    for (const m of apiMatchesData) {
      const dId = m.division && m.division.id;
      if (dId !== undefined && dId !== null && !divIds.includes(dId)) divIds.push(dId);
    }
    const multiDiv = divIds.length > 1;

    const seen = {}; // 决赛 ID 去重 (多轮重号兜底)
    for (const m of apiMatchesData) {
      if (m._matchId) continue; // 已解析过 (generateScheduleFromApi 内部再调 syncScoresToLocal 时幂等)

      const isFinals = Number(m.round) === 15
        || /final/i.test(m.name || '')
        || /final/i.test(m._divisionName || '')
        || /final/i.test((m.division && m.division.name) || '');

      let matchId = '';
      if (!isFinals) {
        matchId = m.matchnum ? `Q${m.matchnum}` : (m.name || '');
      } else if (m.matchnum) {
        matchId = multiDiv
          ? `F${divIds.indexOf(m.division && m.division.id) + 1}-${m.matchnum}`
          : `F${m.matchnum}`;
      } else {
        matchId = m.name || '';
      }
      if (!matchId) continue;

      if (isFinals) {
        if (seen[matchId]) { seen[matchId]++; matchId = `${matchId}(${seen[matchId]})`; }
        else { seen[matchId] = 1; }
      }
      m._matchId = matchId;
    }
  }

  /**
   * API 时间字段格式化为本地展示时间
   * 决赛场次的 scheduled 通常为 null, 回退用 started (实际开赛时间)
   */
  function formatApiTime(iso) {
    if (!iso) return '待定';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '待定';
      const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
      const period = d.getHours() >= 12 ? 'PM' : 'AM';
      const h = d.getHours() > 12 ? d.getHours() - 12 : (d.getHours() === 0 ? 12 : d.getHours());
      return `周${dayNames[d.getDay()]} ${h}:${d.getMinutes().toString().padStart(2, '0')} ${period}`;
    } catch (e) { return '待定'; }
  }

  // 与 UI 端 parseTimeToMinutes 同算法, 保证云端场次与 PDF 场次排序一致
  function parseLocalTimeToMinutes(timeStr) {
    const m = (timeStr || '').match(/(?:周)?([一二三四五六日])?\s*(\d{1,2}):(\d{2})\s*([AP]M)?/i);
    if (!m) return 999999;
    const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7 };
    let day = m[1] ? dayMap[m[1]] || 0 : 0;
    let hours = parseInt(m[2], 10);
    const mins = parseInt(m[3], 10);
    const ampm = m[4] ? m[4].toUpperCase() : '';
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return day * 24 * 60 + hours * 60 + mins;
  }

  // ============================================================
  // 数据合并模块
  // ============================================================

  function syncScoresToLocal(apiMatchesData) {
    log('开始同步比分到本地...');
    if (!apiMatchesData || !Array.isArray(apiMatchesData)) { logError('API 比赛数据无效'); return 0; }
    resolveMatchIds(apiMatchesData);
    let scoresDb = {}; let doneDb = {};
    try {
      const scoresJson = localStorage.getItem('vex_scores');
      const doneJson = localStorage.getItem('vex_done');
      if (scoresJson) scoresDb = JSON.parse(scoresJson);
      if (doneJson) doneDb = JSON.parse(doneJson);
    } catch (e) { logError('读取 LocalStorage 失败:', e); }

    let updatedCount = 0;
    for (const apiMatch of apiMatchesData) {
      const matchId = apiMatch._matchId || '';
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

  // 队伍号 -> 库中当前排名来源赛区的队伍总数（多赛区冲突仲裁用）
  const rankSourceSize = {};

  /**
   * 排名合并（v2.1.1 修正 + v2.2 分区官方榜单）:
   * 1. 只信任 entry.rank；rankingsort1 是排序积分值不是名次，不能当排名兜底
   * 2. 同一队伍在多个赛区有排名时（如 Division A + Final），保留队伍数更多的大赛区排名
   * 3. 传入 divisionName 时，把整分区完整排名（名次/队伍号/队名/平均分）存入
   *    vex_rankings_detail，每次同步整赛区覆盖（实时刷新）。
   *    平均分取值: entry.avg_score > entry.average > entry.rankingsort1（VIQRC 的 rankingsort1 即官方 Avg. Points）
   */
  function mergeRankingsToLocalStorage(apiRankingsData, divisionName) {
    if (!apiRankingsData || !Array.isArray(apiRankingsData)) return;
    let rankingsDb = {};
    try { const existing = localStorage.getItem('vex_rankings'); if (existing) rankingsDb = JSON.parse(existing); } catch (e) {}
    const parsed = [];
    for (const entry of apiRankingsData) {
      const teamName = (entry.team && entry.team.name) || entry.team_name || '';
      const rank = parseInt(entry.rank, 10);
      if (teamName && Number.isFinite(rank) && rank > 0) parsed.push({ teamName, rank });
    }
    for (const p of parsed) {
      const sourceSize = rankSourceSize[p.teamName];
      if (sourceSize === undefined || parsed.length >= sourceSize) {
        rankingsDb[p.teamName] = p.rank;
        rankSourceSize[p.teamName] = parsed.length;
      }
    }
    try { localStorage.setItem('vex_rankings', JSON.stringify(rankingsDb)); logSuccess(`排名合并完成: 本次 ${parsed.length} 条, 库中 ${Object.keys(rankingsDb).length} 条`); } catch (e) { logError('写入排名失败:', e); }

    if (divisionName) {
      // 队名映射 (来自赛事队伍接口), 排名接口本身不含队名
      let nameMap = {};
      try { nameMap = JSON.parse(localStorage.getItem('vex_team_names')) || {}; } catch (e) { nameMap = {}; }
      const standings = [];
      for (const entry of apiRankingsData) {
        const team = (entry.team && entry.team.name) || entry.team_name || '';
        const rank = parseInt(entry.rank, 10);
        if (!team || !Number.isFinite(rank) || rank <= 0) continue;
        // 官方 Avg. Points: 真实字段为 average_points，其余为兜底
        const avgRaw = (entry.average_points !== undefined && entry.average_points !== null) ? entry.average_points
          : (entry.avg_score !== undefined && entry.avg_score !== null) ? entry.avg_score
          : (entry.average !== undefined && entry.average !== null) ? entry.average
          : entry.rankingsort1;
        const avg = parseFloat(avgRaw);
        standings.push({ rank, team, name: nameMap[team] || '', avg: Number.isFinite(avg) ? avg : null });
      }
      standings.sort((a, b) => a.rank - b.rank);
      let detail = {};
      try { detail = JSON.parse(localStorage.getItem('vex_rankings_detail')) || {}; } catch (e) { detail = {}; }
      detail[divisionName] = standings;
      try { localStorage.setItem('vex_rankings_detail', JSON.stringify(detail)); logSuccess(`分区榜单已更新: ${divisionName} (${standings.length} 队)`); } catch (e) { logError('写入分区榜单失败:', e); }
    }
  }

  // 拉取赛事全部队伍（自动分页），返回 { 队号: 队名 }；排名接口不含队名，队名只能从这里拿
  async function fetchTeamNames(eventId, token) {
    if (!eventId || typeof eventId !== 'number') throw new Error('EventId 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');
    const nameMap = {};
    let currentPage = 1, lastPage = 1;
    try {
      do {
        const response = await fetch(`${API_BASE}/events/${eventId}/teams?page=${currentPage}`, { method: 'GET', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } });
        if (!response.ok) { const errorText = await response.text(); throw new Error(`HTTP ${response.status}: ${errorText}`); }
        const data = await response.json();
        if (!data || !data.data || !Array.isArray(data.data)) break;
        for (const t of data.data) { if (t && t.number) nameMap[t.number] = t.team_name || t.organization || ''; }
        if (data.meta && data.meta.last_page) lastPage = data.meta.last_page;
        currentPage++;
      } while (currentPage <= lastPage);
      logSuccess(`队伍名称获取完成: ${Object.keys(nameMap).length} 队`);
      return nameMap;
    } catch (error) {
      logError(`队伍名称获取失败: ${error.message}`);
      return {};
    }
  }

  // 队名映射合并入库（多赛事累积 merge）
  function mergeTeamNamesToLocalStorage(apiNameMap) {
    if (!apiNameMap || typeof apiNameMap !== 'object') return;
    let nameMap = {};
    try { nameMap = JSON.parse(localStorage.getItem('vex_team_names')) || {}; } catch (e) { nameMap = {}; }
    Object.assign(nameMap, apiNameMap);
    try { localStorage.setItem('vex_team_names', JSON.stringify(nameMap)); logSuccess(`队名映射已入库: 共 ${Object.keys(nameMap).length} 队`); } catch (e) { logError('写入队名映射失败:', e); }
  }

  // ============ 技能赛 / 决赛排名 / 队伍年级 (v2.4) ============
  // 接口形态 2026-11-14 真实赛事 VE-IQ-26-66973 验证:
  // - /events/{id}/skills 分页: {type:'driver'|'programming', attempts, score, rank, team{id,name,code}}
  //   同队两条 type 共享同一官方合并排名 (按 手动最高+自动最高 总分排定)
  // - /events/{id}/divisions/{order}/finalistRankings 决赛官方榜: {rank, team{name}, high_score}
  //   注意路径参数是赛区 order 不是 id
  // - /events/{id}/teams: grade = 'Elementary School'/'Middle School' 等

  // 拉取赛事全部技能赛数据（自动分页）
  async function fetchSkills(eventId, token) {
    if (!eventId || typeof eventId !== 'number') throw new Error('EventId 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');
    let allSkills = [], currentPage = 1, lastPage = 1;
    try {
      do {
        const response = await fetch(`${API_BASE}/events/${eventId}/skills?page=${currentPage}`, { method: 'GET', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } });
        if (!response.ok) { const errorText = await response.text(); throw new Error(`HTTP ${response.status}: ${errorText}`); }
        const data = await response.json();
        if (!data || !data.data || !Array.isArray(data.data)) break;
        allSkills = allSkills.concat(data.data);
        if (data.meta && data.meta.last_page) lastPage = data.meta.last_page;
        currentPage++;
      } while (currentPage <= lastPage);
      logSuccess(`技能赛数据获取完成: 共 ${allSkills.length} 条`);
      return allSkills;
    } catch (error) {
      logError(`技能赛数据获取失败: ${error.message}`);
      return []; // 失败不影响主流程
    }
  }

  // 技能赛合并入库 vex_skills: { 队号: {rank, driver:{attempts,best}, programming:{attempts,best}, total} }
  // driver=手动, programming=自动; total = 手动最高 + 自动最高; 多赛事累积, 同队以最新为准
  function mergeSkillsToLocalStorage(apiSkillsData) {
    if (!apiSkillsData || !Array.isArray(apiSkillsData)) return;
    let skillsDb = {};
    try { const ex = localStorage.getItem('vex_skills'); if (ex) skillsDb = JSON.parse(ex); } catch (e) { skillsDb = {}; }
    for (const s of apiSkillsData) {
      const team = (s.team && s.team.name) || s.team_name || '';
      if (!team) continue;
      const cur = skillsDb[team] || { rank: null, driver: { attempts: 0, best: null }, programming: { attempts: 0, best: null }, total: null };
      const slot = (s.type === 'programming') ? cur.programming : cur.driver;
      const attempts = parseInt(s.attempts, 10);
      slot.attempts = Number.isFinite(attempts) && attempts > 0 ? attempts : 0;
      const score = parseFloat(s.score);
      slot.best = Number.isFinite(score) ? score : null;
      const rank = parseInt(s.rank, 10);
      if (Number.isFinite(rank) && rank > 0) cur.rank = rank;
      const d = cur.driver.best, p = cur.programming.best;
      cur.total = (d !== null && p !== null) ? d + p : (d !== null ? d : (p !== null ? p : null));
      skillsDb[team] = cur;
    }
    try { localStorage.setItem('vex_skills', JSON.stringify(skillsDb)); logSuccess(`技能赛数据合并完成: 本次 ${apiSkillsData.length} 条, 库中 ${Object.keys(skillsDb).length} 队`); } catch (e) { logError('写入技能赛数据失败:', e); }
  }

  // 拉取指定赛区决赛排名（自动分页，路径参数为赛区 order）
  async function fetchFinalistRankings(eventId, divisionOrder, token) {
    if (!eventId || typeof eventId !== 'number') throw new Error('EventId 参数无效');
    if (!divisionOrder || typeof divisionOrder !== 'number') throw new Error('DivisionOrder 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');
    let allRankings = [], currentPage = 1, lastPage = 1;
    try {
      do {
        const response = await fetch(`${API_BASE}/events/${eventId}/divisions/${divisionOrder}/finalistRankings?page=${currentPage}`, { method: 'GET', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } });
        if (!response.ok) { const errorText = await response.text(); throw new Error(`HTTP ${response.status}: ${errorText}`); }
        const data = await response.json();
        if (!data || !data.data || !Array.isArray(data.data)) break;
        allRankings = allRankings.concat(data.data);
        if (data.meta && data.meta.last_page) lastPage = data.meta.last_page;
        currentPage++;
      } while (currentPage <= lastPage);
      logSuccess(`决赛排名获取完成: 共 ${allRankings.length} 条`);
      return allRankings;
    } catch (error) {
      logError(`决赛排名获取失败: ${error.message}`);
      return []; // 失败不影响主流程 (未开决赛时接口可能 404)
    }
  }

  // 决赛排名来源赛区队伍数缓存（多赛区仲裁: 总决赛等更小赛区/更"最终"的名次优先保留）
  const finalistSourceSize = {};

  // 决赛排名合并入库: ① 扁平库 vex_finalist_rankings {队号: 名次} (单队视图 🏆 徽章)
  // ② 传入 divisionName 时存整分区决赛榜 vex_finalist_detail {赛区名: [{rank,team,name,score}]}
  function mergeFinalistRankingsToLocalStorage(apiFinalistData, divisionName) {
    if (!apiFinalistData || !Array.isArray(apiFinalistData)) return;
    let rankDb = {};
    try { const ex = localStorage.getItem('vex_finalist_rankings'); if (ex) rankDb = JSON.parse(ex); } catch (e) { rankDb = {}; }
    const parsed = [];
    for (const entry of apiFinalistData) {
      const team = (entry.team && entry.team.name) || entry.team_name || '';
      const rank = parseInt(entry.rank, 10);
      if (team && Number.isFinite(rank) && rank > 0) parsed.push({ team, rank });
    }
    for (const p of parsed) {
      const src = finalistSourceSize[p.team];
      if (src === undefined || parsed.length <= src) {
        rankDb[p.team] = p.rank;
        finalistSourceSize[p.team] = parsed.length;
      }
    }
    try { localStorage.setItem('vex_finalist_rankings', JSON.stringify(rankDb)); logSuccess(`决赛排名合并完成: 本次 ${parsed.length} 条, 库中 ${Object.keys(rankDb).length} 条`); } catch (e) { logError('写入决赛排名失败:', e); }

    if (divisionName) {
      let nameMap = {};
      try { nameMap = JSON.parse(localStorage.getItem('vex_team_names')) || {}; } catch (e) { nameMap = {}; }
      const standings = [];
      for (const entry of apiFinalistData) {
        const team = (entry.team && entry.team.name) || entry.team_name || '';
        const rank = parseInt(entry.rank, 10);
        if (!team || !Number.isFinite(rank) || rank <= 0) continue;
        const score = parseFloat(entry.high_score);
        standings.push({ rank, team, name: nameMap[team] || '', score: Number.isFinite(score) ? score : null });
      }
      standings.sort((a, b) => a.rank - b.rank);
      let detail = {};
      try { detail = JSON.parse(localStorage.getItem('vex_finalist_detail')) || {}; } catch (e) { detail = {}; }
      detail[divisionName] = standings;
      try { localStorage.setItem('vex_finalist_detail', JSON.stringify(detail)); logSuccess(`决赛榜单已更新: ${divisionName} (${standings.length} 队)`); } catch (e) { logError('写入决赛榜单失败:', e); }
    }
  }

  // 拉取赛事队伍年级映射（自动分页）: { 队号: grade } — 技能赛榜小学/初中过滤用
  async function fetchTeamGrades(eventId, token) {
    if (!eventId || typeof eventId !== 'number') throw new Error('EventId 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');
    const gradeMap = {};
    let currentPage = 1, lastPage = 1;
    try {
      do {
        const response = await fetch(`${API_BASE}/events/${eventId}/teams?page=${currentPage}`, { method: 'GET', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } });
        if (!response.ok) { const errorText = await response.text(); throw new Error(`HTTP ${response.status}: ${errorText}`); }
        const data = await response.json();
        if (!data || !data.data || !Array.isArray(data.data)) break;
        for (const t of data.data) { if (t && t.number && t.grade) gradeMap[t.number] = t.grade; }
        if (data.meta && data.meta.last_page) lastPage = data.meta.last_page;
        currentPage++;
      } while (currentPage <= lastPage);
      logSuccess(`队伍年级获取完成: ${Object.keys(gradeMap).length} 队`);
      return gradeMap;
    } catch (error) {
      logError(`队伍年级获取失败: ${error.message}`);
      return {}; // 失败不影响主流程, 技能赛榜仅显示"全部"
    }
  }

  // 队伍年级映射合并入库（多赛事累积 merge）
  function mergeTeamGradesToLocalStorage(apiGradeMap) {
    if (!apiGradeMap || typeof apiGradeMap !== 'object') return;
    let gradeMap = {};
    try { gradeMap = JSON.parse(localStorage.getItem('vex_team_grades')) || {}; } catch (e) { gradeMap = {}; }
    Object.assign(gradeMap, apiGradeMap);
    try { localStorage.setItem('vex_team_grades', JSON.stringify(gradeMap)); logSuccess(`队伍年级映射已入库: 共 ${Object.keys(gradeMap).length} 队`); } catch (e) { logError('写入队伍年级映射失败:', e); }
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
      try { mergeTeamNamesToLocalStorage(await fetchTeamNames(eventInfo.id, token)); } catch (e) { logError('队名抓取失败:', e.message); }
      try { mergeTeamGradesToLocalStorage(await fetchTeamGrades(eventInfo.id, token)); } catch (e) { logError('年级抓取失败:', e.message); }
      try { mergeSkillsToLocalStorage(await fetchSkills(eventInfo.id, token)); } catch (e) { logError('技能赛抓取失败:', e.message); }
      let allMatches = [];
      for (const div of eventInfo.divisions) {
        const matches = await fetchMatchesData(eventInfo.id, div.id, token);
        matches.forEach(m => { m._divisionName = formatDivisionName(eventInfo.name, div.name); });
        allMatches = allMatches.concat(matches);
        try { const rankings = await fetchRankings(eventInfo.id, div.id, token); mergeRankingsToLocalStorage(rankings, formatDivisionName(eventInfo.name, div.name)); } catch (e) { logError(`赛区 ${div.name} 排名失败:`, e.message); }
        // 决赛排名 (路径用赛区 order; 未开决赛时为空/404, 不影响主流程)
        try { const fr = await fetchFinalistRankings(eventInfo.id, div.order || div.id, token); mergeFinalistRankingsToLocalStorage(fr, formatDivisionName(eventInfo.name, div.name)); } catch (e) { logError(`赛区 ${div.name} 决赛排名失败:`, e.message); }
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
    resolveMatchIds(apiMatchesData);
    let newGlobalMatches = [];
    for (const apiMatch of apiMatchesData) {
      const matchId = apiMatch._matchId || apiMatch.name || '';
      if (!matchId) continue;
      let field = apiMatch.field || apiMatch.fieldname || '默认场地';
      // 决赛场次 scheduled 为 null, 回退用 started (实际开赛时间)
      const time = formatApiTime(apiMatch.scheduled || apiMatch.started);
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
      newGlobalMatches.push({ matchId, field, time, timeValue: parseLocalTimeToMinutes(time), team1, team2, division });
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
    fetchEventId, fetchMatchesData, fetchRankings, fetchTeamNames, mergeTeamNamesToLocalStorage,
    fetchTeamGrades, mergeTeamGradesToLocalStorage, fetchSkills, mergeSkillsToLocalStorage,
    fetchFinalistRankings, mergeFinalistRankingsToLocalStorage,
    syncScoresToLocal, mergeRankingsToLocalStorage,
    runFullSync, generateScheduleFromApi, formatDivisionName
  };

  log('API 通信模块已加载 (Android v2.1 多赛区+排名版)');
})();
