// Event-driven photographic motion: no perpetual animation loop or third-party runtime.
export function initCinematicMotion() {
  const abort=new AbortController(), signal=abort.signal;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const fine=matchMedia('(hover:hover) and (pointer:fine) and (min-width:681px)');
  const active=new Set(), photos=[...document.querySelectorAll('.hospitality-visual img,.prive-image img,.final-art img')];
  let frame=0,pointer=null;
  const enabled=()=>!reduced.matches&&fine.matches&&!document.hidden;
  function draw(){
    frame=0;
    if(!enabled())return;
    // Read all geometry before writing transforms; don't force a second layout
    // when a fleet pointer update coincides with a photographic scroll update.
    const measurements=[...active].map(photo=>({photo,bounds:photo.parentElement.getBoundingClientRect()}));
    const pointerBounds=pointer?.card.getBoundingClientRect();
    for(const {photo,bounds} of measurements){
      const position=Math.max(-1,Math.min(1,(innerHeight*.5-bounds.top-bounds.height*.5)/innerHeight));
      photo.style.setProperty('--photo-y',position*22+'px');
    }
    if(pointer){
      const {card,x,y}=pointer,bounds=pointerBounds;
      const dx=(x-bounds.left)/bounds.width-.5,dy=(y-bounds.top)/bounds.height-.5;
      card.style.setProperty('--fleet-rx',(-dy*3)+'deg');
      card.style.setProperty('--fleet-ry',(dx*4)+'deg');
      card.style.setProperty('--fleet-x',(dx*7)+'px');
      card.style.setProperty('--fleet-y',(dy*5)+'px');
    }
  }
  function schedule(){if(!frame&&enabled())frame=requestAnimationFrame(draw);}
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries)entry.isIntersecting?active.add(entry.target):active.delete(entry.target);
    schedule();
  });
  photos.forEach(photo=>observer.observe(photo));
  const cards=[...document.querySelectorAll('.fleet-card')];
  function resetCard(card){for(const property of ['--fleet-rx','--fleet-ry','--fleet-x','--fleet-y'])card.style.removeProperty(property);}
  for(const card of cards){
    card.addEventListener('pointermove',event=>{if(enabled()){pointer={card,x:event.clientX,y:event.clientY};schedule();}},{signal,passive:true});
    card.addEventListener('pointerleave',()=>{if(pointer?.card===card)pointer=null;resetCard(card);},{signal});
  }
  document.querySelectorAll('[data-crew-profile]').forEach(button=>button.addEventListener('click',()=>{
    const expanded=button.getAttribute('aria-expanded')!=='true';
    button.setAttribute('aria-expanded',String(expanded));
    document.getElementById(button.getAttribute('aria-controls')).classList.toggle('is-open',expanded);
    button.querySelector('span').textContent=expanded?'−':'+';
  },{signal}));
  function refresh(){
    if(!enabled()){cancelAnimationFrame(frame);frame=0;pointer=null;cards.forEach(resetCard);photos.forEach(photo=>photo.style.removeProperty('--photo-y'));}
    else schedule();
  }
  addEventListener('scroll',schedule,{signal,passive:true});
  addEventListener('resize',schedule,{signal,passive:true});
  document.addEventListener('visibilitychange',refresh,{signal});
  reduced.addEventListener('change',refresh,{signal});fine.addEventListener('change',refresh,{signal});
  return ()=>{abort.abort();observer.disconnect();cancelAnimationFrame(frame);cards.forEach(resetCard);photos.forEach(photo=>photo.style.removeProperty('--photo-y'));};
}
