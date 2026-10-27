import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=new URL('../tmp/departure-interruption/',import.meta.url);await mkdir(output,{recursive:true});
const base=process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report={};
async function ready(page){await page.goto(base,{waitUntil:'networkidle'});await page.waitForSelector('.planetarium-ready');}
async function returned(page){await page.waitForFunction(()=>!document.querySelector('#navigation-experience').open);assert.equal(await page.locator('#planet-canvas').evaluate(el=>el.parentElement.id),'home');assert.equal(await page.evaluate(()=>document.body.style.overflow),'');}
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/app.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('if(!controller){fallback','window.__renderer=controller;\nif(!controller){fallback')});});
 await page.addInitScript(()=>{
  window.__resources={Buffer:new Set(),Program:new Set(),Texture:new Set()};const original=HTMLCanvasElement.prototype.getContext;const contexts=new Set();
  HTMLCanvasElement.prototype.getContext=function(...args){const gl=original.apply(this,args);if(gl&&/^webgl/.test(args[0])&&!contexts.has(gl)){contexts.add(gl);for(const type of ['Buffer','Program','Texture'])for(const verb of ['create','delete']){const fn=gl[verb+type].bind(gl);gl[verb+type]=function(...values){const result=fn(...values);if(verb==='create')window.__resources[type].add(result);else window.__resources[type].delete(values[0]);return result;};}}return gl;};
 });
 await ready(page);await page.waitForTimeout(1200);
 const counts=()=>page.evaluate(()=>Object.fromEntries(Object.entries(window.__resources).map(([key,set])=>[key,set.size]))),baseline=await counts();
 report.interruptions=[];
 for(const phase of ['terminal','launching','earthDeparture','deepSpace','planetaryReveal']){
  await page.locator('#begin-journey').click();await page.waitForFunction(value=>document.querySelector('#navigation-experience').dataset.phase===value,phase);
  if(phase==='launching')await page.goBack();else if(phase==='earthDeparture')await page.locator('#skip-intro').click();else await page.keyboard.press('Escape');
  await returned(page);await page.waitForTimeout(200);assert.deepEqual(await counts(),baseline);report.interruptions.push(phase);
 }
 report.gpuCleanup={baseline,after:await counts()};
 await page.locator('#begin-journey').click();await page.waitForFunction(()=>document.querySelector('#navigation-experience').dataset.phase==='launching');
 const retained=await page.evaluate(()=>window.__renderer.getSceneState());
 await page.evaluate(()=>{const c=document.querySelector('#planet-canvas'),g=c.getContext('webgl2')||c.getContext('webgl');window.__loss=g.getExtension('WEBGL_lose_context');window.__loss.loseContext();});
 await page.waitForFunction(()=>document.querySelector('#planet-canvas').style.display==='none');await page.waitForTimeout(150);await page.evaluate(()=>window.__loss.restoreContext());
 await page.waitForFunction(()=>document.querySelector('#planet-canvas').style.display!=='none');
 // Restoring the WebGL context also reuploads Earth imagery. A fixed 150ms
 // sleep races image decoding; assert readiness and retained timeline instead.
 await page.waitForFunction(()=>{const scene=window.__renderer.getSceneState();return scene?.loaded&&scene.phase!=='preparing';},{},{timeout:5000});
 const recovered=await page.evaluate(()=>window.__renderer.getSceneState());
 assert.equal(recovered.phase,'launching');assert(recovered.time>=retained.time&&recovered.time<retained.time+.5,'Context recovery resumes the retained timeline instead of restarting or jumping ahead');
 report.retainedTimeline={before:retained.time,after:recovered.time};await page.keyboard.press('Escape');await returned(page);
 assert.equal(await page.locator('#planet-canvas').evaluate(c=>(c.getContext('webgl2')||c.getContext('webgl')).getError()),0);report.contextRecovery=true;
 await page.locator('#begin-journey').click();await page.waitForFunction(()=>document.querySelector('#navigation-experience').dataset.phase==='terminal');await page.emulateMedia({reducedMotion:'reduce'});await returned(page);report.changedMotionPreference=true;
 assert.deepEqual(errors,[]);report.errors=errors;await page.close();
 // A late request must neither trap preparation nor mutate a later visit.
 const late=await browser.newPage();let release;
 await late.route('**/navigation-earth*.webp',async route=>{await new Promise(resolve=>release=resolve);await route.fulfill({status:404,body:''}).catch(()=>{});});
 await ready(late);await late.locator('#begin-journey').click();await late.waitForSelector('#navigation-experience[data-phase="terminal"]',{timeout:5000});
 assert.match(await late.locator('#navigation-notice').textContent(),/still loading/);await late.keyboard.press('Escape');await returned(late);release();await late.waitForTimeout(150);
 await late.unroute('**/navigation-earth*.webp');await late.locator('#begin-journey').click();await late.waitForSelector('#navigation-experience[data-phase="terminal"]');assert.equal(await late.locator('#navigation-notice').textContent(),'');await late.keyboard.press('Escape');await late.close();report.delayedImageFallback=true;
 const fallback=await browser.newPage();await fallback.addInitScript(()=>{const fn=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /^webgl/.test(type)?null:fn.call(this,type,...args);};});
 await fallback.goto(base);await fallback.locator('#begin-journey').click();assert.match(await fallback.locator('#navigation-notice').textContent(),/3D departure is unavailable/);await fallback.locator('#skip-intro').click();await returned(fallback);await fallback.locator('#hero-next').click();await fallback.waitForFunction(()=>document.querySelector('#hero-title').textContent==='TITAN');await fallback.close();report.noWebGL=true;
 const legacy=await browser.newPage({viewport:{width:390,height:844}});const legacyErrors=[];legacy.on('pageerror',e=>legacyErrors.push(e.message));
 await legacy.addInitScript(()=>{Object.defineProperty(navigator,'deviceMemory',{get:()=>2});const fn=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:fn.call(this,type,...args);};});
 await ready(legacy);await legacy.locator('#begin-journey').click();await legacy.waitForSelector('#navigation-experience[data-phase="launching"]');assert.equal(await legacy.locator('#planet-canvas').evaluate(c=>c.getContext('webgl').getError()),0);await legacy.screenshot({path:new URL('webgl1-constrained.png',output).pathname.replace(/^\/(\w:)/,'$1')});await legacy.locator('#skip-intro').click();await returned(legacy);assert.deepEqual(legacyErrors,[]);await legacy.close();report.constrainedWebGL1=true;
}catch(error){report.failure=error.stack;throw error;}finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
