import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=new URL('../tmp/cinematic/',import.meta.url);await mkdir(output,{recursive:true});
const png=name=>new URL(name+'.png',output).pathname.replace(/^\/(\w:)/,'$1');
const base=process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report={};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__draws=0;for(const type of [WebGLRenderingContext,WebGL2RenderingContext]){const original=type.prototype.drawElements;type.prototype.drawElements=function(...args){window.__draws++;return original.apply(this,args);};}});
 await page.route('**/app.js',async route=>{const response=await route.fetch();const body=(await response.text()).replace('if(!controller){fallback','window.__heroMotion=()=>controller.getMotion();\nif(!controller){fallback');await route.fulfill({response,body});});
 await page.goto(base,{waitUntil:'networkidle'});await page.waitForSelector('.planetarium-ready');
 await page.locator('#hero-explore').click();
 await page.waitForTimeout(1100);
 const approach=await page.evaluate(()=>window.__heroMotion());assert(approach.flight>0);
 await page.keyboard.press('Escape');
 let motion=await page.evaluate(()=>window.__heroMotion());assert.equal(motion.flight,0);assert.equal(motion.covered,false);
 await page.locator('#hero-explore').click();await page.locator('#destination-skip').click();
 await page.waitForSelector('#destination-experience[data-state="arrived"]');
 const held=await page.evaluate(()=>window.__draws);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__draws),held,'Covered hero must not render behind resort');
 for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('#destination-experience')));}
 await page.locator('#destination-more').click();await page.locator('#destination-return').click();
 await page.waitForFunction(()=>!document.querySelector('#destination-experience').open);
 await page.locator('#hero-explore').click();await page.locator('#destination-skip').click();await page.locator('#destination-more').click();
 assert(await page.locator('#destination-details').evaluate(el=>!el.inert));await page.keyboard.press('Escape');
 report.explorer='Real camera flight, mid-flight Escape, Skip, focus trapping, repeat details/return, render suspension passed';
 // Context recreation must retain the resort/flight state instead of starting
 // a hidden orbit loop or leaving the camera at its close-up on return.
 await page.locator('#hero-explore').click();await page.locator('#destination-skip').click();
 const recoverySupported=await page.evaluate(()=>{
  const canvas=document.querySelector('#planet-canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
  window.__lostContext=gl.getExtension('WEBGL_lose_context');
  if(!window.__lostContext)return false;
  window.__lostContext.loseContext();return true;
 });
 if(recoverySupported){
  await page.waitForFunction(()=>document.querySelector('#planet-canvas').style.display==='none');
  await page.waitForTimeout(100);await page.evaluate(()=>window.__lostContext.restoreContext());
  await page.waitForFunction(()=>document.querySelector('#planet-canvas').style.display!=='none');
  await page.waitForTimeout(400);motion=await page.evaluate(()=>window.__heroMotion());
  assert.equal(motion.covered,true);assert.equal(motion.flight,1);
  await page.keyboard.press('Escape');motion=await page.evaluate(()=>window.__heroMotion());
  assert.equal(motion.flight,0);assert.equal(motion.covered,false);
  assert.equal(await page.evaluate(()=>{const canvas=document.querySelector('#planet-canvas');return(canvas.getContext('webgl2')||canvas.getContext('webgl')).getError();}),0);
  report.resortContextRecovery='Camera/covered state preserved across context restoration; Return restores orbit without WebGL errors';
 }else{report.resortContextRecovery='Extension unavailable; not tested';await page.keyboard.press('Escape');}
 // All seven chapters must be visible while the phone remains pinned.
 const geometry=await page.locator('#app').evaluate(section=>{const style=getComputedStyle(section),stage=section.querySelector('.app-scroll-stage');const padding=parseFloat(style.paddingTop);return{start:section.offsetTop+padding-90,distance:section.offsetHeight-stage.offsetHeight-padding*2};});
 const order=[0,5,6,2,1,3,4],chapters=[];
 await page.locator('#hero-explore').evaluate(button=>button.blur());
 for(let i=0;i<7;i++){
  await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),geometry.start+geometry.distance*(i+.3)/7);
  await page.waitForTimeout(500);
  const state=await page.evaluate(()=>({screen:Number(document.querySelector('#phone-screen').dataset.screen),top:document.querySelector('.app-scroll-stage').getBoundingClientRect().top}));
  assert.equal(state.screen,order[i],`Scroll chapter ${i}`);
  assert(state.top>=85&&state.top<=100,`Sticky stage left frame: ${state.top}`);
  chapters.push(state);await page.screenshot({path:png('scroll-'+i)});
 }
 await page.locator('[data-appscreen="5"]').click();
 assert.equal(await page.locator('#app-scroll-toggle').getAttribute('aria-pressed'),'false');
 await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),geometry.start+geometry.distance*.9);await page.waitForTimeout(200);
 assert.equal(await page.locator('#phone-screen').getAttribute('data-screen'),'5');
 await page.locator('#app-scroll-toggle').click();await page.waitForTimeout(300);
 assert.equal(await page.locator('#phone-screen').getAttribute('data-screen'),'4');
 report.scroll={chapters,manualOverride:true,resume:true};
 const offscreenDraws=await page.evaluate(()=>window.__draws);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.__draws),offscreenDraws);
 report.offscreenRendering='No WebGL draw calls while hero is offscreen';
 for(let i=0;i<3;i++){
  await page.locator(`[data-crew-profile="${i}"]`).click();
  assert.equal(await page.locator(`[data-crew-profile="${i}"]`).getAttribute('aria-expanded'),'true');
 }
 await page.locator('#crew').screenshot({path:png('crew-profiles')});
 await page.locator('[data-ship="1"]').hover();await page.waitForTimeout(300);
 assert.notEqual(await page.locator('[data-ship="1"]').evaluate(el=>el.style.getPropertyValue('--fleet-ry')),'');
 report.editorialMotion='Crew profile expansion and fleet pointer parallax passed';
 assert.deepEqual(errors,[]);report.errors=errors;
 await page.close();
 // WebGL-disabled fallback retains the complete resort/booking experience.
 const fallback=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'||type==='webgl2'?null:original.call(this,type,...args);};});
 await fallback.goto(base,{waitUntil:'networkidle'});await fallback.locator('[data-destination="3"]').click();await fallback.locator('#hero-explore').click();
 await fallback.waitForSelector('#destination-experience[data-state="arrived"]');await fallback.locator('[data-resort-book]').first().click();
 assert.equal(await fallback.locator('#destination').inputValue(),'Saturn');report.noWebGL='Resort exploration and booking synchronization passed without WebGL';await fallback.close();
 const missingImage=await browser.newPage({viewport:{width:375,height:812},reducedMotion:'reduce'});
 await missingImage.route('**/titan-resort.webp',route=>route.abort());
 await missingImage.route('**/lighting-titan-*.webp',route=>route.abort());
 await missingImage.goto(base,{waitUntil:'networkidle'});
 await missingImage.locator('[data-destination="4"]').click();await missingImage.locator('#hero-explore').click();
 await missingImage.waitForSelector('#destination-experience[data-state="arrived"]');
 await missingImage.waitForSelector('#destination-image-note:not([hidden])');
 assert(await missingImage.locator('#destination-image-note').isVisible());
 await missingImage.locator('[data-resort-book]').first().click();assert.equal(await missingImage.locator('#destination').inputValue(),'Titan');
 report.resortImageFailure='Missing artwork shows a clear note; resort information and booking remain functional';await missingImage.close();
}catch(error){report.failure=error.stack;throw error;}finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
