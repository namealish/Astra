import{createSceneRenderer}from'./scene-renderer.js';
import{clamp,mix,mix3,add,sub,norm,cross,smooth}from'./scene-math.js';
import{orbitPoints,segmentHit,clearCamera,routePoint,routeHeight,fillRoute,shipMatrix,navigationShipData}from'./solar-navigation.js';
import{experienceState as state}from'./experience-state.js';
export{routePoint}from'./solar-navigation.js';
// Deliberately stylized radii, spacing and periods. Hierarchy is not stylized.
export const celestialBodies=Object.freeze([
 {id:'sun',label:'SUN',parent:null,radius:1.9},
 {id:'earth',label:'EARTH',parent:'sun',radius:.82,orbit:6,phase:2.25,speed:.011},
 {id:'luna',label:'LUNA',parent:'earth',radius:.28,orbit:1.65,phase:.4,speed:.065,destination:0},
 {id:'mars',label:'MARS',parent:'sun',radius:.65,orbit:10,phase:.30,speed:.008,destination:1},
 {id:'jupiter',label:'JUPITER',parent:'sun',radius:1.65,orbit:16,phase:3.6,speed:.004},
 {id:'europa',label:'EUROPA',parent:'jupiter',radius:.30,orbit:2.7,phase:1.1,speed:.048,destination:2},
 {id:'saturn',label:'SATURN',parent:'sun',radius:1.4,orbit:23,phase:5.4,speed:.003,destination:3},
 {id:'titan',label:'TITAN',parent:'saturn',radius:.36,orbit:3.7,phase:2.4,speed:.035,destination:4}
]);
export function bodyPositions(time){
 const result={};
 for(const body of celestialBodies){
  if(!body.parent){result[body.id]=[0,0,0];continue;}
  const angle=body.phase+time*body.speed;
  result[body.id]=add(result[body.parent],[Math.cos(angle)*body.orbit,0,Math.sin(angle)*body.orbit]);
 }
 return result;
}
export function createSolarSystem(api,options){
 const renderer=createSceneRenderer(api),abort=new AbortController(),signal=abort.signal,canvas=api.canvas;
 const orbits=new Map(celestialBodies.filter(body=>body.parent).map(body=>[body.id,renderer.lineMesh(orbitPoints(body.orbit))]));
 const craft=renderer.mesh(navigationShipData()),route=new Float32Array(97*3),halo=new Float32Array(65*3);
 const routeMesh=renderer.lineMesh(route,true),haloMesh=renderer.lineMesh(halo,true),viewport=api.viewport;
 let routeTime=-1,routeDestination=-1,cachedRoute=null,obstacles=[],cameraObstacles=[];
 let elapsed=options.restored?.elapsed||0,routeProgress=0,paused=options.restored?.paused??state.get().reducedMotion,disposed=false,moving=true;
 let earth=null,jupiter=null,positions=bodyPositions(elapsed),projected=[],pointers=new Map(),gesture=null,lastAspect=viewport().width/viewport().height;
 let eye=options.restored?.eye||null,routeData=null;
 let framing=options.restored?.framing||[lastAspect>.9?.18:0,lastAspect<.8?.38:0];
 const initial=options.restored?.camera;
 let camera=initial||{yaw:.45,pitch:.64,distance:67,target:[0,0,0]};
 let goal={...camera,target:[...camera.target]},mode='overview';
 function overviewDistance(){return Math.max(67,27/(Math.tan(24*Math.PI/180)*(viewport().width/viewport().height)));}
 function selectedBody(){return celestialBodies.find(body=>body.destination===state.get().selected);}
 function setMode(next){
  if(!['overview','destination','journey'].includes(next))return;
  if(next==='journey'&&mode!=='journey')routeProgress=0;
  mode=next;state.set({cameraMode:mode});
  goal.target=mode==='overview'?[0,0,0]:positions[selectedBody().id];
  const portrait=Math.max(1,Math.min(1.85,.85/(viewport().width/viewport().height)));
  goal.distance=mode==='overview'?overviewDistance():mode==='journey'?7:Math.max(4.6,selectedBody().radius*7.5)*(selectedBody().id==='saturn'?portrait:Math.min(1.25,portrait));
  moving=true;options.onMode?.(mode);api.wake();
 }
 function selectionChanged(){routeProgress=0;setMode('destination');options.onSelect?.(state.get().selected);}
 function select(index){if(!celestialBodies.some(body=>body.destination===index))return;if(index===state.get().selected)selectionChanged();else state.set({selected:index});}
 const unsubscribe=state.subscribe((value,previous)=>{if(value.selected!==previous.selected)selectionChanged();});
 function reportPause(){options.onPause?.(paused||state.get().reducedMotion);}
 function action(name,value){
  if(name==='select')select(value);
  if(name==='mode')setMode(value);
  if(name==='reset'){goal.yaw=.45;goal.pitch=.64;setMode('overview');}
  if(name==='pause'){paused=state.get().reducedMotion||!paused;reportPause();}
  if(name==='zoom'&&Number.isFinite(value)&&value>0)goal.distance=clamp(goal.distance*value,mode==='overview'?overviewDistance()*.25:Math.max(3.8,selectedBody().radius*3.5),overviewDistance()*1.5);
  if(name==='scrub'&&Number.isFinite(value)){routeProgress=clamp(value);paused=true;reportPause();}
  if(name==='replay'){routeProgress=0;paused=state.get().reducedMotion;setMode('journey');reportPause();}
  if(name==='refresh'){if(state.get().reducedMotion)paused=true;reportPause();}
  moving=true;api.wake();
 }
 for(const name of['earth','jupiter']){
  api.loadTexture('assets/navigation-'+name+(api.mobile||api.constrained?'-small':'')+'.webp').then(texture=>{
   if(disposed){api.release(texture);return;}if(name==='earth')earth=texture;else jupiter=texture;api.wake();
  }).catch(()=>{if(!disposed)options.onNotice?.('Some textures could not load. The navigation geometry and controls remain available.');});
 }
 canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  gesture={x:event.clientX,y:event.clientY,moved:false,pinch:pointers.size>1};
  if(pointers.size===2){const[a,b]=[...pointers.values()];gesture.distance=Math.hypot(a.x-b.x,a.y-b.y);}
 },{signal});
 canvas.addEventListener('pointermove',event=>{
  const previous=pointers.get(event.pointerId);if(!previous||!gesture)return;
  const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>4)gesture.moved=true;
  if(pointers.size===2){
   const[a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);
   if(gesture.distance>0)action('zoom',gesture.distance/Math.max(1,distance));
   gesture.distance=distance;gesture.pinch=true;
  }else{
   if(mode==='journey')setMode('destination');
   goal.yaw-=dx*.005;goal.pitch=clamp(goal.pitch+dy*.004,.15,1.28);moving=true;api.wake();
  }
 },{signal});
 canvas.addEventListener('pointerup',event=>{
  if(gesture&&!gesture.moved&&!gesture.pinch){
   const bounds=canvas.getBoundingClientRect(),x=event.clientX-bounds.left,y=event.clientY-bounds.top;
   const hits=projected.filter(item=>item.destination!==undefined&&item.visible&&Math.hypot(item.x-x,item.y-y)<Math.max(22,item.hit));
   hits.sort((a,b)=>a.depth-b.depth);if(hits[0])select(hits[0].destination);
  }
  pointers.delete(event.pointerId);if(!pointers.size)gesture=null;
 },{signal});
 canvas.addEventListener('pointercancel',()=>{pointers.clear();gesture=null;},{signal});
 canvas.addEventListener('lostpointercapture',event=>{pointers.delete(event.pointerId);if(!pointers.size)gesture=null;},{signal});
 canvas.addEventListener('wheel',event=>{event.preventDefault();action('zoom',Math.exp(clamp(event.deltaY,-120,120)*.002));},{signal,passive:false});
 canvas.addEventListener('keydown',event=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home','p','P','1','2','3','4','5'].includes(event.key))event.preventDefault();else return;
  if(event.key==='ArrowLeft')goal.yaw-=.15;if(event.key==='ArrowRight')goal.yaw+=.15;
  if(event.key==='ArrowUp')goal.pitch=clamp(goal.pitch+.1,.15,1.28);if(event.key==='ArrowDown')goal.pitch=clamp(goal.pitch-.1,.15,1.28);
  if(event.key==='+'||event.key==='=')action('zoom',.85);if(event.key==='-')action('zoom',1.15);
  if(event.key==='Home')action('reset');if(event.key.toLowerCase()==='p')action('pause');
  if(/^[1-5]$/.test(event.key))select(Number(event.key)-1);moving=true;api.wake();
 },{signal});
 function render({dt,width,height,reduced}){
  if(Math.abs(width/height-lastAspect)>.04){lastAspect=width/height;if(mode!=='journey')setMode(mode);}
  if(!paused&&!reduced){elapsed+=dt;if(mode==='journey')routeProgress=Math.min(1,routeProgress+dt/14);}
  const body=selectedBody();
  if(routeTime!==elapsed||routeDestination!==body.destination){
   routeTime=elapsed;routeDestination=body.destination;positions=bodyPositions(elapsed);
   obstacles=celestialBodies.map(item=>({id:item.id,center:positions[item.id],radius:item.radius*(item.id==='saturn'?2.4:1)}));
   cameraObstacles=obstacles.map(item=>({...item,radius:item.radius+.45}));
   // Saturn's arrival is above its ring envelope: orbital resort, not landing.
   const start=add(positions.earth,[0,1.35,0]),end=add(positions[body.id],[0,body.id==='saturn'?body.radius*2.4+.65:body.radius+1,0]);
   cachedRoute={start,end,height:routeHeight(start,end,obstacles)};
   fillRoute(route,start,end,cachedRoute.height);renderer.updateLine(routeMesh,route);
  }
  const{start,end,height:heightOfRoute}=cachedRoute,progress=smooth(routeProgress),marker=routePoint(start,end,progress,heightOfRoute);
  const tangent=sub(end,start);tangent[1]+=Math.PI*heightOfRoute*Math.cos(progress*Math.PI);
  routeData={start,end,height:heightOfRoute,marker,tangent};
  if(mode==='overview')goal.distance=Math.max(goal.distance,overviewDistance()*.25);
  if(mode==='destination')goal.target=positions[body.id];
  if(mode==='journey')goal.target=marker;
  const t=reduced?1:1-Math.exp(-dt*5.5);
  camera={yaw:mix(camera.yaw,goal.yaw,t),pitch:mix(camera.pitch,goal.pitch,t),distance:mix(camera.distance,goal.distance,t),target:mix3(camera.target,goal.target,t)};
  moving=Math.abs(camera.yaw-goal.yaw)+Math.abs(camera.pitch-goal.pitch)+Math.abs(camera.distance-goal.distance)+Math.hypot(...sub(camera.target,goal.target))>.001;
  const desiredEye=add(camera.target,[Math.sin(camera.yaw)*Math.cos(camera.pitch)*camera.distance,Math.sin(camera.pitch)*camera.distance,Math.cos(camera.yaw)*Math.cos(camera.pitch)*camera.distance]);
  eye=clearCamera(reduced?null:eye,desiredEye,cameraObstacles);
  const narrow=viewport().width<=680;
  // Keep the tracked craft beside (not beneath) the mobile route controls.
  const desiredFraming=[narrow&&mode==='journey'?-.6:width/height>.9?.18:0,width/height<.8?.38:0];
  framing=framing.map((value,index)=>mix(value,desiredFraming[index],t));
  moving=moving||framing.some((value,index)=>Math.abs(value-desiredFraming[index])>.001);
  renderer.start(eye,camera.target,width,height,[0,0,0],true,framing);renderer.stars(.65);
  routeData.projected=renderer.project(marker);
  for(const item of celestialBodies){
   if(!item.parent)continue;
   renderer.lines(orbits.get(item.id),item.id===body.id?[.72,.60,.39,.62]:item.id===body.parent?[.64,.56,.42,.34]:[.5,.56,.62,.18],undefined,1,positions[item.parent]);
  }
  for(const item of celestialBodies){
   const r=item.radius,map=item.id==='earth'?earth:item.id==='jupiter'?jupiter:item.destination!==undefined?api.material(item.destination):null;
   renderer.object('sphere',positions[item.id],[r,r,r],item.id==='sun'?[.95,.25,.02]:[.28,.37,.42],{map,emission:item.id==='sun'?2:.025,rim:item.id==='earth'?.4:item.id==='titan'?.08:0,angle:item.id==='earth'?-1.1:elapsed*.012,tilted:item.id==='saturn'});
   if(item.id==='saturn')renderer.ring(positions.saturn,r);
  }
  renderer.lines(routeMesh,[.83,.69,.46,.65]);
  const scale=mode==='journey'?(narrow?.16:.23):.075;
  renderer.object(craft,marker,[scale,scale,scale],[.72,.76,.78],{matrix:shipMatrix(marker,tangent,scale),finish:[.3,.4,.6],emission:.15});
  const aft=add(marker,norm(tangent).map(v=>v*-1.4*scale));
  renderer.object('sphere',aft,[scale*.3,scale*.3,scale*.3],[.28,.55,.8],{emission:1.5});
  const facing=norm(sub(eye,positions[body.id])),right=norm(cross([0,1,0],facing)),up=cross(facing,right),radius=body.radius*(body.id==='saturn'?2.5:1.22);
  for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;halo.set(positions[body.id].map((v,j)=>v+radius*(right[j]*Math.cos(a)+up[j]*Math.sin(a))),i*3);}
  renderer.updateLine(haloMesh,halo);renderer.lines(haloMesh,[.8,.69,.48,.3]);
  projected=celestialBodies.map(item=>{
   const p=renderer.project(positions[item.id]),edge=renderer.project(add(positions[item.id],[0,item.radius,0]));
   const occluded=celestialBodies.some(other=>other.id!==item.id&&segmentHit(eye,positions[item.id],positions[other.id],other.radius)!==null);
   return{...item,...p,visible:p.visible&&!occluded,occluded,hit:Math.abs(edge.y-p.y)*1.2};
  });
  options.onLabels?.(projected);
  options.onReady?.();options.onProgress?.(routeProgress);
 }
 goal.distance=overviewDistance();if(!initial)camera.distance=goal.distance;
 setMode(options.restored?.mode||'overview');
 if(options.restored){routeProgress=options.restored.routeProgress;goal=options.restored.goal;}
 reportPause();
 return{render,action,needsFrame:()=>moving||(!paused&&!state.get().reducedMotion),canAdapt:()=>!moving&&!gesture&&mode!=='journey',
  snapshot:()=>({elapsed,routeProgress,paused,mode,camera,goal,eye,framing,route:routeData,positions,draws:renderer.draws,projected}),
  dispose(){disposed=true;unsubscribe();abort.abort();pointers.clear();api.release(earth);api.release(jupiter);renderer.dispose();}
 };
}
