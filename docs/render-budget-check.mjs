import assert from 'node:assert/strict';
import {packMeshes,sphereLOD,sphereVisible,createRenderBudget} from '../render-budget.js';
import {lookAt,perspective,project} from '../scene-math.js';
import {fillRoute,routeHeight,routePoint,segmentHit} from '../solar-navigation.js';
const mesh={vertices:new Float32Array(24),indices:new Uint16Array([0,1,2]),stride:32};
const packed=packMeshes([mesh,mesh,mesh]);
assert.deepEqual([...packed.indices],[0,1,2,3,4,5,6,7,8]);
assert.deepEqual(packed.ranges,[{count:3,offset:0},{count:3,offset:6},{count:3,offset:12}]);
assert.equal(sphereLOD(packed.ranges,20),packed.ranges[2]);
assert.equal(sphereLOD(packed.ranges,100),packed.ranges[1]);
assert.equal(sphereLOD(packed.ranges,500),packed.ranges[0]);
for(const [options,tier,cap] of [[{dpr:3},'high',1.75],[{mobile:true,dpr:3},'balanced',1.3],[{constrained:true,dpr:3},'performance',1]]){
 const policy=createRenderBudget(options);assert.equal(policy.tier,tier);assert.equal(policy.cap,cap);
}
const policy=createRenderBudget({dpr:2});
for(let i=0;i<100;i++)policy.sample(.2);assert.equal(policy.cap,1.75,'Suspended frames must not lower quality');
for(let i=0;i<100;i++)policy.sample(.04,{safe:false});assert.equal(policy.cap,1.75,'No DPR swap during a cinematic');
assert(policy.sample(.04,{safe:true}));assert.equal(policy.cap,1.6);
for(let i=0;i<100;i++)policy.sample(.04);assert.equal(policy.cap,1.6,'Cooldown prevents rapid drops');
for(let i=0;i<1400;i++)policy.sample(.016);assert.equal(policy.cap,1.75,'Recovery restores the device ceiling');
for(let i=0;i<5000;i++)policy.sample(.04);assert.equal(policy.cap,1,'DPR floor');
const ceiling=createRenderBudget({dpr:1});for(let i=0;i<5000;i++)ceiling.sample(.04);assert.equal(ceiling.cap,1);
const start=[-3,1,4],end=[14,3,-5],obstacles=[{center:[4,0,0],radius:2}];
const height=routeHeight(start,end,obstacles),points=new Float32Array(97*3);fillRoute(points,start,end,height);
for(let i=0;i<97;i++)assert.deepEqual([...points.slice(i*3,i*3+3)],Array.from(new Float32Array(routePoint(start,end,i/96,height))));
assert.equal(segmentHit([-5,0,0],[5,0,0],[0,0,0],1),.4);assert.equal(segmentHit([-5,3,0],[5,3,0],[0,0,0],1),null);
let checked=0;
for(const aspect of [.46,1,1.6])for(const framing of [[0,0],[.18,0],[-.6,.38]]){
 const view=lookAt([10,6,17],[0,0,0]),projection=perspective(aspect);projection[8]=-framing[0];projection[9]=-framing[1];
 for(let x=-30;x<=30;x+=3)for(let z=-30;z<=30;z+=3){
  const center=[x,0,z],radius=2;
  for(const delta of [[0,0,0],[2,0,0],[-2,0,0],[0,2,0],[0,-2,0],[0,0,2],[0,0,-2]]){
   const p=project(center.map((v,i)=>v+delta[i]),view,projection,100,100);
   if(p.depth>.08&&p.depth<500&&p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100){assert(sphereVisible(center,radius,view,projection),'Frustum must retain intersecting bounds');checked++;}
  }
 }
}
console.log(`Render budget: tiers, hysteresis, safe handoff, recovery, packed indices, route parity and ${checked} frustum samples passed.`);
