import{chromium}from'playwright-core';
import{mkdir,writeFile}from'node:fs/promises';
import assert from'node:assert/strict';
const base=process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/dist/index.html';
const output=new URL('../tmp/lighting-transitions/',import.meta.url);await mkdir(output,{recursive:true});
const path=name=>new URL(name,output).pathname.replace(/^\/(\w:)/,'$1');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),report={};
const ready=page=>page.waitForSelector('#destination-experience[data-state="arrived"][data-lighting-state="ready"]');
const weights=page=>page.locator('#lighting-images img').evaluateAll(images=>images.map((image,i)=>Number(image.style.opacity)*images.slice(i+1).reduce((product,upper)=>product*(1-Number(upper.style.opacity)),1)));
const light=async(page,mode)=>{await page.locator('[data-lighting="'+mode+'"]').click();await ready(page);};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base,{waitUntil:'networkidle'});await page.locator('#hero-explore').click();await ready(page);await light(page,3);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(100);
 const began=Date.now();await page.locator('[data-lighting="0"]').click();
 const samples=[];
 for(let i=0;i<4;i++){await page.waitForTimeout(360);const sample=await weights(page);assert(Math.abs(sample.reduce((a,b)=>a+b,0)-1)<1e-6);assert.equal(sample[1],0);assert.equal(sample[2],0);samples.push(sample);}
 await ready(page);const duration=(Date.now()-began)/1000;assert(duration>=1.5&&duration<3.2);report.preset={duration,samples,directNightToDawn:true};
 await page.locator('[data-lighting="3"]').click();await page.waitForTimeout(500);
 const interruption=await page.evaluate(()=>{const images=[...document.querySelectorAll('#lighting-images img')],read=()=>images.map(image=>Number(image.style.opacity)),before=read();document.querySelector('[data-lighting="1"]').click();return{before,after:read()};});
 assert.deepEqual(interruption.before,interruption.after);await ready(page);report.interruption='No frame discontinuity when a preset is interrupted';
 // Slider inputs retarget the same animation loop; they do not queue timelines.
 await page.locator('#lighting-slider').fill('20');await page.locator('#lighting-slider').dispatchEvent('input');
 await page.locator('#lighting-slider').fill('260');await page.locator('#lighting-slider').dispatchEvent('input');
 await page.locator('#lighting-slider').fill('150');await page.locator('#lighting-slider').dispatchEvent('input');await ready(page);
 assert.equal(await page.locator('#destination-experience').getAttribute('data-lighting'),'1.50');assert.deepEqual(await weights(page),[0,.5,.5,0]);report.slider='Rapid retargeting settles to the latest value with an opaque blend';
 await page.locator('#lighting-scenery').click();assert.equal(await page.locator('#destination-overview').evaluate(el=>el.inert),true);await page.waitForTimeout(500);
 await page.screenshot({path:path('saturn-architecture.png')});await page.locator('#lighting-scenery').click();assert.equal(await page.locator('#destination-overview').evaluate(el=>el.inert),false);
 // A lighting callback must not overwrite the explorer's return state.
 await page.locator('[data-lighting="3"]').click();await page.waitForTimeout(250);await page.locator('#destination-return').click();
 const returning=[];for(let i=0;i<4;i++){await page.waitForTimeout(150);returning.push(await page.evaluate(async()=>{const{experienceState}=await import(new URL('experience-state.js',location.href));return experienceState.get().animation;}));}
 assert(returning.every(state=>state==='returning'||state==='idle'));await page.waitForFunction(()=>!document.querySelector('#destination-experience').open);report.returning=returning;
 // The remembered Night image is already the arrival poster, not a Day flash.
 await page.locator('#hero-explore').click();assert((await page.locator('#destination-scene').getAttribute('src')).includes('saturn-night'));
 await page.locator('#destination-skip').click();await ready(page);assert.equal(await page.locator('#destination-experience').getAttribute('data-lighting'),'3.00');
 await page.locator('[data-lighting="0"]').click();await page.waitForTimeout(350);await page.emulateMedia({reducedMotion:'reduce'});await ready(page);assert.equal(await page.locator('#destination-experience').getAttribute('data-lighting'),'0.00');
 report.rememberedPoster=true;report.reducedMotionInterrupt=true;await page.keyboard.press('Escape');
 // Shared time-of-day updates use the same renderer and cannot desynchronise UI.
 await page.locator('#hero-explore').click();await ready(page);await page.evaluate(async()=>{const{experienceState}=await import(new URL('experience-state.js',location.href));experienceState.setTime(3,2);});await ready(page);
 assert.equal(await page.locator('[data-lighting="2"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-lighting="2"]').textContent(),'SHADOW');
 await page.keyboard.press('Escape');assert.deepEqual(errors,[]);report.errors=errors;await page.close();
 // Partial failure supports the loaded presets and an explicit recoverable retry.
 const failure=await browser.newPage({reducedMotion:'reduce'});let block=true;
 await failure.route('**/lighting-saturn-night*.webp',route=>block?route.abort():route.continue());await failure.goto(base);await failure.locator('#hero-explore').click();
 await failure.waitForSelector('#destination-experience[data-lighting-state="partial"]');assert(await failure.locator('#lighting-retry').isVisible());assert(await failure.locator('[data-lighting="3"]').isDisabled());
 await failure.emulateMedia({reducedMotion:'no-preference'});await failure.waitForTimeout(100);await failure.locator('[data-lighting="0"]').click();await failure.waitForTimeout(150);
 block=false;await failure.locator('#lighting-retry').click();await ready(failure);assert.equal(await failure.evaluate(async()=>{const{experienceState}=await import(new URL('experience-state.js',location.href));return experienceState.get().transition;}),false);await light(failure,3);report.retry=true;await failure.keyboard.press('Escape');await failure.close();
 const total=await browser.newPage({reducedMotion:'reduce'});await total.route('**/lighting-titan-*.webp',route=>route.abort());await total.goto(base);await total.locator('[data-destination="4"]').click();await total.waitForFunction(()=>document.querySelector('#hero-title').textContent==='TITAN');
 await total.locator('#hero-explore').click();await total.waitForSelector('#destination-experience[data-lighting-state="unavailable"]');
 await total.waitForFunction(()=>{const image=document.querySelector('#destination-scene');return image.complete&&image.naturalWidth>0&&image.src.includes('titan-resort');});
 await total.locator('[data-resort-book]').first().click();assert.equal(await total.locator('#destination').inputValue(),'Titan');report.totalFailure='Original image and booking remain functional';await total.close();
 // A stalled request must not leave the entire configurator locked indefinitely.
 const delayed=await browser.newPage({reducedMotion:'reduce'});await delayed.route('**/lighting-saturn-night*.webp',async route=>{await new Promise(resolve=>setTimeout(resolve,6600));await route.continue().catch(()=>{});});
 await delayed.goto(base);await delayed.locator('#hero-explore').click();await delayed.waitForSelector('#destination-experience[data-lighting-state="partial"]',{timeout:8500});assert(await delayed.locator('[data-lighting="1"]').isEnabled());await delayed.keyboard.press('Escape');await delayed.waitForTimeout(850);
 assert.equal(await delayed.locator('#lighting-images img').count(),0);assert.equal(await delayed.evaluate(async()=>{const{experienceState}=await import(new URL('experience-state.js',location.href));return experienceState.get().experience;}),'hero');report.delayedLoad='Bounded loading and late-result cleanup';await delayed.close();
 // Full existing flow: departure -> carousel -> solar map -> resort -> lighting -> booking.
 const flow=await browser.newPage({viewport:{width:390,height:844}});await flow.goto(base);await flow.locator('#begin-journey').click();await flow.waitForFunction(()=>!document.querySelector('#navigation-experience').open,null,{timeout:16000});
 await flow.locator('#open-solar-system').click();await flow.waitForSelector('#navigation-experience[data-phase="ready"]');await flow.locator('.solar-destinations [data-solar-destination="1"]').click();await flow.locator('#solar-explore').click();await ready(flow);await light(flow,3);
 await flow.locator('[data-resort-book]').first().click();assert.equal(await flow.locator('#destination').inputValue(),'Mars');assert.equal(await flow.evaluate(()=>document.body.style.overflow),'');report.integratedFlow='Departure, carousel, map, Mars resort, Night and Mars booking';await flow.close();
 // A compact, non-destructive asset contact sheet for visual review.
 const sheet=await browser.newPage({viewport:{width:1440,height:1200}});
 const worlds=['luna','mars','europa','saturn','titan'],modes=['dawn','day','sunset','night'];
 await sheet.setContent('<style>body{margin:0;background:#070d15;color:#dbc59f;font:12px Arial;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}figure{margin:0}img{width:100%;aspect-ratio:1.5;object-fit:cover}figcaption{padding:6px}</style>'+worlds.map((world,index)=>modes.map((mode,i)=>{const asset=(i===1&&[0,3].includes(index))||(index===1&&i===2)?world+'-resort.webp':'lighting-'+world+'-'+mode+'.webp';return'<figure><img src="'+new URL('assets/'+asset,base).href+'"><figcaption>'+world.toUpperCase()+' / '+mode.toUpperCase()+'</figcaption></figure>';}).join('')).join(''));
 await sheet.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0));await sheet.screenshot({path:path('all-lighting-assets.png'),fullPage:true});await sheet.close();
}catch(error){report.failure=error.stack;throw error;}finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
