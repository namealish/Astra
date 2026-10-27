import assert from'node:assert/strict';
import{chromium}from'playwright-core';
import{mkdir,writeFile}from'node:fs/promises';
import{clearCamera,segmentHit,routePoint,routeHeight,shipMatrix}from'../solar-navigation.js';
const output=new URL('../tmp/solar-navigation/',import.meta.url);await mkdir(output,{recursive:true});
const report={math:{},browsers:[]};
const obstacle={center:[0,0,0],radius:3};
assert.equal(segmentHit([-10,0,0],[10,0,0],[0,0,0],3),.35);
let camera=[-10,0,0];
for(let frame=0;frame<300;frame++){
 const next=clearCamera(camera,[10,0,0],[obstacle]);
 assert(Math.hypot(...next)>2.99999);assert.equal(segmentHit(camera,next,obstacle.center,obstacle.radius-.002),null);camera=next;
}
assert(camera[0]>9,'Head-on camera sweep must slide past the body, not remain stuck');
const matrix=shipMatrix([3,4,5],[1,2,-3],.2),forward=[-matrix[8],-matrix[9],-matrix[10]],cosine=forward.reduce((sum,v,i)=>sum+v*[1,2,-3][i],0)/(Math.hypot(...forward)*Math.sqrt(14));
assert(Math.abs(cosine-1)<1e-7);report.math={sweptCamera:'300 head-on steps, no tunnelling or sticking',craft:'Local nose aligned with route tangent'};
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 for(const[name,viewport,reduced,legacy]of[['desktop',{width:1440,height:900},false,false],['mobile',{width:390,height:844},false,false],['reduced-webgl1',{width:320,height:740},true,true]]){
  const page=await browser.newPage({viewport,reducedMotion:reduced?'reduce':'no-preference'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  if(legacy)await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
  await page.route('**/app.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('if(!controller){fallback','window.__renderer=controller;\nif(!controller){fallback')});});
  await page.goto(process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/dist/index.html',{waitUntil:'networkidle'});
  await page.locator('#open-solar-system').click();await page.waitForSelector('#navigation-experience[data-phase="ready"]');
  if(!reduced)await page.locator('#solar-pause').click();
  await page.waitForTimeout(350);
  // Validate labels against one another and all controls, including during Journey.
  const labelFit=()=>page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,name:el.dataset.body||el.className};};
   const labels=[...document.querySelectorAll('.solar-marker')].filter(el=>!el.hidden).map(rect);
   const panels=[...document.querySelectorAll('.solar-panel,.solar-tools,.solar-footer,.navigation-toolbar,#solar-scrub-label')].filter(el=>el.getClientRects().length).map(rect);
   const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
   return{labels:labels.map(l=>l.name),conflicts:labels.flatMap((a,i)=>[...labels.slice(i+1),...panels].filter(b=>overlap(a,b)).map(b=>[a.name,b.name])),offscreen:labels.filter(a=>a.x<0||a.y<0||a.right>innerWidth||a.bottom>innerHeight)};
  });
  const fit=await labelFit();assert.deepEqual(fit.conflicts,[]);assert.deepEqual(fit.offscreen,[]);
  await page.screenshot({path:new URL(name+'-overview.png',output).pathname.replace(/^\/(\w:)/,'$1')});
  const routes=[];
  for(let index=0;index<5;index++){
   await page.locator('.solar-destinations [data-solar-destination="'+index+'"]').click();
   await page.waitForTimeout(reduced?80:1000);
   const scene=await page.evaluate(()=>window.__renderer.getSceneState());
   const bodyData=await page.evaluate(async()=>{const{celestialBodies}=await import(new URL('solar-system.js',location.href));return celestialBodies;});
   const obstacles=bodyData.map(body=>({id:body.id,center:scene.positions[body.id],radius:body.radius*(body.id==='saturn'?2.4:1)}));
   let minimum=Infinity;
   for(let i=0;i<=512;i++){const point=routePoint(scene.route.start,scene.route.end,i/512,scene.route.height);for(const body of obstacles){const gap=Math.hypot(...point.map((v,j)=>v-body.center[j]))-body.radius;minimum=Math.min(minimum,gap);assert(gap>.07,`${name} route ${index} clips ${body.id}: ${gap}`);}}
   for(const body of obstacles)assert(Math.hypot(...scene.eye.map((v,j)=>v-body.center[j]))>=body.radius+.44);
   routes.push({index,clearance:minimum,draws:scene.draws});
  }
  await page.locator('[data-camera-mode="journey"]').click();
  await page.locator('#solar-scrub').fill('75');await page.locator('#solar-scrub').dispatchEvent('input');await page.waitForTimeout(reduced?150:800);
  assert.equal(await page.locator('#solar-progress-value').textContent(),'75%');assert.equal(await page.locator('#solar-scrub').getAttribute('aria-valuetext'),'75% of the illustrative route');
  assert.equal(await page.evaluate(()=>window.__renderer.getSceneState().routeProgress),.75);
  assert.deepEqual((await labelFit()).conflicts,[]);
  const marker=await page.evaluate(()=>{const point=window.__renderer.getSceneState().route.projected;return{...point,element:document.elementFromPoint(point.x,point.y)?.id};});
  assert(marker.visible);assert.equal(marker.element,'planet-canvas','The followed spacecraft must remain clear of the journey controls');
  await page.screenshot({path:new URL(name+'-journey.png',output).pathname.replace(/^\/(\w:)/,'$1')});
  await page.locator('#solar-replay').click();await page.waitForTimeout(250);
  const restarted=await page.evaluate(()=>window.__renderer.getSceneState());assert(restarted.routeProgress<.1);assert.equal(restarted.paused,reduced);
  if(reduced){assert(await page.locator('#solar-pause').isDisabled());assert(await page.locator('#solar-motion-note').isVisible());assert.equal(restarted.routeProgress,0);}
  else{
   await page.waitForTimeout(500);const playing=await page.evaluate(()=>window.__renderer.getSceneState());assert(playing.routeProgress>restarted.routeProgress);assert(Math.abs(Number(await page.locator('#solar-scrub').inputValue())-Math.floor(playing.routeProgress*100))<=1);
   await page.locator('#solar-scrub').fill('99');await page.locator('#solar-scrub').dispatchEvent('input');await page.locator('#solar-pause').click();
   await page.waitForFunction(()=>document.querySelector('#solar-progress-value').textContent==='100%');assert.equal(await page.locator('#solar-replay').textContent(),'REPLAY ROUTE ↻');
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#solar-pause').disabled);
  }
  // Changing the shared model directly must update map selection, not create a
  // second, stale destination source inside the map.
  await page.evaluate(async()=>{const{experienceState}=await import(new URL('experience-state.js',location.href));experienceState.set({selected:1});});
  await page.waitForFunction(()=>document.querySelector('#solar-title').textContent==='MARS');
  assert.equal(await page.evaluate(()=>window.__renderer.getSceneState().mode),'destination');
  await page.locator('[data-camera-mode="journey"]').click();await page.waitForTimeout(100);assert.equal(await page.locator('#solar-scrub').inputValue(),'0');
  assert.equal(await page.locator('#planet-canvas').evaluate(canvas=>(canvas.getContext('webgl2')||canvas.getContext('webgl')).getError()),0);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#hero-title').textContent(),'MARS');
  assert.deepEqual(errors,[]);report.browsers.push({name,labels:fit.labels,routes,progress:'Playback, scrubbing, restart, completion and destination reset synchronized',errors});await page.close();
 }
}catch(error){report.failure=error.stack;throw error;}finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
