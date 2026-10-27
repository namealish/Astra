// Sequential gates avoid competing headless WebGL sessions skewing timings.
// Stop at the first failure; never report later gates as passed.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),output=new URL('tmp/acceptance/',root);
await mkdir(output,{recursive:true});
const env={...process.env,ASTRAEA_TEST_URL:process.env.ASTRAEA_TEST_URL||'http://127.0.0.1:5173/dist/index.html',ASTRAEA_TEST_TAG:'final-integration',ASTRAEA_STAGE:'final'};
delete env.ASTRAEA_BASELINE_ONLY;
const gates=[
 ['foundation',['docs/check.mjs','docs/render-budget-check.mjs','build.mjs','docs/assets-check.mjs']],
 ['departure',['docs/departure-check.mjs','docs/departure-interruption-check.mjs']],
 ['solar',['docs/solar-check.mjs','docs/solar-navigation-check.mjs']],
 ['lighting',['docs/lighting-check.mjs','docs/lighting-transition-check.mjs']],
 ['integration',['docs/integration-check.mjs','docs/navigation-history-check.mjs','docs/navigation-layout-check.mjs','docs/lifecycle-check.mjs']],
 ['regression',['docs/visual-check.mjs','docs/handoff-check.mjs','docs/exploration-check.mjs','docs/cinematic-check.mjs','docs/editorial-check.mjs','docs/performance-check.mjs']]
];
const report={url:env.ASTRAEA_TEST_URL,extendedViewports:!!env.ASTRAEA_EXTRA_VIEWPORTS,gates:[],tests:[],passed:false};
const start=Date.now();
for(const[gate,scripts]of gates){
 console.log(`GATE ${gate}`);
 for(const script of scripts){
  const began=Date.now(),log=[];
  console.log(`  RUN node ${script}`);
  const code=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[script],{cwd:fileURLToPath(root),env,stdio:['ignore','pipe','pipe']});
   child.stdout.on('data',data=>log.push(data.toString()));child.stderr.on('data',data=>log.push(data.toString()));
   child.on('error',reject);child.on('close',resolve);
  });
  const entry={gate,command:'node '+script,exitCode:code,seconds:Math.round((Date.now()-began)/100)/10};report.tests.push(entry);
  await writeFile(new URL(script.replace(/^docs\//,'').replace('.mjs','.log'),output),log.join(''));
  console.log(`  ${code===0?'PASS':'FAIL'} ${script} (${entry.seconds}s)`);
  if(code!==0){console.error(log.join(''));report.seconds=(Date.now()-start)/1000;await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));process.exit(code||1);}
 }
 report.gates.push(gate);await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));
}
report.passed=true;report.seconds=(Date.now()-start)/1000;
await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));
console.log(`All ${report.tests.length} checks passed across ${report.gates.length} gates in ${report.seconds.toFixed(1)}s.`);
