/**
 * VEX 赛事数据本地解析测试
 * 
 * 功能：使用纯 Node.js 解析 vex-page-chrome.html，提取所有比赛数据
 * 目的：验证解析逻辑的正确性，无需 Wrangler 认证
 * 
 * 核心目标：从复杂的 HTML 中精准提炼出所有比赛的 JSON 数组
 */

// ============================================================
// 导入文件系统模块
// ============================================================
const fs = require('fs');
const path = require('path');

// ============================================================
// 主函数
// ============================================================
async function main() {
  console.log('='.repeat(80));
  console.log('🔍 VEX 赛事数据本地解析测试');
  console.log('='.repeat(80));
  console.log('');

  // --------------------------------------------------------
  // 1. 读取 vex-page-chrome.html 文件
  // --------------------------------------------------------
  const htmlPath = path.join(__dirname, 'vex-page-chrome.html');
  
  console.log('📂 读取文件:', htmlPath);
  
  if (!fs.existsSync(htmlPath)) {
    console.error('❌ 文件不存在:', htmlPath);
    return;
  }
  
  const html = fs.readFileSync(htmlPath, 'utf-8');
  console.log(`✅ 文件读取成功，长度: ${html.length} 字符`);
  console.log('');

  // --------------------------------------------------------
  // 2. 提取比赛结果表格
  // --------------------------------------------------------
  console.log('='.repeat(80));
  console.log('📊 提取比赛结果表格');
  console.log('='.repeat(80));
  console.log('');

  // 【正则模式】匹配比赛结果表格
  const tableRegex = /<table[^>]*class="[^"]*match-results[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  const tableMatch = html.match(tableRegex);
  
  if (!tableMatch || tableMatch.length === 0) {
    console.error('❌ 未找到比赛结果表格');
    return;
  }
  
  console.log(`✅ 找到 ${tableMatch.length} 个比赛结果表格`);
  const tableHtml = tableMatch[0];
  console.log(`   表格长度: ${tableHtml.length} 字符`);
  console.log('');

  // --------------------------------------------------------
  // 3. 解析所有比赛数据
  // --------------------------------------------------------
  console.log('='.repeat(80));
  console.log('🔍 解析所有比赛数据');
  console.log('='.repeat(80));
  console.log('');

  const matches = parseMatchResults(tableHtml);
  
  console.log(`✅ 成功解析 ${matches.length} 场比赛`);
  console.log('');

  // --------------------------------------------------------
  // 4. 输出解析结果
  // --------------------------------------------------------
  console.log('='.repeat(80));
  console.log('📋 解析结果');
  console.log('='.repeat(80));
  console.log('');

  // 显示前 10 场比赛
  const displayCount = Math.min(10, matches.length);
  for (let i = 0; i < displayCount; i++) {
    const match = matches[i];
    console.log(`--- 比赛 ${i + 1} ---`);
    console.log(`matchId: ${match.matchId}`);
    console.log(`time: ${match.time}`);
    console.log(`redTeam: ${match.redTeam}`);
    console.log(`redScore: ${match.redScore}`);
    console.log(`blueTeam: ${match.blueTeam}`);
    console.log(`blueScore: ${match.blueScore}`);
    console.log('');
  }
  
  if (matches.length > displayCount) {
    console.log(`... 还有 ${matches.length - displayCount} 场比赛未显示`);
    console.log('');
  }

  // --------------------------------------------------------
  // 5. 统计信息
  // --------------------------------------------------------
  console.log('='.repeat(80));
  console.log('📊 统计信息');
  console.log('='.repeat(80));
  console.log('');

  const teamStats = {};
  matches.forEach(match => {
    // 统计红方队伍
    if (!teamStats[match.redTeam]) {
      teamStats[match.redTeam] = { red: 0, blue: 0, totalScore: 0 };
    }
    teamStats[match.redTeam].red++;
    teamStats[match.redTeam].totalScore += parseInt(match.redScore) || 0;
    
    // 统计蓝方队伍
    if (!teamStats[match.blueTeam]) {
      teamStats[match.blueTeam] = { red: 0, blue: 0, totalScore: 0 };
    }
    teamStats[match.blueTeam].blue++;
    teamStats[match.blueTeam].totalScore += parseInt(match.blueScore) || 0;
  });

  console.log('队伍统计:');
  Object.keys(teamStats).sort().forEach(team => {
    const stats = teamStats[team];
    console.log(`  ${team}: 红方 ${stats.red} 场, 蓝方 ${stats.blue} 场, 总得分 ${stats.totalScore}`);
  });

  // --------------------------------------------------------
  // 6. 保存解析结果到 JSON 文件
  // --------------------------------------------------------
  console.log('');
  console.log('='.repeat(80));
  console.log('💾 保存解析结果');
  console.log('='.repeat(80));
  console.log('');

  const outputPath = path.join(__dirname, 'parsed-matches.json');
  fs.writeFileSync(outputPath, JSON.stringify(matches, null, 2), 'utf-8');
  console.log(`✅ 解析结果已保存到: ${outputPath}`);
  console.log(`   文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);

  // --------------------------------------------------------
  // 7. 验证数据完整性
  // --------------------------------------------------------
  console.log('');
  console.log('='.repeat(80));
  console.log('✅ 数据完整性验证');
  console.log('='.repeat(80));
  console.log('');

  const validation = validateMatches(matches);
  console.log(`总比赛数: ${validation.total}`);
  console.log(`有效数据: ${validation.valid}`);
  console.log(`缺失数据: ${validation.invalid}`);
  
  if (validation.invalid > 0) {
    console.log('');
    console.log('⚠️  缺失数据的比赛:');
    validation.invalidMatches.forEach(match => {
      console.log(`  - ${match.matchId}: ${match.missingFields.join(', ')}`);
    });
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('✅ 测试完成');
  console.log('='.repeat(80));
}

// ============================================================
// 解析比赛结果表格
// ============================================================
function parseMatchResults(tableHtml) {
  const matches = [];
  
  // 【正则模式】匹配表格行
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[1];
    
    // 跳过表头行
    if (rowHtml.includes('<th')) continue;
    
    // 提取比赛编号和时间
    const matchColMatch = rowHtml.match(/class="match-col"[^>]*>([\s\S]*?)<\/td>/i);
    if (!matchColMatch) continue;
    
    const matchColRaw = matchColMatch[1].replace(/<[^>]+>/g, '').trim();
    const matchId = cleanMatchId(matchColRaw);
    const time = extractTime(matchColRaw);
    
    // 提取红方队伍和得分
    const redTeamMatches = [...rowHtml.matchAll(/class="red-team"[^>]*>([\s\S]*?)<\/td>/gi)];
    
    let redTeam = '';
    let redScore = '';
    
    if (redTeamMatches.length >= 2) {
      redTeam = redTeamMatches[0][1].replace(/<[^>]+>/g, '').trim();
      redScore = redTeamMatches[1][1].replace(/<[^>]+>/g, '').trim();
    }
    
    // 提取蓝方队伍和得分
    // 【关键修复】使用 includes() 容错匹配，处理 "blue-team border-team" 等复合 class
    const blueTeamMatches = [...rowHtml.matchAll(/class="blue-team[\s\S]*?"[^>]*>([\s\S]*?)<\/td>/gi)];
    
    let blueTeam = '';
    let blueScore = '';
    
    if (blueTeamMatches.length >= 2) {
      blueTeam = blueTeamMatches[0][1].replace(/<[^>]+>/g, '').trim();
      blueScore = blueTeamMatches[1][1].replace(/<[^>]+>/g, '').trim();
    }
    
    // 添加到结果
    matches.push({
      matchId,
      time,
      redTeam,
      redScore,
      blueTeam,
      blueScore
    });
  }
  
  return matches;
}

// ============================================================
// 清洗比赛编号
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
// 提取时间
// ============================================================
function extractTime(rawText) {
  // 匹配时间格式：Aug 15th at 10:01 AM
  const timeMatch = rawText.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+(?:st|nd|rd|th)\s+at\s+\d+:\d+\s*[AP]M/i);
  if (timeMatch) {
    return timeMatch[0].trim();
  }
  
  return '';
}

// ============================================================
// 验证数据完整性
// ============================================================
function validateMatches(matches) {
  const result = {
    total: matches.length,
    valid: 0,
    invalid: 0,
    invalidMatches: []
  };
  
  matches.forEach(match => {
    const missingFields = [];
    
    if (!match.matchId) missingFields.push('matchId');
    if (!match.redTeam) missingFields.push('redTeam');
    if (!match.redScore) missingFields.push('redScore');
    if (!match.blueTeam) missingFields.push('blueTeam');
    if (!match.blueScore) missingFields.push('blueScore');
    
    if (missingFields.length > 0) {
      result.invalid++;
      result.invalidMatches.push({
        matchId: match.matchId || '未知',
        missingFields
      });
    } else {
      result.valid++;
    }
  });
  
  return result;
}

// ============================================================
// 执行主函数
// ============================================================
main().catch(err => {
  console.error('致命错误:', err);
});
