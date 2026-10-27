import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/dist/index.html';
const output=new URL('../tmp/performance/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report={url:base,browser:browser.version(),note:'Headless Chrome measurements; not physical-device FPS or total GPU memory.'};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.addInitScript(()=>{
  window.__drawCount=0;
  for(const type of [window.WebGLRenderingContext,window.WebGL2RenderingContext])if(type)for(const method of ['drawArrays','drawElements']){
   const original=type.prototype[method];type.prototype[method]=function(...args){window.__drawCount++;return original.apply(this,args);};
  }
 });
 await page.goto(base,{waitUntil:'networkidle'});await page.waitForSelector('.planetarium-ready');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 async function sample(){
  await cdp.send('HeapProfiler.collectGarbage');await page.waitForTimeout(150);await cdp.send('HeapProfiler.collectGarbage');
  const performance=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
  return{heapBytes:performance.JSHeapUsedSize,dom:await cdp.send('Memory.getDOMCounters'),canvases:await page.locator('canvas').count(),lightingImages:await page.locator('#lighting-images img').count()};
 }
 async function cycle(){
  await page.locator('#begin-journey').click();await page.waitForSelector('#navigation-experience[data-phase="terminal"]');
  await page.locator('#skip-intro').click();await page.waitForTimeout(100);
  await page.locator('#open-solar-system').click();await page.waitForSelector('#navigation-experience[data-phase="ready"]');
  await page.locator('#solar-explore').click();await page.locator('#destination-skip').click();
  await page.waitForSelector('#destination-experience[data-state="arrived"][data-lighting-state="ready"]');
  await page.locator('[data-lighting="3"]').click();await page.waitForSelector('#destination-experience[data-lighting-state="ready"]');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#destination-experience').open);
  await page.waitForTimeout(250);
 }
 await cycle();report.warmedBaseline=await sample();report.rounds=[];
 const rounds=Math.max(4,Math.min(30,Number(process.env.ASTRAEA_MEMORY_ROUNDS)||4));
 for(let i=0;i<rounds;i++){await cycle();report.rounds.push(await sample());}
 const baseline=report.warmedBaseline;
 for(const round of report.rounds){
  assert.equal(round.canvases,1);assert.equal(round.lightingImages,0);
  assert(round.dom.nodes<=baseline.dom.nodes+20,'Detached DOM accumulation after full experience cycles');
  assert(round.dom.jsEventListeners<=baseline.dom.jsEventListeners+10,'Listener accumulation after full experience cycles');
  // Warmed modules and V8 caches may grow slightly. Catch material, repeated
  // retention without presenting JS heap as the browser/GPU memory footprint.
  assert(round.heapBytes<baseline.heapBytes+2*1024*1024,'Unexpected retained JS heap growth');
 }
 report.heapChangeBytes=report.rounds.at(-1).heapBytes-baseline.heapBytes;
 await page.locator('#hero-explore').click();await page.locator('#destination-skip').click();
 await page.waitForSelector('#destination-experience[data-state="arrived"][data-lighting-state="ready"]');
 await page.waitForTimeout(200);const covered=await page.evaluate(()=>window.__drawCount);await page.waitForTimeout(400);
 report.coveredHeroDraws=(await page.evaluate(()=>window.__drawCount))-covered;assert.equal(report.coveredHeroDraws,0);
 report.activeResortDecodedImageEstimateBytes=await page.locator('#lighting-images img').evaluateAll(images=>images.reduce((sum,image)=>sum+image.naturalWidth*image.naturalHeight*4,0));
 await page.keyboard.press('Escape');await page.waitForTimeout(200);
 await page.locator('#crew').scrollIntoViewIfNeeded();await page.waitForTimeout(300);
 const offscreen=await page.evaluate(()=>window.__drawCount);await page.waitForTimeout(400);
 report.offscreenHeroDraws=(await page.evaluate(()=>window.__drawCount))-offscreen;assert.equal(report.offscreenHeroDraws,0);
 assert.deepEqual(errors,[]);report.errors=errors;
}catch(error){report.failure=error.stack;throw error;}
finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
