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
  // 带重试的认证请求 (v2.5)
  // 体育馆网络抖动时自动重试一次; 5xx/429 与网络错误会重试,
  // 401/404 等确定性错误直接返回不浪费时间
  // ============================================================
  const RETRY_DELAY_MS = 300;

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function authFetch(url, token, retries = 1) {
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        if ((response.status >= 500 || response.status === 429) && attempt < retries) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        return response;
      } catch (e) { // 网络错误 (TypeError: Failed to fetch 等)
        lastErr = e;
        if (attempt < retries) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
      }
    }
    throw lastErr;
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
      const response = await authFetch(url, token);

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
        const url = `${API_BASE}/events/${eventId}/divisions/${divisionId}/matches?page=${currentPage}&per_page=250`;
        log(`请求第 ${currentPage}/${lastPage} 页: ${url}`);

        const response = await authFetch(url, token);

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
        const url = `${API_BASE}/events/${eventId}/divisions/${divisionId}/rankings?page=${currentPage}&per_page=250`;
        log(`请求第 ${currentPage}/${lastPage} 页排名: ${url}`);

        const response = await authFetch(url, token);

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

  /**
   * 将 API 比赛数据静默合并到本地 LocalStorage
   */
  function syncScoresToLocal(apiMatchesData) {
    log('开始同步比分到本地...');

    if (!apiMatchesData || !Array.isArray(apiMatchesData)) {
      logError('API 比赛数据无效');
      return 0;
    }

    resolveMatchIds(apiMatchesData);

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
   * 拉取赛事全部队伍信息（自动分页，单次遍历同时取队名 + 年级）
   * v2.5: 原 fetchTeamNames / fetchTeamGrades 两次遍历合并为一次, 省一轮接口请求
   * 排名/榜单接口不含队名，队名只能从这里拿
   * @returns {Promise<{names: Object, grades: Object}>} { 队号: 队名 }, { 队号: grade }
   */
  async function fetchTeamInfo(eventId, token) {
    if (!eventId || typeof eventId !== 'number') throw new Error('EventId 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');

    const names = {};
    const grades = {};
    let currentPage = 1;
    let lastPage = 1;
    try {
      do {
        const url = `${API_BASE}/events/${eventId}/teams?page=${currentPage}&per_page=250`;
        const response = await authFetch(url, token);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        const data = await response.json();
        if (!data || !data.data || !Array.isArray(data.data)) break;
        for (const t of data.data) {
          if (!t || !t.number) continue;
          names[t.number] = t.team_name || t.organization || '';
          if (t.grade) grades[t.number] = t.grade;
        }
        if (data.meta && data.meta.last_page) lastPage = data.meta.last_page;
        currentPage++;
      } while (currentPage <= lastPage);
      logSuccess(`队伍信息获取完成: ${Object.keys(names).length} 队 (含年级 ${Object.keys(grades).length} 队)`);
      return { names, grades };
    } catch (error) {
      logError(`队伍信息获取失败: ${error.message}`);
      return { names: {}, grades: {} }; // 失败不影响主流程, 榜单队名列显示为空 / 技能赛榜仅显示"全部"
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

  // ============================================================
  // 技能赛 / 决赛排名 / 队伍年级 (v2.4 新增)
  // 接口形态 2026-11-14 用真实赛事 VE-IQ-26-66973 验证:
  // - GET /events/{id}/skills: 分页, 条目 {type:'driver'|'programming',
  //   attempts, score, rank, team{id,name,code}}。同一队伍两条 type 共享
  //   同一个官方合并排名 (rank = 按 手动最高 + 自动最高 的总分排定)
  // - GET /events/{id}/divisions/{order}/finalistRankings: 决赛官方榜,
  //   条目 {rank, team{name}, high_score}。注意路径参数是赛区 order 不是 id
  // - GET /events/{id}/teams: grade 字段 = 'Elementary School'/'Middle School' 等
  // ============================================================

  /**
   * 拉取赛事全部技能赛数据（自动分页），返回原始条目数组
   */
  async function fetchSkills(eventId, token) {
    log(`开始获取技能赛数据: eventId = ${eventId}`);
    if (!eventId || typeof eventId !== 'number') throw new Error('EventId 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');

    let allSkills = [];
    let currentPage = 1;
    let lastPage = 1;
    try {
      do {
        const url = `${API_BASE}/events/${eventId}/skills?page=${currentPage}&per_page=250`;
        const response = await authFetch(url, token);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
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

  /**
   * 技能赛合并入库 vex_skills_ios: { 队号: {rank, driver:{attempts,best}, programming:{attempts,best}, total} }
   * driver=手动, programming=自动; total = 手动最高 + 自动最高 (官方合并口径)
   * 多赛事累积 merge 不清空, 同队以最新同步为准
   */
  function mergeSkillsToLocalStorage(apiSkillsData) {
    if (!apiSkillsData || !Array.isArray(apiSkillsData)) return;
    let skillsDb = {};
    try { const ex = localStorage.getItem('vex_skills_ios'); if (ex) skillsDb = JSON.parse(ex); } catch (e) { skillsDb = {}; }

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

    try {
      localStorage.setItem('vex_skills_ios', JSON.stringify(skillsDb));
      logSuccess(`技能赛数据合并完成: 本次 ${apiSkillsData.length} 条, 库中 ${Object.keys(skillsDb).length} 队`);
    } catch (e) { logError('写入技能赛数据失败:', e); }
  }

  /**
   * 拉取指定赛区的决赛排名（自动分页，路径参数为赛区 order）
   */
  async function fetchFinalistRankings(eventId, divisionOrder, token) {
    log(`开始获取决赛排名: eventId = ${eventId}, divisionOrder = ${divisionOrder}`);
    if (!eventId || typeof eventId !== 'number') throw new Error('EventId 参数无效');
    if (!divisionOrder || typeof divisionOrder !== 'number') throw new Error('DivisionOrder 参数无效');
    if (!token || typeof token !== 'string') throw new Error('Token 参数无效');

    let allRankings = [];
    let currentPage = 1;
    let lastPage = 1;
    try {
      do {
        const url = `${API_BASE}/events/${eventId}/divisions/${divisionOrder}/finalistRankings?page=${currentPage}&per_page=250`;
        const response = await authFetch(url, token);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
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
      return []; // 失败不影响主流程 (赛事未开决赛时接口可能 404)
    }
  }

  // 队伍号 -> 当前决赛排名来源赛区的队伍总数 (多赛区仲裁用)
  // 与资格赛仲裁相反: 总决赛等更小赛区 (更"最终") 的名次优先保留
  const finalistSourceSize = {};

  /**
   * 决赛排名合并入库:
   * 1. 扁平库 vex_finalist_rankings_ios {队号: 名次} — 单队视图 🏆 决赛排名徽章数据源
   * 2. 传入 divisionName 时额外存整分区决赛榜 vex_finalist_detail_ios
   *    {赛区名: [{rank, team, name, score}]} — 排行榜「决赛」页签数据源
   * 多赛区仲裁: 同队出现在赛区决赛与总决赛时, 保留队伍数更少 (更"最终") 赛区的名次
   */
  function mergeFinalistRankingsToLocalStorage(apiFinalistData, divisionName) {
    if (!apiFinalistData || !Array.isArray(apiFinalistData)) return;
    let rankDb = {};
    try { const ex = localStorage.getItem('vex_finalist_rankings_ios'); if (ex) rankDb = JSON.parse(ex); } catch (e) { rankDb = {}; }

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
    try {
      localStorage.setItem('vex_finalist_rankings_ios', JSON.stringify(rankDb));
      logSuccess(`决赛排名合并完成: 本次 ${parsed.length} 条, 库中 ${Object.keys(rankDb).length} 条`);
    } catch (e) { logError('写入决赛排名失败:', e); }

    if (divisionName) {
      let nameMap = {};
      try { nameMap = JSON.parse(localStorage.getItem('vex_team_names_ios')) || {}; } catch (e) { nameMap = {}; }
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
      try { detail = JSON.parse(localStorage.getItem('vex_finalist_detail_ios')) || {}; } catch (e) { detail = {}; }
      detail[divisionName] = standings;
      try {
        localStorage.setItem('vex_finalist_detail_ios', JSON.stringify(detail));
        logSuccess(`决赛榜单已更新: ${divisionName} (${standings.length} 队)`);
      } catch (e) { logError('写入决赛榜单失败:', e); }
    }
  }

  /**
   * 队伍年级映射合并入库（多赛事累积 merge，不清空旧数据）
   */
  function mergeTeamGradesToLocalStorage(apiGradeMap) {
    if (!apiGradeMap || typeof apiGradeMap !== 'object') return;
    let gradeMap = {};
    try { gradeMap = JSON.parse(localStorage.getItem('vex_team_grades_ios')) || {}; } catch (e) { gradeMap = {}; }
    Object.assign(gradeMap, apiGradeMap);
    try {
      localStorage.setItem('vex_team_grades_ios', JSON.stringify(gradeMap));
      logSuccess(`队伍年级映射已入库: 共 ${Object.keys(gradeMap).length} 队`);
    } catch (e) {
      logError('写入队伍年级映射失败:', e);
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
    } else if (/Default/i.test(dn)) {
      // 单赛区赛事 (Default Division) 不显示分区名, 只保留学段
      div = '';
    } else if (/Division\s+/i.test(dn)) {
      div = dn.replace(/Division\s+/i, '').trim() + '区';
    } else if (dn) {
      div = dn;
    }

    // 3. 组合返回
    if (level && div) return level + ' ' + div;
    if (level) return level;
    if (div) return div;
    // 兜底 (无分区信息/Default 单赛区)
    return '默认赛区';
  }

  /**
   * 一键同步完整流程（单个 SKU，多赛区并行抓取）
   *
   * v2.5 提速: ① 赛事信息先行，其余端点(比赛/排名/决赛排名/技能赛/队伍)并行发起，
   *    每个端点内部保持顺序分页 —— 总耗时 ≈ 最长一条链而非全部请求之和
   * ② 队名+年级合并为一次 /teams 遍历 ③ 所有请求带一次自动重试 ④ 抓取到的全部比赛
   *    随返回值交回调用方：赛程表由调用方合并多 SKU 数据后统一生成
   *    (generateScheduleFromApi)，避免多赛事互相覆盖
   *
   * @param onProgress 可选 (done, total) => void，用于 UI 进度显示
   * @returns {success, matches: Array(带 _divisionName 标注的原始比赛数据), matchCount, message}
   */
  async function runFullSync(sku, token, onProgress) {
    log('开始一键同步...');

    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
      return { success: false, matches: [], matchCount: 0, message: 'SKU 参数无效' };
    }
    if (!token || typeof token !== 'string' || token.trim() === '') {
      return { success: false, matches: [], matchCount: 0, message: 'Token 参数无效' };
    }

    try {
      // 1. 获取赛事信息（含赛区列表），其余请求依赖它才能发起
      const eventInfo = await fetchEventId(sku, token);
      log(`赛事: ${eventInfo.name}, ${eventInfo.divisions.length} 个赛区, 并行抓取中...`);

      // 2. 并行发起全部请求（每端点内部保持顺序分页；除比赛外均失败兜底返回空，不影响主流程）
      const total = eventInfo.divisions.length * 3 + 2;
      let done = 0;
      const tick = () => { done++; if (typeof onProgress === 'function') onProgress(done, total); };

      const teamsP = fetchTeamInfo(eventInfo.id, token).then(x => { tick(); return x; });
      const skillsP = fetchSkills(eventInfo.id, token).then(x => { tick(); return x; });
      const chains = eventInfo.divisions.map(div => ({
        div,
        matchesP: fetchMatchesData(eventInfo.id, div.id, token).then(x => { tick(); return x; }),
        rankingsP: fetchRankings(eventInfo.id, div.id, token).then(x => { tick(); return x; }),
        finalistP: fetchFinalistRankings(eventInfo.id, div.order || div.id, token).then(x => { tick(); return x; })
      }));

      // 3. 等全部请求落地（比赛失败会在这里抛出，其余端点内部已兜底为空）
      const [teamsInfo, skills, ...chainResults] = await Promise.all([
        teamsP,
        skillsP,
        ...chains.map(c => Promise.all([c.matchesP, c.rankingsP, c.finalistP])
          .then(([matches, rankings, finalist]) => ({ div: c.div, matches, rankings, finalist })))
      ]);

      // 4. 按旧版顺序合并（队名在前 — 决赛榜单名称列依赖它；赛区按列表顺序仲裁）
      mergeTeamNamesToLocalStorage(teamsInfo.names);
      mergeTeamGradesToLocalStorage(teamsInfo.grades);
      mergeSkillsToLocalStorage(skills);

      const allMatches = [];
      for (const res of chainResults) {
        const divLabel = formatDivisionName(eventInfo.name, res.div.name);
        mergeRankingsToLocalStorage(res.rankings, divLabel);
        mergeFinalistRankingsToLocalStorage(res.finalist, divLabel);
        res.matches.forEach(m => { m._divisionName = divLabel; });
        allMatches.push(...res.matches);
      }

      const msg = `同步成功：${eventInfo.divisions.length} 个赛区，共 ${allMatches.length} 场比赛`;
      logSuccess(msg);
      return { success: true, matches: allMatches, matchCount: allMatches.length, message: msg };

    } catch (error) {
      return { success: false, matches: [], matchCount: 0, message: `同步失败: ${error.message}` };
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

      // 优先使用调用者设置的 _divisionName，否则回退为默认
      const division = apiMatch._divisionName || '默认赛区';

      newGlobalMatches.push({ matchId, field, time, timeValue: parseLocalTimeToMinutes(time), team1, team2, division });
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
    fetchTeamInfo,
    mergeTeamNamesToLocalStorage,
    mergeTeamGradesToLocalStorage,
    fetchSkills,
    mergeSkillsToLocalStorage,
    fetchFinalistRankings,
    mergeFinalistRankingsToLocalStorage,
    syncScoresToLocal,
    mergeRankingsToLocalStorage,
    runFullSync,
    generateScheduleFromApi,
    formatDivisionName
  };

  log('API 通信模块已加载 (v2.5 并行同步版: 多赛区+排名+决赛+技能赛)');
  log('可用函数:');
  log('  - VexApiSync.fetchEventId(sku, token)        -> { id, name, divisions }');
  log('  - VexApiSync.fetchMatchesData(eventId, divId, token)');
  log('  - VexApiSync.fetchRankings(eventId, divId, token)');
  log('  - VexApiSync.fetchFinalistRankings(eventId, divOrder, token)');
  log('  - VexApiSync.fetchSkills(eventId, token)');
  log('  - VexApiSync.fetchTeamInfo(eventId, token)   -> { names, grades }');
  log('  - VexApiSync.syncScoresToLocal(apiMatchesData)');
  log('  - VexApiSync.mergeRankingsToLocalStorage(apiRankingsData, divisionName)');
  log('  - VexApiSync.mergeFinalistRankingsToLocalStorage(apiData, divisionName)');
  log('  - VexApiSync.mergeSkillsToLocalStorage(apiSkillsData)');
  log('  - VexApiSync.runFullSync(sku, token, onProgress) -> { success, matches, matchCount, message }');
  log('  - VexApiSync.generateScheduleFromApi(apiMatchesData)');

})();
