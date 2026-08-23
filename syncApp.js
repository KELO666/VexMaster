/**
 * VEX 赛程管理助手 - 数据同步模块
 * 
 * 功能：从 Cloudflare Worker 获取实时比分，回填到本地 LocalStorage
 * 环境：纯前端，兼容 iOS Safari / 老款 iPad
 * 
 * 使用方式：
 * 1. 在浏览器控制台执行：syncScoresFromWeb('https://your-worker.workers.dev/')
 * 2. 或绑定到按钮点击事件
 * 
 * 【核心逻辑】
 * 1. 读取 globalMatches 获取所有比赛的 matchId
 * 2. 向 Worker 发送 POST 请求，获取比分数据
 * 3. 根据 globalMatches 匹配每场比赛的红蓝方队伍
 * 4. 更新 scoresDb（key 格式：${matchId}_${team}）
 * 5. 调用现有函数保存数据并刷新 UI
 */

// ============================================================
// Worker URL 配置
// 
// 【注意】部署后请修改为你的 Worker 地址
// 格式：https://your-worker-name.your-subdomain.workers.dev/
// ============================================================
const WORKER_URL = 'https://vex-score-proxy.jc-1234.workers.dev/';

// ============================================================
// 核心同步函数 - 无侵入式补丁
// 
// 【设计原则】
// - 不修改任何原有代码
// - 不改变任何数据结构
// - 只向 scoresDb 写入数据
// - 通过现有函数触发 UI 更新
// ============================================================
window.syncScoresFromWeb = async function(targetUrl) {
  console.log('[SyncData] ========== 开始同步比分 ==========');
  console.log('[SyncData] 目标网址:', targetUrl);
  
  // --------------------------------------------------------
  // 1. 获取参数：从全局变量 globalMatches 提取所有比赛 ID
  // 
  // 【数据来源】
  // globalMatches 是用户通过 PDF 导入的比赛数据
  // 格式：[{matchId: "Q19", team1: "53168C", team2: "12345A", ...}]
  // --------------------------------------------------------
  if (typeof globalMatches === 'undefined' || globalMatches.length === 0) {
    console.error('[SyncData] 错误：globalMatches 为空，请先导入 PDF 数据');
    alert('请先导入 PDF 对阵表数据！');
    return;
  }

  // 提取所有唯一的 matchId
  const matchIds = [...new Set(globalMatches.map(m => m.matchId))];
  console.log('[SyncData] 提取到比赛 ID 列表:', matchIds);
  console.log('[SyncData] 比赛总数:', matchIds.length);

  // --------------------------------------------------------
  // 2. 发送网络请求：向 Worker 获取比分数据
  // 
  // 【请求格式】
  // POST /
  // Content-Type: application/json
  // {
  //   "targetUrl": "https://events.vex.com/...",
  //   "matchIds": ["Q19", "Q20", "Q21"]
  // }
  // 
  // 【响应格式】
  // [
  //   {"matchId": "Q19", "redScore": 236, "blueScore": 100},
  //   {"matchId": "Q20", "redScore": 150, "blueScore": 180}
  // ]
  // --------------------------------------------------------
  console.log('[SyncData] 正在发送请求到 Worker...');
  
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        targetUrl: targetUrl,
        matchIds: matchIds
      })
    });

    // --------------------------------------------------------
    // 3. 处理响应：检查 HTTP 状态码
    // --------------------------------------------------------
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[SyncData] Worker 返回错误:', errorData);
      alert('获取比分失败：' + (errorData.message || errorData.error));
      return;
    }

    const scoreDataList = await response.json();
    console.log('[SyncData] Worker 返回数据:', scoreDataList);
    console.log('[SyncData] 解析到', scoreDataList.length, '条比分数据');

    // --------------------------------------------------------
    // 4. 核心映射逻辑：将比分数据匹配到对应的队伍
    // 
    // 【映射规则】
    // - Worker 返回的 redScore 是红方（team1）的得分
    // - Worker 返回的 blueScore 是蓝方（team2）的得分
    // - 我们需要为每场比赛的双方队伍分别更新 scoresDb
    // 
    // 【scoresDb 格式】
    // Key: "${matchId}_${teamNumber}"
    // Value: 分数（字符串）
    // 
    // 示例：
    // scoresDb["Q19_53168C"] = "236"  ← 红方队伍 53168C 的得分
    // scoresDb["Q19_12345A"] = "236"  ← 红方队伍 12345A 的得分（同队）
    // scoresDb["Q19_67890B"] = "100"  ← 蓝方队伍 67890B 的得分
    // --------------------------------------------------------
    let updatedCount = 0;
    
    console.log('[SyncData] 开始匹配队伍...');
    
    for (const scoreData of scoreDataList) {
      const { matchId, redScore, blueScore } = scoreData;
      console.log(`[SyncData] 处理比赛 ${matchId}: 红方=${redScore}, 蓝方=${blueScore}`);
      
      // 在 globalMatches 中查找该比赛
      const match = globalMatches.find(m => m.matchId === matchId);
      
      if (!match) {
        console.log(`[SyncData] 警告：在 globalMatches 中未找到比赛 ${matchId}`);
        continue;
      }

      // --------------------------------------------------------
      // 更新红方队伍的得分
      // 
      // 【team1】是红方队伍编号
      // 【key 格式】"${matchId}_${team1}"
      // --------------------------------------------------------
      const redKey = `${matchId}_${match.team1}`;
      scoresDb[redKey] = String(redScore);
      console.log(`[SyncData] 保存红方得分: ${redKey} = ${redScore}`);

      // --------------------------------------------------------
      // 更新蓝方队伍的得分
      // 
      // 【team2】是蓝方队伍编号
      // 【key 格式】"${matchId}_${team2}"
      // --------------------------------------------------------
      const blueKey = `${matchId}_${match.team2}`;
      scoresDb[blueKey] = String(blueScore);
      console.log(`[SyncData] 保存蓝方得分: ${blueKey} = ${blueScore}`);

      updatedCount++;
    }

    console.log('[SyncData] 队伍匹配完成，更新了', updatedCount, '场比赛的得分');

    // --------------------------------------------------------
    // 5. 状态持久化：调用现有函数保存数据到 LocalStorage
    // 
    // 【注意】
    // saveData() 是原有代码中的函数，负责将以下变量写入 LocalStorage：
    // - globalMatches
    // - myTeams
    // - currentViewTeam
    // - scoresDb
    // - doneDb
    // 
    // 我们只修改了 scoresDb，其他变量保持不变
    // --------------------------------------------------------
    console.log('[SyncData] 正在保存数据到 LocalStorage...');
    
    if (typeof window.saveData === 'function') {
      window.saveData();
      console.log('[SyncData] 数据保存成功');
    } else {
      console.error('[SyncData] 错误：找不到 saveData 函数');
    }

    // --------------------------------------------------------
    // 6. UI 重绘：调用现有函数刷新界面
    // 
    // 【renderSingleTeam()】
    // - 刷新单队视图页面
    // - 显示当前选中队伍的所有比赛及得分
    // 
    // 【renderMasterTimeline()】
    // - 刷新大师总表页面
    // - 显示所有关注队伍的时间线
    // --------------------------------------------------------
    console.log('[SyncData] 正在刷新 UI...');
    
    if (typeof window.renderSingleTeam === 'function') {
      window.renderSingleTeam();
      console.log('[SyncData] 单队视图刷新完成');
    } else {
      console.error('[SyncData] 错误：找不到 renderSingleTeam 函数');
    }

    if (typeof window.renderMasterTimeline === 'function') {
      window.renderMasterTimeline();
      console.log('[SyncData] 大师总表刷新完成');
    } else {
      console.error('[SyncData] 错误：找不到 renderMasterTimeline 函数');
    }

    // --------------------------------------------------------
    // 7. 完成提示
    // --------------------------------------------------------
    console.log('[SyncData] ========== 同步完成 ==========');
    console.log(`[SyncData] 成功同步 ${updatedCount} 场比赛的比分`);
    
    alert(`✅ 比分同步成功！\n\n已更新 ${updatedCount} 场比赛的数据。\n\n请刷新页面查看最新比分。`);

  } catch (error) {
    // --------------------------------------------------------
    // 异常处理：网络错误或其他异常
    // --------------------------------------------------------
    console.error('[SyncData] 网络错误:', error);
    alert('同步失败：' + error.message + '\n\n请检查网络连接或 Worker 配置。');
  }
};

// ============================================================
// 辅助函数：获取当前同步状态（可选）
// 
// 【用途】
// 可以在控制台调用此函数，查看 scoresDb 中的数据
// ============================================================
window.getSyncStatus = function() {
  console.log('[SyncData] ========== 同步状态 ==========');
  console.log('[SyncData] globalMatches 数量:', globalMatches?.length || 0);
  console.log('[SyncData] scoresDb 数据:', scoresDb);
  
  // 统计有得分的比赛数量
  const matchCount = new Set(
    Object.keys(scoresDb)
      .filter(key => key.includes('_'))
      .map(key => key.split('_')[0])
  ).size;
  
  console.log('[SyncData] 已同步比分的比赛数:', matchCount);
  return { matchCount, scoresDb };
};

// ============================================================
// 使用示例（注释）
// ============================================================

/**
 * 【在浏览器控制台使用】
 * 
 * 1. 同步比分：
 *    syncScoresFromWeb('https://events.vex.com/competition/12345/results')
 * 
 * 2. 查看同步状态：
 *    getSyncStatus()
 * 
 * 3. 直接查看 scoresDb：
 *    console.log(scoresDb)
 */

/**
 * 【绑定到按钮】
 * 
 * 在 index.html 中添加按钮：
 * <button onclick="syncScoresFromWeb('https://events.vex.com/...')">同步比分</button>
 */

/**
 * 【定时自动同步】（可选，谨慎使用）
 * 
 * // 每 5 分钟自动同步一次
 * setInterval(() => {
 *   syncScoresFromWeb('https://events.vex.com/...');
 * }, 5 * 60 * 1000);
 */

// ============================================================
// 初始化日志
// ============================================================
console.log('[SyncData] 模块加载完成');
console.log('[SyncData] 可用函数: syncScoresFromWeb(targetUrl), getSyncStatus()');
