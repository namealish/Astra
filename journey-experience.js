// Local concept interactions only: no reservations, messages, payments or storage.
import {experienceState} from './experience-state.js';
export function initJourneyExperience(destinations) {
  const abort=new AbortController(),signal=abort.signal;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const pricing = {Luna:{price:285000,duration:3},Mars:{price:890000,duration:8},Europa:{price:1400000,duration:19},Saturn:{price:1750000,duration:22},Titan:{price:2100000,duration:26}};
  const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  const form = $('#booking-form'), departure = $('#departure');
  departure.min='2086-01-01'; departure.max='2099-12-31'; departure.value='2086-06-18';
  let screen=0, day=0, passVisible=false, onboard=0;
  const selectedDestination=()=>experienceState.get().selected;
  const savedExperiences=new Set();
  const screenNames=['Discover','Itinerary','Boarding','Onboard','Concierge','Booking','Countdown'];
  const storyOrder=[0,5,6,2,1,3,4];
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const scrollEligible=matchMedia('(min-width:981px) and (min-height:800px)');
  const section=$('#app'),stage=$('.app-scroll-stage');
  let storyAuto=true,sectionVisible=false,storyFrame=0,phoneAnimation=null,countdownTimer=0;
  const simulationStarted=performance.now(),simulationEpoch=Date.UTC(2086,5,1,9,30);
  const experiences=[
    {name:'Celestial Dining',image:'interior-dining-small.webp',time:'19:30 · OBSERVATION DECK',description:'A six-course tasting journey above the clouds.'},
    {name:'Zero-G Wellness',image:'interior-spa-small.webp',time:'14:00 · WELLNESS DECK',description:'A quiet hour of weightless restoration.'},
    {name:'Stargazing',image:'interior-lounge-small.webp',time:'21:00 · FORWARD LOUNGE',description:'A guided evening beneath unfamiliar constellations.'}
  ];
  function selection() {
    const destination=$('#destination').value;
    if(!pricing[destination])return null;
    const guests=Number($('#travelers').value),cabin=$('#cabin').value;
    const multiplier=cabin==='Private Residence'?2.5:cabin==='Grand Suite'?1.6:1;
    const date=new Date(`${departure.value}T12:00:00`);
    return {destination,guests,cabin,...pricing[destination],amount:Math.round(pricing[destination].price*guests*multiplier),dateLabel:Number.isNaN(date.getTime())?'Choose a departure':date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})};
  }
  function updateJourney() {
    $$('[data-cabin-value]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.cabinValue===$('#cabin').value)));
    $('#booking-results').hidden=true;
    const chosen=selection();
    if(!chosen) {
      $('#journey-eyebrow').textContent='CURATED AROUND YOU';
      $('#journey-name').textContent='Five worlds. One extraordinary choice.';
      $('#journey-detail').textContent='Choose your destination to preview the route, accommodation and estimated fare.';
      $('#journey-estimate').textContent='Your journey, tailored.';
      $('#journey-estimate-note').textContent='Private suites · Thoughtful service';
      $('#journey-image').src='assets/interior-lounge-small.webp';
      $('#journey-image').alt='The spacecraft observation lounge';
      return;
    }
    const destination=destinations.find(d=>d.name===chosen.destination.toUpperCase());
    $('#journey-eyebrow').textContent=`EARTH → ${destination.name}`;
    $('#journey-name').textContent=destination.resort.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
    $('#journey-detail').textContent=`${chosen.dateLabel} · ${chosen.duration}-day concept transfer · ${chosen.guests} ${chosen.guests===1?'guest':'guests'} · ${chosen.cabin}`;
    $('#journey-estimate').textContent=money(chosen.amount);
    $('#journey-estimate-note').textContent='Estimated total · USD · Demonstration only';
    $('#journey-image').src=`assets/${destination.image}`;
    $('#journey-image').alt=destination.alt;
  }
  form.addEventListener('change',()=>{
    const selected=destinations.findIndex(destination=>destination.name===$('#destination').value.toUpperCase());
    if(selected>=0&&selected!==selectedDestination())experienceState.set({selected});
    updateJourney();renderPhone();
  },{signal});
  $$('[data-cabin-value]').forEach(button=>button.addEventListener('click',()=>{
    $('#cabin').value=button.dataset.cabinValue;updateJourney();if(screen===5)renderPhone();
  },{signal}));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const chosen=selection(); if(!chosen)return;
    selectDestination(destinations.findIndex(d=>d.name===chosen.destination.toUpperCase()));
    const results=$('#booking-results');
    results.innerHTML=`<p class="booking-result-heading">YOUR JOURNEY PREVIEW · NO RESERVATION HAS BEEN MADE</p><div class="booking-result-row"><div><strong>Earth → ${chosen.destination}</strong><p>${chosen.dateLabel} · ${chosen.duration}-day concept transfer · ${chosen.guests} ${chosen.guests===1?'guest':'guests'} · ${chosen.cabin}</p><p>Private accommodation, onboard dining and a personal concierge concept.</p></div><div class="booking-price">${money(chosen.amount)} <small>EST. TOTAL · USD · DEMO</small></div></div><div class="journey-route" aria-label="Sample journey stages"><span><small>01 / DEPART</small>Earth orbital terminal</span><span><small>02 / THE JOURNEY</small>Your private sanctuary</span><span><small>03 / ARRIVE</small>${chosen.destination} awaits</span></div><button class="text-link journey-app-link" type="button" id="preview-journey-app">EXPLORE THIS JOURNEY IN THE APP DEMO ↗</button>`;
    results.hidden=false;
    $('#preview-journey-app').addEventListener('click',()=>{showScreen(1,true);$('#app').scrollIntoView({behavior:'smooth'});$('[data-appscreen="1"]').focus({preventScroll:true});},{signal});
    results.scrollIntoView({behavior:'smooth',block:'nearest'});
  },{signal});

  function renderPhone() {
    const destination=destinations[selectedDestination()];
    const label=$('#phone-label'),title=$('#phone-title'),photo=$('#phone-photo'),panel=$('#phone-panel');
    $('#phone-screen').dataset.screen=String(screen);
    $('#phone-screen').setAttribute('aria-label',`${screenNames[screen]} app demonstration`);
    $('#phone-status').textContent='';
    photo.style.backgroundImage=`url('assets/${destination.image}')`;
    if(screen===0) {
      label.textContent='YOUR NEXT WORLD';title.innerHTML='Explore the<br/><em>extraordinary.</em>';
      panel.innerHTML=`<small>THE ASTRAEA COLLECTION</small><strong>${destination.name}</strong><span>${destination.resort}</span><div class="phone-actions"><button type="button" data-phone-action="next">Next world ↗</button><button type="button" data-phone-action="plan">View journey</button></div>`;
    } else if(screen===1) {
      label.textContent=`EARTH → ${destination.name}`;title.innerHTML='Every moment,<br/><em>considered.</em>';
      const chapters=[['Departure','Your welcome aboard','Earth orbital terminal. Settle into your suite with a private welcome.','interior-suite-small.webp'],['In transit','The art of travelling','A slow morning in the atrium, followed by dinner among the stars.','interior-atrium-small.webp'],['Arrival',`${destination.name} awaits`,'A private transfer to your resort. An entirely new perspective.',destination.image]];
      const chapter=chapters[day];photo.style.backgroundImage=`url('assets/${chapter[3]}')`;
      panel.innerHTML=`<div class="phone-segments" aria-label="Itinerary chapters">${chapters.map((c,i)=>`<button type="button" data-day="${i}" aria-pressed="${i===day}">${c[0]}</button>`).join('')}</div><small>SAMPLE ITINERARY · ${String(day+1).padStart(2,'0')} / 03</small><strong>${chapter[1]}</strong><p>${chapter[2]}</p>`;
    } else if(screen===2) {
      label.textContent='YOUR DIGITAL COMPANION';title.innerHTML='A world away.<br/><em>Ready when you are.</em>';
      photo.style.backgroundImage="url('assets/celeste-small.webp')";
      panel.innerHTML=`<small>BOARDING PASS · CONCEPT ONLY</small><strong>EARTH → ${destination.name}</strong><div class="phone-pass"><span><small>GATE</small>A01</span><span><small>SUITE</small>02</span><span><small>BOARDING</small>09:30</span></div>${passVisible?'<div class="demo-pass-code">AS–2086–02<span>DEMO · NOT VALID FOR TRAVEL</span></div>':''}<button type="button" class="phone-action" data-phone-action="pass" aria-expanded="${passVisible}">${passVisible?'Hide':'Reveal'} demo pass</button>`;
    } else if(screen===3) {
      label.textContent='LIFE BETWEEN WORLDS';title.innerHTML='Make time for<br/><em>the exceptional.</em>';
      const experience=experiences[onboard];photo.style.backgroundImage=`url('assets/${experience.image}')`;
      panel.innerHTML=`<div class="phone-segments" aria-label="Onboard experiences">${['Dine','Unwind','Observe'].map((name,i)=>`<button type="button" data-onboard="${i}" aria-pressed="${i===onboard}">${name}</button>`).join('')}</div><small>${experience.time}</small><strong>${experience.name}</strong><p>${experience.description}</p><button type="button" class="phone-action" data-phone-action="save" aria-pressed="${savedExperiences.has(onboard)}">${savedExperiences.has(onboard)?'Remove from':'Add to'} demo itinerary</button>`;
    } else if(screen===4) {
      label.textContent='A PERSONAL TOUCH';title.innerHTML='Consider it<br/><em>taken care of.</em>';
      photo.style.backgroundImage="url('assets/interior-lounge-small.webp')";
      panel.innerHTML='<small>PRIVATE CONCIERGE · DEMO</small><strong>How may we help?</strong><p>Explore a request. Nothing is sent to a real concierge.</p><div class="phone-requests"><button type="button" data-request="Dining preferences">Dining preferences ↗</button><button type="button" data-request="Suite comfort">Suite comfort ↗</button><button type="button" data-request="Arrival transfer">Arrival transfer ↗</button></div>';
    } else if(screen===5) {
      label.textContent='YOUR JOURNEY, YOUR WAY';title.innerHTML='A world of<br/><em>possibility.</em>';
      photo.style.backgroundImage="url('assets/interior-cabin-small.webp')";
      const guests=Number($('#travelers').value),cabin=$('#cabin').value,place=destination.name.toLowerCase().replace(/^./,c=>c.toUpperCase());
      const estimate=pricing[place].price*guests*(cabin==='Grand Suite'?1.6:cabin==='Private Residence'?2.5:1);
      panel.innerHTML='<small>JOURNEY PLANNER · DEMO</small><strong>EARTH → '+destination.name+'</strong><div class="phone-booking-fields"><label for="app-guests">Guests<select id="app-guests">'+[1,2,3,4,5,6].map(n=>'<option value="'+n+'"'+(n===guests?' selected':'')+'>'+n+'</option>').join('')+'</select></label><label for="app-cabin">Cabin<select id="app-cabin">'+['Celestial Suite','Grand Suite','Private Residence'].map(name=>'<option'+(name===cabin?' selected':'')+'>'+name+'</option>').join('')+'</select></label></div><p class="phone-fare">'+money(estimate)+'<span>ESTIMATED TOTAL · USD · FICTIONAL</span></p><button type="button" class="phone-action" data-phone-action="booking">Open journey planner ↗</button>';
    } else if(screen===6) {
      label.textContent='THE ANTICIPATION BEGINS';title.innerHTML='Closer to<br/><em>extraordinary.</em>';
      photo.style.backgroundImage='url(assets/'+destination.image+')';
      panel.innerHTML='<small>SIMULATED VOYAGE CLOCK</small><strong>'+destination.name+' awaits</strong><div class="phone-countdown" aria-label="Simulated time until the sample departure"><span><b id="countdown-days">00</b><small>DAYS</small></span><span><b id="countdown-hours">00</b><small>HRS</small></span><span><b id="countdown-minutes">00</b><small>MIN</small></span><span><b id="countdown-seconds">00</b><small>SEC</small></span></div><p>Demo clock begins on 1 June 2086. This is not a real departure.</p><button type="button" class="phone-action" data-phone-action="plan">Explore your itinerary</button>';
      updateCountdown();
    }
    $$('[data-appscreen]').forEach(button=>{const selected=Number(button.dataset.appscreen)===screen;button.classList.toggle('is-active',selected);button.setAttribute('aria-pressed',String(selected));});
    $$('.phone-dots span').forEach((dot,i)=>dot.classList.toggle('selected',storyOrder[i]===screen));
    $('#app-chapter').textContent=String(storyOrder.indexOf(screen)+1).padStart(2,'0')+' / 07 · '+screenNames[screen].toUpperCase();
    $('#app-story-progress').style.transform='scaleX('+((storyOrder.indexOf(screen)+1)/7)+')';
    updateTimer();
  }
  function pauseStory(){storyAuto=false;updateStoryControl();}
  function showScreen(index,manual=false) {
    if(manual)pauseStory();
    screen=index;renderPhone();
    phoneAnimation?.cancel();
    if(sectionVisible&&!reduced.matches)phoneAnimation=$('#phone-screen').animate([{opacity:.3,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'ease-out'});
  }
  $$('[data-appscreen]').forEach(button=>button.addEventListener('click',()=>showScreen(Number(button.dataset.appscreen),true),{signal}));
  $('#phone-panel').addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    pauseStory();
    if(button.dataset.request) {
      $$('.phone-requests button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      $('#phone-status').textContent=`${button.dataset.request}: preview noted. No request has been sent.`;return;
    }
    let focus='';
    if(button.dataset.day!==undefined){day=Number(button.dataset.day);focus=`[data-day="${day}"]`;}
    if(button.dataset.onboard!==undefined){onboard=Number(button.dataset.onboard);focus=`[data-onboard="${onboard}"]`;}
    const action=button.dataset.phoneAction;
    if(action==='booking'){selectDestination(selectedDestination());$('#book').scrollIntoView({behavior:reduced.matches?'instant':'smooth'});$('#destination').focus({preventScroll:true});return;}
    if(action==='next')selectDestination((selectedDestination()+1)%destinations.length);
    if(action==='plan'){screen=1;day=0;focus='[data-day="0"]';}
    if(action==='pass')passVisible=!passVisible;
    if(action==='save'){if(savedExperiences.has(onboard))savedExperiences.delete(onboard);else savedExperiences.add(onboard);}
    renderPhone();
    if(action==='save')$('#phone-status').textContent=savedExperiences.has(onboard)?'Added to this demo only. No reservation made.':'Removed from the demo itinerary.';
    const target=$(focus||`[data-phone-action="${action}"]`);target?.focus({preventScroll:true});
  },{signal});
  $('#phone-panel').addEventListener('change',event=>{
    if(!['app-guests','app-cabin'].includes(event.target.id))return;
    pauseStory();const focus=event.target.id;
    $(focus==='app-guests'?'#travelers':'#cabin').value=event.target.value;
    selectDestination(selectedDestination());$('#'+focus)?.focus({preventScroll:true});
  },{signal});
  function selectDestination(index){
    if(!Number.isInteger(index)||!destinations[index])throw new RangeError('Invalid destination');
    if(selectedDestination()!==index)experienceState.set({selected:index});
    else syncDestination();
  }
  function syncDestination(){
    $('#destination').value=destinations[selectedDestination()].name.toLowerCase().replace(/^./,c=>c.toUpperCase());
    updateJourney();renderPhone();
  }
  function updateCountdown(){
    if(screen!==6||!$('#countdown-days'))return;
    const date=Date.parse((departure.value||'2086-06-18')+'T09:30:00Z');
    const remaining=Math.max(0,Math.floor((date-simulationEpoch-(performance.now()-simulationStarted))/1000));
    const values={days:Math.floor(remaining/86400),hours:Math.floor(remaining/3600)%24,minutes:Math.floor(remaining/60)%60,seconds:remaining%60};
    for(const [unit,value] of Object.entries(values))$('#countdown-'+unit).textContent=String(value).padStart(2,'0');
  }
  function updateTimer(){
    clearInterval(countdownTimer);countdownTimer=0;
    if(screen===6&&sectionVisible&&!document.hidden)countdownTimer=setInterval(updateCountdown,1000);
  }
  function updateStoryControl(){
    const available=scrollEligible.matches&&!reduced.matches;
    section.classList.toggle('scroll-showcase',available);
    $('#app-scroll-toggle').hidden=!available;
    $('#app-scroll-toggle').setAttribute('aria-pressed',String(storyAuto));
    $('#app-scroll-toggle').textContent=storyAuto?'SCROLL STORY · ON ↓':'RESUME SCROLL STORY ↓';
    $('#app-story-hint').textContent=available?'Scroll to follow the journey, or select a screen.':'Choose a screen to explore the journey.';
  }
  function updateStory(){
    storyFrame=0;
    if(!storyAuto||!sectionVisible||!scrollEligible.matches||reduced.matches||document.hidden)return;
    if($('#phone-screen').contains(document.activeElement))return;
    const bounds=section.getBoundingClientRect(),padding=parseFloat(getComputedStyle(section).paddingTop),top=90;
    const distance=Math.max(1,section.offsetHeight-stage.offsetHeight-padding*2);
    const progress=Math.max(0,Math.min(1,(-bounds.top-padding+top)/distance));
    const next=storyOrder[Math.min(6,Math.floor(progress*7))];
    if(next!==screen)showScreen(next);
  }
  function scheduleStory(){if(!storyFrame&&sectionVisible)storyFrame=requestAnimationFrame(updateStory);}
  const storyObserver=new IntersectionObserver(entries=>{sectionVisible=entries[0].isIntersecting;updateTimer();scheduleStory();});
  storyObserver.observe(section);
  addEventListener('scroll',scheduleStory,{signal,passive:true});
  addEventListener('resize',scheduleStory,{signal,passive:true});
  $('#app-scroll-toggle').addEventListener('click',()=>{storyAuto=!storyAuto;updateStoryControl();scheduleStory();},{signal});
  const modeChanged=()=>{updateStoryControl();scheduleStory();};
  reduced.addEventListener('change',modeChanged,{signal});scrollEligible.addEventListener('change',modeChanged,{signal});
  document.addEventListener('visibilitychange',()=>{updateTimer();scheduleStory();},{signal});
  const unsubscribe=experienceState.subscribe((value,previous)=>{if(value.selected!==previous.selected)syncDestination();});
  updateStoryControl();
  syncDestination();
  return {
    selectDestination,
    destroy(){unsubscribe();abort.abort();storyObserver.disconnect();clearInterval(countdownTimer);cancelAnimationFrame(storyFrame);phoneAnimation?.cancel();}
  };
}
