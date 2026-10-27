document.documentElement.classList.add('js');
import { createPlanetarium } from './planetarium.js';
import { initJourneyExperience } from './journey-experience.js';
import { initCinematicMotion } from './cinematic-motion.js';
import { initDestinationExplorer } from './destination-explorer.js';
import { destinations as data } from './destinations.js';
import { experienceState } from './experience-state.js';
import { initAdvancedExperiences } from './advanced-experiences.js';
import { createExperienceHistory } from './experience-history.js';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
// Native lazy-loading may fetch several screens ahead and compete with the 4K
// hero. Start these photographs near their section; explicit dimensions and the
// original no-script images preserve layout and non-JavaScript access.
const deferredImages=$$('img[data-deferred-src]');
const loadDeferred=image=>{image.src=image.dataset.deferredSrc;delete image.dataset.deferredSrc;};
if('IntersectionObserver' in window){
 const mediaObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){loadDeferred(entry.target);mediaObserver.unobserve(entry.target);}},{rootMargin:'450px 0px'});
 deferredImages.forEach(image=>mediaObserver.observe(image));
}else deferredImages.forEach(loadDeferred);
const hero=$('.hero'),fallback=$('#planet-fallback');
let active=3,controller=null,lastClick=0,updateToken=0,explorer=null;
controller=createPlanetarium($('#planet-canvas'),{start:active,onReady(){document.body.classList.add('planetarium-ready');fallback.style.display='none';},onError(error){console.warn('WebGL unavailable; showing original CSS planetary fallback',error);fallback.style.display='block';$('#planet-canvas').style.display='none';}});
if(!controller){fallback.style.display='block';$('#planet-canvas').style.display='none';}
function setFallback(index){fallback.style.backgroundImage=`url('assets/hero-${data[index].name.toLowerCase()}.webp')`;}
function setDestination(index,animate=true){index=(index+data.length)%data.length;
 if(explorer?.isOpen()||experienceState.get().experience==='departure')return;
 if(animate&&index===active)return;
 active=index;
 if(experienceState.get().selected!==index)experienceState.set({selected:index});
 // Offscreen selections must be aligned before the hero comes back into view.
 // Its rendering loop is suspended while offscreen, so there is no visible
 // orbital transition to wait for in that case.
 const heroBounds=hero.getBoundingClientRect();
 controller?.setIndex(index,heroBounds.bottom<=0||heroBounds.top>=innerHeight);
 setFallback(index);
 const n=data[index],token=++updateToken;
 const info=$('#hero-info'),preview=$('#resort-preview');
 if(animate){info.classList.add('is-changing');preview.classList.add('is-changing');}
 const render=()=>{if(token!==updateToken)return;
 hero.dataset.destination=n.name.toLowerCase();
 $('#hero-index').textContent=String(index+1).padStart(2,'0');
 $('#hero-title').textContent=n.name;
 $('#hero-resort').textContent=n.resort;
 $('#hero-description').textContent=n.description;
 $('#hero-explore').innerHTML=`${n.label} <span aria-hidden="true">↗</span>`;
 $('#preview-image').src=`assets/${n.image}`;
 $('#preview-image').alt=n.alt;
 $('#preview-name').textContent=n.resort;
 $('#preview-caption').textContent=n.caption;
 $('#preview-link').setAttribute('aria-label',`Explore ${n.resort}`);
 $$('#planet-tabs [data-destination]').forEach((tab,i)=>{let selected=i===index;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',selected?'true':'false');tab.tabIndex=selected?0:-1;});
 requestAnimationFrame(()=>{info.classList.remove('is-changing');preview.classList.remove('is-changing');});
 };
 // Commit copy only when the requested world is genuinely in the foreground.
 // This also cancels stale hand-offs during rapid clicks or direction reversals.
 const handoff=()=>{
  if(token!==updateToken)return;
  const motion=controller?.getMotion();
  const bounds=hero.getBoundingClientRect();
  const canvasVisible=$('#planet-canvas').style.display!=='none'&&experienceState.get().experience==='hero'&&bounds.bottom>0&&bounds.top<innerHeight;
  if(!motion||!canvasVisible||Math.abs(motion.target-motion.progress)<.28)render();
  else requestAnimationFrame(handoff);
 };
 animate?requestAnimationFrame(handoff):render();
}
// Explicit clicks/keys must never be dropped, including under reduced motion.
// Only continuous trackpad events need throttling; the orbit itself is interruptible.
function moveDestination(delta,throttle=0){if(experienceState.get().experience!=='hero')return;if(throttle&&Date.now()-lastClick<throttle)return;lastClick=Date.now();setDestination((active+delta+5)%5);}
$('#hero-prev').addEventListener('click',()=>moveDestination(-1));
$('#hero-next').addEventListener('click',()=>moveDestination(1));
$$('#planet-tabs [data-destination]').forEach(tab=>tab.addEventListener('click',()=>setDestination(Number(tab.dataset.destination))));
$$('#planet-tabs [data-destination]').forEach(tab=>tab.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const direction=e.key==='ArrowRight'?1:-1;const next=(Number(tab.dataset.destination)+direction+5)%5;setDestination(next);$$('#planet-tabs [data-destination]')[next].focus();}}));
function highlightDestination(i){const el=$$('[data-open-destination]')[i];if(!el)return;el.classList.add('destination-highlight');window.setTimeout(()=>el.classList.remove('destination-highlight'),1100);}
$$('[data-open-destination]').forEach(card=>card.addEventListener('click',e=>{e.preventDefault();setDestination(Number(card.dataset.openDestination));hero.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}));
$('#hero-explore').addEventListener('click',event=>explorer.open(active,event.currentTarget));
$('#preview-link').addEventListener('click',event=>{event.preventDefault();explorer.open(active,event.currentTarget);});
// Keyboard arrows work for the hero; do not hijack form inputs or other controls.
window.addEventListener('keydown',e=>{const formFocused=/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName||'');
 if(explorer?.isOpen())return;
 if(!formFocused&&hero.getBoundingClientRect().bottom>100&&hero.getBoundingClientRect().top<window.innerHeight*.7){if(e.key==='ArrowRight'){e.preventDefault();moveDestination(1);}if(e.key==='ArrowLeft'){e.preventDefault();moveDestination(-1);}}
});
// True orbit is moved with 3D transforms in planetarium.js, not by image replacement.
let down=null;
$('#planet-canvas').addEventListener('pointerdown',e=>{if(experienceState.get().experience!=='hero'){down=null;return;}down={x:e.clientX,y:e.clientY,time:Date.now()};});
$('#planet-canvas').addEventListener('pointerup',e=>{if(!down)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;down=null;if(Math.abs(dx)>35&&Math.abs(dx)>Math.abs(dy)*1.25)moveDestination(dx<0?1:-1);});
$('#planet-canvas').addEventListener('pointercancel',()=>down=null);
// Supports the same swipe behavior in CSS fallback mode.
hero.addEventListener('touchstart',e=>{if(e.target.closest('button,a,input,select'))return;if(e.touches.length===1)down={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
hero.addEventListener('touchend',e=>{if(!down||e.changedTouches.length!==1)return;const dx=e.changedTouches[0].clientX-down.x,dy=e.changedTouches[0].clientY-down.y;down=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.3)moveDestination(dx<0?1:-1);},{passive:true});
hero.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>35&&Math.abs(e.deltaX)>Math.abs(e.deltaY)*1.5){e.preventDefault();moveDestination(e.deltaX>0?1:-1,120)}},{passive:false});

// Responsive navigation.
const header=$('#site-header'),toggle=$('#menu-toggle'),mobileNav=$('#mobile-navigation');
function updateHeader(){header.classList.toggle('is-scrolled',window.scrollY>40)}
window.addEventListener('scroll',updateHeader,{passive:true});updateHeader();
function closeMenu(){mobileNav.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation');}
toggle.addEventListener('click',()=>{const willOpen=mobileNav.hidden;mobileNav.hidden=!willOpen;toggle.setAttribute('aria-expanded',String(willOpen));toggle.setAttribute('aria-label',willOpen?'Close navigation':'Open navigation')});
$$('a',mobileNav).forEach(a=>a.addEventListener('click',closeMenu));
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
window.addEventListener('resize',()=>{if(window.innerWidth>980)closeMenu();},{passive:true});

// Scroll-triggered editorial reveals.
const revealObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('in-view');revealObserver.unobserve(entry.target);}})},{rootMargin:'0px 0px -55px 0px',threshold:.05});
$$('.reveal').forEach(el=>revealObserver.observe(el));

// Horizontal gallery with buttons, drag/swipe, keyboard support, and progress.
const gallery=$('#interior-gallery'),progressBar=$('#gallery-progress-bar'),progressLabel=$('#gallery-progress-label');
function galleryStep(){const item=$('.gallery-card',gallery);return item?item.getBoundingClientRect().width+20:400;}
$('#gallery-prev').addEventListener('click',()=>gallery.scrollBy({left:-galleryStep(),behavior:'smooth'}));
$('#gallery-next').addEventListener('click',()=>gallery.scrollBy({left:galleryStep(),behavior:'smooth'}));
function galleryProgress(){const max=Math.max(1,gallery.scrollWidth-gallery.clientWidth);const progress=Math.min(1,Math.max(0,gallery.scrollLeft/max));const count=$$('.gallery-card',gallery).length;const index=Math.min(count,Math.round(gallery.scrollLeft/galleryStep())+1);const minimum=100/count;progressBar.style.width=`${minimum+progress*(100-minimum)}%`;progressLabel.textContent=`${String(index).padStart(2,'0')} — ${String(count).padStart(2,'0')}`;}
gallery.addEventListener('keydown',event=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 event.preventDefault();event.stopPropagation();
 const left=event.key==='Home'?0:event.key==='End'?gallery.scrollWidth:gallery.scrollLeft+galleryStep()*(event.key==='ArrowLeft'?-1:1);
 gallery.scrollTo({left,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
});
gallery.addEventListener('scroll',galleryProgress,{passive:true});window.addEventListener('resize',galleryProgress,{passive:true});galleryProgress();
let galleryPointer=null;gallery.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'){galleryPointer={x:e.clientX,left:gallery.scrollLeft};gallery.style.cursor='grabbing';}});gallery.addEventListener('pointermove',e=>{if(galleryPointer)gallery.scrollLeft=galleryPointer.left-(e.clientX-galleryPointer.x);});window.addEventListener('pointerup',()=>{galleryPointer=null;gallery.style.cursor=''});

// Real working fleet details.
const ships=[
 {title:'ASTRAEA ONE',description:'Our grand interplanetary flagship elevates the art of travel with expansive observation decks, world-class dining and extraordinary private residences.',image:'astraea-one.webp',capacity:'120 GUESTS',range:'INTERPLANETARY',suite:'CELESTIAL / GRAND',crew:'42 SPECIALISTS'},
 {title:'CELESTE',description:'Precision, serenity and complete comfort meet in our beautiful orbital transport. Designed for effortless travel between Earth and our closest extraordinary destinations.',image:'celeste.webp',capacity:'48 GUESTS',range:'ORBITAL / LUNAR',suite:'PREMIUM SUITES',crew:'18 SPECIALISTS'},
 {title:'AURELIA',description:'A personal interplanetary residence unlike any other. Tailored for private parties seeking complete discretion and a journey curated around every preference.',image:'aurelia.webp',capacity:'12 GUESTS',range:'PRIVATE CHARTER',suite:'PRIVATE RESIDENCES',crew:'10 SPECIALISTS'}
];
const shipDialog=$('#ship-dialog');
$$('[data-ship]').forEach(btn=>btn.addEventListener('click',()=>{const ship=ships[Number(btn.dataset.ship)];$('#ship-dialog-name').textContent=ship.title;$('#ship-dialog-description').textContent=ship.description;$('#ship-dialog-image').src=`assets/${ship.image}`;$('#ship-dialog-image').alt=`Cinematic spacecraft concept of ${ship.title}`;$('#ship-stats').innerHTML=`<span><small>CAPACITY</small>${ship.capacity}</span><span><small>VOYAGE CLASS</small>${ship.range}</span><span><small>ACCOMMODATION</small>${ship.suite}</span><span><small>YOUR CREW</small>${ship.crew}</span>`;shipDialog.showModal();}));
$('#close-ship').addEventListener('click',()=>shipDialog.close());$('#ship-book').addEventListener('click',()=>shipDialog.close());

// Booking and app demonstrations share a destination, without external writes.
const journey=initJourneyExperience(data);
function bookDestination(index){
 experienceState.set({selected:index});
 journey.selectDestination(index);
 $('#book').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
 $('#destination').focus({preventScroll:true});
}
const navigation=createExperienceHistory({async onRestore(route){
 advanced.close({fromHistory:true,restoreFocus:!route});
 explorer.dismiss({fromHistory:true,restoreFocus:!route});
 if(!route)return;
 experienceState.set({selected:route.selected});
 if(route.mode==='resort')await explorer.open(route.selected,$('#hero-explore'));
 else await advanced.open(route.mode,$(route.mode==='solar'?'#open-solar-system':'#begin-journey'));
}});
explorer=initDestinationExplorer({destinations:data,getRenderer:()=>controller,onBook:bookDestination,navigation});
experienceState.subscribe((state,previous)=>{if(state.selected!==previous.selected&&state.selected!==active)setDestination(state.selected);});
$$('[data-book-current]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();bookDestination(active);}));
const destroyCinematicMotion=initCinematicMotion();
const advanced=initAdvancedExperiences({getRenderer:()=>controller,onExplore:index=>explorer.open(index,$('#hero-explore')),onBook:bookDestination,navigation});
window.addEventListener('pagehide',event=>{if(!event.persisted){advanced.destroy();explorer.destroy();navigation.destroy();journey.destroy();destroyCinematicMotion();controller?.destroy();revealObserver.disconnect();experienceState.destroy();}});

const inviteDialog=$('#invite-dialog');$('#prive-invite').addEventListener('click',()=>inviteDialog.showModal());$('#close-invite').addEventListener('click',()=>inviteDialog.close());$('#invite-journeys').addEventListener('click',()=>inviteDialog.close());
[shipDialog,inviteDialog].forEach(dialog=>dialog.addEventListener('click',e=>{const bounds=dialog.getBoundingClientRect();if(e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom)dialog.close();}));
