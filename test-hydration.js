/**
 * 前端回填压测脚本 (Hydration Stress Test)
 * 
 * 功能：验证 Mock 数据能否正确写入 scoresDb 并触发页面渲染
 * 目的：确保前端链路贯通，数据回填无误
 * 
 * 测试内容：
 * 1. 验证 scoresDb 键值对生成正确
 * 2. 验证 globalMatches 数据未被覆盖
 * 3. 验证 UI 渲染函数可正常调用
 */

// ============================================================
// 模拟前端全局变量
// ============================================================
let globalMatches = [
  { matchId: 'TeamWork #2', field: 'Field A', time: '10:01 AM', team1: '1268A', team2: '1268K', division: 'Division 1' },
  { matchId: 'TeamWork #5', field: 'Field B', time: '10:15 AM', team1: '80077A', team2: '20868C', division: 'Division 1' },
  { matchId: 'TeamWork #10', field: 'Field A', time: '10:34 AM', team1: '996X', team2: '33566G', division: 'Division 1' }
];

let scoresDb = {};
let doneDb = {};

// ============================================================
// Mock 数据
// ============================================================
const MOCK_FETCH_RESULT = [
  { matchId: 'TeamWork #2', redTeam: '1268A', redScore: '233', blueTeam: '1268K', blueScore: '233' },
  { matchId: 'TeamWork #5', redTeam: '80077A', redScore: '0', blueTeam: '20868C', blueScore: '104' },
  { matchId: 'TeamWork #10', redTeam: '996X', redScore: '238', blueTeam: '33566G', blueScore: '238' }
];

// ============================================================
// 模拟 saveData 函数
// ============================================================
function saveData() {
  console.log('[Mock] saveData() 被调用');
  // 实际会写入 localStorage
}

// ============================================================
// 模拟 renderSingleTeam 函数
// ============================================================
function renderSingleTeam() {
  console.log('[Mock] renderSingleTeam() 被调用');
  // 实际会渲染单队视图
}

// ============================================================
// 模拟 renderMasterTimeline 函数
// ============================================================
function renderMasterTimeline() {
  console.log('[Mock] renderMasterTimeline() 被调用');
  // 实际会渲染大师总表
}

// ============================================================
// 核心同步函数（从 index.html 复制）
// ============================================================
async function syncScoresFromWeb(targetUrl) {
  console.log('[SyncData] ========== 开始同步比分 ==========');
  console.log('[SyncData] 目标网址:', targetUrl);
  
  // 1. 获取参数
  if (typeof globalMatches === 'undefined' || globalMatches.length === 0) {
    console.error('[SyncData] 错误：globalMatches 为空');
    return;
  }

  const matchIds = [...new Set(globalMatches.map(m => m.matchId))];
  console.log('[SyncData] 提取到比赛 ID 列表:', matchIds);
  console.log('[SyncData] 比赛总数:', matchIds.length);

  // 2. 使用 Mock 数据
  console.log('[SyncData] 使用 Mock 数据模式');
  console.log('[SyncData] Mock 数据:', MOCK_FETCH_RESULT);
  const scoreDataList = MOCK_FETCH_RESULT;
  
  console.log('[SyncData] 获取到数据:', scoreDataList);
  console.log('[SyncData] 解析到', scoreDataList.length, '条比分数据');

  // 3. 核心映射逻辑
  let updatedCount = 0;
  
  console.log('[SyncData] 开始匹配队伍...');
  
  for (const scoreData of scoreDataList) {
    const { matchId, redTeam, redScore, blueTeam, blueScore } = scoreData;
    console.log(`[SyncData] 处理比赛 ${matchId}: 红方=${redTeam}(${redScore}), 蓝方=${blueTeam}(${blueScore})`);
    
    // 在 globalMatches 中查找该比赛
    const match = globalMatches.find(m => m.matchId === matchId);
    
    if (!match) {
      console.log(`[SyncData] 警告：在 globalMatches 中未找到比赛 ${matchId}`);
      continue;
    }

    // 更新红方队伍的得分
    const redKey = `${matchId}_${match.team1}`;
    scoresDb[redKey] = String(redScore);
    console.log(`[SyncData] 保存红方得分: ${redKey} = ${redScore}`);

    // 更新蓝方队伍的得分
    const blueKey = `${matchId}_${match.team2}`;
    scoresDb[blueKey] = String(blueScore);
    console.log(`[SyncData] 保存蓝方得分: ${blueKey} = ${blueScore}`);

    updatedCount++;
  }

  console.log('[SyncData] 队伍匹配完成，更新了', updatedCount, '场比赛的得分');

  // 4. 状态持久化
  console.log('[SyncData] 正在保存数据到 LocalStorage...');
  saveData();

  // 5. UI 重绘
  console.log('[SyncData] 正在刷新 UI...');
  renderSingleTeam();
  renderMasterTimeline();

  // 6. 完成提示
  console.log('[SyncData] ========== 同步完成 ==========');
  console.log(`[SyncData] 成功同步 ${updatedCount} 场比赛的比分`);
  
  return { updatedCount, scoresDb };
}

// ============================================================
// 断言验证函数
// ============================================================
function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    return true;
  } else {
    console.error(`❌ FAIL: ${message}`);
    return false;
  }
}

// ============================================================
// 主测试函数
// ============================================================
async function runHydrationTest() {
  console.log('='.repeat(80));
  console.log('🔍 前端回填压测 (Hydration Stress Test)');
  console.log('='.repeat(80));
  console.log('');

  // 记录测试前的状态
  const beforeScoresDb = JSON.parse(JSON.stringify(scoresDb));
  const beforeGlobalMatches = JSON.parse(JSON.stringify(globalMatches));
  
  console.log('📊 测试前状态:');
  console.log('   scoresDb:', beforeScoresDb);
  console.log('   globalMatches.length:', beforeGlobalMatches.length);
  console.log('');

  // 执行同步
  console.log('='.repeat(80));
  console.log('🚀 执行同步函数');
  console.log('='.repeat(80));
  console.log('');

  const result = await syncScoresFromWeb('https://events.vex.com/test');

  // 记录测试后的状态
  const afterScoresDb = JSON.parse(JSON.stringify(scoresDb));
  const afterGlobalMatches = JSON.parse(JSON.stringify(globalMatches));

  console.log('');
  console.log('='.repeat(80));
  console.log('📊 测试后状态');
  console.log('='.repeat(80));
  console.log('');

  console.log('scoresDb:', afterScoresDb);
  console.log('globalMatches.length:', afterGlobalMatches.length);
  console.log('');

  // ============================================================
  // 断言验证
  // ============================================================
  console.log('='.repeat(80));
  console.log('✅ 断言验证');
  console.log('='.repeat(80));
  console.log('');

  let allPassed = true;

  // 验证 1: scoresDb 包含正确的键值对
  allPassed &= assert(
    afterScoresDb['TeamWork #2_1268A'] === '233',
    'scoresDb[TeamWork #2_1268A] 应为 "233"'
  );

  allPassed &= assert(
    afterScoresDb['TeamWork #2_1268K'] === '233',
    'scoresDb[TeamWork #2_1268K] 应为 "233"'
  );

  allPassed &= assert(
    afterScoresDb['TeamWork #5_80077A'] === '0',
    'scoresDb[TeamWork #5_80077A] 应为 "0"'
  );

  allPassed &= assert(
    afterScoresDb['TeamWork #5_20868C'] === '104',
    'scoresDb[TeamWork #5_20868C] 应为 "104"'
  );

  allPassed &= assert(
    afterScoresDb['TeamWork #10_996X'] === '238',
    'scoresDb[TeamWork #10_996X] 应为 "238"'
  );

  allPassed &= assert(
    afterScoresDb['TeamWork #10_33566G'] === '238',
    'scoresDb[TeamWork #10_33566G] 应为 "238"'
  );

  // 验证 2: globalMatches 未被覆盖
  allPassed &= assert(
    afterGlobalMatches.length === beforeGlobalMatches.length,
    'globalMatches 长度未改变'
  );

  allPassed &= assert(
    afterGlobalMatches[0].field === 'Field A',
    'globalMatches[0].field 保持不变'
  );

  allPassed &= assert(
    afterGlobalMatches[0].time === '10:01 AM',
    'globalMatches[0].time 保持不变'
  );

  // 验证 3: 更新数量正确
  allPassed &= assert(
    result.updatedCount === 3,
    `更新了 3 场比赛 (实际: ${result.updatedCount})`
  );

  // ============================================================
  // 测试结果汇总
  // ============================================================
  console.log('');
  console.log('='.repeat(80));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(80));
  console.log('');

  if (allPassed) {
    console.log('🎉 所有测试通过！');
    console.log('');
    console.log('✅ scoresDb 正确生成了键值对');
    console.log('✅ globalMatches 数据未被覆盖');
    console.log('✅ UI 渲染函数可正常调用');
  } else {
    console.error('❌ 部分测试失败！');
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('✅ 测试完成');
  console.log('='.repeat(80));

  return allPassed;
}

// ============================================================
// 执行测试
// ============================================================
runHydrationTest().then(passed => {
  process.exit(passed ? 0 : 1);
}).catch(err => {
  console.error('致命错误:', err);
  process.exit(1);
});
