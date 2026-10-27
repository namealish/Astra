import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const stage = process.env.ASTRAEA_STAGE || 'final';
const output = new URL(`../tmp/editorial-${stage}/`, import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report = [];
try {
 const viewports=[['desktop',1440,1000],['mobile',390,844]];
 if(process.env.ASTRAEA_EXTRA_VIEWPORTS)viewports.push(['wide-desktop',1920,1080],['mobile-430',430,932],['mobile-375',375,812],['small-mobile',320,740],['tablet',768,1024],['small-desktop',1024,900]);
 for(const [name,width,height] of viewports) {
  const page = await browser.newPage({viewport:{width,height}, deviceScaleFactor:1, reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.goto(process.env.ASTRAEA_TEST_URL || 'http://127.0.0.1:5173/',{waitUntil:'networkidle'});
  await page.waitForSelector('.planetarium-ready');
  for(const section of ['crew','fleet']) {
   await page.locator(`#${section}`).scrollIntoViewIfNeeded();
   await page.waitForTimeout(300);
   await page.locator(`#${section} img`).evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
   assert(await page.locator(`#${section} img`).evaluateAll(images=>images.length===3&&images.every(image=>image.complete&&image.naturalWidth>0&&image.currentSrc.includes('.webp'))));
   await page.locator(`#${section}`).screenshot({path:new URL(`${name}-${section}.png`,output).pathname.replace(/^\/(?:([A-Z]:))/,'$1')});
  }
  for(const [index,title] of ['ASTRAEA ONE','CELESTE','AURELIA'].entries()) {
   await page.locator(`[data-ship="${index}"]`).click();
   assert.equal(await page.locator('#ship-dialog-name').textContent(),title);
   await page.locator('#ship-dialog-image').evaluate(image=>image.decode());
   assert(await page.locator('#ship-dialog').evaluate(dialog=>dialog.open));
   await page.locator('#close-ship').click();
  }
  if(stage!=='stage1') {
   await page.locator('#experience').scrollIntoViewIfNeeded();
   const cards=page.locator('.gallery-card');
   assert.equal(await cards.count(),6);
   for(let i=0;i<6;i++) {
    await cards.nth(i).scrollIntoViewIfNeeded();
    await cards.nth(i).locator('img').evaluate(image=>image.decode());
    assert((await cards.nth(i).locator('img').getAttribute('src')).includes('interior-'));
    await cards.nth(i).screenshot({path:new URL(`${name}-interior-${i}.png`,output).pathname.replace(/^\/(?:([A-Z]:))/,'$1')});
   }
   await page.locator('#gallery-prev').click();
   await page.waitForTimeout(300);
   assert(await page.locator('#interior-gallery').evaluate(gallery=>gallery.scrollLeft<gallery.scrollWidth-gallery.clientWidth-10));
   await page.locator('#interior-gallery').focus();await page.keyboard.press('Home');
   assert(await page.locator('#interior-gallery').evaluate(gallery=>gallery.scrollLeft<=3.1),'Home reaches first card, including its 3px snap inset');
   await page.keyboard.press('End');
   assert(await page.locator('#interior-gallery').evaluate(gallery=>Math.abs(gallery.scrollWidth-gallery.clientWidth-gallery.scrollLeft)<4),'End reaches the final card with its snap inset');
  }
  if(stage==='final') {
   await page.locator('#destination').selectOption('Saturn');
   await page.locator('#travelers').selectOption('3');
   await page.locator('#cabin').selectOption('Grand Suite');
   assert.equal(await page.locator('#journey-estimate').textContent(),'$8,400,000');
   await page.locator('.booking-submit').click();
   assert.match(await page.locator('#booking-results').textContent(),/Earth → Saturn/);
   assert.match(await page.locator('#booking-results').textContent(),/\$8,400,000/);
   await page.locator('#book').screenshot({path:new URL(`${name}-booking.png`,output).pathname.replace(/^\/(?:([A-Z]:))/,'$1')});
   await page.locator('#destination').selectOption('Mars');
   assert(await page.locator('#booking-results').isHidden());
   await page.locator('[data-cabin-value="Private Residence"]').click();
   assert.equal(await page.locator('#cabin').inputValue(),'Private Residence');
   assert.equal(await page.locator('#journey-estimate').textContent(),'$6,675,000');
   await page.locator('[data-cabin-value="Grand Suite"]').click();
   await page.locator('.booking-submit').click();
   await page.locator('#preview-journey-app').click();
   assert.match(await page.locator('#phone-label').textContent(),/MARS/);
   for(let i=0;i<3;i++) {
    await page.locator(`[data-day="${i}"]`).click();
    assert.equal(await page.locator(`[data-day="${i}"]`).getAttribute('aria-pressed'),'true');
   }
   await page.locator('[data-appscreen="2"]').click();
   await page.locator('[data-phone-action="pass"]').click();
   assert.match(await page.locator('.demo-pass-code').textContent(),/NOT VALID FOR TRAVEL/);
   await page.locator('[data-appscreen="3"]').click();
   await page.locator('[data-onboard="1"]').click();
   await page.locator('[data-phone-action="save"]').click();
   assert.equal(await page.locator('[data-phone-action="save"]').getAttribute('aria-pressed'),'true');
   assert.match(await page.locator('#phone-status').textContent(),/No reservation made/);
   await page.locator('[data-appscreen="4"]').click();
   await page.locator('[data-request="Suite comfort"]').click();
   assert.match(await page.locator('#phone-status').textContent(),/No request has been sent/);
   await page.locator('[data-appscreen="0"]').click();
   const discovered=new Set();
   for(let i=0;i<5;i++) {
    discovered.add(await page.locator('#phone-panel>strong').textContent());
    await page.locator('[data-phone-action="next"]').click();
   }
   assert.equal(discovered.size,5);
   await page.locator('[data-appscreen="5"]').click();
   await page.locator('#app-guests').selectOption('4');
   await page.locator('#app-cabin').selectOption('Private Residence');
   assert.equal(await page.locator('#travelers').inputValue(),'4');
   assert.equal(await page.locator('#cabin').inputValue(),'Private Residence');
   await page.locator('[data-appscreen="6"]').click();
   assert.match(await page.locator('#phone-panel').textContent(),/SIMULATED VOYAGE CLOCK/);
   assert.match(await page.locator('#countdown-days').textContent(),/^\d+$/);
   for(let i=0;i<7;i++) {
    await page.locator(`[data-appscreen="${i}"]`).click();
    await page.locator('.phone').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const layout=await page.locator('#phone-screen').evaluate(screen=>({height:screen.clientHeight,content:screen.scrollHeight}));
    assert(layout.content<=layout.height,`Phone screen ${i} clips content: ${JSON.stringify(layout)}`);
    await page.locator('.phone').screenshot({path:new URL(`${name}-phone-${i}.png`,output).pathname.replace(/^\/(?:([A-Z]:))/,'$1')});
   }
   for(const section of ['#app','.final-section','#home']) {
    await page.locator(section).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.locator(`${section} img`).evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    await page.screenshot({path:new URL(`${name}-${section.replace(/^[#.]/,'')}-viewport.png`,output).pathname.replace(/^\/(?:([A-Z]:))/,'$1')});
   }
   if(width<680) {
    await page.locator('#menu-toggle').click();
    assert(await page.locator('#mobile-navigation').isVisible());
    await page.locator('#mobile-navigation a[href="#crew"]').click();
    assert(await page.locator('#mobile-navigation').isHidden());
   }
   await page.locator('#prive-invite').click();
   assert(await page.locator('#invite-dialog').evaluate(dialog=>dialog.open));
   await page.keyboard.press('Escape');
   assert(await page.locator('#invite-dialog').evaluate(dialog=>!dialog.open));
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  report.push({viewport:name,stage,errors,crew:3,fleet:3,dialogs:3,horizontalOverflow:false,interactiveFlows:stage==='final'?'Booking pricing, stale-result invalidation, booking/app sync, 7 app screens, cabin/guest controls, simulated countdown, itinerary, pass, onboard save, concierge, navigation, Privé passed':undefined});
  await page.close();
 }
} finally { await browser.close(); await writeFile(new URL('report.json',output),JSON.stringify(report,null,2)); }
console.log(JSON.stringify(report,null,2));
