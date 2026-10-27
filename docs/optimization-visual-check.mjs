// Compare deterministic, fully loaded reduced-motion frames against the frozen
// pre-optimization build. No source instrumentation or pixel filtering is used.
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const before=process.env.ASTRAEA_BASELINE_URL||'http://127.0.0.1:5173/tmp/perf-baseline-2026-10-27/index.html';
const after=process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/dist/index.html';
const output=new URL('../tmp/optimization-visual/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report={comparisons:[],assets:[],errors:[],method:'Raw RGB screenshots, reduced motion; original foreground geometry/materials. Subpixel distant-body edges may differ.'};
try{
 for(const [device,width,height,dpr] of [['desktop',1440,900,1],['mobile',390,844,2]]){
  const images=new Map();
  for(const [tag,url] of [['before',before],['after',after]]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:'reduce',hasTouch:device==='mobile',isMobile:device==='mobile'});
   const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
   await page.goto(url,{waitUntil:'networkidle'});await page.waitForSelector('.planetarium-ready');
   for(const [index,name] of ['luna','mars','europa','saturn','titan'].entries()){
    await page.locator(`#planet-tabs [data-destination="${index}"]`).click();await page.mouse.move(0,0);
    await page.waitForFunction(name=>document.querySelector('#hero-title').textContent===name.toUpperCase(),name);
    await page.waitForLoadState('networkidle');await page.waitForTimeout(250);
    const buffer=await page.locator('.hero').screenshot({path:new URL(`${device}-${name}-${tag}.png`,output).pathname.replace(/^\/(\w:)/,'$1'),animations:'disabled'});
    const key=device+'-'+name;
    if(tag==='before'){images.set(key,buffer.toString('base64'));continue;}
    const difference=await page.evaluate(async({a,b})=>{
     async function pixels(base64){const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return{data:ctx.getImageData(0,0,img.width,img.height).data,width:img.width,height:img.height};}
     const first=await pixels(a),second=await pixels(b);if(first.width!==second.width||first.height!==second.height)throw new Error('Screenshot dimensions changed');
     let sum=0,changed=0,foregroundSum=0,foregroundCount=0,max=0;
     for(let i=0;i<first.data.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(first.data[i+c]-second.data[i+c]);sum+=d;max=Math.max(max,d/3);if(d/3>8)changed++;if(i/4>=first.width*first.height*.45){foregroundSum+=d;foregroundCount++;}}
     return{width:first.width,height:first.height,meanRgbDifference:sum/(first.width*first.height*3),foregroundMeanRgbDifference:foregroundSum/(foregroundCount*3),changedPixelsPercent:changed/(first.width*first.height)*100,maxRgbDifference:max};
    },{a:images.get(key),b:buffer.toString('base64')});
    report.comparisons.push({device,name,...difference});
   }
   if(tag==='after'){
    const sources=[];
    for(const card of await page.locator('.destination-card').all()){
     await card.scrollIntoViewIfNeeded();
     await page.waitForFunction(index=>!!document.querySelector(`.destination-card[data-open-destination="${index}"] img`).currentSrc,await card.getAttribute('data-open-destination'));
     await card.locator('img').evaluate(img=>img.decode());
     sources.push(await card.locator('img').evaluate(img=>({source:img.currentSrc,width:img.naturalWidth})));
    }
    assert(sources.every(image=>image.width>0));assert.equal(sources.length,5);report.assets.push({device,cards:sources});
   }
   await context.close();
  }
 }
 assert.deepEqual(report.errors,[]);
 for(const comparison of report.comparisons){
  assert(comparison.foregroundMeanRgbDifference<.2,`${comparison.device} ${comparison.name}: foreground changed; review screenshots`);
  assert(comparison.changedPixelsPercent<.5,`${comparison.device} ${comparison.name}: visible difference requires review`);
 }
 // Without JS the original photographic cards must still be visible.
 const fallback=await browser.newPage({javaScriptEnabled:false});await fallback.goto(after);
 await fallback.locator('.destination-card').first().scrollIntoViewIfNeeded();
 assert.equal(await fallback.locator('.destination-card noscript img').count(),5);
 assert(await fallback.locator('.destination-card noscript img').first().isVisible());report.noScript=true;await fallback.close();
}catch(error){report.failure=error.stack;throw error;}
finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
