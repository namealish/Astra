import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 // Test-only instrumentation: no debugging global is shipped to the site.
 await page.route('**/app.js',async route=>{
  const response=await route.fetch();
  const body=(await response.text()).replace('if(!controller){fallback', 'window.__heroMotion=()=>controller.getMotion();\nif(!controller){fallback');
  await route.fulfill({response,body});
 });
 await page.goto(process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/',{waitUntil:'networkidle'});
 await page.waitForSelector('.planetarium-ready');
 await page.evaluate(()=>{
  window.__handoffs=[];
  new MutationObserver(()=>{
   const motion=window.__heroMotion();
   window.__handoffs.push({title:document.querySelector('#hero-title').textContent,gap:Math.abs(motion.target-motion.progress),target:((Math.round(motion.target)%5)+5)%5});
  }).observe(document.querySelector('#hero-title'),{childList:true});
 });
 await page.locator('[data-destination="0"]').click();
 await page.waitForFunction(()=>document.querySelector('#hero-title').textContent==='LUNA');
 await page.evaluate(()=>{for(const i of [3,1,4,2])document.querySelector(`[data-destination="${i}"]`).click();});
 await page.waitForFunction(()=>document.querySelector('#hero-title').textContent==='EUROPA');
 await page.locator('[data-open-destination="1"]').click();
 await page.waitForFunction(()=>document.querySelector('#hero-title').textContent==='MARS');
 const handoffs=await page.evaluate(()=>window.__handoffs);
 assert.equal(handoffs.length,3,'Stale rapid-click titles must not be committed');
 for(const record of handoffs){assert(record.gap<.281);assert.equal(['LUNA','MARS','EUROPA','SATURN','TITAN'][record.target],record.title);}
 assert.deepEqual(errors,[]);
 await mkdir(new URL('../tmp/editorial-final/',import.meta.url),{recursive:true});
 await writeFile(new URL('../tmp/editorial-final/handoffs.json',import.meta.url),JSON.stringify({handoffs,errors},null,2));
 console.log(JSON.stringify({handoffs,errors},null,2));
} finally {await browser.close();}
