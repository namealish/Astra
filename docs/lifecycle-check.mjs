import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=new URL('../tmp/lifecycle/',import.meta.url);await mkdir(output,{recursive:true});
const base=process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report={};
const instrument=async page=>page.route('**/app.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('if(!controller){fallback','window.__renderer=controller;\nif(!controller){fallback')});});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});await instrument(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{
  window.__resources={Buffer:new Set(),Program:new Set(),Texture:new Set()};window.__draws=0;window.__contexts=new Set();
  const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(...args){const gl=original.apply(this,args);if(gl&&/^webgl/.test(args[0])&&!window.__contexts.has(gl)){
   window.__contexts.add(gl);
   for(const type of ['Buffer','Program','Texture'])for(const verb of ['create','delete']){const name=verb+type,fn=gl[name].bind(gl);gl[name]=function(...values){const result=fn(...values);if(verb==='create')window.__resources[type].add(result);else window.__resources[type].delete(values[0]);return result;};}
   for(const name of ['drawElements','drawArrays']){const fn=gl[name].bind(gl);gl[name]=function(...values){window.__draws++;return fn(...values);};}
  }return gl;};
 });
 await page.goto(base,{waitUntil:'networkidle'});await page.waitForSelector('.planetarium-ready');await page.waitForTimeout(1800);
 const counts=()=>page.evaluate(()=>Object.fromEntries(Object.entries(window.__resources).map(([key,set])=>[key,set.size])));
 const initial=await counts(),rounds=[];
 for(let i=0;i<3;i++){
  await page.locator('#begin-journey').click();await page.waitForFunction(()=>document.querySelector('#navigation-experience').dataset.phase==='terminal');await page.locator('#skip-intro').click();await page.waitForTimeout(200);
  await page.locator('#open-solar-system').click();await page.waitForSelector('#navigation-experience[data-phase="ready"]');await page.waitForTimeout(350);
  await page.keyboard.press('Escape');await page.waitForTimeout(900);rounds.push(await counts());
 }
 assert.deepEqual(rounds[0],initial);assert.deepEqual(rounds[1],initial);assert.deepEqual(rounds[2],initial);
 report.resources={initial,rounds,contexts:await page.evaluate(()=>window.__contexts.size)};assert.equal(report.resources.contexts,1);
 await page.locator('#open-solar-system').click();await page.waitForSelector('#navigation-experience[data-phase="ready"]');
 await page.locator('#solar-pause').click();await page.waitForTimeout(2400);
 const held=await page.evaluate(()=>window.__draws);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__draws),held);report.pausedNoDraws=true;
 const before=await page.evaluate(()=>window.__renderer.getSceneState().goal.distance);await page.mouse.move(900,360);await page.mouse.wheel(0,-120);await page.waitForTimeout(500);
 assert((await page.evaluate(()=>window.__renderer.getSceneState().goal.distance))<before);report.wheelZoom=true;
 // Select the actual projected Mars mesh, not a DOM marker.
 await page.locator('#solar-reset').click();await page.waitForTimeout(1900);
 const mars=await page.evaluate(()=>window.__renderer.getSceneState().projected.find(body=>body.id==='mars'));
 await page.mouse.click(mars.x,mars.y);await page.waitForFunction(()=>document.querySelector('#solar-title').textContent==='MARS');report.meshPicking=true;
 await page.locator('[data-camera-mode="journey"]').click();await page.locator('#solar-scrub').fill('42');await page.locator('#solar-scrub').dispatchEvent('input');await page.waitForTimeout(1600);
 const retained=await page.evaluate(()=>window.__renderer.getSceneState());
 const lose=async()=>{const supported=await page.evaluate(()=>{const c=document.querySelector('#planet-canvas'),g=c.getContext('webgl2')||c.getContext('webgl');window.__loss=g.getExtension('WEBGL_lose_context');if(!window.__loss)return false;window.__loss.loseContext();return true;});assert(supported,'Context-loss extension unavailable');await page.waitForFunction(()=>document.querySelector('#planet-canvas').style.display==='none');await page.waitForTimeout(200);await page.evaluate(()=>window.__loss.restoreContext());await page.waitForFunction(()=>document.querySelector('#planet-canvas').style.display!=='none');await page.waitForTimeout(800);};
 await lose();const recovered=await page.evaluate(()=>window.__renderer.getSceneState());
 assert.equal(recovered.mode,retained.mode);assert.equal(recovered.routeProgress,.42);assert.equal(recovered.paused,true);assert.equal(await page.locator('#solar-title').textContent(),'MARS');
 assert.equal(await page.locator('#planet-canvas').evaluate(c=>(c.getContext('webgl2')||c.getContext('webgl')).getError()),0);report.solarContextRecovery=true;
 await page.keyboard.press('Escape');await page.waitForTimeout(200);await page.locator('#begin-journey').click();await page.waitForFunction(()=>document.querySelector('#navigation-experience').dataset.phase==='terminal');await lose();await page.locator('#skip-intro').click();
 assert.equal(await page.locator('#planet-canvas').evaluate(el=>el.parentElement.id),'home');report.departureContextRecovery=true;
 await page.waitForTimeout(200);await page.locator('#begin-journey').click();await page.waitForFunction(()=>document.querySelector('#navigation-experience').dataset.phase==='terminal');await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.querySelector('#navigation-experience').open);report.motionPreferenceInterruption=true;
 assert.deepEqual(errors,[]);report.errors=errors;await page.close();
 // Real touch events through CDP exercise two simultaneous pointers.
 const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2,reducedMotion:'reduce'});await instrument(touch);
 const touchErrors=[];touch.on('pageerror',e=>touchErrors.push(e.message));await touch.goto(base);await touch.locator('#open-solar-system').tap();await touch.waitForSelector('#navigation-experience[data-phase="ready"]');
 const cdp=await touch.context().newCDPSession(touch),point=(x,y,id)=>({x,y,id,radiusX:2,radiusY:2});
 const initialTouch=await touch.evaluate(()=>window.__renderer.getSceneState().goal);
 assert.equal(await touch.evaluate(()=>document.elementFromPoint(150,420).id),'planet-canvas');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(150,420,1),point(230,420,2)]});
 for(let step=1;step<=5;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(150-step*6,420,1),point(230+step*6,420,2)]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.waitForTimeout(150);
 const pinched=await touch.evaluate(()=>window.__renderer.getSceneState().goal);assert(pinched.distance<initialTouch.distance);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(160,420,1)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(235,450,1)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.notEqual(await touch.evaluate(()=>window.__renderer.getSceneState().goal.yaw),pinched.yaw);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(150,420,1),point(230,420,2)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 assert.deepEqual(touchErrors,[]);report.touch='Pinch zoom, one-finger orbit, and interrupted gesture passed';
 await touch.locator('#navigation-exit').tap();await touch.close();
 const fallback=await browser.newPage({viewport:{width:375,height:812},reducedMotion:'reduce'});
 await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /^webgl/.test(type)?null:original.call(this,type,...args);};});
 await fallback.goto(base);await fallback.locator('#open-solar-system').click();assert(await fallback.locator('#navigation-notice').isVisible());
 for(const[index,name]of['LUNA','MARS','EUROPA','SATURN','TITAN'].entries()){await fallback.locator('.solar-destinations [data-solar-destination="'+index+'"]').click();assert.equal(await fallback.locator('#solar-title').textContent(),name);}
 await fallback.locator('#solar-book').click();assert.equal(await fallback.locator('#destination').inputValue(),'Titan');report.noWebGL='All destination information and booking functional';await fallback.close();
}catch(error){report.failure=error.stack;throw error;}finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
