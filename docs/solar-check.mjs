import{chromium}from'playwright-core';
import{mkdir,writeFile}from'node:fs/promises';
import assert from'node:assert/strict';
const output=new URL('../tmp/solar/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report=[];
try{
 for(const[name,width,height,motion]of[['desktop',1440,900,'no-preference'],['mobile',390,844,'no-preference'],['reduced',375,812,'reduce']]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:motion});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/app.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('if(!controller){fallback','window.__renderer=controller;\nif(!controller){fallback')});});
  await page.goto(process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/',{waitUntil:'networkidle'});await page.waitForSelector('.planetarium-ready');
  await page.locator('#open-solar-system').click();await page.waitForSelector('#navigation-experience[data-phase="ready"]');await page.waitForTimeout(500);
  assert.equal(await page.locator('.solar-marker').count(),8);
  await page.screenshot({path:new URL(name+'-overview.png',output).pathname.replace(/^\/(\w:)/,'$1')});
  const result={name,destinations:[],errors};
  for(const[index,planet]of['LUNA','MARS','EUROPA','SATURN','TITAN'].entries()){
   await page.locator('.solar-destinations [data-solar-destination="'+index+'"]').click();
   assert.equal(await page.locator('#solar-title').textContent(),planet);await page.waitForTimeout(motion==='reduce'?100:850);
   const scene=await page.evaluate(()=>window.__renderer.getSceneState());
   assert.equal(scene.mode,'destination');assert.equal(await page.locator('#solar-route-label').textContent(),'EARTH → '+planet);
   const glError=await page.locator('#planet-canvas').evaluate(canvas=>(canvas.getContext('webgl2')||canvas.getContext('webgl')).getError());assert.equal(glError,0);
   await page.screenshot({path:new URL(name+'-'+planet.toLowerCase()+'.png',output).pathname.replace(/^\/(\w:)/,'$1')});result.destinations.push(planet);
  }
  const hierarchy=await page.evaluate(()=>{const p=window.__renderer.getSceneState().positions;const distance=(a,b)=>Math.hypot(...p[a].map((x,i)=>x-p[b][i]));return{luna:distance('luna','earth'),europa:distance('europa','jupiter'),titan:distance('titan','saturn')};});
  assert(Math.abs(hierarchy.luna-1.65)<.02);assert(Math.abs(hierarchy.europa-2.7)<.02);assert(Math.abs(hierarchy.titan-3.7)<.02);result.hierarchy=hierarchy;
  await page.locator('[data-camera-mode="journey"]').click();
  await page.locator('#solar-scrub').fill('60');await page.locator('#solar-scrub').dispatchEvent('input');await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>window.__renderer.getSceneState().routeProgress),.6);
  assert.equal(await page.evaluate(()=>window.__renderer.getSceneState().paused),true);
  await page.locator('#solar-reset').click();await page.waitForTimeout(600);
  const before=await page.evaluate(()=>window.__renderer.getSceneState().camera);
  const canvas=page.locator('#planet-canvas');await canvas.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('+');await page.waitForTimeout(700);
  const after=await page.evaluate(()=>window.__renderer.getSceneState().camera);
  assert(after.yaw>before.yaw);assert(after.distance<before.distance);
  await page.mouse.move(width*.7,height*.38);await page.mouse.down();await page.mouse.move(width*.8,height*.43,{steps:8});await page.mouse.up();await page.waitForTimeout(250);
  assert.notEqual(await page.evaluate(()=>window.__renderer.getSceneState().goal.yaw),after.yaw);
  result.camera='Modes, route scrubbing, pause, reset, keyboard zoom/orbit and pointer drag passed';
  await page.locator('#solar-book').click();assert.equal(await page.locator('#destination').inputValue(),'Titan');
  await page.locator('#open-solar-system').click();await page.waitForSelector('#navigation-experience[data-phase="ready"]');
  await page.locator('.solar-destinations [data-solar-destination="1"]').click();await page.locator('#solar-explore').click();
  await page.waitForSelector('#destination-experience[data-state="arrived"]');assert.equal(await page.locator('#destination-title').textContent(),'ELYSIUM RESORT');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#hero-title').textContent(),'MARS');
  await page.locator('#open-solar-system').click();await page.waitForSelector('#navigation-experience[data-phase="ready"]');
  await page.goBack();await page.waitForFunction(()=>!document.querySelector('#navigation-experience').open);
  assert.equal(await page.locator('#planet-canvas').evaluate(el=>el.parentElement.id),'home');assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  assert.deepEqual(errors,[]);result.booking=true;result.exploration=true;result.historyBack=true;report.push(result);await page.close();
 }
}finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
