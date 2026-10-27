const reduced=matchMedia('(prefers-reduced-motion:reduce)');
let value=Object.freeze({selected:3,experience:'hero',cameraMode:'overview',animation:'idle',transition:false,reducedMotion:reduced.matches,timeOfDay:Object.freeze([1,1,1,1,1])});
const listeners=new Set();
export const experienceState={
 get:()=>value,
 set(patch){
  if(patch.selected!==undefined&&(!Number.isInteger(patch.selected)||patch.selected<0||patch.selected>4))throw new RangeError('Invalid destination');
  const previous=value;value=Object.freeze({...value,...patch});
  for(const listener of listeners)listener(value,previous);
 },
 subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
 setTime(index,time){if(!Number.isInteger(index)||index<0||index>=value.timeOfDay.length||!Number.isFinite(time))throw new RangeError('Invalid lighting selection');const bounded=Math.max(0,Math.min(3,time));if(value.timeOfDay[index]===bounded)return;const times=[...value.timeOfDay];times[index]=bounded;this.set({timeOfDay:Object.freeze(times)});},
 destroy(){listeners.clear();reduced.removeEventListener('change',onMotionChange);}
};
function onMotionChange(){experienceState.set({reducedMotion:reduced.matches});}
reduced.addEventListener('change',onMotionChange);
