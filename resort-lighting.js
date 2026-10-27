import {experienceState} from './experience-state.js';
import {destinations} from './destinations.js';
const modes=['Dawn','Day','Sunset','Night'],worlds=['luna','mars','europa','saturn','titan'];
const descriptions=[
 ['Grazing sunlight, long lunar shadows.','Direct sunlight in a black, airless sky.','Low-angle sunlight across the lunar terrain.','Earthshine and warm architectural light.'],
 ['Soft light across a dusty frontier.','Clear sunlight reveals the red terrain.','Dust scatters the last light of the day.','Quiet desert, illuminated private sanctuaries.'],
 ['Low sunlight traces the fractured ice.','Cold light, crisp ice, Jupiter beyond.','Long shadows across an airless frozen world.','Reflected light and warm interior spaces.'],
 ['Emerging from planetary shadow.','Direct sunlight on the orbital residence.','Entering orbital shadow—not a surface sunset.','In shadow, with subtle reflected Saturn light.'],
 ['The first diffuse light through dense haze.','Muted golden light and very soft shadows.','Amber light dissolves into the horizon.','Atmospheric darkness, warm architectural light.']
];
export function lightingAsset(index,mode,small=false){
 const world=worlds[index],name=modes[mode].toLowerCase();
 if((mode===1&&[0,3].includes(index))||(index===1&&mode===2))return 'assets/'+world+'-resort.webp';
 return 'assets/lighting-'+world+'-'+name+(small?'-small':'')+'.webp';
}
const clamp=value=>Math.max(0,Math.min(3,value));
const smallImages=()=>matchMedia('(max-width:680px)').matches||(navigator.deviceMemory||8)<=2;
export const lightingPoster=index=>lightingAsset(index,Math.round(experienceState.get().timeOfDay[index]),smallImages());
export function lightingWeights(value){
 const result=[0,0,0,0],lower=Math.floor(clamp(value)),fraction=clamp(value)-lower;
 result[lower]=1-fraction;if(lower<3)result[lower+1]=fraction;return result;
}
export function layerOpacities(weights){
 // Conditional alpha in fixed back-to-front order reproduces the requested
 // weighted blend with an opaque bottom layer. No black dip at the midpoint.
 let total=0;return weights.map(weight=>{total+=weight;return total>1e-9?weight/total:0;});
}
export function initResortLighting(){
 const dialog=document.querySelector('#destination-experience'),host=document.querySelector('#lighting-images');
 const controls=document.querySelector('#resort-lighting'),slider=document.querySelector('#lighting-slider'),status=document.querySelector('#lighting-status');
 const retry=document.querySelector('#lighting-retry'),scenery=document.querySelector('#lighting-scenery'),description=document.querySelector('#lighting-description');
 const buttons=[...controls.querySelectorAll('[data-lighting]')],abort=new AbortController(),signal=abort.signal;
 let index=3,images=[],available=[false,false,false,false],ready=false,generation=0,value=1,target=1,from=1,elapsed=0,last=0,frame=0,active=false,loadTimer=0,animation=null;
 let weights=lightingWeights(1),fromWeights=[...weights],targetWeights=[...weights];
 const modeName=mode=>index===3?['Shadow exit','Sunlit orbit','Shadow entry','Orbital night'][mode]:modes[mode];
 const valueName=next=>{const lower=Math.floor(next),near=Math.round(next);return Math.abs(next-near)<.005?modeName(near):'Between '+modeName(lower)+' and '+modeName(Math.min(3,lower+1));};
 function enabled(on){buttons.forEach((button,i)=>button.disabled=!on||!available[i]);slider.disabled=!on||!available.every(Boolean);}
 function render(){
  const opacity=layerOpacities(weights);images.forEach((image,i)=>{const next=String(opacity[i]);if(image.style.opacity!==next)image.style.opacity=next;});
  const display=value.toFixed(2);if(dialog.dataset.lighting!==display)dialog.dataset.lighting=display;
 }
 function updateControls(){
  slider.value=String(Math.round(target*100));slider.setAttribute('aria-valuetext',valueName(target));
  const near=Math.round(target),exact=Math.abs(target-near)<.005;
  buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(exact&&i===near)));
  description.textContent=descriptions[index][near];
  dialog.dataset.lightingTarget=target.toFixed(2);
 }
 function announce(){status.textContent=available.every(Boolean)?valueName(target)+' lighting.':available.some(Boolean)?'Some lighting images are unavailable. Loaded presets remain usable; retry to restore all four states.':'Lighting images could not load. The original resort view is retained. Retry when your connection is available.';}
 function finish(){
  cancelAnimationFrame(frame);frame=0;animation=null;last=0;value=target;weights=[...targetWeights];render();
  dialog.dataset.lightingState=available.every(Boolean)?'ready':'partial';
  // Only release our own animation state; never overwrite a return/arrival.
  if(active&&experienceState.get().experience==='resort'&&experienceState.get().animation==='lighting')experienceState.set({animation:'arrived',transition:false});
  announce();
 }
 function tick(now){
  frame=0;if(!active||!ready||!animation)return;
  const dt=last?Math.min(.1,(now-last)/1000):0;last=now;elapsed+=dt;
  let done=false;
  if(animation==='preset'){
   const t=Math.min(1,elapsed/2.2),ease=t*t*(3-2*t);value=from+(target-from)*ease;
   weights=fromWeights.map((weight,i)=>weight+(targetWeights[i]-weight)*ease);done=t===1;
  }else{
   const t=1-Math.exp(-dt/0.065);value+=(target-value)*t;weights=weights.map((weight,i)=>weight+(targetWeights[i]-weight)*t);
   done=Math.abs(target-value)<.002&&weights.every((weight,i)=>Math.abs(weight-targetWeights[i])<.001);
  }
  render();if(done)finish();else wake();
 }
 function wake(){if(!frame&&active&&ready&&animation&&!document.hidden)frame=requestAnimationFrame(tick);}
 function choose(next,kind='preset',commit=true){
  if(!ready||!active||!Number.isFinite(next))return;
  const desired=lightingWeights(clamp(next));if(desired.some((weight,i)=>weight>0&&!available[i]))return;
  from=value;fromWeights=[...weights];target=clamp(next);targetWeights=desired;elapsed=0;
  if(animation!==kind)last=0;animation=kind;updateControls();
  if(commit)experienceState.setTime(index,target);
  if(experienceState.get().reducedMotion||weights.every((weight,i)=>Math.abs(weight-desired[i])<.00001)){finish();return;}
  dialog.dataset.lightingState='transitioning';
  if(experienceState.get().animation!=='lighting')experienceState.set({animation:'lighting',transition:true});
  status.textContent='Changing to '+valueName(target)+'.';wake();
 }
 async function load(){
  const hadView=host.style.opacity==='1'&&available.some(Boolean);
  const stamp=++generation;ready=false;enabled(false);retry.hidden=true;controls.setAttribute('aria-busy','true');
  dialog.dataset.lightingState='loading';status.textContent='Preparing lighting states…';
  const decoded=[false,false,false,false],small=smallImages();
  images=modes.map((mode,i)=>{
   if(available[i]&&images[i]?.naturalWidth){decoded[i]=true;return images[i];}
   const image=new Image();image.decoding='async';image.alt='';image.dataset.mode=mode.toLowerCase();image.src=lightingAsset(index,i,small);
   image.style.objectPosition=document.querySelector('#destination-scene').style.objectPosition;image.style.zIndex=String(i);return image;
  });
  host.replaceChildren(...images);
  const decoding=images.map((image,i)=>image.decode().then(()=>{decoded[i]=true;}).catch(()=>{}));
  await Promise.race([Promise.all(decoding),new Promise(resolve=>{loadTimer=setTimeout(resolve,6000);})]);
  if(stamp!==generation||!active)return;
  clearTimeout(loadTimer);loadTimer=0;available=decoded;ready=available.some(Boolean);controls.setAttribute('aria-busy','false');retry.hidden=available.every(Boolean);
  if(ready){
   if(lightingWeights(target).some((weight,i)=>weight>0&&!available[i])){
    target=available.map((loaded,i)=>loaded?i:null).filter(i=>i!==null).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0];
    experienceState.setTime(index,target);
   }
   if(!hadView){value=target;weights=targetWeights=lightingWeights(target);render();}
   updateControls();host.style.opacity='1';enabled(true);
   dialog.dataset.lightingState=available.every(Boolean)?'ready':'partial';
   if(hadView)choose(target,'preset',false);
  }else{
   host.style.opacity='0';dialog.dataset.lightingState='unavailable';
   document.querySelector('#destination-scene').src='assets/'+destinations[index].image;
  }
  announce();
 }
 function open(destination){
  close();active=true;index=destination;host.style.opacity='0';
  document.querySelector('#lighting-title').textContent=index===3?'ORBITAL ILLUMINATION':'TIME OF DAY';
  buttons.forEach((button,i)=>{button.textContent=index===3&&i===2?'SHADOW':modes[i].toUpperCase();button.setAttribute('aria-label',modeName(i));});
  value=target=experienceState.get().timeOfDay[index];weights=targetWeights=lightingWeights(target);updateControls();return load();
 }
 function viewScenery(show){
  dialog.classList.toggle('is-viewing-scenery',show);scenery.setAttribute('aria-pressed',String(show));scenery.textContent=show?'SHOW RESORT DETAILS':'VIEW ARCHITECTURE';
  document.querySelector('#destination-overview').inert=show||dialog.dataset.state!=='arrived';
 }
 function suspend(){active=false;cancelAnimationFrame(frame);frame=0;animation=null;last=0;enabled(false);}
 function close(){
  suspend();ready=false;generation++;clearTimeout(loadTimer);loadTimer=0;controls.setAttribute('aria-busy','false');
  host.style.opacity='0';for(const image of images)image.removeAttribute('src');host.replaceChildren();images=[];available=[false,false,false,false];retry.hidden=true;viewScenery(false);
 }
 buttons.forEach(button=>button.addEventListener('click',()=>choose(Number(button.dataset.lighting)),{signal}));
 slider.addEventListener('input',()=>choose(Number(slider.value)/100,'scrub'),{signal});
 slider.addEventListener('change',()=>{if(!animation)announce();},{signal});
 retry.addEventListener('click',()=>{if(active){cancelAnimationFrame(frame);frame=0;animation=null;load();}},{signal});
 scenery.addEventListener('click',()=>viewScenery(!dialog.classList.contains('is-viewing-scenery')),{signal});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;}
  else{last=0;wake();}
 },{signal});
 const unsubscribe=experienceState.subscribe((next,previous)=>{
  if(!active||!ready)return;
  if(next.timeOfDay[index]!==previous.timeOfDay[index]&&next.timeOfDay[index]!==target)choose(next.timeOfDay[index],'preset',false);
  if(animation&&next.reducedMotion&&!previous.reducedMotion)finish();
 });
 return{open,close,suspend,destroy(){close();abort.abort();unsubscribe();}};
}
