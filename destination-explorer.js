import {experienceState} from './experience-state.js';
import {initResortLighting,lightingPoster} from './resort-lighting.js';
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=(a,b,value)=>{const t=clamp((value-a)/(b-a));return t*t*(3-2*t);};
const RESORTS=[
 {tone:'151,174,196',location:'LUNAR SURFACE · EARTHRISE',approach:'Approaching the Sea of Tranquility',description:'A sanctuary in silver and shadow. Wake to Earth suspended above the lunar horizon, and discover the beauty of absolute quiet.',amenities:['Earth-view residences','Lunar observatory','Private surface excursions'],detail:'The art of standing still.',story:'Days unfold at a different pace here: a private breakfast beneath Earthrise, a guided lunar walk, and an evening of astronomical discovery.',stays:['Panoramic lunar suites','Chef-led celestial dining','Personal expedition concierge'],position:'54% center'},
 {tone:'180,91,54',location:'MARTIAN LANDSCAPE · ELYSIUM',approach:'Descending through the Martian light',description:'Carved into an extraordinary red landscape, Elysium is a retreat for those drawn to the unfamiliar. Vast horizons. Warm stone. A new kind of solitude.',amenities:['Canyon-view suites','Desert observatory','Guided terrain expeditions'],detail:'A frontier, beautifully considered.',story:'Follow the light across ancient terrain, return to a private sanctuary, and watch the Martian sky change from your panoramic terrace.',stays:['Private canyon residences','Seasonal tasting experiences','Curated landscape excursions'],position:'56% center'},
 {tone:'116,169,192',location:'EUROPA · BENEATH JUPITER',approach:'Crossing the fractured ice',description:'An intimate world of ice and light beneath the immense presence of Jupiter. Oceanus brings warmth, privacy and human comfort to a remarkable frozen landscape.',amenities:['Jupiter-view suites','Ice-gallery walks','Thermal wellness spaces'],detail:'Warmth at the edge of wonder.',story:'Explore the patterns written into ancient ice, then return to quiet warmth and an uninterrupted view of the giant world above.',stays:['Insulated panoramic residences','Guided ice-surface discovery','Private restorative rituals'],position:'52% center'},
 {tone:'187,160,110',location:'SATURN ORBIT · THE RINGS',approach:'Approaching the orbital sanctuary',description:'Suspended in orbit, never on Saturn’s surface. A private sanctuary where luminous rings stretch beyond the horizon and every moment feels quietly impossible.',amenities:['Ring-facing residences','Orbital observation decks','Private dining among the stars'],detail:'An address beyond imagination.',story:'The Rings Resort is an orbital destination. Watch bands of ice turn in the distance from a panoramic residence designed around the most extraordinary view.',stays:['Panoramic orbital suites','Ring-view tasting salon','Astronomy with your private guide'],position:'60% center'},
 {tone:'180,126,52',location:'TITAN · GOLDEN HORIZONS',approach:'Passing through the golden haze',description:'Beyond a veil of amber lies a world unlike any other. Horizon pairs enveloping warmth and thoughtful service with the mystery of Titan’s distant landscape.',amenities:['Amber-view suites','Protected landscape excursions','Private wellness rituals'],detail:'A little further from the familiar.',story:'Experience the changing light of a golden world from a protected panoramic sanctuary, with every detail of your stay thoughtfully arranged.',stays:['Private horizon residences','Warm, intimate dining rooms','Guided protected excursions'],position:'55% center'}
];

// A single interruptible state machine bridges real WebGL approach and local
// resort photography. It is not a continuous terrain simulation or a video.
export function initDestinationExplorer({destinations,getRenderer,onBook,navigation}) {
 const lighting=initResortLighting();
 const dialog=document.querySelector('#destination-experience');
 const $=selector=>dialog.querySelector(selector);
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const abort=new AbortController(),signal=abort.signal;
 let state='idle',index=3,frame=0,last=0,elapsed=0,amount=0,returnStart=0,token=0,opener=null;
 let previousOverflow='',entryScroll=0,destroyed=false;
 const scene=$('#destination-scene'),panel=$('#destination-overview'),details=$('#destination-details');
 function setState(next){state=next;dialog.dataset.state=next;experienceState.set({experience:next==='idle'?'hero':'resort',animation:next,transition:!['idle','arrived'].includes(next)});}
 function apply(value){
  amount=clamp(value);
  getRenderer()?.setFlight(amount);
  dialog.style.setProperty('--arrival-opacity',smooth(.40,.88,amount));
  dialog.style.setProperty('--arrival-scale',String(1.10-.10*smooth(.4,1,amount)));
  dialog.style.setProperty('--arrival-veil',String(Math.sin(smooth(.12,.92,amount)*Math.PI)*.78));
  $('#destination-progress').style.transform='scaleX('+amount+')';
 }
 function wake(){if(!frame&&state!=='idle'&&state!=='arrived'&&!document.hidden)frame=requestAnimationFrame(tick);}
 function arrive(){
  if(state==='idle'||state==='returning')return;
  cancelAnimationFrame(frame);frame=0;apply(1);setState('arrived');
  getRenderer()?.setCovered(true);
  $('#destination-skip').hidden=true;
  panel.inert=false;
  $('#destination-status').textContent=destinations[index].resort+' · You have arrived.';
  // If Skip held focus, move to the newly available heading instead of hiding it.
  if(document.activeElement===$('#destination-skip'))$('#destination-title').focus({preventScroll:true});
 }
 function tick(now){
  frame=0;
  const dt=last?Math.min(.05,(now-last)/1000):0;last=now;elapsed+=dt;
  if(state==='preparing'){
   const motion=getRenderer()?.getMotion();
   if(!motion||Math.abs(motion.target-motion.progress)<.025||elapsed>1.8){setState('approaching');elapsed=0;}
  }else if(state==='approaching'){
   const duration=index===4?3.1:index===3?2.9:2.65;
   apply(smooth(0,duration,elapsed));
   if(elapsed>=duration)arrive();
  }else if(state==='returning'){
   apply(returnStart*(1-smooth(0,.95,elapsed)));
   if(elapsed>=.95)finishClose();
  }
  wake();
 }
 function setDetails(open){
  panel.hidden=open;details.hidden=!open;dialog.dataset.view=open?'details':'overview';
  (open?$('#destination-detail-title'):$('#destination-title')).focus({preventScroll:true});
 }
 async function open(destination,trigger=document.activeElement){
  await navigation.whenSettled();
  if(destroyed||state!=='idle'||experienceState.get().experience!=='hero')return;
  entryScroll=navigation.enter('resort');
  index=destination;opener=trigger;token++;const stamp=token;
  const resort=RESORTS[index],data=destinations[index];
  dialog.dataset.destination=data.name.toLowerCase();dialog.dataset.view='overview';
  dialog.style.setProperty('--arrival-tone',resort.tone);
  scene.style.objectPosition=resort.position;
  $('#destination-location').textContent=resort.location;
  $('#destination-title').textContent=data.resort;
  $('#destination-description').textContent=resort.description;
  $('#destination-amenities').replaceChildren(...resort.amenities.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  $('#destination-detail-title').textContent=resort.detail;
  $('#destination-story').textContent=resort.story;
  $('#destination-stays').replaceChildren(...resort.stays.map((text,i)=>{const li=document.createElement('li');const number=document.createElement('span');number.textContent='0'+(i+1);li.append(number,document.createTextNode(text));return li;}));
  $('#destination-flight-label').textContent=resort.approach;
  $('#destination-status').textContent='Journey to '+data.name+'. Skip the transition or press Escape to return to orbit.';
  $('#destination-image-note').hidden=true;
  scene.alt=data.alt;scene.src=lightingPoster(index);const poster=scene.src;
  // The remembered state is the arrival poster too: revisiting Night must not
  // first flash the original daytime photograph before the variants decode.
  scene.decode().catch(()=>{if(stamp===token&&state!=='idle'&&scene.src===poster){scene.src='assets/'+data.image;$('#destination-image-note').textContent='The selected lighting image could not load. The original resort view is retained where available; you can still explore or plan a journey.';$('#destination-image-note').hidden=false;}});
  lighting.open(index);
  panel.hidden=false;details.hidden=true;details.inert=false;panel.inert=true;
  $('#destination-skip').hidden=reduced.matches;
  getRenderer()?.setCovered(false);getRenderer()?.setFlight(0);
  document.querySelector('#home').scrollIntoView({behavior:'instant',block:'start'});
  previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';document.body.classList.add('exploration-open');
  amount=elapsed=last=0;setState('preparing');apply(0);
  dialog.showModal();$('#destination-return').focus({preventScroll:true});
  if(reduced.matches)arrive();else wake();
 }
 function finishClose({restoreFocus=true,fromHistory=false}={}){
  if(state==='idle')return;
  lighting.close();
  token++;cancelAnimationFrame(frame);frame=0;
  getRenderer()?.setFlight(0);getRenderer()?.setCovered(false);
  setState('idle');dialog.close();
  document.body.classList.remove('exploration-open');document.body.style.overflow=previousOverflow;
  panel.inert=false;panel.hidden=false;details.hidden=true;
  if(restoreFocus){scrollTo({top:entryScroll,behavior:'instant'});if(opener?.isConnected)opener.focus({preventScroll:true});}
  navigation.leave({fromHistory});
 }
 function close(immediate=false){
  if(state==='idle')return;
  if(immediate||reduced.matches||state==='returning'){finishClose();return;}
  lighting.suspend();panel.inert=true;details.inert=true;getRenderer()?.setCovered(false);
  returnStart=amount;elapsed=last=0;setState('returning');wake();
 }
 $('#destination-return').addEventListener('click',()=>close(),{signal});
 $('#destination-skip').addEventListener('click',arrive,{signal});
 $('#destination-more').addEventListener('click',()=>setDetails(true),{signal});
 $('#destination-back').addEventListener('click',()=>setDetails(false),{signal});
 dialog.querySelectorAll('[data-resort-book]').forEach(button=>button.addEventListener('click',()=>{
  const selected=index;finishClose({restoreFocus:false});onBook(selected);
 },{signal}));
 dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);},{signal});
 dialog.addEventListener('close',()=>{if(!dialog.open&&state!=='idle')finishClose();details.inert=false;},{signal});
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close(true);}
  if(event.key==='Tab'){
   const controls=[...dialog.querySelectorAll('button,a[href],select,input,[tabindex="0"]')].filter(element=>!element.disabled&&!element.closest('[inert]')&&element.getClientRects().length>0);
   const current=controls.indexOf(document.activeElement),last=controls.length-1;
   if(controls.length&&((event.shiftKey&&current<=0)||(!event.shiftKey&&(current===last||current<0)))){
    event.preventDefault();controls[event.shiftKey?last:0].focus({preventScroll:true});
   }
  }
  // Do not let hero keyboard arrows move the hidden orbit.
  event.stopPropagation();
 },{signal});
 document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else wake();},{signal});
 reduced.addEventListener('change',()=>{if(reduced.matches){if(state==='returning')finishClose();else if(state!=='idle')arrive();}},{signal});
 return {open,dismiss:finishClose,isOpen:()=>state!=='idle',destroy(){destroyed=true;if(state!=='idle')finishClose({restoreFocus:false,fromHistory:true});lighting.destroy();abort.abort();cancelAnimationFrame(frame);}};
}
