// Conservative screen-space LOD. All levels share one VBO/IBO; foreground
// geometry, shading and textures are unchanged. Offsets are bytes (Uint16).
export function packMeshes(meshes) {
 const stride=meshes[0].stride,vertices=new Float32Array(meshes.reduce((n,m)=>n+m.vertices.length,0));
 const indices=new Uint16Array(meshes.reduce((n,m)=>n+m.indices.length,0)),ranges=[];
 let vertexOffset=0,indexOffset=0;
 for(const mesh of meshes){
  const base=vertexOffset/(stride/4);
  if(base+mesh.vertices.length/(stride/4)>65536)throw new RangeError('LOD mesh exceeds WebGL1 index budget');
  vertices.set(mesh.vertices,vertexOffset);
  for(let i=0;i<mesh.indices.length;i++)indices[indexOffset+i]=mesh.indices[i]+base;
  ranges.push({count:mesh.indices.length,offset:indexOffset*2});
  vertexOffset+=mesh.vertices.length;indexOffset+=mesh.indices.length;
 }
 return{vertices,indices,stride,ranges};
}
export function sphereLOD(ranges,pixels,low=48,medium=150){return ranges[pixels<low?2:pixels<medium?1:0];}
// Test a bounding sphere against the actual off-axis view frustum. This is
// conservative for nonuniform objects and does not cull by screen-center alone.
export function sphereVisible(position,radius,view,projection){
 const x=view[0]*position[0]+view[4]*position[1]+view[8]*position[2]+view[12];
 const y=view[1]*position[0]+view[5]*position[1]+view[9]*position[2]+view[13];
 const z=view[2]*position[0]+view[6]*position[1]+view[10]*position[2]+view[14],depth=-z;
 if(depth+radius<.08||depth-radius>500)return false;
 const clipX=projection[0]*x+projection[8]*z,clipY=projection[5]*y+projection[9]*z;
 return depth+clipX>=-radius*Math.hypot(projection[0],projection[8]-1)
  &&depth-clipX>=-radius*Math.hypot(projection[0],projection[8]+1)
  &&depth+clipY>=-radius*Math.hypot(projection[5],projection[9]-1)
  &&depth-clipY>=-radius*Math.hypot(projection[5],projection[9]+1);
}

// Fill-rate adaptation, not a material downgrade. Evidence must be sustained;
// loading, a resumed tab and a single stutter cannot lower the resolution.
// Recovery is deliberately slower, with a cooldown to prevent oscillation.
export function createRenderBudget({constrained=false,mobile=false,dpr=1}={}){
 const tier=constrained?'performance':mobile?'balanced':'high';
 const ceiling=Math.min(dpr,constrained?1:mobile?1.3:1.75),floor=Math.min(1,ceiling);
 let cap=ceiling,slow=0,fast=0,cooldown=0,pending=0;
 return{
  get cap(){return cap;},get tier(){return tier;},
  sample(dt,{eligible=true,safe=true}={}){
   if(!eligible||dt<=0||dt>=.1){slow=fast=0;return false;}
   cooldown=Math.max(0,cooldown-dt);
   slow=dt>.032?slow+dt:Math.max(0,slow-dt*2);
   fast=dt<.018?fast+dt:0;
   if(!cooldown){if(slow>3&&cap>floor)pending=-1;else if(fast>12&&cap<ceiling)pending=1;}
   if(!pending||!safe)return false;
   cap=Math.max(floor,Math.min(ceiling,Math.round((cap+pending*.15)*100)/100));
   pending=0;slow=fast=0;cooldown=12;return true;
  },
  reset(){slow=fast=pending=0;}
 };
}
