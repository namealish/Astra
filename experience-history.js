import {experienceState} from './experience-state.js';

// One same-document overlay route. Transferring map -> resort replaces that
// route; Back always reaches the main site, Forward restores the last overlay.
// Await the actual popstate event, never an assumed browser traversal timeout.
export function createExperienceHistory({onRestore}){
 // This is an ownership label, not a security token. Keep plain-HTTP static
 // previews working too, where browsers may omit crypto.randomUUID.
 const key='astraeaRoute',session=globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 const originalScrollRestoration=history.scrollRestoration;
 const abort=new AbortController();
 let pending=null,resolvePending=null,restoring=false,disposed=false,generation=0,scrollTimer=0;
 const read=()=>{const route=history.state?.[key];return route?.session===session&&['departure','solar','resort'].includes(route.mode)?route:null;};
 // Reloads start at the hero. Do not inherit a modal owned by a previous page.
 if(history.state?.[key]||history.state?.astraeaExperience){const clean={...history.state};delete clean[key];delete clean.astraeaExperience;history.replaceState(clean,'');}
 function releaseScroll(){
  clearTimeout(scrollTimer);
  scrollTimer=setTimeout(()=>{if(!disposed&&!read()&&!pending)history.scrollRestoration=originalScrollRestoration;},0);
 }
 function settle(){resolvePending?.();resolvePending=null;pending=null;}
 const unsubscribe=experienceState.subscribe((value,previous)=>{
  const route=read();
  if(route&&!restoring&&value.selected!==previous.selected)history.replaceState({...history.state,[key]:{...route,selected:value.selected}},'');
 });
 addEventListener('popstate',async()=>{
  const stamp=++generation;restoring=true;
  // Keep UA scroll restoration out of the close/booking handoff. Release it
  // only after the traversal task has finished, not inside the popstate event.
  clearTimeout(scrollTimer);history.scrollRestoration='manual';
  try{await onRestore(read());}
  finally{if(stamp===generation){restoring=false;settle();releaseScroll();}}
 },{signal:abort.signal});
 return{
  whenSettled:()=>restoring?Promise.resolve():pending||Promise.resolve(),
  enter(mode){
   clearTimeout(scrollTimer);history.scrollRestoration='manual';
   const previous=read(),route={session,mode,selected:experienceState.get().selected,returnScroll:previous?.returnScroll??scrollY};
   if(!restoring)history[previous?'replaceState':'pushState']({...history.state,[key]:route},'');
   return route.returnScroll;
  },
  leave({fromHistory=false,transfer=false}={}){
   if(disposed||restoring||fromHistory||transfer)return;
   if(read()&&!pending){pending=new Promise(resolve=>{resolvePending=resolve;});history.back();}
   else if(!pending)releaseScroll();
  },
  destroy(){disposed=true;generation++;abort.abort();unsubscribe();clearTimeout(scrollTimer);settle();history.scrollRestoration=originalScrollRestoration;}
 };
}
