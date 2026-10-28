const { chromium } = require('/Users/w/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('http://127.0.0.1:8766/');
  const count = () => page.locator('#count').innerText().then(x => parseInt(x, 10));
  const flagged = () => page.locator('#rapid').innerText().then(x => parseInt(x, 10));
  const padPoint = async () => { const b = await page.locator('#pad').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const press = async (holdMs = 30, button = 'left') => { const p = await padPoint(); await page.mouse.move(p.x, p.y); await page.mouse.down({button}); if (holdMs) await page.waitForTimeout(holdMs); await page.mouse.up({button}); };
  const checked = [];

  await page.locator('#device-name').fill('自动验证隔离会话');
  await page.locator('#start').click();
  assert.equal(await page.locator('#source').isDisabled(), true);
  await press(); await page.waitForTimeout(220); await press(); await page.waitForTimeout(220); await press();
  assert.equal(await count(), 3); assert.equal(await flagged(), 0);
  checked.push('三次慢速单击只记录三次按下；松开不重复计数');
  await page.waitForTimeout(220);
  await page.locator('#pad').dblclick({delay:30});
  assert.equal(await count(), 5); assert.equal(await flagged(), 1);
  checked.push('主动双击记录两个按下和一处短间隔，不把 dblclick 再算一次');
  await page.locator('#stop').click();
  await page.locator('#actual').fill('1.5');
  assert.equal(await page.locator('#actual').evaluate(el=>el.checkValidity()),false);
  await page.locator('#actual').fill('4'); await page.locator('#confirm-single').check();
  assert.match(await page.locator('#result-title').innerText(), /多收到 1 次/);
  assert.match(await page.locator('#history').innerText(), /手指实际 4 次/);
  checked.push('实际次数和收到次数分开填写，结束后保存用户确认');

  const reportPromise = page.waitForEvent('download'); await page.locator('#export-report').click();
  const report = await reportPromise; const reportPath = path.join(__dirname,'qa-report.txt'); await report.saveAs(reportPath);
  assert.match(await fs.readFile(reportPath,'utf8'), /收到按下：5 次/);
  const jsonPromise = page.waitForEvent('download'); await page.locator('#export-json').click();
  const jsonDownload = await jsonPromise; const jsonPath = path.join(__dirname,'qa-events.json'); await jsonDownload.saveAs(jsonPath);
  const data = JSON.parse(await fs.readFile(jsonPath,'utf8'));
  assert.equal(data.presses.length,5); assert.equal(data.stats.rapid,1); assert.equal(data.actualCount,4);
  assert.equal(data.rawEvents.filter(x=>x.type==='pointerdown').length,5);
  assert.equal(data.rawEvents.filter(x=>x.type==='pointerup').length,5);
  assert.equal(data.presses.every(x=>x.holdMs!==null),true);
  checked.push('文字报告和 JSON 导出包含匹配的计数、按下/松开与用户确认');

  await page.locator('#button').selectOption('2'); await page.locator('#start').click(); await press(30,'right'); await page.locator('#stop').click();
  assert.equal(await count(),1); checked.push('右键可测且不会弹出菜单');
  await page.locator('#button').selectOption('1'); await page.locator('#start').click(); await press(30,'middle'); await page.locator('#stop').click();
  assert.equal(await count(),1); checked.push('中键可测且不会触发自动滚动');

  await page.locator('#button').selectOption('0'); await page.locator('#mode-hold').click(); await page.locator('#start').click();
  await press(3100); await page.waitForTimeout(220); await press(80);
  assert.equal(await count(),2); assert.equal(await flagged(),1);
  const p = await padPoint(); await page.mouse.move(p.x,p.y); await page.mouse.down();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur'))); await page.mouse.up();
  assert.equal(await count(),3); assert.equal(await flagged(),1);
  assert.match(await page.locator('#events').innerText(),/记录中断/);
  await page.locator('#stop').click();
  checked.push('持续按住3秒正常，主动短按标记未达目标，窗口中断不算作有效早松开');

  await page.locator('#mode-click').click(); await page.locator('#start').click();
  const outside = await padPoint(); await page.mouse.move(outside.x,outside.y); await page.mouse.down(); await page.mouse.move(20,20); await page.mouse.up();
  assert.equal(await count(),1);
  assert.doesNotMatch(await page.locator('#events').innerText(),/仍在按住|记录中断/);
  await page.locator('#stop').click();
  checked.push('移出测试区域后松开仍被完整记录；实际按键次数拒绝小数');

  await page.reload();
  assert.match(await page.locator('#history').innerText(),/自动验证隔离会话/);
  const offlinePromise = page.waitForEvent('download'); await page.locator('#download-page').click();
  const offline = await offlinePromise; const offlinePath = path.join(__dirname,'offline-qa.html'); await offline.saveAs(offlinePath);
  const local = await context.newPage(); const external = [];
  local.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  local.on('pageerror', error => errors.push(String(error)));
  await local.goto('file://'+offlinePath); await local.locator('#start').click(); await local.locator('#pad').click(); await local.locator('#stop').click();
  assert.equal(parseInt(await local.locator('#count').innerText(),10),1);
  assert.equal(external.length,0); checked.push('历史在刷新后保留；下载的单文件HTML离线可运行，无外部请求');

  await page.setViewportSize({width:390,height:844}); await page.screenshot({path:path.join(__dirname,'qa-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1280,height:1000});
  await page.evaluate(()=>localStorage.clear()); await page.reload();
  await page.screenshot({path:path.join(__dirname,'qa-desktop.png'),fullPage:true});
  checked.push('390px窄屏无页面横向溢出，桌面与窄屏布局已截图检查');
  assert.deepEqual(errors,[]);
  const webmcp = await page.evaluate(()=>typeof document.modelContext?.registerTool==='function');
  const result = {passed:true,checks:checked,pageErrors:errors,webmcpSupported:webmcp,webmcpValidation:webmcp?'available':'浏览器不支持，实际注册验证不可用；未影响普通页面测试'};
  await fs.writeFile(path.join(__dirname,'verification.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
