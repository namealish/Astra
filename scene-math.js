export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const mix=(a,b,t)=>a+(b-a)*t;
export const mix3=(a,b,t)=>a.map((x,i)=>mix(x,b[i],t));
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const norm=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export function lookAt(eye,target){
 const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);
 return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
export function perspective(aspect,fov=48){
 const f=1/Math.tan(fov*Math.PI/360),near=.08,far=500;
 return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
}
export function transform(position,scale=[1,1,1],angle=0,tilted=false){
 const c=Math.cos(angle),s=Math.sin(angle);
 const matrix=new Float32Array([c*scale[0],0,-s*scale[0],0,0,scale[1],0,0,s*scale[2],0,c*scale[2],0,...position,1]);
 if(tilted){
  const ct=Math.cos(-.22),st=Math.sin(-.22),d=Math.sqrt(1-.42*.42),u=[ct,st,0],north=[-st*d,ct*d,-.42],v=[-st*.42,ct*.42,d];
  for(let column=0;column<3;column++){const p=Array.from(matrix.slice(column*4,column*4+3));for(let axis=0;axis<3;axis++)matrix[column*4+axis]=u[axis]*p[0]+north[axis]*p[1]+v[axis]*p[2];}
 }
 return matrix;
}
export function project(position,view,projection,width,height){
 const p=[...position,1],v=[0,0,0,0],q=[0,0,0,0];
 for(let row=0;row<4;row++)for(let i=0;i<4;i++)v[row]+=view[i*4+row]*p[i];
 for(let row=0;row<4;row++)for(let i=0;i<4;i++)q[row]+=projection[i*4+row]*v[i];
 return{x:(q[0]/q[3]*.5+.5)*width,y:(.5-q[1]/q[3]*.5)*height,depth:q[3],visible:q[3]>.08&&q[3]<500&&Math.abs(q[0]/q[3])<1.1&&Math.abs(q[1]/q[3])<1.1};
}
export function cubeData(){
 const v=[],indices=[];
 const faces=[[[1,0,0],[0,1,0],[0,0,1]],[[-1,0,0],[0,1,0],[0,0,-1]],[[0,1,0],[0,0,1],[1,0,0]],[[0,-1,0],[0,0,1],[-1,0,0]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]]];
 for(const[n,u,w]of faces){const first=v.length/8;for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])v.push(...n.map((x,i)=>x+u[i]*a+w[i]*b),...n,(a+1)/2,(b+1)/2);indices.push(first,first+1,first+2,first,first+2,first+3);}
 return{vertices:new Float32Array(v),indices:new Uint16Array(indices),stride:32};
}
