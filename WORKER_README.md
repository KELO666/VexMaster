# VEX 赛事数据代理 Worker

## 功能说明

这是一个 Cloudflare Worker，用于代理抓取 `events.vex.com` 的比赛页面，提取指定队伍的赛程比分数据，并以 JSON 格式返回给前端应用。

## 为什么需要这个 Worker？

1. **跨域问题**：前端直接请求 `events.vex.com` 会遇到 CORS 限制
2. **WAF 拦截**：直接请求可能被目标网站的防火墙拦截
3. **数据清洗**：将 HTML 页面转换为结构化的 JSON 数据

## 部署步骤

### 方法 1：使用 Cloudflare Dashboard

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 `Workers & Pages`
3. 点击 `Create Application`
4. 选择 `Worker`
5. 输入 Worker 名称（如 `vex-proxy`）
6. 将 `worker.js` 的内容粘贴到编辑器中
7. 点击 `Deploy`

### 方法 2：使用 Wrangler CLI

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 创建 Worker 项目
wrangler init vex-proxy

# 将 worker.js 复制到项目目录
cp worker.js vex-proxy/src/index.js

# 部署
cd vex-proxy
wrangler deploy
```

## 使用方法

部署完成后，通过 GET 请求访问 Worker：

```
https://your-worker.workers.dev/?targetUrl=https://events.vex.com/...&teamNumber=53168C
```

### 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `targetUrl` | ✅ | 目标网页的完整 URL |
| `teamNumber` | ✅ | 要查询的队伍编号（如 53168C） |

### 返回示例

```json
{
  "success": true,
  "teamNumber": "53168C",
  "matchCount": 2,
  "matches": [
    {
      "matchId": "Q123",
      "field": "Field A",
      "time": "10:30 AM",
      "redTeams": ["53168C", "12345A"],
      "blueTeams": ["67890B", "11111D"],
      "redScore": "45",
      "blueScore": "32",
      "status": "Final",
      "division": "小学组"
    }
  ]
}
```

### 错误响应示例

```json
{
  "error": "缺少必要参数",
  "message": "请提供 targetUrl 参数",
  "example": "/?targetUrl=https://events.vex.com/...&teamNumber=53168C"
}
```

## 前端调用示例

### JavaScript

```javascript
async function fetchVexData(targetUrl, teamNumber) {
  const workerUrl = 'https://your-worker.workers.dev/';
  const params = new URLSearchParams({
    targetUrl: targetUrl,
    teamNumber: teamNumber
  });
  
  try {
    const response = await fetch(`${workerUrl}?${params}`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`找到 ${data.matchCount} 场比赛`);
      return data.matches;
    } else {
      console.error('查询失败:', data.error);
      return [];
    }
  } catch (error) {
    console.error('网络错误:', error);
    return [];
  }
}

// 使用示例
const matches = await fetchVexData(
  'https://events.vex.com/competition/12345/results',
  '53168C'
);
```

### 在 VEX 赛程管理助手中集成

在 `index.html` 中添加以下函数：

```javascript
// 从云端获取实时比分
window.fetchLiveScores = async function(teamNumber) {
  const workerUrl = 'https://your-worker.workers.dev/';
  
  // 需要用户提供目标 URL
  const targetUrl = prompt('请输入比赛结果页面的 URL：');
  if (!targetUrl) return;
  
  const params = new URLSearchParams({
    targetUrl: targetUrl,
    teamNumber: teamNumber
  });
  
  try {
    const response = await fetch(`${workerUrl}?${params}`);
    const data = await response.json();
    
    if (data.success) {
      // 更新本地数据
      data.matches.forEach(match => {
        const key = `${match.matchId}_${teamNumber}`;
        scoresDb[key] = match.redScore; // 或根据红蓝方判断
      });
      window.saveData();
      alert(`成功获取 ${data.matchCount} 场比赛数据！`);
    } else {
      alert('获取失败：' + data.message);
    }
  } catch (error) {
    alert('网络错误：' + error.message);
  }
};
```

## 技术细节

### CORS 处理

Worker 在所有响应中都添加了以下 headers：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### User-Agent 伪装

Worker 使用伪造的 Chrome 浏览器 User-Agent 发起请求，绕过目标网站的 WAF 检测。

### 数据解析策略

1. **优先匹配表格行**：使用正则表达式匹配 `<tr>` 标签中的内容
2. **回退匹配 div**：如果未找到表格，尝试匹配 `<div>` 结构
3. **多模式提取**：针对不同的 HTML 结构使用不同的提取规则

## 注意事项

1. **目标网站结构变化**：如果 `events.vex.com` 改变了页面结构，可能需要调整正则表达式
2. **请求频率限制**：Cloudflare Worker 免费版每天有 100,000 次请求限制
3. **数据缓存**：可以考虑添加 Cloudflare Cache API 来缓存频繁请求的数据

## 调试

在 Cloudflare Dashboard 的 Worker 页面，可以查看实时日志：

1. 进入 Worker 详情页
2. 点击 `Logs` 标签
3. 发起请求后即可看到日志输出

## License

MIT
