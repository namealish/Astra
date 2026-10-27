// Small, deterministic navigation helpers. Units are art-directed, not AU.
import{add,sub,norm,cross,mix3}from'./scene-math.js';
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
export function orbitPoints(radius,segments=128){
 const points=new Float32Array((segments+1)*3);
 for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;points.set([Math.cos(a)*radius,0,Math.sin(a)*radius],i*3);}
 return points;
}
export function segmentHit(start,end,center,radius){
 // This runs for every camera sweep and label occlusion test. Scalar math
 // avoids four temporary arrays per candidate without changing the collision.
 const dx=end[0]-start[0],dy=end[1]-start[1],dz=end[2]-start[2];
 const ox=start[0]-center[0],oy=start[1]-center[1],oz=start[2]-center[2];
 const a=dx*dx+dy*dy+dz*dz,b=ox*dx+oy*dy+oz*dz,c=ox*ox+oy*oy+oz*oz-radius*radius;
 if(c<-.00001)return 0;
 if(a<1e-12||b>=0)return null;
 const discriminant=b*b-a*c;if(discriminant<0)return null;
 const t=(-b-Math.sqrt(discriminant))/a;return t>=0&&t<=1?t:null;
}
export function clearCamera(previous,desired,obstacles){
 const outside=point=>{
  let result=[...point];
  for(let pass=0;pass<3;pass++)for(const body of obstacles){const d=sub(result,body.center),length=Math.hypot(...d);if(length<body.radius)result=add(body.center,(length>1e-8?norm(d):[0,1,0]).map(v=>v*(body.radius+.002)));}
  return result;
 };
 let position=outside(previous||desired),remaining=sub(outside(desired),position);
 // Sweep, stop just before contact, then slide along the obstacle. Testing the
 // full segment (not just its endpoint) prevents tunnelling during focus changes.
 for(let pass=0;pass<5&&Math.hypot(...remaining)>.00001;pass++){
  const end=add(position,remaining);let hit=null,time=1;
  for(const body of obstacles){const t=segmentHit(position,end,body.center,body.radius);if(t!==null&&t<time){time=t;hit=body;}}
  if(!hit){position=end;break;}
  position=mix3(position,end,Math.max(0,time-.0001));
  const normal=norm(sub(position,hit.center)),rest=remaining.map(v=>v*(1-time)),inward=Math.min(0,dot(rest,normal));
  remaining=sub(rest,normal.map(v=>v*inward));
  // A perfectly head-on approach needs a small tangent to avoid getting stuck.
  if(Math.hypot(...remaining)<.02){const tangent=norm(sub([0,1,0],normal.map(v=>v*normal[1])));remaining=tangent.map(v=>v*Math.min(.18,Math.hypot(...rest)));}
 }
 return outside(position);
}
export function routePoint(start,end,t,height=2+Math.hypot(...sub(end,start))*.27){
 const point=mix3(start,end,t);point[1]+=Math.sin(t*Math.PI)*height;return point;
}
const routeSines=Float64Array.from({length:97},(_,i)=>Math.sin(i/96*Math.PI));
export function fillRoute(points,start,end,height){
 for(let i=0;i<=96;i++){
  const t=i/96,j=i*3;
  points[j]=start[0]+(end[0]-start[0])*t;
  points[j+1]=start[1]+(end[1]-start[1])*t+routeSines[i]*height;
  points[j+2]=start[2]+(end[2]-start[2])*t;
 }
}
export function routeHeight(start,end,obstacles){
 const dx=end[0]-start[0],dy=end[1]-start[1],dz=end[2]-start[2];
 let height=2+Math.hypot(dx,dy,dz)*.27;
 // Raise the illustrative curve over bodies/ring envelopes. No transfer physics
 // are implied. Extra clearance also covers the spaces between these samples.
 for(let i=1;i<96;i++){
  const t=i/96,x=start[0]+dx*t,y=start[1]+dy*t,z=start[2]+dz*t;
  for(const body of obstacles){const horizontal=(x-body.center[0])**2+(z-body.center[2])**2,r=body.radius+.18;
   if(horizontal<r*r)height=Math.max(height,(body.center[1]+Math.sqrt(r*r-horizontal)-y)/routeSines[i]);
  }
 }
 return height;
}
export function shipMatrix(position,direction,scale){
 const back=norm(direction).map(v=>-v),right=norm(cross(Math.abs(back[1])>.995?[0,0,1]:[0,1,0],back)),up=cross(back,right);
 return new Float32Array([...right.map(v=>v*scale),0,...up.map(v=>v*scale),0,...back.map(v=>v*scale),0,...position,1]);
}
export function navigationShipData(){
 // A deliberately small procedural navigation craft, not a detailed fleet model.
 const points=[[0,0,-2.5],[0,.3,.65],[-1.3,-.08,1.15],[1.3,-.08,1.15],[0,-.2,1.3],[0,.02,1.45]],vertices=[],indices=[];
 for(const face of[[0,2,1],[0,1,3],[0,4,2],[0,3,4],[1,2,5],[1,5,3],[2,4,5],[3,5,4]]){
  const[a,b,c]=face.map(i=>points[i]),normal=norm(cross(sub(b,a),sub(c,a))),offset=vertices.length/8;
  for(const p of[a,b,c])vertices.push(...p,...normal,0,0);indices.push(offset,offset+1,offset+2);
 }
 return{vertices:new Float32Array(vertices),indices:new Uint16Array(indices),stride:32};
}
export function layoutLabels(items,{width,height,obstacles=[],selected}){
 const occupied=obstacles.map(r=>({...r})),result=[];
 // A moved label must not misidentify a neighbouring body (especially Earth
 // and the Sun in the compressed mobile overview).
 for(const item of items)if(item.visible){const radius=Math.max(5,item.hit*.85);occupied.push({x:item.x-radius,y:item.y-radius,right:item.x+radius,bottom:item.y+radius});}
 const overlaps=(a,b)=>a.x<b.right+5&&a.right>b.x-5&&a.y<b.bottom+5&&a.bottom>b.y-5;
 // Selected destination first, then other destinations, then contextual parents.
 const ordered=[...items].sort((a,b)=>(b.destination===selected)-(a.destination===selected)||(b.destination!==undefined)-(a.destination!==undefined));
 for(const item of ordered){
  let box=null;
  if(item.visible){const w=item.labelWidth,h=item.labelHeight,r=Math.max(13,item.hit);
   const candidates=[[item.x-w/2,item.y+r+7],[item.x-w/2,item.y-r-h-7],[item.x+r+8,item.y-h/2],[item.x-r-w-8,item.y-h/2],[item.x-r-w-8,item.y+r+7],[item.x+r+8,item.y+r+7],[item.x-w/2,item.y+r+h+13]];
   for(const[desiredX,y]of candidates){const x=Math.max(8,Math.min(width-8-w,desiredX)),candidate={x,y,right:x+w,bottom:y+h};if(y<8||candidate.right>width-8||candidate.bottom>height-8||occupied.some(rect=>overlaps(candidate,rect)))continue;box=candidate;break;}
  }
  if(box)occupied.push(box);result.push({...item,labelBox:box});
 }
 return result;
}
