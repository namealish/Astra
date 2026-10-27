import {experienceState as state} from './experience-state.js';
import {destinations} from './destinations.js';
import {layoutLabels} from './solar-navigation.js';
export function initAdvancedExperiences({getRenderer,onExplore,onBook,navigation}){
 const dialog=document.querySelector('#navigation-experience'),stage=document.querySelector('#navigation-stage');
 const canvas=document.querySelector('#planet-canvas'),home=canvas.parentNode,anchor=canvas.nextSibling;
 const abort=new AbortController(),signal=abort.signal;
 let token=0,opener=null,overflow='',returnTimer=0,kind='idle',entryScroll=0,destroyed=false;
 let labelLayoutDirty=true,labelMetrics=new Map(),labelObstacles=[],labelElements=new Map(),labelWidth=1,labelHeight=1;
 const $=selector=>dialog.querySelector(selector);
 const routeBar=$('#solar-route-progress'),routeSlider=$('#solar-scrub'),routeValue=$('#solar-progress-value'),routeReplay=$('#solar-replay');
 let previousProgress=-1,previousPercent=-1,previousComplete=null;
 function updateRouteProgress(value){
  if(value===previousProgress)return;
  previousProgress=value;routeBar.style.transform='scaleX('+value+')';
  const percent=Math.floor(value*100+1e-8),complete=value>=1;
  if(percent!==previousPercent){previousPercent=percent;routeSlider.value=String(percent);routeSlider.setAttribute('aria-valuetext',percent+'% of the illustrative route');routeValue.textContent=percent+'%';}
  if(complete!==previousComplete){previousComplete=complete;routeReplay.textContent=complete?'REPLAY ROUTE ↻':'RESTART ROUTE ↻';}
 }
 const resizeObserver=new ResizeObserver(()=>{labelLayoutDirty=true;if(kind==='solar')getRenderer()?.sceneAction('layout');});
 for(const selector of['.solar-panel','.solar-tools','.solar-footer','.navigation-toolbar','#solar-scrub-label'])resizeObserver.observe($(selector));
 function updateLabels(items){
  if(labelLayoutDirty){
   labelLayoutDirty=false;
   for(const label of labelElements.values())label.hidden=false;
   labelMetrics=new Map(items.map(item=>{const label=labelElements.get(item.id);return[item.id,{labelWidth:label.offsetWidth,labelHeight:label.offsetHeight}];}));
   const bounds=dialog.getBoundingClientRect();
   labelWidth=dialog.clientWidth;labelHeight=dialog.clientHeight;
   labelObstacles=['.solar-panel','.solar-tools','.solar-footer','.navigation-toolbar','#solar-scrub-label'].map(selector=>$(selector)).filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return{x:r.x-bounds.x,y:r.y-bounds.y,right:r.right-bounds.x,bottom:r.bottom-bounds.y};});
  }
  const selected=state.get().selected;
  const placed=layoutLabels(items.map(item=>({...item,...labelMetrics.get(item.id)})),{width:labelWidth,height:labelHeight,selected,obstacles:labelObstacles});
  for(const body of placed){
   const label=labelElements.get(body.id),box=body.labelBox,isSelected=body.destination===selected;
   if(label.hidden!==!box)label.hidden=!box;
   if(box){const transform='translate('+Math.round(box.x*4)/4+'px,'+Math.round(box.y*4)/4+'px)';if(label.style.transform!==transform)label.style.transform=transform;}
   if(label.classList.contains('is-selected')!==isSelected)label.classList.toggle('is-selected',isSelected);
   if(body.destination!==undefined&&label.getAttribute('aria-pressed')!==String(isSelected))label.setAttribute('aria-pressed',String(isSelected));
  }
 }
 const captions={preparing:['PREPARING YOUR DEPARTURE','A journey beyond the familiar.'],terminal:['01 / EARTH ORBITAL TERMINAL','The extraordinary begins here.'],launching:['02 / DEPARTURE','Leave the ordinary behind.'],earthDeparture:['03 / BEYOND EARTH','A new perspective on home.'],deepSpace:['04 / BETWEEN WORLDS','The universe is yours.'],planetaryReveal:['05 / YOUR NEXT WORLD','Extraordinary worlds await.']};
 function restoreCanvas(){
  getRenderer()?.setScene(null);home.insertBefore(canvas,anchor);canvas.removeAttribute('tabindex');canvas.setAttribute('aria-hidden','true');
  canvas.removeAttribute('aria-label');getRenderer()?.setIndex(state.get().selected,true);
  getRenderer()?.setCovered(false);
 }
 function close({completed=false,restoreFocus=true,fromHistory=false,transfer=false}={}){
  if(kind==='idle')return;
  token++;clearTimeout(returnTimer);restoreCanvas();
  const previousKind=kind;kind='idle';state.set({experience:'hero',animation:completed?'complete':'cancelled',transition:false});
  dialog.close();dialog.classList.remove('is-revealing');dialog.style.setProperty('--curtain','0');
  document.body.classList.remove('advanced-open');document.body.style.overflow=overflow;
  if(restoreFocus&&!completed)scrollTo({top:entryScroll,behavior:'instant'});
  if(previousKind==='departure')document.querySelector('#replay-intro').hidden=false;
  const focusTarget=completed?document.querySelector('#planet-tabs [aria-selected="true"]'):opener;
  if(restoreFocus&&focusTarget?.isConnected)focusTarget.focus({preventScroll:true});
  navigation.leave({fromHistory,transfer});
 }
 function reveal(){
  if(kind!=='departure'||dialog.classList.contains('is-revealing'))return;
  clearTimeout(returnTimer);
  restoreCanvas();dialog.classList.add('is-revealing');dialog.style.setProperty('--curtain','0');
  returnTimer=setTimeout(()=>close({completed:true}),state.get().reducedMotion?0:850);
 }
 async function open(mode,trigger=document.activeElement){
  await navigation.whenSettled();
  if(destroyed||state.get().experience!=='hero'||kind!=='idle')return;
  const stamp=++token;kind=mode;opener=trigger;overflow=document.body.style.overflow;
  entryScroll=navigation.enter(mode);
  state.set({experience:mode,animation:'preparing',transition:true});
  document.querySelector('#home').scrollIntoView({behavior:'instant'});
  document.body.style.overflow='hidden';document.body.classList.add('advanced-open');
  dialog.dataset.experience=mode;dialog.dataset.phase='preparing';dialog.style.setProperty('--curtain','0');
  $('#navigation-notice').textContent='';$('#navigation-loading').hidden=false;
  $('#solar-interface').hidden=mode!=='solar';$('.departure-copy').hidden=mode!=='departure';$('#skip-intro').hidden=mode!=='departure';
  $('.solar-tools').hidden=!getRenderer();
  $('#navigation-loading').textContent=mode==='solar'?'Charting your next world…':'Preparing your departure…';
  if(mode==='departure'){$('#departure-chapter').textContent=captions.preparing[0];$('#departure-title').textContent=captions.preparing[1];$('#departure-progress').style.transform='scaleX(0)';}
  if(mode==='solar'){updateDestination();updateMode('overview');$('#solar-status').textContent='';$('#solar-labels').replaceChildren();labelElements.clear();labelLayoutDirty=true;}
  dialog.showModal();$('#navigation-exit').focus({preventScroll:true});
  if(mode==='departure'&&state.get().reducedMotion){$('#navigation-loading').hidden=true;reveal();return;}
  if(!getRenderer()){
   $('#navigation-loading').hidden=true;$('#navigation-notice').textContent=mode==='departure'?'3D departure is unavailable on this device. Return to the website to explore the destinations.':'3D rendering is unavailable on this device. Destination information and journey planning remain available.';
   state.set({animation:'unavailable',transition:false});return;
  }
  try{
   if(mode==='solar'){
    const{createSolarSystem,celestialBodies}=await import('./solar-system.js');
    if(stamp!==token)return;
    $('#solar-labels').replaceChildren(...celestialBodies.map(body=>{
     const element=document.createElement(body.destination===undefined?'span':'button');element.className='solar-marker';labelElements.set(body.id,element);
     element.dataset.body=body.id;element.textContent=body.label;
     if(body.destination!==undefined){element.type='button';element.dataset.solarDestination=String(body.destination);element.setAttribute('aria-label','Focus '+body.label);}
     return element;
    }));
    stage.prepend(canvas);canvas.style.display='';canvas.setAttribute('tabindex','0');canvas.setAttribute('aria-hidden','false');canvas.setAttribute('aria-label','Interactive solar system. Drag to orbit; pinch or scroll to zoom. Arrow keys orbit, plus and minus zoom, Home resets, P pauses, keys 1 to 5 select destinations.');
    getRenderer().setScene(createSolarSystem,{
     onSelect:updateDestination,onMode:updateMode,onPause:paused=>{if(stamp!==token)return;const reduced=state.get().reducedMotion;$('#solar-pause').setAttribute('aria-pressed',String(paused));$('#solar-pause').disabled=reduced;$('#solar-pause').textContent=reduced?'REDUCED MOTION':paused?'RESUME MOTION':'PAUSE MOTION';$('#solar-motion-note').hidden=!reduced;labelLayoutDirty=true;},
     onLabels(items){if(stamp===token)updateLabels(items);},
     onReady(){if(dialog.dataset.phase!=='ready'){dialog.dataset.phase='ready';$('#navigation-loading').hidden=true;state.set({animation:'ready',transition:false});}},
     onProgress(value){if(stamp===token)updateRouteProgress(value);},onNotice(text){if(stamp===token)$('#navigation-notice').textContent=text;}
    });
    return;
   }
   const{createDepartureScene}=await import('./departure-scene.js');
   if(stamp!==token)return;
   stage.prepend(canvas);canvas.style.display='';getRenderer().setCovered(false);
   getRenderer().setScene(createDepartureScene,{
    onPhase(phase){if(stamp!==token)return;dialog.dataset.phase=phase;state.set({animation:phase,transition:true});const copy=captions[phase];$('#departure-chapter').textContent=copy[0];$('#departure-title').textContent=copy[1];$('#navigation-loading').hidden=phase!=='preparing';},
    onProgress(progress,curtain){if(stamp!==token)return;$('#departure-progress').style.transform='scaleX('+progress+')';dialog.style.setProperty('--curtain',String(curtain));},
    onNotice(text){if(stamp===token)$('#navigation-notice').textContent=text;},onComplete:reveal
   });
  }catch(error){
   if(stamp!==token)return;
   console.error('Cinematic scene failed',error);$('#navigation-loading').hidden=true;
   $('.solar-tools').hidden=true;
   $('#navigation-notice').textContent='The 3D scene could not start. Your destinations and booking remain available.';
   state.set({animation:'unavailable',transition:false});
  }
 }
 function updateDestination(){
  const selected=state.get().selected,data=destinations[selected];
  labelLayoutDirty=true;
  $('#solar-title').textContent=data.name;$('#solar-resort').textContent=data.resort;$('#solar-description').textContent=data.description;
  $('#solar-parent').textContent=['MOON OF EARTH','PLANET · SOLAR ORBIT','MOON OF JUPITER','ORBITAL RESORT · SATURN','MOON OF SATURN'][selected];
  $('#solar-route-label').textContent='EARTH → '+data.name;
  $('#solar-duration').textContent=data.duration+'-day fictional transfer · Illustrative route, not a calculated trajectory.';
  $('#solar-explore').textContent=data.label+' ↗';
  $('#solar-status').textContent=data.name+' — '+data.resort+'. Selected destination.';
  dialog.querySelectorAll('.solar-destinations [data-solar-destination]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.solarDestination)===selected)));
 }
 function updateMode(mode){dialog.querySelectorAll('[data-camera-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.cameraMode===mode)));$('#solar-scrub-label').hidden=mode!=='journey';labelLayoutDirty=true;}
 document.querySelector('#open-solar-system').hidden=false;
 document.querySelector('#open-solar-system').addEventListener('click',event=>open('solar',event.currentTarget),{signal});
 $('#solar-interface').addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.solarDestination!==undefined){const index=Number(button.dataset.solarDestination);if(getRenderer())getRenderer().sceneAction('select',index);else{state.set({selected:index});updateDestination();}}
  if(button.dataset.cameraMode)getRenderer()?.sceneAction('mode',button.dataset.cameraMode);
 },{signal});
 $('#solar-reset').addEventListener('click',()=>getRenderer()?.sceneAction('reset'),{signal});
 $('#solar-pause').addEventListener('click',()=>getRenderer()?.sceneAction('pause'),{signal});
 $('#solar-zoom-in').addEventListener('click',()=>getRenderer()?.sceneAction('zoom',.8),{signal});
 $('#solar-zoom-out').addEventListener('click',()=>getRenderer()?.sceneAction('zoom',1.25),{signal});
 $('#solar-scrub').addEventListener('input',event=>getRenderer()?.sceneAction('scrub',Number(event.target.value)/100),{signal});
 $('#solar-replay').addEventListener('click',()=>getRenderer()?.sceneAction('replay'),{signal});
 $('#solar-explore').addEventListener('click',()=>{const index=state.get().selected;close({restoreFocus:false,transfer:true});onExplore(index);},{signal});
 $('#solar-book').addEventListener('click',()=>{const index=state.get().selected;close({restoreFocus:false});onBook(index);},{signal});
 document.querySelector('#begin-journey').addEventListener('click',event=>open('departure',event.currentTarget),{signal});
 document.querySelector('#replay-intro').addEventListener('click',event=>open('departure',event.currentTarget),{signal});
 $('#navigation-exit').addEventListener('click',()=>close(),{signal});
 $('#skip-intro').addEventListener('click',()=>close({completed:true}),{signal});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();},{signal});
 dialog.addEventListener('keydown',event=>{
  event.stopPropagation();
  if(event.key==='Escape'){event.preventDefault();close();return;}
  if(event.key==='Tab'){
   const controls=[...dialog.querySelectorAll('button,a[href],select,input,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
   const i=controls.indexOf(document.activeElement);
   if((event.shiftKey&&i<=0)||(!event.shiftKey&&(i<0||i===controls.length-1))){event.preventDefault();controls[event.shiftKey?controls.length-1:0]?.focus();}
  }
 },{signal});
 const unsubscribe=state.subscribe((value,previous)=>{if(value.reducedMotion&&!previous.reducedMotion&&kind==='departure')reveal();if(kind==='solar'&&value.reducedMotion!==previous.reducedMotion)getRenderer()?.sceneAction('refresh');});
 return{open,close,destroy(){destroyed=true;close({restoreFocus:false,fromHistory:true});abort.abort();resizeObserver.disconnect();unsubscribe();}};
}
