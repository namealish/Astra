import{chromium}from'playwright-core';
import{mkdir,writeFile}from'node:fs/promises';
import assert from'node:assert/strict';
const output=new URL('../tmp/departure/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report=[];
try{
 for(const[name,width,height,motion]of[['desktop',1440,900,'no-preference'],['mobile',390,844,'no-preference'],['reduced',375,812,'reduce']]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:motion});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/app.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('if(!controller){fallback','window.__renderer=controller;\nif(!controller){fallback')});});
  await page.addInitScript(()=>{window.__contexts=new Set();const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){const result=original.apply(this,args);if(result&&/^webgl/.test(args[0]))window.__contexts.add(result);return result;};});
  await page.goto(process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/',{waitUntil:'networkidle'});
  await page.waitForSelector('.planetarium-ready');
  await page.locator('#begin-journey').click();
  const began=Date.now(),phases=[],drawCalls=[];
  if(motion!=='reduce'){
   for(const phase of['terminal','launching','earthDeparture','deepSpace','planetaryReveal']){
    await page.waitForFunction(p=>document.querySelector('#navigation-experience').dataset.phase===p,phase);
    await page.waitForTimeout(180);phases.push(phase);
    drawCalls.push(await page.evaluate(()=>window.__renderer.getSceneState()?.draws));
    await page.screenshot({path:new URL(name+'-'+phase+'.png',output).pathname.replace(/^\/(\w:)/,'$1')});
   }
  }
  await page.waitForFunction(()=>!document.querySelector('#navigation-experience').open,null,{timeout:18000});
  const durationSeconds=(Date.now()-began)/1000;
  if(motion!=='reduce'){assert(durationSeconds>=8&&durationSeconds<14);assert(drawCalls.every(count=>count<=13));}
  assert.equal(await page.locator('#planet-canvas').evaluate(el=>el.parentElement.id),'home');
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.destination),'3');
  await page.locator('#replay-intro').click();
  if(motion!=='reduce'){await page.waitForTimeout(350);await page.locator('#skip-intro').click();}
  await page.waitForFunction(()=>!document.querySelector('#navigation-experience').open);
  await page.locator('#begin-journey').click();
  if(motion!=='reduce')await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('#navigation-experience').open);
  await page.locator('#hero-next').click();await page.waitForFunction(()=>document.querySelector('#hero-title').textContent==='TITAN');
  assert.equal(await page.evaluate(()=>window.__contexts.size),1);
  assert.equal(await page.locator('#planet-canvas').evaluate(canvas=>(canvas.getContext('webgl2')||canvas.getContext('webgl')).getError()),0);
  assert.deepEqual(errors,[]);report.push({name,phases,durationSeconds,drawCalls,complete:true,replay:true,skip:motion!=='reduce',escape:motion!=='reduce',contexts:1,errors});
  await page.close();
 }
}finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
