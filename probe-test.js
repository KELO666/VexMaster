/**
 * 云端探针测试脚本 (probe-test.js)
 * 
 * 功能：验证 Cloudflare Worker 的可用性和 CORS 配置
 * 目标：https://vex-proxy.linkelo666.workers.dev/
 * 
 * 测试内容：
 * 1. Worker 是否可访问
 * 2. CORS headers 是否正确配置
 * 3. POST 请求是否正常响应
 * 4. 返回的 JSON 结构是否符合预期
 */

const WORKER_URL = 'https://vex-proxy.linkelo666.workers.dev/';

// 使用真实的 VEX 比赛 URL 和 Mock matchIds
const TEST_PAYLOAD = {
  targetUrl: 'https://events.vex.com/zh-CN/robot-competitions/vex-iq-competition/RE-VIQRC-26-5111.html',
  matchIds: ['TeamWork #1', 'TeamWork #2', 'TeamWork #3']
};

async function runProbeTest() {
  console.log('🔬 [ProbeTest] ========== 云端探针测试开始 ==========');
  console.log(`🔬 [ProbeTest] 目标 Worker: ${WORKER_URL}`);
  console.log(`🔬 [ProbeTest] 测试时间: ${new Date().toISOString()}`);
  console.log('');
  
  // --------------------------------------------------------
  // 测试 1: OPTIONS 预检请求 (CORS Preflight)
  // --------------------------------------------------------
  console.log('🔬 [ProbeTest] --- 测试 1: OPTIONS 预检请求 ---');
  try {
    const optionsResponse = await fetch(WORKER_URL, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    console.log(`🔬 [ProbeTest] HTTP 状态码: ${optionsResponse.status}`);
    console.log(`🔬 [ProbeTest] access-control-allow-origin: ${optionsResponse.headers.get('access-control-allow-origin')}`);
    console.log(`🔬 [ProbeTest] access-control-allow-methods: ${optionsResponse.headers.get('access-control-allow-methods')}`);
    console.log(`🔬 [ProbeTest] access-control-allow-headers: ${optionsResponse.headers.get('access-control-allow-headers')}`);
    
    // 断言：CORS headers 必须存在
    const allowOrigin = optionsResponse.headers.get('access-control-allow-origin');
    if (allowOrigin === '*') {
      console.log('✅ [ProbeTest] PASS: CORS 预检请求正常，allow-origin 为 *');
    } else {
      console.log(`❌ [ProbeTest] FAIL: allow-origin 应为 *，实际为 ${allowOrigin}`);
    }
    console.log('');
  } catch (error) {
    console.log(`❌ [ProbeTest] OPTIONS 请求失败: ${error.message}`);
    console.log('');
  }
  
  // --------------------------------------------------------
  // 测试 2: POST 请求 - 正常数据
  // --------------------------------------------------------
  console.log('🔬 [ProbeTest] --- 测试 2: POST 请求 - 正常数据 ---');
  try {
    const postResponse = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(TEST_PAYLOAD)
    });
    
    console.log(`🔬 [ProbeTest] HTTP 状态码: ${postResponse.status}`);
    console.log(`🔬 [ProbeTest] Content-Type: ${postResponse.headers.get('content-type')}`);
    console.log(`🔬 [ProbeTest] access-control-allow-origin: ${postResponse.headers.get('access-control-allow-origin')}`);
    
    // 读取响应体
    const responseText = await postResponse.text();
    console.log(`🔬 [ProbeTest] 响应体长度: ${responseText.length} 字符`);
    
    // 尝试解析 JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log(`🔬 [ProbeTest] JSON 解析成功`);
      console.log(`🔬 [ProbeTest] 返回数据: ${JSON.stringify(responseData, null, 2)}`);
      
      // 断言：返回数据必须是数组
      if (Array.isArray(responseData)) {
        console.log(`✅ [ProbeTest] PASS: 返回数据是数组，包含 ${responseData.length} 条记录`);
      } else if (responseData.error) {
        console.log(`⚠️ [ProbeTest] WARN: 返回错误: ${responseData.error}`);
      } else {
        console.log(`❌ [ProbeTest] FAIL: 返回数据不是数组`);
      }
    } catch (e) {
      console.log(`❌ [ProbeTest] JSON 解析失败: ${e.message}`);
      console.log(`🔬 [ProbeTest] 原始响应: ${responseText.substring(0, 500)}`);
    }
    console.log('');
  } catch (error) {
    console.log(`❌ [ProbeTest] POST 请求失败: ${error.message}`);
    console.log('');
  }
  
  // --------------------------------------------------------
  // 测试 3: POST 请求 - 无效 URL
  // --------------------------------------------------------
  console.log('🔬 [ProbeTest] --- 测试 3: POST 请求 - 无效 URL ---');
  try {
    const invalidResponse = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        targetUrl: 'https://invalid-url-that-does-not-exist.com/test',
        matchIds: ['TeamWork #1']
      })
    });
    
    console.log(`🔬 [ProbeTest] HTTP 状态码: ${invalidResponse.status}`);
    
    const invalidText = await invalidResponse.text();
    let invalidData;
    try {
      invalidData = JSON.parse(invalidText);
      console.log(`🔬 [ProbeTest] 错误响应: ${JSON.stringify(invalidData, null, 2)}`);
      
      // 断言：错误响应必须包含 error 字段
      if (invalidData.error) {
        console.log(`✅ [ProbeTest] PASS: 错误响应包含 error 字段`);
      } else {
        console.log(`❌ [ProbeTest] FAIL: 错误响应缺少 error 字段`);
      }
    } catch (e) {
      console.log(`🔬 [ProbeTest] 非 JSON 响应: ${invalidText.substring(0, 200)}`);
    }
    console.log('');
  } catch (error) {
    console.log(`❌ [ProbeTest] 无效 URL 测试失败: ${error.message}`);
    console.log('');
  }
  
  // --------------------------------------------------------
  // 测试 4: POST 请求 - 缺少参数
  // --------------------------------------------------------
  console.log('🔬 [ProbeTest] --- 测试 4: POST 请求 - 缺少参数 ---');
  try {
    const missingParamResponse = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        targetUrl: 'https://events.vex.com/test'
        // 缺少 matchIds
      })
    });
    
    console.log(`🔬 [ProbeTest] HTTP 状态码: ${missingParamResponse.status}`);
    
    const missingParamText = await missingParamResponse.text();
    let missingParamData;
    try {
      missingParamData = JSON.parse(missingParamText);
      console.log(`🔬 [ProbeTest] 错误响应: ${JSON.stringify(missingParamData, null, 2)}`);
      
      // 断言：错误响应必须包含 error 字段
      if (missingParamData.error) {
        console.log(`✅ [ProbeTest] PASS: 缺少参数时返回错误`);
      } else {
        console.log(`❌ [ProbeTest] FAIL: 缺少参数时未返回错误`);
      }
    } catch (e) {
      console.log(`🔬 [ProbeTest] 非 JSON 响应: ${missingParamText.substring(0, 200)}`);
    }
    console.log('');
  } catch (error) {
    console.log(`❌ [ProbeTest] 缺少参数测试失败: ${error.message}`);
    console.log('');
  }
  
  // --------------------------------------------------------
  // 测试总结
  // --------------------------------------------------------
  console.log('🔬 [ProbeTest] ========== 测试总结 ==========');
  console.log('🔬 [ProbeTest] 如果 Worker 正常运行，你应该看到：');
  console.log('🔬 [ProbeTest]   - OPTIONS 请求返回 204');
  console.log('🔬 [ProbeTest]   - POST 请求返回 JSON 数组或错误对象');
  console.log('🔬 [ProbeTest]   - 所有响应都包含 access-control-allow-origin: *');
  console.log('');
  console.log('🔬 [ProbeTest] 如果看到错误，请检查：');
  console.log('🔬 [ProbeTest]   1. Worker 是否已部署到 Cloudflare');
  console.log('🔬 [ProbeTest]   2. Worker URL 是否正确');
  console.log('🔬 [ProbeTest]   3. 目标网站是否可访问');
  console.log('');
  console.log('🔬 [ProbeTest] ========== 测试完成 ==========');
}

// 执行测试
runProbeTest().catch(error => {
  console.error('❌ [ProbeTest] 测试执行失败:', error);
});
