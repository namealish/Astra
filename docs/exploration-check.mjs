import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../tmp/exploration/',import.meta.url);await mkdir(root,{recursive:true});
const path=name=>new URL(name+'.png',root).pathname.replace(/^\/(\w:)/,'$1');
const base=process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report=[];
const viewports=[['desktop',1440,900,'no-preference'],['mobile',390,844,'reduce']];
if(process.env.ASTRAEA_EXTRA_VIEWPORTS==='1')viewports.push(
 ['wide',1920,1080,'reduce'],['tablet-wide',1024,900,'reduce'],['tablet',768,1024,'reduce'],
 ['mobile-wide',430,932,'no-preference'],['mobile-small',375,812,'reduce'],['mobile-minimum',320,740,'reduce']
);
try {
 for(const [name,width,height,motion] of viewports){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:motion});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.goto(base,{waitUntil:'networkidle'});await page.waitForSelector('.planetarium-ready');
  for(const [index,planet] of ['LUNA','MARS','EUROPA','SATURN','TITAN'].entries()){
   await page.locator(`[data-destination="${index}"]`).click();
   await page.waitForFunction(planet=>document.querySelector('#hero-title').textContent===planet,planet);
   await page.waitForFunction(()=>!document.querySelector('#hero-info').classList.contains('is-changing'));
   await page.locator('#hero-explore').click();
   await page.waitForFunction(()=>document.querySelector('#destination-experience').open);
   if(index===1&&motion==='no-preference'){
    await page.waitForTimeout(1400);await page.screenshot({path:path(name+'-mars-approach')});
   }
   await page.waitForSelector('#destination-experience[data-state="arrived"]');
   await page.waitForTimeout(700);
   assert.equal(await page.locator('#destination-experience').getAttribute('data-destination'),planet.toLowerCase());
   assert.equal(await page.locator('#destination-amenities li').count(),3);
   assert(await page.locator('#destination-scene').evaluate(image=>image.complete&&image.naturalWidth>0));
   const fit=await page.locator('#destination-experience').evaluate(dialog=>{
    const title=document.querySelector('#destination-title'),range=document.createRange();range.selectNodeContents(title);
    const bounds=range.getBoundingClientRect();
    return{overflow:dialog.scrollWidth>dialog.clientWidth+1,titleFits:bounds.left>=0&&bounds.right<=innerWidth};
   });
   assert.equal(fit.overflow,false,`${name} ${planet}: dialog horizontal overflow`);
   assert(fit.titleFits,`${name} ${planet}: heading exceeds viewport`);
   if(index===3)assert.match(await page.locator('#destination-description').textContent(),/never on Saturn/);
   await page.screenshot({path:path(name+'-'+planet.toLowerCase())});
   await page.locator('#destination-more').click();
   assert(await page.locator('#destination-details').isVisible());
   assert.equal(await page.locator('#destination-stays li').count(),3);
   await page.locator('#destination-back').click();
   await page.locator('#destination-return').click();
   await page.waitForFunction(()=>!document.querySelector('#destination-experience').open);
   assert.equal(await page.locator('#hero-title').textContent(),planet);
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  }
  await page.locator('#hero-explore').click();
  if(motion!=='reduce')await page.locator('#destination-skip').click();
  await page.waitForSelector('#destination-experience[data-state="arrived"]');
  await page.locator('[data-resort-book]').first().click();
  assert.equal(await page.locator('#destination').inputValue(),'Titan');
  assert(await page.locator('#destination-experience').evaluate(dialog=>!dialog.open));
  await page.locator('#home').scrollIntoViewIfNeeded();
  await page.locator('#hero-explore').click();await page.keyboard.press('Escape');
  assert(await page.locator('#destination-experience').evaluate(dialog=>!dialog.open));
  assert.equal(await page.evaluate(()=>document.body.classList.contains('exploration-open')),false);
  await page.locator('#planet-tabs [data-destination="1"]').click();
  await page.waitForFunction(()=>document.querySelector('#hero-title').textContent==='MARS');
  await page.locator('#hero-book').click();
  assert.equal(await page.locator('#destination').inputValue(),'Mars');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  report.push({name,width,height,planets:5,details:5,returns:5,skip:motion!=='reduce',escape:true,heroBookingSync:true,resortBookingSync:true,errors});
  await page.close();
 }
}finally{await browser.close();await writeFile(new URL('report.json',root),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
