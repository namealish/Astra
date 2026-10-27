import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=new URL('../tmp/lighting/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const base=process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/';
const report=[];
try{
 for(const[name,width,height,motion]of[['desktop',1440,900,'no-preference'],['mobile',390,844,'reduce']]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:motion});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base,{waitUntil:'networkidle'});await page.waitForSelector('.planetarium-ready');
  const results=[];
  for(const[index,planet]of['LUNA','MARS','EUROPA','SATURN','TITAN'].entries()){
   await page.locator('#planet-tabs [data-destination="'+index+'"]').click();await page.waitForFunction(p=>document.querySelector('#hero-title').textContent===p,planet);
   await page.waitForFunction(()=>!document.querySelector('#hero-info').classList.contains('is-changing'));
   await page.locator('#hero-explore').click();if(motion!=='reduce')await page.locator('#destination-skip').click();
   await page.waitForSelector('#destination-experience[data-state="arrived"][data-lighting-state="ready"]');
   const assets=await page.locator('#lighting-images img').evaluateAll(images=>images.map(image=>({src:image.currentSrc,width:image.naturalWidth,filter:getComputedStyle(image).filter})));
   assert.equal(new Set(assets.map(image=>image.src)).size,4);assert(assets.every(image=>image.width>0&&image.filter==='none'));
   if(name==='mobile')assert(assets.filter(image=>image.src.includes('/lighting-')).every(image=>image.width===768));
   const modes=[];
   for(let mode=0;mode<4;mode++){
    await page.locator('[data-lighting="'+mode+'"]').click();
    await page.waitForFunction(value=>{const d=document.querySelector('#destination-experience');return d.dataset.lightingState==='ready'&&Number(d.dataset.lighting)===value;},mode);
    assert.equal(await page.locator('[data-lighting="'+mode+'"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#lighting-images img').nth(mode).evaluate(el=>el.style.opacity),'1');
    const fit=await page.locator('#resort-lighting').evaluate(el=>{const r=el.getBoundingClientRect(),title=document.querySelector('#destination-title').getBoundingClientRect();return{fits:r.left>=0&&r.right<=innerWidth&&r.bottom<innerHeight,overlap:r.right>title.left&&r.left<title.right&&r.bottom>title.top&&r.top<title.bottom};});
    assert(fit.fits&&!fit.overlap,`${name} ${planet} controls overlap`);
    await page.screenshot({path:new URL(`${name}-${planet.toLowerCase()}-${mode}.png`,output).pathname.replace(/^\/(\w:)/,'$1')});modes.push(mode);
   }
   await page.locator('#lighting-slider').fill('150');await page.locator('#lighting-slider').dispatchEvent('input');
   await page.waitForFunction(()=>document.querySelector('#destination-experience').dataset.lightingState==='ready');
   const alpha=await page.locator('#lighting-images img').evaluateAll(images=>images.map(image=>Number(image.style.opacity)));assert.deepEqual(alpha,[0,1,.5,0]);
   await page.locator('[data-lighting="0"]').click();await page.locator('[data-lighting="3"]').click();
   await page.waitForFunction(()=>document.querySelector('#destination-experience').dataset.lighting==='3.00'&&document.querySelector('#destination-experience').dataset.lightingState==='ready');
   await page.keyboard.press('Escape');assert.equal(await page.locator('#lighting-images img').count(),0);
   await page.locator('#hero-explore').click();if(motion!=='reduce')await page.locator('#destination-skip').click();
   await page.waitForSelector('#destination-experience[data-lighting-state="ready"]');assert.equal(await page.locator('#destination-experience').getAttribute('data-lighting'),'3.00');
   await page.keyboard.press('Escape');results.push({planet,modes,assets:assets.map(image=>image.width),interpolation:true,interruption:true,remembered:true});
  }
  assert.deepEqual(errors,[]);report.push({name,results,errors});await page.close();
 }
 const failure=await browser.newPage({reducedMotion:'reduce'});await failure.route('**/lighting-saturn-night*.webp',route=>route.abort());await failure.goto(base);await failure.locator('#hero-explore').click();
 await failure.waitForSelector('#destination-experience[data-lighting-state="partial"]');assert(await failure.locator('#destination-scene').evaluate(el=>el.complete&&el.naturalWidth>0));assert(await failure.locator('#lighting-status').isVisible());
 assert(await failure.locator('[data-lighting="3"]').isDisabled());assert(await failure.locator('[data-lighting="1"]').isEnabled());assert(await failure.locator('#lighting-slider').isDisabled());
 await failure.keyboard.press('Escape');await failure.close();report.push({failedImageFallback:true,loadedPresetsRemainAvailable:true});
}finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
