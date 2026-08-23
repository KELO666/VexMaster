/**
 * VEX 成果页 DOM 结构探路脚本 (系统 Chrome 版本)
 * 
 * 功能：使用系统已安装的 Chrome 浏览器抓取目标页面
 * 目的：为后续 HTMLRewriter 解析器提供准确的选择器依据
 * 
 * 使用方式：node scrape-vex-system-chrome.js
 * 前置条件：npm install puppeteer-core
 */

// ============================================================
// 目标 URL
// ============================================================
const TARGET_URL = 'https://events.vex.com/zh-CN/robot-competitions/vex-iq-competition/RE-VIQRC-26-5111.html';

// 系统 Chrome 路径 (macOS)
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ============================================================
// 主函数
// ============================================================
async function main() {
  let browser = null;
  
  console.log('='.repeat(80));
  console.log('🔍 VEX 成果页 DOM 结构探路 (系统 Chrome)');
  console.log('='.repeat(80));
  console.log('');
  console.log('📡 目标 URL:', TARGET_URL);
  console.log('');
  
  try {
    // --------------------------------------------------------
    // 1. 导入 puppeteer-core
    // --------------------------------------------------------
    console.log('🚀 正在加载 puppeteer-core...');
    
    const puppeteer = require('puppeteer-core');
    
    console.log('✅ puppeteer-core 加载成功');
    console.log('');

    // --------------------------------------------------------
    // 2. 启动系统 Chrome
    // --------------------------------------------------------
    console.log('🚀 正在启动系统 Chrome...');
    console.log('   路径:', CHROME_PATH);
    
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    console.log('✅ Chrome 启动成功');
    console.log('');

    // --------------------------------------------------------
    // 3. 创建新页面
    // --------------------------------------------------------
    const page = await browser.newPage();
    
    // 设置视口大小
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 设置 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // --------------------------------------------------------
    // 4. 导航到目标页面
    // --------------------------------------------------------
    console.log('⏳ 正在导航到目标页面...');
    console.log('   (等待 Cloudflare 验证通过...)');
    
    await page.goto(TARGET_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // 等待页面完全加载
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('✅ 页面加载完成');
    console.log('');

    // --------------------------------------------------------
    // 5. 获取页面标题和 URL
    // --------------------------------------------------------
    const title = await page.title();
    const currentUrl = page.url();
    
    console.log('📌 页面标题:', title);
    console.log('📌 当前 URL:', currentUrl);
    console.log('');

    // --------------------------------------------------------
    // 6. 获取完整 HTML
    // --------------------------------------------------------
    console.log('⏳ 正在提取 HTML...');
    
    const html = await page.content();
    console.log(`✅ HTML 提取成功! 长度: ${html.length} 字符`);
    console.log('');

    // --------------------------------------------------------
    // 7. 查找核心表格结构
    // --------------------------------------------------------
    console.log('='.repeat(80));
    console.log('📊 查找核心表格结构');
    console.log('='.repeat(80));
    console.log('');

    // 【策略】尝试多种选择器查找表格
    const tablePatterns = [
      // 模式 1：标准 table 标签
      /<table[^>]*class="[^"]*(?:match|score|result|competition|rank|standing|table)[^"]*"[^>]*>[\s\S]*?<\/table>/gi,
      // 模式 2：带有 data 属性的 table
      /<table[^>]*data-[^>]*>[\s\S]*?<\/table>/gi,
      // 模式 3：所有 table 标签
      /<table[^>]*>[\s\S]*?<\/table>/gi
    ];

    let foundTables = [];
    
    for (const pattern of tablePatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        foundTables = matches;
        console.log(`✅ 使用模式找到 ${matches.length} 个表格`);
        break;
      }
    }

    if (foundTables.length === 0) {
      console.log('⚠️  未找到标准 <table> 标签，尝试查找其他结构...');
      
      // 尝试查找 div 结构
      const divPatterns = [
        /<div[^>]*class="[^"]*(?:match|score|result|competition|rank|standing|table|list|grid)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
        /<div[^>]*id="[^"]*(?:match|score|result|competition|rank|standing)[^"]*"[^>]*>[\s\S]*?<\/div>/gi
      ];
      
      for (const pattern of divPatterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          foundTables = matches;
          console.log(`✅ 使用 div 模式找到 ${matches.length} 个容器`);
          break;
        }
      }
    }

    // --------------------------------------------------------
    // 8. 打印第一个表格的完整结构
    // --------------------------------------------------------
    if (foundTables.length > 0) {
      console.log('');
      console.log('='.repeat(80));
      console.log('📋 第一个表格的完整 HTML 结构');
      console.log('='.repeat(80));
      console.log('');
      
      // 限制输出长度，避免刷屏
      const tableHtml = foundTables[0];
      const truncated = tableHtml.length > 10000 
        ? tableHtml.substring(0, 10000) + '\n\n... (截断，完整长度: ' + tableHtml.length + ' 字符)'
        : tableHtml;
      
      console.log(truncated);
      console.log('');

      // --------------------------------------------------------
      // 9. 分析表格结构
      // --------------------------------------------------------
      console.log('='.repeat(80));
      console.log('🔬 表格结构分析');
      console.log('='.repeat(80));
      console.log('');

      // 提取 class 名称
      const classMatch = tableHtml.match(/<table[^>]*class="([^"]*)"/i);
      if (classMatch) {
        console.log('📌 表格 class:', classMatch[1]);
      }

      // 提取 id
      const idMatch = tableHtml.match(/<table[^>]*id="([^"]*)"/i);
      if (idMatch) {
        console.log('📌 表格 id:', idMatch[1]);
      }

      // 提取表头 th
      const thMatches = tableHtml.match(/<th[^>]*>[\s\S]*?<\/th>/gi);
      if (thMatches) {
        console.log('');
        console.log('📌 表头 (th) 列表:');
        thMatches.forEach((th, i) => {
          const text = th.replace(/<[^>]+>/g, '').trim();
          console.log(`   ${i + 1}. ${text}`);
        });
      }

      // 提取前 3 个数据行 tr
      const trMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
      if (trMatches && trMatches.length > 0) {
        console.log('');
        console.log(`📌 数据行 (tr) 示例 (共 ${trMatches.length} 行，显示前 3 行):`);
        console.log('');
        trMatches.slice(0, 3).forEach((tr, i) => {
          console.log(`--- 第 ${i + 1} 行 ---`);
          console.log(tr);
          console.log('');
        });
      }

    } else {
      console.log('❌ 未找到任何表格结构');
      console.log('');
      console.log('💡 可能原因：');
      console.log('   1. 页面使用 JavaScript 动态渲染内容');
      console.log('   2. 需要登录才能查看');
      console.log('   3. 页面结构与预期不同');
    }

    // --------------------------------------------------------
    // 10. 打印页面中所有包含相关关键词的 class
    // --------------------------------------------------------
    console.log('');
    console.log('='.repeat(80));
    console.log('🏷️  页面中所有相关 class 名称');
    console.log('='.repeat(80));
    console.log('');

    const classRegex = /class="([^"]*(?:score|match|result|team|point|competition|rank|standing|division|alliance)[^"]*)"/gi;
    const allClasses = new Set();
    let classMatch2;

    while ((classMatch2 = classRegex.exec(html)) !== null) {
      allClasses.add(classMatch2[1]);
    }

    if (allClasses.size > 0) {
      console.log('找到以下相关 class:');
      allClasses.forEach(cls => {
        console.log(`   - ${cls}`);
      });
    } else {
      console.log('未找到包含相关关键词的 class');
    }

    // --------------------------------------------------------
    // 11. 保存完整 HTML 到文件
    // --------------------------------------------------------
    console.log('');
    console.log('='.repeat(80));
    console.log('💾 保存完整 HTML 到文件');
    console.log('='.repeat(80));
    console.log('');

    const fs = require('fs');
    const outputPath = 'vex-page-chrome.html';
    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`✅ 完整 HTML 已保存到: ${outputPath}`);
    console.log(`   文件大小: ${(html.length / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error('');
    console.error('❌ 错误:', error.message);
    console.error('');
    console.error('错误栈:', error.stack);
  } finally {
    // --------------------------------------------------------
    // 12. 关闭浏览器
    // --------------------------------------------------------
    if (browser) {
      await browser.close();
      console.log('');
      console.log('🔒 浏览器已关闭');
    }
  }
}

// ============================================================
// 执行主函数
// ============================================================
main().then(() => {
  console.log('');
  console.log('='.repeat(80));
  console.log('🏁 探路完成，请架构师分析上述结构并下发解析指令');
  console.log('='.repeat(80));
}).catch(err => {
  console.error('致命错误:', err);
});
