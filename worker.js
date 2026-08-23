/**
 * VEX 赛事比分代理 Worker (HTMLRewriter 状态机版本)
 * 
 * 功能：接收前端 POST 请求，抓取指定比赛的比分数据
 * 环境：Cloudflare Worker (V8 Isolate)
 * 
 * 架构说明：
 * - 使用 HTMLRewriter 流式解析，无 DOM 树
 * - 通过状态机跟踪当前解析位置
 * - 监听 tr/td 标签的进入事件
 * - 根据 class 属性判断红蓝方数据
 * 
 * 请求格式：
 * POST /
 * Content-Type: application/json
 * {
 *   "targetUrl": "https://events.vex.com/...",
 *   "matchIds": ["TeamWork #2", "TeamWork #3"]
 * }
 * 
 * 返回格式：
 * [
 *   {"matchId": "TeamWork #2", "redTeam": "1268A", "redScore": "233", "blueTeam": "1268K", "blueScore": "233"},
 *   {"matchId": "TeamWork #3", "redTeam": "80077D", "redScore": "194", "blueTeam": "80077C", "blueScore": "194"}
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
          matchIds: ['TeamWork #2', 'TeamWork #3']
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
      // 6. 使用 HTMLRewriter 流式解析
      // --------------------------------------------------------
      console.log(`[Worker] 开始 HTMLRewriter 流式解析...`);
      
      const results = await parseWithHTMLRewriter(targetResponse, matchIds);
      
      console.log(`[Worker] 解析完成，有效数据: ${results.length} 条`);

      // --------------------------------------------------------
      // 7. 返回结果
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
// HTMLRewriter 状态机解析器
// 
// 【核心设计】
// 由于 HTMLRewriter 是流式解析，没有 DOM 树，无法使用 querySelectorAll
// 我们通过状态机跟踪当前解析位置：
// 
// 状态转移：
// tr 进入 → 初始化 currentMatch
//   ↓
// td 进入 → 检查 class 属性
//   ├─ match-col → 设置捕获目标为 matchId
//   ├─ red-team → redCount++，根据计数捕获 team 或 score
//   └─ blue-team → blueCount++，根据计数捕获 team 或 score
//   ↓
// td 文本 → 根据捕获目标存储数据
//   ↓
// tr 退出 → 保存 currentMatch 到 results
// ============================================================
async function parseWithHTMLRewriter(response, matchIds) {
  // 结果数组
  const results = [];
  
  // 当前正在解析的比赛对象
  let currentMatch = null;
  
  // 红蓝方计数器
  let redCount = 0;
  let blueCount = 0;
  
  // 当前文本捕获目标
  let captureTarget = null; // 'matchId' | 'redTeam' | 'redScore' | 'blueTeam' | 'blueScore'
  
  // 文本缓冲区
  let textBuffer = '';

  // --------------------------------------------------------
  // 创建 HTMLRewriter 实例
  // 
  // 【监听器设计】
  // - tr: 进入时初始化比赛对象，退出时保存数据
  // - td: 进入时根据 class 设置捕获目标，文本时捕获数据
  // --------------------------------------------------------
  const rewriter = new HTMLRewriter()
    // --------------------------------------------------------
    // 监听 tr 标签 - 每场比赛一行
    // 
    // 【逻辑】
    // - 进入 tr 时：初始化 currentMatch，重置计数器
    // - 退出 tr 时：如果 currentMatch 有效，保存到 results
    // --------------------------------------------------------
    .on('tr', {
      // 进入 <tr> 标签时触发
      element(element) {
        // 初始化当前比赛对象
        currentMatch = {
          matchId: '',
          redTeam: '',
          redScore: '',
          blueTeam: '',
          blueScore: ''
        };
        
        // 重置计数器
        redCount = 0;
        blueCount = 0;
        
        // 重置捕获目标
        captureTarget = null;
        
        // 清空文本缓冲区
        textBuffer = '';
        
        console.log('[Worker] 进入 <tr> 标签，初始化比赛对象');
      },
      
      // 退出 <tr> 标签时触发
      end(element) {
        // 如果 currentMatch 有效且 matchId 不为空，保存到结果
        if (currentMatch && currentMatch.matchId) {
          // 检查是否在目标列表中
          const isTarget = matchIds.some(id => 
            currentMatch.matchId.includes(id) || id.includes(currentMatch.matchId)
          );
          
          if (isTarget) {
            console.log(`[Worker] 找到目标比赛: ${currentMatch.matchId}`);
            results.push({...currentMatch});
          }
        }
        
        // 重置 currentMatch
        currentMatch = null;
        
        console.log('[Worker] 退出 <tr> 标签');
      }
    })
    // --------------------------------------------------------
    // 监听 td 标签 - 每个单元格
    // 
    // 【逻辑】
    // - 进入 td 时：检查 class 属性，设置捕获目标
    // - 文本时：根据捕获目标存储数据
    // --------------------------------------------------------
    .on('td', {
      // 进入 <td> 标签时触发
      element(element) {
        // 获取 class 属性
        const classAttr = element.getAttribute('class') || '';
        
        console.log(`[Worker] 进入 <td> 标签，class: "${classAttr}"`);
        
        // 根据 class 设置捕获目标
        // 【关键修复】使用 includes() 容错匹配，处理 border-team 等复合 class
        if (classAttr.includes('match-col')) {
          // 比赛编号和时间列
          captureTarget = 'matchId';
          console.log('[Worker] 设置捕获目标: matchId');
        } else if (classAttr.includes('red-team')) {
          // 红方列 - 使用 includes() 容错匹配
          redCount++;
          if (redCount === 1) {
            captureTarget = 'redTeam';
            console.log('[Worker] 设置捕获目标: redTeam (第1次)');
          } else if (redCount === 2) {
            captureTarget = 'redScore';
            console.log('[Worker] 设置捕获目标: redScore (第2次)');
          }
        } else if (classAttr.includes('blue-team')) {
          // 蓝方列 - 使用 includes() 容错匹配，处理 "blue-team border-team" 等复合 class
          blueCount++;
          if (blueCount === 1) {
            captureTarget = 'blueTeam';
            console.log('[Worker] 设置捕获目标: blueTeam (第1次)');
          } else if (blueCount === 2) {
            captureTarget = 'blueScore';
            console.log('[Worker] 设置捕获目标: blueScore (第2次)');
          }
        } else {
          // 其他列，不捕获
          captureTarget = null;
        }
        
        // 清空文本缓冲区
        textBuffer = '';
      },
      
      // 文本节点时触发
      text(text) {
        // 如果有捕获目标，累加文本
        if (captureTarget) {
          textBuffer += text.text;
          console.log(`[Worker] 捕获文本: "${text.text}" -> ${captureTarget}`);
        }
      },
      
      // 退出 <td> 标签时触发
      end(element) {
        // 如果有捕获目标且 currentMatch 存在，存储数据
        if (captureTarget && currentMatch) {
          // 清洗文本：去除首尾空白
          const cleanText = textBuffer.trim();
          
          // 根据捕获目标存储
          switch (captureTarget) {
            case 'matchId':
              // 清洗比赛编号：只保留 TeamWork #数字 或 Match #数字-数字
              currentMatch.matchId = cleanMatchId(cleanText);
              console.log(`[Worker] 存储 matchId: "${currentMatch.matchId}"`);
              break;
            case 'redTeam':
              currentMatch.redTeam = cleanText;
              console.log(`[Worker] 存储 redTeam: "${currentMatch.redTeam}"`);
              break;
            case 'redScore':
              currentMatch.redScore = cleanText;
              console.log(`[Worker] 存储 redScore: "${currentMatch.redScore}"`);
              break;
            case 'blueTeam':
              currentMatch.blueTeam = cleanText;
              console.log(`[Worker] 存储 blueTeam: "${currentMatch.blueTeam}"`);
              break;
            case 'blueScore':
              currentMatch.blueScore = cleanText;
              console.log(`[Worker] 存储 blueScore: "${currentMatch.blueScore}"`);
              break;
          }
        }
        
        // 重置捕获目标和缓冲区
        captureTarget = null;
        textBuffer = '';
      }
    });

  // --------------------------------------------------------
  // 执行 HTMLRewriter 流式解析
  // --------------------------------------------------------
  await rewriter.transform(response).text();

  // --------------------------------------------------------
  // 返回结果
  // --------------------------------------------------------
  console.log(`[Worker] 解析完成，共找到 ${results.length} 场比赛`);
  return results;
}

// ============================================================
// 数据清洗函数 - 清洗比赛编号
// 
// 【输入】
// - 原始文本：如 "TeamWork #2 \n Aug 15th at 10:01 AM"
// 
// 【输出】
// - 清洗后：如 "TeamWork #2"
// 
// 【规则】
// - 资格赛：保留 "TeamWork #数字"
// - 淘汰赛：保留 "Match #数字-数字"
// ============================================================
function cleanMatchId(rawText) {
  // 去除首尾空白
  let text = rawText.trim();
  
  // 替换换行符为空格
  text = text.replace(/\n/g, ' ');
  
  // 【规则1】匹配资格赛格式：TeamWork #数字
  const teamWorkMatch = text.match(/TeamWork\s*#\d+/i);
  if (teamWorkMatch) {
    return teamWorkMatch[0].trim();
  }
  
  // 【规则2】匹配淘汰赛格式：Match #数字-数字
  const matchMatch = text.match(/Match\s*#\d+-\d+/i);
  if (matchMatch) {
    return matchMatch[0].trim();
  }
  
  // 【规则3】如果都不匹配，返回原始文本（可能需要进一步处理）
  console.log(`[Worker] 警告：无法清洗比赛编号: "${text}"`);
  return text;
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
