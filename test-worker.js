/**
 * Worker 本地测试脚本
 * 
 * 功能：模拟 HTMLRewriter 状态机解析逻辑
 * 目的：验证解析规则是否正确
 * 
 * 注意：由于无法在本地运行 HTMLRewriter，我们使用正则表达式模拟
 * 实际部署时会使用 Cloudflare Worker 的 HTMLRewriter API
 */

// ============================================================
// 测试数据 - 从探路阶段获取的真实 HTML 片段
// ============================================================
const TEST_HTML = `
<table class="table table-hover match-results viqc-match-results">
  <thead>
    <tr>
      <th class="match-col">Match</th>
      <th>Red Team</th>
      <th>Score</th>
      <th>Blue Team</th>
      <th>Score</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="match-col">TeamWork #2 <br> Aug 15th at 10:01 AM</td>
      <td class="red-team">1268A</td>
      <td class="red-team">233</td>
      <td class="blue-team border-team">1268K</td>
      <td class="blue-team">233</td>
    </tr>
    <tr>
      <td class="match-col">TeamWork #3 <br> Aug 15th at 10:07 AM</td>
      <td class="red-team">80077D</td>
      <td class="red-team">194</td>
      <td class="blue-team border-team">80077C</td>
      <td class="blue-team">194</td>
    </tr>
    <tr>
      <td class="match-col">TeamWork #4 <br> Aug 15th at 10:08 AM</td>
      <td class="red-team">18185A</td>
      <td class="red-team">186</td>
      <td class="blue-team border-team">1266Y</td>
      <td class="blue-team">186</td>
    </tr>
  </tbody>
</table>
`;

// ============================================================
// 模拟 HTMLRewriter 状态机解析
// ============================================================
function parseWithRegex(html, matchIds) {
  const results = [];
  
  // 【正则模式】匹配表格行
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    
    // 跳过表头行
    if (rowHtml.includes('<th')) continue;
    
    // 提取比赛编号
    const matchIdMatch = rowHtml.match(/class="match-col"[^>]*>([\s\S]*?)<\/td>/i);
    if (!matchIdMatch) continue;
    
    const matchIdRaw = matchIdMatch[1].replace(/<[^>]+>/g, '').trim();
    const matchId = cleanMatchId(matchIdRaw);
    
    // 检查是否在目标列表中
    const isTarget = matchIds.some(id => 
      matchId.includes(id) || id.includes(matchId)
    );
    
    if (!isTarget) continue;
    
    // 提取红方队伍和得分
    const redTeamMatches = [...rowHtml.matchAll(/class="red-team"[^>]*>([\s\S]*?)<\/td>/gi)];
    
    let redTeam = '';
    let redScore = '';
    
    if (redTeamMatches.length >= 2) {
      redTeam = redTeamMatches[0][1].replace(/<[^>]+>/g, '').trim();
      redScore = redTeamMatches[1][1].replace(/<[^>]+>/g, '').trim();
    }
    
    // 提取蓝方队伍和得分
    const blueTeamMatches = [...rowHtml.matchAll(/class="blue-team[\s\S]*?"[^>]*>([\s\S]*?)<\/td>/gi)];
    
    let blueTeam = '';
    let blueScore = '';
    
    if (blueTeamMatches.length >= 2) {
      blueTeam = blueTeamMatches[0][1].replace(/<[^>]+>/g, '').trim();
      blueScore = blueTeamMatches[1][1].replace(/<[^>]+>/g, '').trim();
    }
    
    // 添加到结果
    results.push({
      matchId,
      redTeam,
      redScore,
      blueTeam,
      blueScore
    });
  }
  
  return results;
}

// ============================================================
// 数据清洗函数
// ============================================================
function cleanMatchId(rawText) {
  let text = rawText.trim().replace(/\n/g, ' ');
  
  // 匹配资格赛格式：TeamWork #数字
  const teamWorkMatch = text.match(/TeamWork\s*#\d+/i);
  if (teamWorkMatch) {
    return teamWorkMatch[0].trim();
  }
  
  // 匹配淘汰赛格式：Match #数字-数字
  const matchMatch = text.match(/Match\s*#\d+-\d+/i);
  if (matchMatch) {
    return matchMatch[0].trim();
  }
  
  return text;
}

// ============================================================
// 测试执行
// ============================================================
console.log('='.repeat(80));
console.log('🔍 Worker 本地测试');
console.log('='.repeat(80));
console.log('');

// 测试数据
const testMatchIds = ['TeamWork #2', 'TeamWork #3', 'TeamWork #4'];
console.log('📋 测试数据:');
console.log('   matchIds:', testMatchIds);
console.log('');

// 执行解析
console.log('⏳ 执行解析...');
const results = parseWithRegex(TEST_HTML, testMatchIds);

// 输出结果
console.log('');
console.log('='.repeat(80));
console.log('📊 解析结果');
console.log('='.repeat(80));
console.log('');

if (results.length > 0) {
  console.log(`✅ 成功解析 ${results.length} 场比赛`);
  console.log('');
  
  results.forEach((result, index) => {
    console.log(`--- 比赛 ${index + 1} ---`);
    console.log(`matchId: ${result.matchId}`);
    console.log(`redTeam: ${result.redTeam}`);
    console.log(`redScore: ${result.redScore}`);
    console.log(`blueTeam: ${result.blueTeam}`);
    console.log(`blueScore: ${result.blueScore}`);
    console.log('');
  });
} else {
  console.log('❌ 未解析到任何数据');
}

// ============================================================
// 模拟前端 scoresDb 更新
// ============================================================
console.log('='.repeat(80));
console.log('💾 模拟前端 scoresDb 更新');
console.log('='.repeat(80));
console.log('');

const scoresDb = {};
const globalMatches = [
  { matchId: 'TeamWork #2', team1: '1268A', team2: '1268K' },
  { matchId: 'TeamWork #3', team1: '80077D', team2: '80077C' },
  { matchId: 'TeamWork #4', team1: '18185A', team2: '1266Y' }
];

results.forEach(scoreData => {
  const { matchId, redScore, blueScore } = scoreData;
  
  // 查找对应的 globalMatch
  const match = globalMatches.find(m => m.matchId === matchId);
  
  if (match) {
    // 更新红方得分
    const redKey = `${matchId}_${match.team1}`;
    scoresDb[redKey] = String(redScore);
    console.log(`✅ 保存红方得分: ${redKey} = ${redScore}`);
    
    // 更新蓝方得分
    const blueKey = `${matchId}_${match.team2}`;
    scoresDb[blueKey] = String(blueScore);
    console.log(`✅ 保存蓝方得分: ${blueKey} = ${blueScore}`);
  } else {
    console.log(`⚠️  未找到比赛: ${matchId}`);
  }
});

console.log('');
console.log('📊 最终 scoresDb:');
console.log(JSON.stringify(scoresDb, null, 2));

console.log('');
console.log('='.repeat(80));
console.log('✅ 测试完成');
console.log('='.repeat(80));
