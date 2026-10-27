import {createSceneRenderer} from './scene-renderer.js';
import {createDepartureArt} from './departure-art.js';
import {smooth,mix3,add} from './scene-math.js';
const DURATION=9.6;
const flightPosition=time=>[0,smooth((time-3.8)/4.8)*13,-smooth((time-1.8)/8)*145];
export function departurePose(time,portrait=false){
 const ship=flightPosition(time),release=smooth((time-6.4)/3.2);
 // The camera gradually stops following, allowing the vessel to depart the
 // composition before the original hero takes over. No camera cuts or teleports.
 const anchor=flightPosition(time-release*2.1),offset=mix3([6.8,3.4,8.6],[10,5,15],smooth((time-3)/6));
 const eye=add(anchor,offset),target=mix3(add(ship,[0,.15,-1.4]),add(anchor,[8,6,-24]),release);
 if(portrait){eye[0]+=4;eye[1]+=2.8;eye[2]+=10;}
 return{ship,eye,target,heading:-.11*smooth((time-3)/5),release};
}
export function createDepartureScene(api,options){
 const renderer=createSceneRenderer(api),art=createDepartureArt(renderer,api.constrained);
 let time=options.restored?.time||0,phase='',earth=null,disposed=false,loaded=false,finished=false,pose=null;
 // Do not hold the user in preparing indefinitely on a stalled image request.
 const loadingTimer=setTimeout(()=>{if(!disposed&&!loaded){loaded=true;options.onNotice?.('Earth imagery is still loading. Your departure will continue.');api.wake();}},2500);
 api.loadTexture('assets/navigation-earth'+(api.mobile||api.constrained?'-small':'')+'.webp')
 .then(texture=>{if(disposed)api.release(texture);else{earth=texture;options.onNotice?.('');}})
 .catch(()=>{if(!disposed)options.onNotice?.('Earth imagery unavailable; simplified globe shown.');})
 .finally(()=>{clearTimeout(loadingTimer);if(!disposed){loaded=true;api.wake();}});
 function render({dt,width,height,reduced}){
  if(loaded)time+=dt;
  if(reduced&&loaded)time=DURATION;
  const next=!loaded?'preparing':time<1.8?'terminal':time<4?'launching':time<7?'earthDeparture':time<9?'deepSpace':'planetaryReveal';
  if(phase!==next){phase=next;options.onPhase?.(phase);}
  pose=departurePose(time,width/height<.8);const{ship,eye,target,heading}=pose;
  renderer.start(eye,target,width,height,[-35,25,18]);
  renderer.stars(.25+.7*smooth((time-2)/5));
  renderer.object('sphere',[7,-28,-50],[26,26,26],[.025,.12,.24],{map:earth,rim:.75,angle:-.8});
  renderer.object('sphere',[7,-28,-50],[26.15,26.15,26.15],[.08,.22,.4],{alpha:.045,rim:.6});
  // Cull only after the terminal is behind the camera, not at a timed cut.
  if(eye[2]>-13)art.terminal(ship);
  art.ship(ship,heading,.15+.65*smooth((time-1.8)/3));
  options.onProgress?.(Math.min(1,time/DURATION),smooth((time-8.9)/.7));
  if(time>=DURATION&&!finished){finished=true;queueMicrotask(()=>{if(!disposed)options.onComplete?.();});}
 }
 return{render,needsFrame:()=>!finished,snapshot:()=>({time,phase,draws:renderer.draws,loaded,pose}),
  dispose(){disposed=true;clearTimeout(loadingTimer);api.release(earth);renderer.dispose();}};
}
