/**
 * VEX 赛事比分代理 Worker (POST 版本)
 * 
 * 功能：接收前端 POST 请求，抓取指定比赛的比分数据
 * 环境：Cloudflare Worker (V8 Isolate)
 * 
 * 请求格式：
 * POST /
 * Content-Type: application/json
 * {
 *   "targetUrl": "https://events.vex.com/...",
 *   "matchIds": ["Q19", "Q20", "Q21"]
 * }
 * 
 * 返回格式：
 * [
 *   {"matchId": "Q19", "redScore": 236, "blueScore": 100},
 *   {"matchId": "Q20", "redScore": 150, "blueScore": 180}
 * ]
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
    // 2. 只允许 POST 请求
    // --------------------------------------------------------
    if (request.method !== 'POST') {
      return jsonResponse(405, {
        error: '请求方法不允许',
        message: '请使用 POST 请求',
        allowed: ['POST', 'OPTIONS']
      });
    }

    // --------------------------------------------------------
    // 3. 解析请求体
    // --------------------------------------------------------
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse(400, {
        error: '请求体格式错误',
        message: '请提供有效的 JSON 数据',
        example: {
          targetUrl: 'https://events.vex.com/...',
          matchIds: ['Q19', 'Q20']
        }
      });
    }

    const { targetUrl, matchIds } = body;

    // --------------------------------------------------------
    // 4. 参数校验
    // --------------------------------------------------------
    if (!targetUrl) {
      return jsonResponse(400, {
        error: '缺少必要参数',
        message: '请提供 targetUrl 参数'
      });
    }

    if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
      return jsonResponse(400, {
        error: '缺少必要参数',
        message: '请提供 matchIds 数组（要查询的比赛编号列表）'
      });
    }

    // --------------------------------------------------------
    // 5. 伪装请求 - 向目标网站发起 GET 请求
    // --------------------------------------------------------
    console.log(`[Worker] 开始抓取: ${targetUrl}, 比赛数量: ${matchIds.length}`);

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
        console.log(`[Worker] 目标网站返回错误: ${targetResponse.status}`);
        return jsonResponse(502, {
          error: '目标网站请求失败',
          statusCode: targetResponse.status,
          statusText: targetResponse.statusText
        });
      }

      // --------------------------------------------------------
      // 6. 获取 HTML 内容
      // --------------------------------------------------------
      const html = await targetResponse.text();
      console.log(`[Worker] 获取 HTML 成功，长度: ${html.length}`);

      // --------------------------------------------------------
      // 7. 解析比分数据
      // --------------------------------------------------------
      const results = parseScoresFromHtml(html, matchIds);
      console.log(`[Worker] 解析完成，有效数据: ${results.length} 条`);

      // --------------------------------------------------------
      // 8. 返回结果
      // --------------------------------------------------------
      return jsonResponse(200, results);

    } catch (error) {
      console.log(`[Worker] 错误: ${error.message}`);
      return jsonResponse(500, {
        error: '服务器内部错误',
        message: error.message
      });
    }
  }
};

// ============================================================
// 核心解析函数 - 从 HTML 中提取指定比赛的比分
// 
// 【输入】
// - html: 目标页面的完整 HTML
// - matchIds: 要提取的比赛编号数组，如 ["Q19", "Q20"]
// 
// 【输出】
// - 包含比分数据的数组，格式：
//   [{"matchId": "Q19", "redScore": 236, "blueScore": 100}]
// 
// 【HTML 结构假设】
// events.vex.com 的比赛结果页面通常结构如下：
// 
// <table>
//   <tr>
//     <td>Q19</td>           ← 比赛编号
//     <td>Field A</td>       ← 场地
//     <td>10:30 AM</td>      ← 时间
//     <td>53168C 12345A</td> ← 红方队伍
//     <td>236</td>           ← 红方得分
//     <td>67890B 11111D</td> ← 蓝方队伍
//     <td>100</td>           ← 蓝方得分
//   </tr>
// </table>
// 
// 【解析策略】
// 1. 定位包含目标比赛编号的行
// 2. 提取该行中的得分数据
// 3. 返回结构化结果
// ============================================================
function parseScoresFromHtml(html, matchIds) {
  const results = [];

  // --------------------------------------------------------
  // 遍历每个要查询的比赛编号
  // --------------------------------------------------------
  for (const matchId of matchIds) {
    console.log(`[Worker] 正在解析比赛: ${matchId}`);

    // --------------------------------------------------------
    // 正则匹配：定位包含该比赛编号的表格行
    // 
    // 【正则说明】
    // - <tr[^>]*> : 匹配表格行开始标签
    // - [\s\S]*? : 非贪婪匹配任意内容（包括换行符）
    // - ${matchId} : 目标比赛编号
    // - [\s\S]*?</tr> : 匹配到行结束标签
    // - g: 全局匹配, i: 忽略大小写
    // --------------------------------------------------------
    const rowRegex = new RegExp(
      `<tr[^>]*>[\\s\\S]*?${escapeRegex(matchId)}[\\s\\S]*?</tr>`,
      'gi'
    );

    const match = html.match(rowRegex);

    if (match && match.length > 0) {
      const rowHtml = match[0];
      console.log(`[Worker] 找到比赛 ${matchId} 的行，长度: ${rowHtml.length}`);

      // --------------------------------------------------------
      // 提取得分数据
      // 
      // 【策略】
      // 在表格行中，得分通常是纯数字，且位于队伍编号之后
      // 我们提取所有数字，然后根据位置判断红蓝方得分
      // --------------------------------------------------------
      const scoreData = extractScoresFromRow(rowHtml, matchId);
      
      if (scoreData) {
        results.push(scoreData);
        console.log(`[Worker] 比赛 ${matchId}: 红方=${scoreData.redScore}, 蓝方=${scoreData.blueScore}`);
      } else {
        console.log(`[Worker] 比赛 ${matchId}: 未能提取到有效得分`);
      }
    } else {
      console.log(`[Worker] 比赛 ${matchId}: 未找到匹配的行`);
    }
  }

  return results;
}

// ============================================================
// 从单行 HTML 中提取比分数据
// ============================================================
function extractScoresFromRow(rowHtml, matchId) {
  // --------------------------------------------------------
  // 提取所有数字（得分）
  // 
  // 【正则说明】
  // - \b : 单词边界，确保匹配完整的数字
  // - (\d+) : 捕获一个或多个数字
  // - \b : 单词边界
  // --------------------------------------------------------
  const scoreRegex = /\b(\d{1,4})\b/g;
  const allNumbers = [...rowHtml.matchAll(scoreRegex)]
    .map(m => parseInt(m[1]))
    .filter(n => n >= 0 && n <= 9999);  // 过滤掉不合理的数字

  console.log(`[Worker] 提取到的数字: ${JSON.stringify(allNumbers)}`);

  // --------------------------------------------------------
  // 判断红蓝方得分
  // 
  // 【策略】
  // 在 VEX 比赛中，得分通常在 0-500 范围内
  // 前两个合理的数字通常是红方和蓝方得分
  // 
  // 【注意】
  // 这里假设数字的顺序是：红方得分、蓝方得分
  // 如果实际页面结构不同，需要调整
  // --------------------------------------------------------
  const validScores = allNumbers.filter(n => n >= 0 && n <= 999);

  if (validScores.length >= 2) {
    return {
      matchId: matchId.toUpperCase(),
      redScore: validScores[0],
      blueScore: validScores[1]
    };
  }

  return null;
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
