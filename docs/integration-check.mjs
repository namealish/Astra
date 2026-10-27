import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/dist/index.html';
const output=new URL('../tmp/integration/',import.meta.url);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report=[];
const worlds=['LUNA','MARS','EUROPA','SATURN','TITAN'];
const hero=page=>page.waitForFunction(()=>!document.querySelector('#navigation-experience').open&&!document.querySelector('#destination-experience').open&&document.body.style.overflow!=='hidden');
const map=page=>page.waitForSelector('#navigation-experience[open][data-experience="solar"][data-phase="ready"]');
const resort=page=>page.waitForSelector('#destination-experience[open][data-state="arrived"][data-lighting-state="ready"]');
const state=page=>page.evaluate(async()=>(await import(new URL('./experience-state.js',location.href))).experienceState.get());
const traverse=async(page,direction)=>{await page.evaluate(direction=>history[direction](),direction);};
try{
 for(const[name,width,height,motion]of[['desktop',1440,900,'no-preference'],['mobile',390,844,'no-preference'],['reduced',375,812,'reduce']]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:motion,hasTouch:width<500});
  const errors=[],documents=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())documents.push(request.url());});
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  if(motion==='reduce')await page.addInitScript(()=>Object.defineProperty(globalThis.crypto,'randomUUID',{value:undefined}));
  await page.goto(base,{waitUntil:'networkidle'});await page.waitForSelector('.planetarium-ready');
  const result={name,checks:[],errors};report.push(result);
  for(const[index,world]of worlds.entries()){
   await page.locator('#planet-tabs [data-destination="'+index+'"]').click();
   await page.waitForFunction(world=>document.querySelector('#hero-title').textContent===world,world);
   assert.equal((await page.locator('#destination').inputValue()).toUpperCase(),world,'Hero selection must synchronize booking');
   assert.equal((await state(page)).selected,index);
  }
  result.checks.push('All five hero selections synchronize booking');
  await page.locator('#destination').selectOption('Mars');
  assert.equal((await state(page)).selected,1);
  await page.locator('[data-appscreen="0"]').click();
  assert.match(await page.locator('#phone-panel').textContent(),/MARS/);
  await page.locator('[data-phone-action="next"]').click();
  assert.equal((await state(page)).selected,2,'App discovery must use the shared selection');
  assert.equal(await page.locator('#destination').inputValue(),'Europa');
  await page.locator('#home').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#hero-title').textContent==='EUROPA');
  result.checks.push('Booking and app discovery synchronize back to the hero');

  await page.locator('#open-solar-system').click();await map(page);
  await page.locator('.solar-destinations [data-solar-destination="4"]').click();
  assert.equal(await page.locator('#destination').inputValue(),'Titan');
  await traverse(page,'back');await hero(page);
  await traverse(page,'forward');await map(page);
  assert.equal(await page.locator('#solar-title').textContent(),'TITAN');
  result.checks.push('Solar Back/Forward restores the selected destination without reload');

  // A map-to-resort handoff replaces the overlay route, not the document.
  await page.locator('#solar-explore').click();
  if(motion!=='reduce')await page.locator('#destination-skip').click();
  await resort(page);await page.locator('[data-lighting="3"]').click();await resort(page);
  await traverse(page,'back');await hero(page);
  await traverse(page,'forward');
  if(motion!=='reduce')await page.locator('#destination-skip').click();
  await resort(page);
  assert.equal((await state(page)).selected,4);
  assert.equal((await state(page)).timeOfDay[4],3);
  assert.equal(await page.locator('#destination-experience').getAttribute('data-destination'),'titan');
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#destination-overview')).opacity)>.99&&Number(getComputedStyle(document.querySelector('.destination-flight')).opacity)<.01);
  await page.screenshot({path:new URL(name+'-restored-resort.png',output).pathname.replace(/^\/(\w:)/,'$1')});
  await page.keyboard.press('Escape');await hero(page);await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'hero-explore');
  result.checks.push('Map/resort transfer, resort Back/Forward, retained Night and visible return focus');

  // Click the next entry in the same task as close: no timeout-based race.
  for(let round=0;round<3;round++){
   await page.locator('#open-solar-system').click();await map(page);
   await page.evaluate(()=>{document.querySelector('#navigation-exit').click();document.querySelector('#hero-explore').click();});
   if(motion!=='reduce')await page.locator('#destination-skip').click();
   await resort(page);await page.keyboard.press('Escape');await hero(page);await page.waitForTimeout(80);
  }
  result.checks.push('Three immediate close/reopen cycles retain canvas, scroll and controls');
  if(motion!=='reduce'){
   await page.locator('#begin-journey').click();await page.waitForSelector('#navigation-experience[data-phase="terminal"]');
   await traverse(page,'back');await hero(page);
   await traverse(page,'forward');await page.waitForSelector('#navigation-experience[data-phase="terminal"]');
   await page.locator('#skip-intro').click();await hero(page);await page.waitForTimeout(100);
   result.checks.push('Departure Back cancels safely; Forward replays; Skip restores the hero');
  }
  await page.locator('#open-solar-system').click();await map(page);
  await page.locator('.solar-destinations [data-solar-destination="1"]').click();
  await page.locator('#solar-book').click();await hero(page);await page.waitForTimeout(1500);
  assert.equal(await page.locator('#destination').inputValue(),'Mars');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'destination');
  assert(Math.abs(await page.locator('#book').evaluate(el=>el.getBoundingClientRect().top))<120);
  result.checks.push('Booking survives asynchronous history traversal with correct scroll/focus');
  assert.equal(await page.locator('#planet-canvas').evaluate(canvas=>canvas.parentElement.id),'home');
  assert.equal(await page.locator('canvas').count(),1);
  assert.equal(documents.length,1,'Back/Forward and exits must not reload the document');
  assert.deepEqual(errors,[]);result.documents=documents.length;
  await page.close();
 }
}finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
