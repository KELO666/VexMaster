/**
 * VEX 赛事数据代理 Worker
 * 
 * 功能：抓取 events.vex.com 比赛页面，提取指定队伍的赛程比分数据
 * 环境：Cloudflare Worker (V8 Isolate)
 * 
 * 使用方式：
 * GET https://your-worker.workers.dev/?targetUrl=https://events.vex.com/...&teamNumber=53168C
 * 
 * 返回示例：
 * {
 *   "success": true,
 *   "teamNumber": "53168C",
 *   "matchCount": 2,
 *   "matches": [
 *     {
 *       "matchId": "Q123",
 *       "field": "Field A",
 *       "time": "10:30 AM",
 *       "redTeams": ["53168C", "12345A"],
 *       "blueTeams": ["67890B", "11111D"],
 *       "redScore": "45",
 *       "blueScore": "32",
 *       "status": "Final",
 *       "division": "小学组"
 *     }
 *   ]
 * }
 */

// ============================================================
// CORS 预检 headers - 所有响应都需要携带
// ============================================================
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

// ============================================================
// 伪造的浏览器 User-Agent - 用于绕过 WAF 检测
// ============================================================
const FAKE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============================================================
// Worker 入口 - 符合 ESM 标准
// ============================================================
export default {
  async fetch(request, env, ctx) {
    // --------------------------------------------------------
    // 1. 处理 OPTIONS 预检请求（浏览器跨域时会先发 OPTIONS）
    // --------------------------------------------------------
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // --------------------------------------------------------
    // 2. 解析 URL 参数
    // --------------------------------------------------------
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('targetUrl');
    const teamNumber = url.searchParams.get('teamNumber')?.toUpperCase();

    // 参数校验：缺少必要参数时返回错误
    if (!targetUrl) {
      return jsonResponse(400, {
        error: '缺少必要参数',
        message: '请提供 targetUrl 参数',
        example: '/?targetUrl=https://events.vex.com/...&teamNumber=53168C'
      });
    }

    if (!teamNumber) {
      return jsonResponse(400, {
        error: '缺少必要参数',
        message: '请提供 teamNumber 参数（队伍编号）'
      });
    }

    // 验证队伍编号格式
    if (!/^\d+[A-Z]?$/i.test(teamNumber)) {
      return jsonResponse(400, {
        error: '参数格式错误',
        message: '队伍编号格式不正确，应为数字+可选字母（如 53168C）'
      });
    }

    // --------------------------------------------------------
    // 3. 伪装请求 - 向目标网站发起 GET 请求
    // --------------------------------------------------------
    try {
      const targetResponse = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': FAKE_USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Referer': 'https://www.google.com/'
        }
      });

      // 异常熔断：目标网站返回非 200 状态码
      if (!targetResponse.ok) {
        return jsonResponse(502, {
          error: '目标网站请求失败',
          statusCode: targetResponse.status,
          statusText: targetResponse.statusText,
          targetUrl: targetUrl
        });
      }

      // --------------------------------------------------------
      // 4. 流式萃取 - 获取 HTML 内容并解析
      // --------------------------------------------------------
      const html = await targetResponse.text();
      const matchData = parseMatchData(html, teamNumber);

      // 异常熔断：未找到任何匹配的赛程数据
      if (matchData.length === 0) {
        return jsonResponse(404, {
          error: '未找到匹配数据',
          message: `未能找到队伍 ${teamNumber} 的赛程信息`,
          targetUrl: targetUrl,
          hint: '请检查队伍编号是否正确，或确认该页面包含此队伍的赛程'
        });
      }

      // --------------------------------------------------------
      // 5. 返回结构化 JSON 数据
      // --------------------------------------------------------
      return jsonResponse(200, {
        success: true,
        teamNumber: teamNumber,
        matchCount: matchData.length,
        matches: matchData
      });

    } catch (error) {
      // 异常熔断：网络错误或其他异常
      return jsonResponse(500, {
        error: '服务器内部错误',
        message: error.message,
        targetUrl: targetUrl
      });
    }
  }
};

// ============================================================
// 核心解析函数 - 从 HTML 中提取比赛数据
// 
// 【重要说明】
// events.vex.com 的比赛结果页面通常具有以下 HTML 结构：
// 
// <table class="matches">
//   <tbody>
//     <tr class="match-row">
//       <td class="match-id">Q123</td>
//       <td class="field">Field A</td>
//       <td class="time">10:30 AM</td>
//       <td class="red">
//         <span class="team">53168C</span>
//         <span class="team">12345A</span>
//         <span class="score">45</span>
//       </td>
//       <td class="blue">
//         <span class="team">67890B</span>
//         <span class="team">11111D</span>
//         <span class="score">32</span>
//       </td>
//       <td class="status">Final</td>
//     </tr>
//   </tbody>
// </table>
// 
// 【解析策略】
// 1. 使用正则表达式定位包含目标队伍的行
// 2. 提取该行中的所有相关数据
// 3. 组装成结构化的 JSON 对象
// 
// 【注意】由于实际 HTML 结构可能变化，我们采用多模式匹配
// ============================================================
function parseMatchData(html, teamNumber) {
  const matches = [];
  
  // --------------------------------------------------------
  // 模式 1：匹配表格行结构（最常见）
  // 
  // 正则说明：
  // - <tr[^>]*> : 匹配 <tr> 标签（忽略其他属性）
  // - [\s\S]*? : 非贪婪匹配任意内容（包括换行符）
  // - teamNumber : 目标队伍编号
  // - [\s\S]*?</tr> : 匹配到行结束标签
  // --------------------------------------------------------
  const rowRegex = new RegExp(
    `<tr[^>]*>[\\s\\S]*?${escapeRegex(teamNumber)}[\\s\\S]*?</tr>`,
    'gi'
  );
  
  // 所有匹配的行
  const matchedRows = html.match(rowRegex) || [];
  
  // --------------------------------------------------------
  // 遍历每个匹配的行，提取详细数据
  // --------------------------------------------------------
  for (const row of matchedRows) {
    const match = extractMatchFromRow(row, teamNumber);
    if (match && match.matchId) {
      matches.push(match);
    }
  }

  // --------------------------------------------------------
  // 模式 2：如果模式 1 未找到，尝试匹配 div 结构
  // 
  // 某些现代前端框架使用 div 而非 table
  // --------------------------------------------------------
  if (matches.length === 0) {
    const divRegex = new RegExp(
      `<div[^>]*class="[^"]*match[^"]*"[^>]*>[\\s\\S]*?${escapeRegex(teamNumber)}[\\s\\S]*?</div>`,
      'gi'
    );
    
    const matchedDivs = html.match(divRegex) || [];
    
    for (const div of matchedDivs) {
      const match = extractMatchFromDiv(div, teamNumber);
      if (match && match.matchId) {
        matches.push(match);
      }
    }
  }

  return matches;
}

// ============================================================
// 从表格行中提取比赛数据
// ============================================================
function extractMatchFromRow(row, teamNumber) {
  const match = {
    matchId: '',
    field: '',
    time: '',
    redTeams: [],
    blueTeams: [],
    redScore: '',
    blueScore: '',
    status: '',
    division: ''
  };

  // --------------------------------------------------------
  // 提取比赛编号（Q + 数字）
  // 
  // 【逻辑】查找 Q123, Q456 等格式的文本
  // --------------------------------------------------------
  const matchIdMatch = row.match(/Q\d+/i);
  if (matchIdMatch) {
    match.matchId = matchIdMatch[0].toUpperCase();
  }

  // --------------------------------------------------------
  // 提取时间（数字:数字 格式）
  // 
  // 【逻辑】查找 10:30, 2:15 PM 等格式的文本
  // --------------------------------------------------------
  const timeMatch = row.match(/\d{1,2}:\d{2}(?:\s*[AP]M)?/i);
  if (timeMatch) {
    match.time = timeMatch[0].trim();
  }

  // --------------------------------------------------------
  // 提取场地（Field + 字母/数字，或纯数字）
  // 
  // 【逻辑】查找 Field A, Field 1, Court 2 等格式
  // --------------------------------------------------------
  const fieldMatch = row.match(/(?:Field|Court|Track|Pitch)\s*[A-Z0-9]+/i);
  if (fieldMatch) {
    match.field = fieldMatch[0].trim();
  }

  // --------------------------------------------------------
  // 提取队伍编号（数字 + 可选字母）
  // 
  // 【逻辑】查找所有符合队伍编号格式的文本
  // 格式：53168C, 12345A, 67890 等
  // --------------------------------------------------------
  const teamRegex = /\b\d{4,6}[A-Z]?\b/gi;
  const allTeams = [...row.matchAll(teamRegex)].map(m => m[0].toUpperCase());
  
  // 去重
  const uniqueTeams = [...new Set(allTeams)];
  
  // 判断红方和蓝方
  // 【策略】假设目标队伍在红方（实际使用时可能需要调整）
  const teamIndex = uniqueTeams.indexOf(teamNumber);
  if (teamIndex !== -1) {
    // 目标队伍在红方
    match.redTeams = [teamNumber];
    // 其他队伍在蓝方
    match.blueTeams = uniqueTeams.filter(t => t !== teamNumber).slice(0, 2);
  }

  // --------------------------------------------------------
  // 提取得分（纯数字，且长度为 1-3 位）
  // 
  // 【逻辑】查找 0-999 范围内的数字
  // 注意：比赛得分通常不会超过 999
  // --------------------------------------------------------
  const scoreRegex = /\b(\d{1,3})\b/g;
  const allScores = [...row.matchAll(scoreRegex)]
    .map(m => parseInt(m[1]))
    .filter(s => s >= 0 && s <= 999);
  
  // 假设第一个是红方得分，第二个是蓝方得分
  if (allScores.length >= 2) {
    match.redScore = allScores[0].toString();
    match.blueScore = allScores[1].toString();
  }

  // --------------------------------------------------------
  // 提取状态（Final, Complete, In Progress 等）
  // 
  // 【逻辑】查找常见的比赛状态文本
  // --------------------------------------------------------
  const statusMatch = row.match(/\b(Final|Complete|In\s*Progress|Pending|Unscored)\b/i);
  if (statusMatch) {
    match.status = statusMatch[1];
  }

  // --------------------------------------------------------
  // 提取赛区（Division）
  // 
  // 【逻辑】查找 Division, Group 等关键词
  // --------------------------------------------------------
  const divisionMatch = row.match(/(?:Division|Group|Category|组|区)\s*[:：]?\s*([^\s<]+)/i);
  if (divisionMatch) {
    match.division = divisionMatch[1].trim();
  }

  return match;
}

// ============================================================
// 从 div 结构中提取比赛数据（兼容现代前端框架）
// ============================================================
function extractMatchFromDiv(div, teamNumber) {
  // 复用表格行的提取逻辑
  return extractMatchFromRow(div, teamNumber);
}

// ============================================================
// 辅助函数：转义正则表达式特殊字符
// ============================================================
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// 辅助函数：生成 JSON 响应
// ============================================================
function jsonResponse(status, data) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status,
    headers: CORS_HEADERS
  });
}

// ============================================================
// 【调试模式】如果需要调试，可以取消下面的注释
// ============================================================
// console.log('Worker started');
// console.log('Team number:', teamNumber);
// console.log('Matches found:', matches.length);
