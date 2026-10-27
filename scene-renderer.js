// Small scene layer sharing the hero's context, sphere buffers and planet maps.
import {lookAt,perspective,transform,cubeData,project} from './scene-math.js';
import {ringVS,ringFS} from './planet-shaders.js';
import {packMeshes,sphereLOD,sphereVisible} from './render-budget.js';
const vs=`attribute vec3 a_position,a_normal;attribute vec2 a_uv;
uniform mat4 u_model,u_view,u_projection;uniform vec3 u_scale;
varying vec3 v_world,v_normal;varying vec2 v_uv;
void main(){vec4 p=u_model*vec4(a_position,1.);v_world=p.xyz;
v_normal=normalize(mat3(u_model)*(a_normal/(u_scale*u_scale)));v_uv=a_uv;gl_Position=u_projection*u_view*p;}`;
const fs=`precision highp float;varying vec3 v_world,v_normal;varying vec2 v_uv;
uniform sampler2D u_map;uniform vec3 u_color,u_eye,u_light;uniform float u_textured,u_emission,u_alpha,u_rim,u_sun;
uniform vec4 u_finish,u_shadow;uniform float u_shadowStrength;
vec3 aces(vec3 c){return clamp(c*(2.51*c+.03)/(c*(2.43*c+.59)+.14),0.,1.);}
void main(){vec3 n=normalize(v_normal),v=normalize(u_eye-v_world);
vec3 l=normalize(mix(u_light,u_light-v_world,u_sun));float ndl=max(0.,dot(n,l));
vec4 tex=texture2D(u_map,v_uv);vec3 base=mix(u_color,pow(tex.rgb,vec3(2.2)),u_textured);
float spec=pow(max(0.,dot(n,normalize(l+v))),48.)*.16;
vec3 c=base*(.055+ndl*1.65+u_emission)+vec3(spec)*ndl;
if(u_finish.w>.5){
 float rough=clamp(u_finish.x,.12,1.),metal=u_finish.y,nv=max(.001,dot(n,v));
 vec3 h=normalize(l+v),f0=mix(vec3(.04),base,metal);
 float nh=max(0.,dot(n,h)),hv=max(0.,dot(h,v)),a2=pow(rough,4.);
 float d=a2/(3.14159*pow(nh*nh*(a2-1.)+1.,2.));
 float k=pow(rough+1.,2.)/8.,g=nv/(nv*(1.-k)+k)*ndl/max(.001,ndl*(1.-k)+k);
 vec3 fresnel=f0+(1.-f0)*pow(1.-hv,5.);
 vec3 reflected=reflect(-v,n);
 vec3 environment=mix(vec3(.018,.032,.052),vec3(.22,.28,.34),smoothstep(-.2,1.,reflected.y));
 environment+=vec3(.58,.47,.32)*exp(-pow((reflected.y-.08)*7.,2.))*.32;
 environment+=vec3(.5,.55,.6)*pow(max(0.,dot(reflected,normalize(vec3(-.6,.8,.3)))),mix(70.,4.,rough));
 c=base*(.045+ndl*1.4)*(1.-metal*.65)+d*g*fresnel*ndl/max(.04,4.*nv*ndl);
 c+=environment*(f0+(1.-f0)*pow(1.-nv,5.))*u_finish.z+base*u_emission;
}
if(u_shadowStrength>0.){vec2 q=(v_world.xz-u_shadow.xy)/u_shadow.zw;c*=1.-u_shadowStrength*exp(-dot(q,q)*1.7);}
if(u_emission>1.95&&u_textured<.5){float grain=.96+.04*sin(n.x*94.)*sin(n.y*113.)*sin(n.z*87.);c=base*grain*(.7+pow(max(0.,dot(n,v)),.28)*.75);}
c+=u_rim*vec3(.20,.43,.72)*pow(1.-max(0.,dot(n,v)),3.)*(.15+ndl);
gl_FragColor=vec4(pow(aces(c),vec3(1./2.2)),u_alpha*mix(1.,tex.a,u_textured));}`;
const lineVS=`attribute vec3 a_position;uniform mat4 u_view,u_projection;uniform vec3 u_offset;uniform float u_size;void main(){gl_Position=u_projection*u_view*vec4(a_position+u_offset,1.);gl_PointSize=u_size;}`;
const lineFS=`precision mediump float;uniform vec4 u_color;uniform float u_points;void main(){float a=u_color.a;if(u_points>.5)a*=1.-smoothstep(.08,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(u_color.rgb,a);}`;
export function createSceneRenderer(api){
 const{gl}=api,p=api.program(gl,vs,fs),lp=api.program(gl,lineVS,lineFS),cube=api.meshBuffer(gl,cubeData());
 const sphere=api.meshBuffer(gl,packMeshes([api.sphereMesh(api.constrained?24:40,api.constrained?48:72),api.sphereMesh(24,48),api.sphereMesh(16,32)]));
 const uniforms=Object.fromEntries(['model','view','projection','scale','color','eye','light','textured','emission','alpha','rim','sun','map','finish','shadow','shadowStrength'].map(n=>[n,gl.getUniformLocation(p,'u_'+n)]));
 const customMeshes=new Set(),lineMeshes=new Set();
 const attrs=['position','normal','uv'].map(n=>gl.getAttribLocation(p,'a_'+n));
 const lu=Object.fromEntries(['view','projection','size','color','points','offset'].map(n=>[n,gl.getUniformLocation(lp,'u_'+n)])),la=gl.getAttribLocation(lp,'a_position');
 const lineBuffer=gl.createBuffer(),white=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,white);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
 let eye=[0,0,10],view,projection,width=1,height=1,light=[-4,6,8],sun=0,draws=0,ringProgram=null,ringUniforms=null,ringAttributes=null;
 function start(camera,target,w,h,lightPosition=[-4,6,8],pointLight=false,framing=[0,0]){
  eye=camera;view=lookAt(eye,target);projection=perspective(w/h);width=w;height=h;light=lightPosition;sun=pointLight?1:0;draws=0;
  projection[8]=-framing[0];projection[9]=-framing[1];
  gl.viewport(0,0,w,h);gl.clearColor(.012,.023,.038,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
 }
 function object(kind,pos,scale,color,{map=null,emission=0,alpha=1,rim=0,angle=0,tilted=false,finish=null,shadow=null,matrix=null}={}){
  if(kind==='sphere'&&!matrix&&!sphereVisible(pos,Math.max(...scale),view,projection))return;
  const mesh=typeof kind==='object'?kind:kind==='box'?cube:sphere;gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vbo);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ibo);
  for(let i=0;i<3;i++)gl.disableVertexAttribArray(i);
  attrs.forEach((loc,i)=>{gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,[3,3,2][i],gl.FLOAT,false,32,[0,12,24][i]);});
  gl.uniformMatrix4fv(uniforms.model,false,matrix||transform(pos,scale,angle,tilted));gl.uniformMatrix4fv(uniforms.view,false,view);gl.uniformMatrix4fv(uniforms.projection,false,projection);
  gl.uniform3fv(uniforms.scale,scale);gl.uniform3fv(uniforms.color,color);gl.uniform3fv(uniforms.eye,eye);gl.uniform3fv(uniforms.light,light);
  gl.uniform1f(uniforms.sun,sun);gl.uniform1f(uniforms.textured,map?1:0);gl.uniform1f(uniforms.emission,emission);gl.uniform1f(uniforms.alpha,alpha);gl.uniform1f(uniforms.rim,rim);
  gl.uniform4fv(uniforms.finish,finish?[...finish,1]:[.6,0,0,0]);
  gl.uniform4fv(uniforms.shadow,shadow?shadow.slice(0,4):[0,0,1,1]);gl.uniform1f(uniforms.shadowStrength,shadow?.[4]||0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,map||white);gl.uniform1i(uniforms.map,0);
  if(alpha<1){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);}
  let lod=mesh;
  if(mesh===sphere){
   const depth=-(view[2]*pos[0]+view[6]*pos[1]+view[10]*pos[2]+view[14]),radius=Math.max(...scale);
   // Conservative bound includes the near side of the sphere. Cinematic Earth
   // and every close-up retain the original tessellation.
   lod=sphereLOD(sphere.ranges,projection[5]*height*.5*radius/Math.max(.01,depth-radius),18,50);
  }
  gl.drawElements(gl.TRIANGLES,lod.count,gl.UNSIGNED_SHORT,lod.offset||0);draws++;
  gl.depthMask(true);gl.disable(gl.BLEND);
 }
 function lineMesh(points,dynamic=false){const vbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,points,dynamic?gl.DYNAMIC_DRAW:gl.STATIC_DRAW);const mesh={vbo,count:points.length/3};lineMeshes.add(mesh);return mesh;}
 function updateLine(mesh,points){gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vbo);gl.bufferSubData(gl.ARRAY_BUFFER,0,points);}
 function lines(points,color=[.64,.57,.43,.3],mode=gl.LINE_STRIP,size=1,offset=[0,0,0]){
  gl.useProgram(lp);gl.bindBuffer(gl.ARRAY_BUFFER,points.vbo||lineBuffer);if(!points.vbo)gl.bufferData(gl.ARRAY_BUFFER,points instanceof Float32Array?points:new Float32Array(points.flat()),gl.DYNAMIC_DRAW);
  for(let i=0;i<3;i++)gl.disableVertexAttribArray(i);
  gl.enableVertexAttribArray(la);gl.vertexAttribPointer(la,3,gl.FLOAT,false,12,0);
  gl.uniformMatrix4fv(lu.view,false,view);gl.uniformMatrix4fv(lu.projection,false,projection);gl.uniform4fv(lu.color,color);gl.uniform3fv(lu.offset,offset);gl.uniform1f(lu.size,size);gl.uniform1f(lu.points,mode===gl.POINTS?1:0);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.drawArrays(mode,0,points.count??points.length/(points instanceof Float32Array?3:1));draws++;gl.depthMask(true);gl.disable(gl.BLEND);
 }
 function ship(pos,scale=1,engine=.2,heading=0){
  const s=scale,c=Math.cos(heading),sn=Math.sin(heading),at=(x,y,z)=>[pos[0]+(c*x+sn*z)*s,pos[1]+y*s,pos[2]+(-sn*x+c*z)*s];
  const part=(kind,p,sz,col,extra={})=>object(kind,at(...p),sz.map(v=>v*s),col,{...extra,angle:heading});
  part('sphere',[0,0,0],[.62,.34,2.8],[.7,.74,.73]);
  part('sphere',[0,.2,-1.65],[.49,.16,.8],[.018,.042,.065]);
  for(const x of [-.86,.86]){
   part('sphere',[x,-.12,.65],[.24,.20,1.7],[.62,.67,.69]);
   part('box',[x*.5,-.15,.55],[.5,.055,.65],[.45,.40,.29]);
   part('sphere',[x,-.12,2.15],[.15,.13,.12],[.30,.60,.85],{emission:1+engine*3});
   part('sphere',[x,-.12,2.35+engine*.25],[.10,.10,.25+engine*.28],[.25,.50,.80],{emission:1.4,alpha:.4});
  }
  // Panoramic passenger ribbon follows the actual hull, not a flat billboard.
  for(const side of [-1,1])for(let i=0;i<8;i++){
   const z=-.8+i*.33,x=side*.57*Math.sqrt(Math.max(.3,1-z*z/8));
   part('box',[x,.12,z],[.012,.05,.09],[.12,.22,.29],{emission:.35});
  }
  part('box',[0,.32,.6],[.035,.03,1.1],[.69,.52,.29]);
 }
 const stars=new Float32Array((api.constrained?240:600)*3);let seed=59;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<stars.length;i+=3){const a=random()*Math.PI*2,y=random()*2-1,r=Math.sqrt(1-y*y);stars.set([Math.cos(a)*r*160,y*160,Math.sin(a)*r*160],i);}
 const starMesh=lineMesh(stars);
 function ring(pos,radius){
  if(!sphereVisible(pos,radius*2.31,view,projection))return;
  if(!ringProgram){ringProgram=api.program(gl,ringVS,ringFS.replace(/const vec3 SUN = vec3\([^;]+;/,'uniform vec3 SUN;'));ringUniforms=Object.fromEntries(['model','view','projection','eye','texture'].map(n=>[n,gl.getUniformLocation(ringProgram,'u_'+n)]));ringUniforms.sun=gl.getUniformLocation(ringProgram,'SUN');ringAttributes=['position','uv'].map(n=>gl.getAttribLocation(ringProgram,'a_'+n));}
  gl.useProgram(ringProgram);gl.bindBuffer(gl.ARRAY_BUFFER,api.rings.vbo);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,api.rings.ibo);
  for(let i=0;i<3;i++)gl.disableVertexAttribArray(i);
  ringAttributes.forEach((loc,i)=>{gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,i?2:3,gl.FLOAT,false,20,i?12:0);});
  gl.uniformMatrix4fv(ringUniforms.model,false,transform(pos,[radius,radius,radius]));gl.uniformMatrix4fv(ringUniforms.view,false,view);gl.uniformMatrix4fv(ringUniforms.projection,false,projection);gl.uniform3fv(ringUniforms.eye,eye);
  const direction=sun?light.map((value,i)=>value-pos[i]):[-.72,.28,.635],length=Math.hypot(...direction);gl.uniform3fv(ringUniforms.sun,direction.map(value=>value/length));
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,api.ringTexture());gl.uniform1i(ringUniforms.texture,0);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  gl.drawElements(gl.TRIANGLES,api.rings.count,gl.UNSIGNED_SHORT,0);draws++;gl.depthMask(true);gl.disable(gl.BLEND);
 }
 return{start,object,lines,lineMesh,updateLine,ship,ring,mesh(data){const mesh=api.meshBuffer(gl,data);customMeshes.add(mesh);return mesh;},stars(alpha=1){lines(starMesh,[.77,.83,.9,alpha],gl.POINTS,Math.min(2,devicePixelRatio||1));},
  project:p=>project(p,view,projection,api.viewport().width,api.viewport().height),get draws(){return draws;},
  dispose(){if(api.isLost()||gl.isContextLost())return;for(const mesh of[cube,sphere,...customMeshes]){gl.deleteBuffer(mesh.vbo);gl.deleteBuffer(mesh.ibo);}customMeshes.clear();for(const mesh of lineMeshes)gl.deleteBuffer(mesh.vbo);lineMeshes.clear();gl.deleteBuffer(lineBuffer);gl.deleteTexture(white);gl.deleteProgram(p);gl.deleteProgram(lp);if(ringProgram)gl.deleteProgram(ringProgram);}
 };
}
