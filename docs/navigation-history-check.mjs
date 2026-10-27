import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report=[];
try{
 for(const motion of ['no-preference','reduce']){
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:motion});
  await page.goto(process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/',{waitUntil:'networkidle'});
  await page.locator('#open-solar-system').scrollIntoViewIfNeeded();await page.waitForTimeout(200);const before=await page.evaluate(()=>scrollY);
  await page.locator('#open-solar-system').click();await page.waitForSelector('#navigation-experience[data-phase="ready"]');await page.keyboard.press('Escape');await page.waitForTimeout(250);
  const after=await page.evaluate(()=>scrollY);
  await page.locator('#open-solar-system').click();await page.waitForSelector('#navigation-experience[data-phase="ready"]');await page.locator('.solar-destinations [data-solar-destination="1"]').click();await page.locator('#solar-book').click();await page.waitForTimeout(1800);
  const booking=await page.evaluate(()=>({selected:document.querySelector('#destination').value,top:document.querySelector('#book').getBoundingClientRect().top,focus:document.activeElement.id}));
  report.push({motion,before,after,booking});await page.close();
 }
 assert(report.every(item=>Math.abs(item.before-item.after)<3),'Closing the map must restore the entry scroll position');
 assert(report.every(item=>item.booking.selected==='Mars'&&Math.abs(item.booking.top)<120&&item.booking.focus==='destination'),'Booking must remain visible after Back completes');
}finally{await mkdir(new URL('../tmp/navigation-history/',import.meta.url),{recursive:true});await writeFile(new URL('../tmp/navigation-history/report.json',import.meta.url),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
