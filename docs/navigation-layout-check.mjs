import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=new URL('../tmp/navigation-layout/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const report=[];
try{
 for(const[width,height]of[[1920,1080],[1024,900],[768,1024],[430,932],[375,812],[320,740],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});await page.goto(process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/',{waitUntil:'networkidle'});
  await page.locator('#open-solar-system').click();await page.waitForSelector('#navigation-experience[data-phase="ready"]');await page.locator('[data-camera-mode="destination"]').click();await page.waitForTimeout(200);
  const fit=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};};const t=rect('.solar-tools'),p=rect('.solar-panel'),f=rect('.solar-footer');return{width:innerWidth,height:innerHeight,tools:t,panel:p,footer:f,overflow:document.querySelector('#navigation-experience').scrollWidth>innerWidth+1,toolsOverlap:t.right>p.x&&t.x<p.right&&t.bottom>p.y&&t.y<p.bottom,panelFooterOverlap:p.bottom>f.y};});
  await page.screenshot({path:new URL(`${width}-solar.png`,output).pathname.replace(/^\/(\w:)/,'$1')});report.push(fit);
  await page.locator('#navigation-exit').click();await page.locator('#hero-explore').click();await page.waitForSelector('#destination-experience[data-lighting-state="ready"]');
  await page.screenshot({path:new URL(`${width}-resort.png`,output).pathname.replace(/^\/(\w:)/,'$1')});
  const resortFit=await page.evaluate(()=>{const r=document.querySelector('#resort-lighting').getBoundingClientRect(),t=document.querySelector('#destination-title').getBoundingClientRect();return{controls:r.left>=0&&r.right<=innerWidth,overlap:r.left<t.right&&r.right>t.left&&r.top<t.bottom&&r.bottom>t.top,overflow:document.querySelector('#destination-experience').scrollWidth>innerWidth+1};});fit.resort=resortFit;
  await page.keyboard.press('Escape');await page.close();
 }
 assert(report.every(item=>!item.overflow&&!item.toolsOverlap&&!item.panelFooterOverlap&&item.resort.controls&&!item.resort.overlap&&!item.resort.overflow),JSON.stringify(report.filter(item=>item.overflow||item.toolsOverlap||item.panelFooterOverlap||item.resort.overlap)));
}finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
