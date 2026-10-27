import {cubeData,norm,cross,sub} from './scene-math.js';

// Authored procedural geometry, merged by finish. No imported spacecraft model.
// These meshes are created only when the departure is opened and freed with it.
function geometry(){
 const vertices=[],indices=[];
 const vertex=(p,n,uv=[0,0])=>{vertices.push(...p,...n,...uv);return vertices.length/8-1;};
 function face(points){const n=norm(cross(sub(points[1],points[0]),sub(points[2],points[0]))),start=vertices.length/8;points.forEach(p=>vertex(p,n));for(let i=1;i<points.length-1;i++)indices.push(start,start+i,start+i+1);}
 function append(data,position,scale){const start=vertices.length/8;for(let i=0;i<data.vertices.length;i+=8){const p=data.vertices.slice(i,i+3),n=data.vertices.slice(i+3,i+6);vertex(Array.from(p,(v,j)=>position[j]+v*scale[j]),norm(Array.from(n,(v,j)=>v/scale[j])),Array.from(data.vertices.slice(i+6,i+8)));}for(const i of data.indices)indices.push(start+i);}
 function ellipsoid(position,scale,segments=32,rings=16){
  const first=vertices.length/8;
  for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
   const a=j/rings*Math.PI,b=i/segments*Math.PI*2,p=[Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];
   vertex(p.map((v,k)=>position[k]+v*scale[k]),norm(p.map((v,k)=>v/scale[k])),[i/segments,j/rings]);
  }
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=first+j*(segments+1)+i;indices.push(a,a+1,a+segments+1,a+1,a+segments+2,a+segments+1);}
 }
 function ring(position,radius,tube,segments=40){
  const first=vertices.length/8,radial=8;
  for(let i=0;i<=segments;i++)for(let j=0;j<=radial;j++){
   const a=i/segments*Math.PI*2,b=j/radial*Math.PI*2,n=[Math.cos(a)*Math.cos(b),Math.sin(a)*Math.cos(b),Math.sin(b)];
   vertex([position[0]+Math.cos(a)*(radius+tube*Math.cos(b)),position[1]+Math.sin(a)*(radius+tube*Math.cos(b)),position[2]+tube*Math.sin(b)],n);
  }
  for(let i=0;i<segments;i++)for(let j=0;j<radial;j++){const a=first+i*(radial+1)+j;indices.push(a,a+radial+1,a+1,a+1,a+radial+1,a+radial+2);}
 }
 function hull(segments=48,rings=64){
  // Rounded forward fuselage, broad passenger volume and a tapered aft section.
  const profiles=[[-3.3,.012,.015,-.03],[-2.9,.24,.14,-.01],[-2.1,.65,.29,.02],[-1.1,.87,.40,.02],[.3,.94,.42,0],[1.5,.78,.34,-.015],[2.5,.37,.20,-.015],[2.8,.02,.025,-.015]];
  const slopes=profiles.map((p,i)=>[1,2,3].map(axis=>{
   const previous=profiles[Math.max(0,i-1)],next=profiles[Math.min(profiles.length-1,i+1)];
   const left=(p[axis]-previous[axis])/(p[0]-previous[0]||1),right=(next[axis]-p[axis])/(next[0]-p[0]||1);
   if(i===0)return right;if(i===profiles.length-1)return left;
   return left*right<=0?0:2*left*right/(left+right);
  }));
  const sample=z=>{
   let k=0;while(k<profiles.length-2&&z>profiles[k+1][0])k++;
   const a=profiles[k],b=profiles[k+1],length=b[0]-a[0],t=Math.max(0,Math.min(1,(z-a[0])/length)),t2=t*t,t3=t2*t;
   return[1,2,3].map((axis,i)=>(2*t3-3*t2+1)*a[axis]+(t3-2*t2+t)*length*slopes[k][i]+(-2*t3+3*t2)*b[axis]+(t3-t2)*length*slopes[k+1][i]);
  };
  const first=vertices.length/8;
  for(let j=0;j<=rings;j++){
   const z=-3.3+j/rings*6.1,[rx,ry,cy]=sample(z),a=sample(z-.002),b=sample(z+.002),slope=a.map((v,i)=>(b[i]-v)/.004);
   for(let i=0;i<=segments;i++){
    const t=i/segments*Math.PI*2,c=Math.cos(t),s=Math.sin(t);
    vertex([rx*c,cy+ry*s,z],norm([ry*c,rx*s,-rx*s*(slope[2]+slope[1]*s)-ry*slope[0]*c*c]),[i/segments,j/rings]);
   }
  }
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=first+j*(segments+1)+i;indices.push(a,a+1,a+segments+1,a+1,a+segments+2,a+segments+1);}
 }
 function plate(points,thickness){
  const upper=points.map(([x,y,z])=>[x,y+thickness/2,z]),lower=points.map(([x,y,z])=>[x,y-thickness/2,z]);
  face(upper);face([...lower].reverse());for(let i=0;i<points.length;i++){const j=(i+1)%points.length;face([upper[i],lower[i],lower[j],upper[j]]);}
 }
 return{box:(p,s)=>append(cubeData(),p,s),ellipsoid,ring,hull,plate,
  finish:()=>({vertices:new Float32Array(vertices),indices:new Uint16Array(indices),stride:32})};
}

export function createDepartureArt(renderer,constrained){
 const pearl=geometry(),glass=geometry(),trim=geometry(),engines=geometry(),seams=geometry();
 pearl.hull(constrained?28:48,constrained?40:72);
 glass.ellipsoid([0,.305,-1.88],[.59,.15,.92]);
 for(const side of [-1,1]){
  pearl.ellipsoid([side*1.48,-.18,.85],[.255,.24,1.78]);
  pearl.plate([[side*.58,-.13,-.10],[side*1.95,-.20,1.48],[side*1.68,-.18,2.08],[side*.62,-.13,1.38]],.075);
  trim.ring([side*1.48,-.18,2.53],.21,.035,constrained?24:40);
  seams.ellipsoid([side*1.48,-.18,2.52],[.19,.19,.075]);
  engines.ellipsoid([side*1.48,-.18,2.58],[.135,.135,.04],24,12);
  for(let i=0;i<8;i++){const z=-.5+i*.27,x=side*(.93-Math.max(0,z)*.095);glass.box([x,.11,z],[.018,.055,.082]);}
  trim.box([side*.15,.415,.15],[.012,.008,.90]);
  seams.box([side*.67,.235,.73],[.006,.012,.60]);
 }
 const shipMeshes=[pearl,glass,trim,engines,seams].map(g=>renderer.mesh(g.finish()));
 const architecture=geometry(),metal=geometry(),windows=geometry(),lights=geometry();
 // Glazing is alongside the departure lane. The forward aperture is open.
 architecture.box([-4.5,4.5,.5],[3,.12,9.5]);
 architecture.box([-6.9,-.70,.5],[.32,.20,9.5]);
 for(const z of [-8,-4,0,4,8]){
  metal.box([-6.9,1.83,z],[.055,2.55,.075]);
  if(z<8)windows.box([-6.94,1.8,z+2],[.016,2.45,1.92]);
 }
 for(const z of [-7.5,-3.5,.5,4.5,8.5]){
  architecture.box([-4.6,4.31,z],[2.3,.045,.10]);
  lights.box([-4.6,4.25,z],[2.2,.012,.028]);
 }
 metal.box([-6.85,4.4,.5],[.10,.09,9.5]);
 for(const x of [-5.3,5.3])lights.box([x,-.905,0],[.018,.009,8.6]);
 for(const z of [-8,-4,0,4,8])metal.box([0,-.91,z],[6.7,.005,.009]);
 // Recessed lounge plinths sit outside the vessel's travel envelope.
 for(const z of [-4,3]){architecture.box([-5.5,-.33,z],[.64,.25,1.1]);metal.box([-5.5,-.62,z],[.7,.035,1.16]);}
 const terminalMeshes=[architecture,metal,windows,lights].map(g=>renderer.mesh(g.finish()));
 return{
  terminal(ship){
   renderer.object('box',[0,-1.1,.5],[7,.18,9.5],[.028,.044,.064],{finish:[.48,.15,.8],shadow:[ship[0]+.3,ship[2]+.15,1.7+ship[1]*.15,3.7+ship[1]*.15,.55*Math.exp(-ship[1]*.6)]});
   const [structure,metalMesh,windowMesh,lightMesh]=terminalMeshes;
   renderer.object(structure,[0,0,0],[1,1,1],[.29,.32,.34],{finish:[.4,.35,.7]});
   renderer.object(metalMesh,[0,0,0],[1,1,1],[.29,.23,.14],{finish:[.3,.75,1]});
   renderer.object(lightMesh,[0,0,0],[1,1,1],[.40,.27,.12],{emission:1.1});
   renderer.object(windowMesh,[0,0,0],[1,1,1],[.055,.11,.16],{finish:[.17,.4,1.6],alpha:.18});
  },
  ship(position,heading,thrust){
   const [hull,windowMesh,metal,engine,dark]=shipMeshes,scale=[1,1,1];
   renderer.object(hull,position,scale,[.68,.71,.70],{angle:heading,finish:[.28,.18,1.8]});
   renderer.object(windowMesh,position,scale,[.012,.028,.043],{angle:heading,finish:[.14,.5,2]});
   renderer.object(metal,position,scale,[.46,.33,.17],{angle:heading,finish:[.25,.8,1.5]});
   renderer.object(dark,position,scale,[.018,.028,.039],{angle:heading,finish:[.6,.5,.5]});
   renderer.object(engine,position,scale,[.15,.34,.51],{angle:heading,emission:.8+thrust});
  }
 };
}
