// Comparable local lab measurements. No production instrumentation is shipped.
import {chromium} from 'playwright-core';
import {mkdir,writeFile,readdir,stat} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const tag=process.env.ASTRAEA_BENCH_TAG||'after';
const base=process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/dist/index.html';
const output=new URL('../tmp/benchmark-'+tag+'/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report={tag,url:base,browser:browser.version(),method:{loadRuns:3,loadWindow:'6 seconds after navigation start, then final readiness (bounded 30s)',coldCache:true,loadConditions:{desktop:{viewport:[1440,900],dpr:1,cpu:1,latencyMs:40,downloadMbps:8},mobile:{viewport:[390,844],dpr:2,cpu:4,latencyMs:100,downloadMbps:1.6}},renderConditions:'Unthrottled isolated Chrome; instrumentation overhead included equally; no real mobile hardware.',tbt:'Lab proxy: sum(max(0,longTask.duration-50)) between FCP and the six-second load window. Not Lighthouse TBT or field INP.',memory:'RGBA8 mip-chain and buffer allocation estimates exclude driver/framebuffer overhead.',fps:'Delivered renderer requestAnimationFrame cadence, not guaranteed physical presentation FPS.'},loading:[],rendering:[],errors:[]};
const metrics=async cdp=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
function observers(){
 window.__lab={lcp:null,heroReadyMs:null,cls:0,longTasks:[],events:[]};
 document.addEventListener('DOMContentLoaded',()=>{
  const observer=new MutationObserver(check);
  function check(){if(document.body.classList.contains('planetarium-ready')){window.__lab.heroReadyMs=performance.now();observer.disconnect();}}
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});check();
 },{once:true});
 for(const type of ['largest-contentful-paint','layout-shift','longtask','event'])try{
  new PerformanceObserver(list=>{for(const entry of list.getEntries()){
   if(type==='largest-contentful-paint')window.__lab.lcp=entry.startTime;
   if(type==='layout-shift'&&!entry.hadRecentInput)window.__lab.cls+=entry.value;
   if(type==='longtask')window.__lab.longTasks.push({start:entry.startTime,duration:entry.duration});
   if(type==='event')window.__lab.events.push({name:entry.name,duration:entry.duration,inputDelay:entry.processingStart-entry.startTime,processing:entry.processingEnd-entry.processingStart});
  }}).observe({type,buffered:true,...(type==='event'?{durationThreshold:16}:{})});
 }catch{}
}
function instrumentation(){
 const textures=new Map(),buffers=new Map(),contexts=new Set();let gl=null,timer=null,queries=[],boundTexture=null,boundBuffers=new Map(),lastStamp=0;
 const data=window.__gpu={frames:[],gpuMs:[],draws:0,triangles:0,uploads:0,uploadedBytes:0,apiCalls:0,domMutations:0,texturePeakBytes:0,geometryBytes:0,capabilities:{}};
 const texBytes=()=>[...textures.values()].reduce((sum,t)=>sum+t.bytes*(t.mips?4/3:1),0);
 const peak=()=>{data.texturePeakBytes=Math.max(data.texturePeakBytes,texBytes());};
 new MutationObserver(records=>{for(const r of records)if((r.target.nodeType===1?r.target:r.target.parentElement)?.closest('#solar-interface'))data.domMutations++;}).observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
 const getContext=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(type,...args){
  const ctx=getContext.call(this,type,...args);if(!ctx||!/^webgl/.test(type)||contexts.has(ctx))return ctx;
  contexts.add(ctx);gl=ctx;timer=type==='webgl2'?ctx.getExtension('EXT_disjoint_timer_query_webgl2'):null;
  const debug=ctx.getExtension('WEBGL_debug_renderer_info');
  data.capabilities={webgl:type,maxTexture:ctx.getParameter(ctx.MAX_TEXTURE_SIZE),renderer:debug?ctx.getParameter(debug.UNMASKED_RENDERER_WEBGL):'masked',gpuTimer:!!timer,extensions:ctx.getSupportedExtensions()};
  const wrap=(name,fn)=>{const original=ctx[name].bind(ctx);ctx[name]=(...values)=>fn(original,values);};
  wrap('bindTexture',(original,args)=>{if(args[0]===ctx.TEXTURE_2D)boundTexture=args[1];data.apiCalls++;return original(...args);});
  wrap('createTexture',(original,args)=>{const result=original(...args);textures.set(result,{bytes:0,mips:false});return result;});
  wrap('deleteTexture',(original,args)=>{textures.delete(args[0]);return original(...args);});
  wrap('texImage2D',(original,args)=>{const image=args[5],w=args.length===6?image.width:args[3],h=args.length===6?image.height:args[4];textures.set(boundTexture,{bytes:w*h*4,mips:false});peak();return original(...args);});
  wrap('generateMipmap',(original,args)=>{const texture=textures.get(boundTexture);if(texture)texture.mips=true;peak();return original(...args);});
  wrap('bindBuffer',(original,args)=>{boundBuffers.set(args[0],args[1]);data.apiCalls++;return original(...args);});
  wrap('bufferData',(original,args)=>{const bytes=typeof args[1]==='number'?args[1]:args[1]?.byteLength||0;buffers.set(boundBuffers.get(args[0]),bytes);data.uploads++;data.uploadedBytes+=bytes;return original(...args);});
  wrap('bufferSubData',(original,args)=>{data.uploads++;data.uploadedBytes+=args[2]?.byteLength||0;return original(...args);});
  wrap('deleteBuffer',(original,args)=>{buffers.delete(args[0]);return original(...args);});
  for(const name of ['drawElements','drawArrays'])wrap(name,(original,args)=>{data.draws++;if(args[0]===ctx.TRIANGLES)data.triangles+=(name==='drawElements'?args[1]:args[2])/3;return original(...args);});
  for(const name of ['useProgram','vertexAttribPointer','enableVertexAttribArray','disableVertexAttribArray','uniformMatrix4fv','uniform1f','uniform1i','uniform3fv','uniform4fv','uniform3f','uniform4f','activeTexture'])wrap(name,(original,args)=>{data.apiCalls++;return original(...args);});
  return ctx;
 };
 const raf=requestAnimationFrame;
 window.requestAnimationFrame=callback=>raf(now=>{
  if(callback.name!=='draw'){callback(now);return;}
  if(timer){while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=queries.shift();if(!gl.getParameter(timer.GPU_DISJOINT_EXT))data.gpuMs.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}}
  let query=null;if(timer&&queries.length<8){query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);}
  const before={time:performance.now(),draws:data.draws,triangles:data.triangles,api:data.apiCalls};
  callback(now);
  if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push(query);}
  if(data.draws>before.draws){data.frames.push({interval:lastStamp?now-lastStamp:0,cpu:performance.now()-before.time,draws:data.draws-before.draws,triangles:data.triangles-before.triangles,api:data.apiCalls-before.api});lastStamp=now;}
 });
 window.__snapshot=()=>({...data,textureBytes:texBytes(),geometryBytes:[...buffers.values()].reduce((a,b)=>a+b,0),textures:textures.size,buffers:buffers.size,contexts:contexts.size});
 window.__reset=()=>{data.frames=[];data.gpuMs=[];data.uploads=data.uploadedBytes=data.domMutations=0;lastStamp=0;};
}
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]:null;
const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
function summarize(raw){const intervals=raw.frames.map(f=>f.interval).filter(v=>v>0);return{frames:raw.frames.length,fps:intervals.length?1000/average(intervals):0,frameMs:{mean:average(intervals),p50:percentile(intervals,.5),p95:percentile(intervals,.95),p99:percentile(intervals,.99)},rendererCpuMs:{mean:average(raw.frames.map(f=>f.cpu)),p95:percentile(raw.frames.map(f=>f.cpu),.95)},gpuMs:raw.gpuMs.length?{mean:average(raw.gpuMs),p95:percentile(raw.gpuMs,.95)}:null,drawsPerFrame:average(raw.frames.map(f=>f.draws)),trianglesPerFrame:average(raw.frames.map(f=>f.triangles)),glCallsPerFrame:average(raw.frames.map(f=>f.api)),uploads:raw.uploads,uploadedBytes:raw.uploadedBytes,domMutations:raw.domMutations,textureBytes:raw.textureBytes,texturePeakBytes:raw.texturePeakBytes,geometryBytes:raw.geometryBytes,textures:raw.textures,buffers:raw.buffers,contexts:raw.contexts};}
try{
 for(const[name,width,height,dpr,cpu,latency,mbps]of[['desktop',1440,900,1,1,40,8],['mobile',390,844,2,4,100,1.6]]){
  for(let run=0;run<3;run++){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:name==='mobile',hasTouch:name==='mobile'}),page=await context.newPage(),cdp=await context.newCDPSession(page);
   await page.addInitScript(observers);page.on('pageerror',error=>report.errors.push(error.message));
   await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency,downloadThroughput:mbps*1e6/8,uploadThroughput:mbps*1e6/8});await cdp.send('Performance.enable');
   await page.bringToFront();await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>performance.now()>6000);
   const load=await page.evaluate(()=>{const nav=performance.getEntriesByType('navigation')[0],fcp=performance.getEntriesByName('first-contentful-paint')[0]?.startTime||0,resources=performance.getEntriesByType('resource').filter(r=>r.startTime<6000);return{...window.__lab,domContentLoadedMs:nav.domContentLoadedEventEnd,loadMs:nav.loadEventEnd,fcpMs:fcp,labTbtMs:window.__lab.longTasks.filter(t=>t.start>=fcp&&t.start<6000).reduce((sum,t)=>sum+Math.max(0,Math.min(t.duration,6000-t.start)-50),0),resources:resources.map(r=>({name:new URL(r.name).pathname,bytes:r.encodedBodySize,duration:r.duration})),transferBytes:resources.reduce((sum,r)=>sum+r.transferSize,0),readyAtWindow:document.body.classList.contains('planetarium-ready')};});
   await page.waitForSelector('.planetarium-ready',{timeout:30000});await page.waitForLoadState('load');
   load.final=await page.evaluate(()=>({lcp:window.__lab.lcp,heroReadyMs:window.__lab.heroReadyMs,loadMs:performance.getEntriesByType('navigation')[0].loadEventEnd,transferBytes:performance.getEntriesByType('resource').reduce((sum,r)=>sum+r.transferSize,0),visibility:document.visibilityState}));
   report.loading.push({name,run,...load,metrics:await metrics(cdp)});await context.close();
  }
  console.log(`${tag}: ${name} cold-load samples complete`);
 }
 for(const[name,width,height,dpr]of[['desktop',1440,900,1],['mobile',390,844,2]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:name==='mobile',hasTouch:name==='mobile'}),page=await context.newPage(),cdp=await context.newCDPSession(page);
  await page.addInitScript(observers);await page.addInitScript(instrumentation);page.on('pageerror',error=>report.errors.push(error.message));
  await cdp.send('Performance.enable');await page.goto(base,{waitUntil:'networkidle'});await page.waitForSelector('.planetarium-ready');await page.waitForTimeout(500);
  const result={name,capabilities:await page.evaluate(()=>window.__gpu.capabilities),scenes:[]};report.rendering.push(result);
  async function sample(scene,duration=2000){
   await page.evaluate(()=>window.__reset());const before=await metrics(cdp),start=Date.now();await page.waitForTimeout(duration);const after=await metrics(cdp),raw=await page.evaluate(()=>window.__snapshot());
   const entry={scene,seconds:(Date.now()-start)/1000,...summarize(raw),mainThreadMs:{task:(after.TaskDuration-before.TaskDuration)*1000,script:(after.ScriptDuration-before.ScriptDuration)*1000,layout:(after.LayoutDuration-before.LayoutDuration)*1000,style:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000},heapBytes:after.JSHeapUsedSize};result.scenes.push(entry);return entry;
  }
  await sample('hero-saturn');await page.screenshot({path:new URL(name+'-hero.png',output).pathname.replace(/^\/(\w:)/,'$1')});
  await page.locator('#hero-next').click();await page.waitForFunction(()=>document.querySelector('#hero-title').textContent==='TITAN');await page.locator('#planet-tabs [data-destination="1"]').click();await page.waitForFunction(()=>document.querySelector('#hero-title').textContent==='MARS');await page.waitForTimeout(500);await sample('hero-mars');
  result.interactions=await page.evaluate(()=>window.__lab.events);
  await page.locator('#begin-journey').click();await page.waitForSelector('#navigation-experience[data-phase="terminal"]');await sample('departure',2400);await page.locator('#skip-intro').click();
  await page.locator('#open-solar-system').click();await page.waitForSelector('#navigation-experience[data-phase="ready"]');await page.waitForTimeout(500);await sample('solar-overview');
  await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await page.waitForTimeout(1000);const{profile}=await cdp.send('Profiler.stop');
  const hot=new Map();for(let i=0;i<profile.samples.length;i++){const id=profile.samples[i];hot.set(id,(hot.get(id)||0)+(profile.timeDeltas[i]||0)/1000);}result.solarCpuProfile=profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber,ms:hot.get(n.id)||0})).sort((a,b)=>b.ms-a.ms).slice(0,16);
  await page.locator('[data-camera-mode="journey"]').click();await page.waitForTimeout(1300);await sample('solar-journey');
  await page.locator('#solar-pause').click();await page.waitForTimeout(2300);await sample('solar-paused',1000);
  await page.locator('#solar-explore').click();await page.locator('#destination-skip').click();await page.waitForSelector('#destination-experience[data-lighting-state="ready"]');
  await page.locator('[data-lighting="3"]').click();await sample('resort-transition',2400);await sample('resort-static',1000);
  await page.keyboard.press('Escape');await page.waitForTimeout(200);await cdp.send('HeapProfiler.collectGarbage');result.cleanedHeapBytes=(await metrics(cdp)).JSHeapUsedSize;result.cleanedDom=await cdp.send('Memory.getDOMCounters');
  await context.close();console.log(`${tag}: ${name} rendering samples complete`);
 }
 // Transfer sizes of actual modules (unminified native ESM; gzip is a size
 // estimate only because the local development server sends identity encoding).
 const modules=[];for(const file of(await readdir(new URL('../',import.meta.url))).filter(f=>f.endsWith('.js'))){const response=await fetch(new URL(file,base));if(response.ok){const bytes=Buffer.from(await response.arrayBuffer());modules.push({file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length});}}
 report.modules=modules;assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;throw error;}
finally{await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({tag,load:report.loading.map(x=>({name:x.name,run:x.run,lcp:x.lcp,tbt:x.labTbtMs,bytes:x.transferBytes})),scenes:report.rendering.map(x=>({name:x.name,scenes:x.scenes.map(s=>({scene:s.scene,triangles:s.trianglesPerFrame,cpu:s.rendererCpuMs.mean,draws:s.drawsPerFrame,dom:s.domMutations}))}))},null,2));
