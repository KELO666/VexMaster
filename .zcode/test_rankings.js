/**
 * 排名修复验证测试 (Node, 零依赖)
 * 模拟 VEX API 的分页返回 + 多赛区场景，实际运行 vex-api-sync.js 的真实代码。
 * 覆盖: iOS 外部模块 / iOS index.html 内联副本 / Android 模块
 * 用法: node .zcode/test_rankings.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IOS_EXT = path.join(ROOT, 'VexMaster', 'vex-api-sync.js');
const ANDROID_EXT = path.join(ROOT, 'VEX_Master_Android', 'vex-api-sync.js');
const IOS_HTML = path.join(ROOT, 'VexMaster', 'index.html');

// ---------- 测试基建 ----------
function makeEnv() {
  const store = {};
  return {
    window: {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      _store: store
    },
    requests: []
  };
}

function makeFetchServer(env, handler) {
  env.fetch = async (url, opts) => {
    env.requests.push(url);
    const res = handler(url, opts);
    return {
      ok: (res.status || 200) < 400,
      status: res.status || 200,
      text: async () => (typeof res.body === 'string' ? res.body : JSON.stringify(res.body)),
      json: async () => (typeof res.body === 'string' ? JSON.parse(res.body) : res.body)
    };
  };
}

function loadCode(code, env) {
  const fn = new Function('window', 'localStorage', 'fetch', 'console', code);
  fn(env.window, env.localStorage, env.fetch, console);
  return env.window.VexApiSync;
}

function loadFile(file, env) {
  return loadCode(fs.readFileSync(file, 'utf8'), env);
}

// 从 index.html 提取内联的 VexApiSync 模块代码
function loadInlineFromHtml(htmlFile, env) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)];
  const inline = blocks.map(m => m[1]).find(c => c.includes('VexApiSync') && c.includes('fetchRankings'));
  if (!inline) throw new Error('未在 index.html 中找到内联 VexApiSync 模块');
  return loadCode(inline, env);
}

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------- 测试 1: fetchRankings 自动分页 ----------
async function testPagination(label, loader) {
  console.log(`\n[${label}] 测试 1: fetchRankings 自动翻页 (3 页, 每页 2 条, 共 6 队)`);
  const env = makeEnv();
  makeFetchServer(env, (url) => {
    const page = Number(new URL(url).searchParams.get('page') || 1);
    const pages = {
      1: { data: [ { team: { name: 'A' }, rank: 1, rankingsort1: 120 }, { team: { name: 'B' }, rank: 2, rankingsort1: 110 } ], meta: { last_page: 3, current_page: 1 } },
      2: { data: [ { team: { name: 'C' }, rank: 3, rankingsort1: 100 }, { team: { name: 'D' }, rank: 4, rankingsort1: 90 } ], meta: { last_page: 3, current_page: 2 } },
      3: { data: [ { team: { name: 'E' }, rank: 5, rankingsort1: 80 }, { team: { name: 'F' }, rank: 6, rankingsort1: 70 } ], meta: { last_page: 3, current_page: 3 } }
    };
    return { body: pages[page] || { data: [], meta: { last_page: 3 } } };
  });
  const mod = loader(env);
  const out = await mod.fetchRankings(42, 1, 'tok');
  check('发起了 3 次请求 (逐页)', env.requests.length === 3, `实际 ${env.requests.length}`);
  check('请求 URL 带 ?page=N', env.requests[1].includes('page=2'));
  check('共取回 6 条排名 (第 2/3 页未丢失)', out.length === 6, `实际 ${out.length}`);
  check('最后一队 F 在结果中', out.some(e => e.team.name === 'F'));
}

// ---------- 测试 2: mergeRankings 只信 rank, 不用 rankingsort1 ----------
function testMergeNoSort1(label, loader, key) {
  console.log(`\n[${label}] 测试 2: mergeRankings 只信任 entry.rank`);
  const env = makeEnv();
  makeFetchServer(env, () => ({ body: { data: [] } }));
  const mod = loader(env);
  mod.mergeRankingsToLocalStorage([
    { team: { name: 'A' }, rank: 3, rankingsort1: 150 },   // rank 正常
    { team: { name: 'B' }, rank: 0, rankingsort1: 140 },   // rank=0, 有积分 → 应跳过
    { team: { name: 'C' }, rankingsort1: 130 },            // rank 缺失 → 应跳过
    { team: { name: 'D' }, rank: '7', rankingsort1: 120 }  // 字符串 rank → parseInt 应接受 7
  ]);
  const db = JSON.parse(env.localStorage._store[key]);
  check('A 排名 = 3 (rank)', db['A'] === 3, `实际 ${db['A']}`);
  check('B 被跳过 (rank=0 时不得把积分 140 当排名)', db['B'] === undefined, `实际 ${db['B']}`);
  check('C 被跳过 (rank 缺失时不得把积分 130 当排名)', db['C'] === undefined, `实际 ${db['C']}`);
  check('D 字符串 rank 解析为 7', db['D'] === 7, `实际 ${db['D']}`);
  check('库中正好 2 条', Object.keys(db).length === 2, `实际 ${Object.keys(db).length}`);
}

// ---------- 测试 3: 多赛区冲突仲裁 ----------
function testMergeArbitration(label, loader, key) {
  console.log(`\n[${label}] 测试 3: 多赛区仲裁 — 大分区(60 队)与小分区(16 队)互相覆盖`);

  const env = makeEnv();
  makeFetchServer(env, () => ({ body: { data: [] } }));
  const mod = loader(env);

  // 大分区 60 队: T1 排名 1, T16 排名 16, ...
  const big = Array.from({ length: 60 }, (_, i) => ({ team: { name: 'T' + (i + 1) }, rank: i + 1 }));
  // Final 16 队, 名次倒序: T1 排名 16, T16 排名 1 (与大分区不同, 便于区分来源)
  const fin = Array.from({ length: 16 }, (_, i) => ({ team: { name: 'T' + (i + 1) }, rank: 16 - i }));

  // 顺序 1: 大分区先入, Final 后入
  mod.mergeRankingsToLocalStorage(big);
  mod.mergeRankingsToLocalStorage(fin);
  const db = JSON.parse(env.localStorage._store[key]);
  check('T1 保留大分区排名 1 (不被 Final 的 16 覆盖)', db['T1'] === 1, `实际 ${db['T1']}`);
  check('T16 保留大分区排名 16 (不被 Final 的 1 覆盖)', db['T16'] === 16, `实际 ${db['T16']}`);
  check('60 队全部有排名', Object.keys(db).length === 60, `实际 ${Object.keys(db).length}`);

  // 顺序 2: Final 先入, 大分区后入 (新模块实例, 清空仲裁缓存)
  const env2 = makeEnv();
  makeFetchServer(env2, () => ({ body: { data: [] } }));
  const mod2 = loader(env2);
  mod2.mergeRankingsToLocalStorage(fin);
  mod2.mergeRankingsToLocalStorage(big);
  const db2 = JSON.parse(env2.localStorage._store[key]);
  check('反向: 大分区后到时 T1 覆盖为 1', db2['T1'] === 1, `实际 ${db2['T1']}`);
  check('反向: 大分区后到时 T16 覆盖为 16 (Final 曾写入 1)', db2['T16'] === 16, `实际 ${db2['T16']}`);
}

// ---------- 测试 4: runFullSync 端到端 (2 赛区 + 排名分页) ----------
async function testFullSync(label, loader, rankingsKey, scoreKey) {
  console.log(`\n[${label}] 测试 4: runFullSync 端到端 (赛事含 2 赛区, 排名各 2 页)`);

  const env = makeEnv();
  makeFetchServer(env, (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/events')) {
      return { body: { data: [ { id: 42, name: '测试初中赛 MS', divisions: [ { id: 1, name: 'Division 1' }, { id: 2, name: 'Final' } ] } ] } };
    }
    if (u.pathname.includes('/matches')) {
      const page = Number(u.searchParams.get('page') || 1);
      if (page > 1) return { body: { data: [], meta: { last_page: 1 } } };
      return { body: { data: [ { matchnum: 1, field: 'Field 1', scheduled: '2026-10-27T10:00:00Z', alliances: [ { score: 88, teams: [ { team: { name: 'T1' } }, { team: { name: 'T2' } } ] } ] } ], meta: { last_page: 1 } } };
    }
    if (u.pathname.endsWith('/teams')) {
      // 队名接口: 2 页 (R1/R2 + R3/R4/R5), 验证 fetchTeamNames 分页
      const page = Number(u.searchParams.get('page') || 1);
      const data = page === 1
        ? [ { number: 'R1', team_name: 'Team R One' }, { number: 'R2', team_name: 'Team R Two' } ]
        : [ { number: 'R3', team_name: 'Team R Three' }, { number: 'R4', team_name: 'Team R Four' }, { number: 'R5', team_name: 'Team R Five' } ];
      return { body: { data, meta: { last_page: 2 } } };
    }
    if (u.pathname.includes('/rankings')) {
      // 正确提取赛区 ID: /api/v2/events/42/divisions/{id}/rankings
      const m = u.pathname.match(/divisions\/(\d+)\//);
      const divId = m ? m[1] : '?';
      const page = Number(u.searchParams.get('page') || 1);
      // 赛区 1: 4 队分 2 页; 赛区 2 (Final): 2 队分 2 页 — 均用真实字段 average_points
      const teams = divId === '1' ? ['R1','R2','R3','R4'] : ['R1','R5'];
      const ranks  = divId === '1' ? [1,2,3,4]              : [2,1];
      const half = Math.ceil(teams.length / 2);
      const idx = (page - 1) * half;
      const slice = teams.slice(idx, idx + half).map((t, i) => ({ team: { name: t }, rank: ranks[idx + i], average_points: 100 + ranks[idx + i] }));
      return { body: { data: slice, meta: { last_page: 2 } } };
    }
    return { status: 404, body: 'not found' };
  });

  const mod = loader(env);
  const result = await mod.runFullSync('RE-VIX-26-TEST', 'tok');
  check('runFullSync 返回 success', result.success === true, result.message);

  const rankingReqs = env.requests.filter(u => u.includes('/rankings'));
  check('排名请求共 4 次 (2 赛区 × 2 页)', rankingReqs.length === 4, `实际 ${rankingReqs.length}`);
  check('排名请求覆盖赛区 1 和赛区 2', rankingReqs.some(u => u.includes('/divisions/1/')) && rankingReqs.some(u => u.includes('/divisions/2/')));

  const db = JSON.parse(env.localStorage._store[rankingsKey]);
  // 赛区 1 (4 队): R1=1 R2=2 R3=3 R4=4; Final (2 队): R1=2, R5=1
  check('R1 保留赛区 1 排名 1 (Final 2 队小赛区不得覆盖为 2)', db['R1'] === 1, `实际 ${db['R1']}`);
  check('R2 = 2 (赛区 1)', db['R2'] === 2, `实际 ${db['R2']}`);
  check('R3 = 3 (赛区 1 第 2 页)', db['R3'] === 3, `实际 ${db['R3']}`);
  check('R4 = 4 (赛区 1 第 2 页)', db['R4'] === 4, `实际 ${db['R4']}`);
  check('R5 = 1 (来自 Final)', db['R5'] === 1, `实际 ${db['R5']}`);

  check(`比分写入 ${scoreKey}`, env.localStorage._store[scoreKey] !== undefined);
  const scores = JSON.parse(env.localStorage._store[scoreKey]);
  check('比分 Q1_T1 = "88"', scores['Q1_T1'] === '88', `实际 ${scores['Q1_T1']}`);

  // v2.2: 分区官方榜单 + 队名映射
  const detail = JSON.parse(env.localStorage._store[rankingsKey.replace('rankings', 'rankings_detail')]);
  check('分区榜单含 2 个赛区', Object.keys(detail).length === 2, Object.keys(detail).join(','));
  const d1 = detail['初中组 1区'];
  check('赛区 1 榜单 4 队且按名次', d1 && d1.length === 4 && d1[0].rank === 1 && d1[3].rank === 4);
  check('赛区 1 榜首 avg = average_points 101', d1 && d1[0].avg === 101, d1 && `实际 ${d1[0].avg}`);
  check('赛区 1 榜首队名来自 teams 接口 (跨页映射)', d1 && d1[0].name === 'Team R One', d1 && `实际 ${d1[0].name}`);
  check('第 3 名队名 (teams 第 2 页)', d1 && d1[2].name === 'Team R Three', d1 && `实际 ${d1[2].name}`);
  const df = detail['初中组 Final'];
  check('Final 榜单 2 队', df && df.length === 2 && df.find(s => s.team === 'R5').avg === 101, df && JSON.stringify(df.map(s => s.avg)));
}

// ---------- 被测对象 ----------
const targets = [
  { label: 'iOS 外部模块', load: env => loadFile(IOS_EXT, env), key: 'vex_rankings_ios' },
  { label: 'iOS 内联副本', load: env => loadInlineFromHtml(IOS_HTML, env), key: 'vex_rankings_ios' },
  { label: 'Android 模块', load: env => loadFile(ANDROID_EXT, env), key: 'vex_rankings' }
];

// ---------- 测试 5: 比赛过程中重复同步 → 排名实时刷新 ----------
function testLiveRefresh(label, loader, key) {
  console.log(`\n[${label}] 测试 5: 重复同步时排名实时刷新 (比赛进行中场景)`);
  const env = makeEnv();
  makeFetchServer(env, () => ({ body: { data: [] } }));
  const mod = loader(env);

  // 三轮同步, T1 (i=0) 的排名: offset 4→5, offset 1→2, offset 7→8
  const mk = offset => Array.from({ length: 60 }, (_, i) => ({ team: { name: 'T' + (i + 1) }, rank: ((i + offset) % 60) + 1 }));

  // 第 1 次同步: 赛中第 3 轮结束, T1 排第 5 (60 队)
  mod.mergeRankingsToLocalStorage(mk(4));
  let db = JSON.parse(env.localStorage._store[key]);
  check('第 1 次同步: T1 = 5', db['T1'] === 5, `实际 ${db['T1']}`);

  // 第 2 次同步: 又打了几轮, T1 升到第 2 → 必须刷新为 2
  mod.mergeRankingsToLocalStorage(mk(1));
  db = JSON.parse(env.localStorage._store[key]);
  check('第 2 次同步: T1 刷新为 2 (实时更新生效)', db['T1'] === 2, `实际 ${db['T1']}`);

  // 第 3 次同步: T1 跌回第 8 → 同赛区同规模必须允许覆盖回退
  mod.mergeRankingsToLocalStorage(mk(7));
  db = JSON.parse(env.localStorage._store[key]);
  check('第 3 次同步: T1 回落为 8 (同规模赛区允许名次回退)', db['T1'] === 8, `实际 ${db['T1']}`);
}

// ---------- 测试 6: 分区官方榜单 (vex_rankings_detail) + 队名映射 ----------
function testOfficialStandings(label, loader, key) {
  console.log(`\n[${label}] 测试 6: 分区官方榜单 + 队名映射 (average_points)`);
  const env = makeEnv();
  makeFetchServer(env, () => ({ body: { data: [] } }));
  const mod = loader(env);
  const detailKey = key.replace('rankings', 'rankings_detail');
  const namesKey = key.replace('rankings', 'team_names');

  // 先入库队名映射 (对应 fetchTeamNames 的产物)
  mod.mergeTeamNamesToLocalStorage({ '5366A': 'ALCTRON VEX CLUB', '4466A': 'QonnWolf-es1' });

  mod.mergeRankingsToLocalStorage([
    { team: { name: '5366A' }, rank: 1, average_points: 280 },
    { team: { name: '91782B' }, rank: 3, rankingsort1: 259 },      // 无 average_points → rankingsort1 兜底
    { team: { name: 'BAD' }, average_points: 999 },                // 无 rank → 跳过
    { team: { name: '4466A' }, rank: 2, average_points: 275 },
    { team: { name: 'NO-NAME' }, rank: 4, average_points: 100 }    // 队名映射缺失 → name 为空
  ], '小学组 A区');

  const detail = JSON.parse(env.localStorage._store[detailKey]);
  const list = detail['小学组 A区'];
  check('榜单按 rank 升序 (4 队)', list.length === 4 && list[0].rank === 1 && list[3].rank === 4, JSON.stringify(list.map(s => s.rank)));
  check('榜首: 队号/队名(映射)/average_points', list[0].team === '5366A' && list[0].name === 'ALCTRON VEX CLUB' && list[0].avg === 280);
  check('第 2 名队名', list[1].name === 'QonnWolf-es1', `实际 ${list[1].name}`);
  check('第 3 名: rankingsort1 兜底', list[2].avg === 259, `实际 ${list[2].avg}`);
  check('映射缺失的队 name 为空字符串', list[3].name === '');
  check('无 rank 的条目不入榜', !list.some(s => s.team === 'BAD'));
  check('队名映射已入库 (2 队)', Object.keys(JSON.parse(env.localStorage._store[namesKey])).length === 2);

  // 再次同步同赛区 (赛中刷新): 整赛区覆盖
  mod.mergeRankingsToLocalStorage([{ team: { name: '91782B' }, rank: 1, average_points: 300 }], '小学组 A区');
  const detail2 = JSON.parse(env.localStorage._store[detailKey]);
  check('同赛区再次同步: 整区覆盖为最新 (实时刷新)', detail2['小学组 A区'].length === 1 && detail2['小学组 A区'][0].avg === 300);

  // 第二赛区并存 + 不传 divisionName 不动榜单
  mod.mergeRankingsToLocalStorage([{ team: { name: '10001A' }, rank: 1, average_points: 200 }], '初中组 1区');
  mod.mergeRankingsToLocalStorage([{ team: { name: 'X' }, rank: 1, average_points: 1 }]);
  const detail3 = JSON.parse(env.localStorage._store[detailKey]);
  check('多分区并存', Object.keys(detail3).length === 2 && detail3['初中组 1区'][0].team === '10001A');
  check('不传 divisionName 不写榜单', Object.keys(detail3).length === 2);
}

// ---------- 执行 ----------
(async () => {
  for (const t of targets) {
    await testPagination(t.label, t.load);
    testMergeNoSort1(t.label, t.load, t.key);
    testMergeArbitration(t.label, t.load, t.key);
    testLiveRefresh(t.label, t.load, t.key);
    testOfficialStandings(t.label, t.load, t.key);
    await testFullSync(t.label, t.load, t.key, t.key.replace('rankings', 'scores'));
  }
  console.log(`\n========== 结果: ${passed} 通过, ${failed} 失败 ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('测试框架异常:', e); process.exit(2); });
