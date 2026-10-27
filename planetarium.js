/** ASTRAEA native-WebGL planetary carousel. No framework or layout changes.
 * Local astronomical maps, linear-light PBR, DEM normals, optical-depth rings
 * and restrained exponential atmospheres. Carousel API/choreography preserved.
 */
import { sphereVS, sphereFS, atmosphereVS, atmosphereFS, ringVS, ringFS } from './planet-shaders.js';
import {packMeshes,sphereLOD,createRenderBudget} from './render-budget.js';

const PI = Math.PI, TAU = PI * 2;
const DESTINATIONS = ['luna', 'mars', 'europa', 'saturn', 'titan'];
const MATERIALS = [
  { color: [.48, .58, .75], normal: 1.0, rough: .95, f0: .025, haze: 0, shell: 1, density: 0, rotation: 1.50 },
  // Present the Valles Marineris / Tharsis hemisphere in the lit hero view.
  { color: [.58, .22, .10], normal: 1.0, rough: .91, f0: .035, haze: .014, shell: 1.012, density: .025, rotation: .85 },
  { color: [.45, .65, .90], normal: 1.0, rough: .57, f0: .045, haze: .006, shell: 1, density: 0, rotation: .80 },
  { color: [.82, .62, .32], normal: 0, rough: .93, f0: .018, haze: .012, shell: 1.012, density: .025, rotation: .6 },
  { color: [.78, .49, .22], normal: 0, rough: 1, f0: .008, haze: .6, shell: 1.055, density: .19, rotation: .5 }
];
const RING_INNER = 1.24, RING_OUTER = 2.30, RING_TILT = -.22, RING_OPENING = .42;
const smoothstep = (a, b, value) => { const x = Math.max(0, Math.min(1, (value - a) / (b - a))); return x * x * (3 - 2 * x); };
const wrappedOffset = value => ((value + 2.5) % 5 + 5) % 5 - 2.5;
const normalizeIndex = i => ((Math.round(i) % 5) + 5) % 5;

function program(gl, vertex, fragment) {
  const shaders = [vertex, fragment].map((source, i) => {
    const shader = gl.createShader(i ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Planet shader compilation: ${message}`);
    }
    return shader;
  });
  const p = gl.createProgram();
  shaders.forEach(s => gl.attachShader(p, s));
  gl.linkProgram(p);
  shaders.forEach(s => gl.deleteShader(s));
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(p); gl.deleteProgram(p);
    throw new Error(`Planet program linking: ${message}`);
  }
  return p;
}

function sphereMesh(lat = 80, lon = 144) {
  const vertices = [], indices = [];
  for (let j = 0; j <= lat; j++) {
    const a = j / lat * PI, y = Math.cos(a), r = Math.sin(a);
    for (let i = 0; i <= lon; i++) {
      const b = i / lon * TAU, x = r * Math.cos(b), z = r * Math.sin(b);
      vertices.push(x, y, z, x, y, z, i / lon, 1 - j / lat);
    }
  }
  for (let j = 0; j < lat; j++) for (let i = 0; i < lon; i++) {
    const k = j * (lon + 1) + i;
    // Outward winding permits one-sided atmospheric shells.
    indices.push(k, k + 1, k + lon + 1, k + 1, k + lon + 2, k + lon + 1);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices), stride: 32 };
}

function ringMesh(segments = 320) {
  const vertices = [], indices = [];
  const c = Math.cos(RING_TILT), s = Math.sin(RING_TILT), d = Math.sqrt(1 - RING_OPENING ** 2);
  for (let j = 0; j <= segments; j++) {
    const angle = j / segments * TAU;
    for (const r of [RING_INNER, RING_OUTER]) {
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r * RING_OPENING;
      vertices.push(x * c - y * s, x * s + y * c, Math.sin(angle) * r * d, r, j / segments);
    }
    if (j < segments) { const k = j * 2; indices.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices), stride: 20 };
}

function meshBuffer(gl, data) {
  const vbo = gl.createBuffer(), ibo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
  return { vbo, ibo, count: data.indices.length, stride: data.stride, ranges:data.ranges };
}

function perspective(fov, aspect) {
  const f = 1 / Math.tan(fov * PI / 360), near = .15, far = 120, nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function model(x, y, z, scale, spin = 0, tilted = false) {
  const c = Math.cos(spin), s = Math.sin(spin);
  let basis = [[c, 0, -s], [0, 1, 0], [s, 0, c]];
  if (tilted) {
    // Saturn's band equator and rings share exactly the same physical plane.
    const ct = Math.cos(RING_TILT), st = Math.sin(RING_TILT), d = Math.sqrt(1 - RING_OPENING ** 2);
    const u = [ct, st, 0], north = [-st * d, ct * d, -RING_OPENING], v = [-st * RING_OPENING, ct * RING_OPENING, d];
    basis = basis.map(p => p.map((_, axis) => u[axis] * p[0] + north[axis] * p[1] + v[axis] * p[2]));
  }
  return new Float32Array([...basis[0].map(v => v * scale), 0, ...basis[1].map(v => v * scale), 0, ...basis[2].map(v => v * scale), 0, x, y, z, 1]);
}

export function createPlanetarium(canvas, { start = 3, onReady, onError } = {}) {
  let gl;
  try {
    const options = { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    gl = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
    if (!gl) throw new Error('WebGL is not available');
  } catch (error) { onError?.(error); return null; }

  let sphereP, atmosphereP, ringP;
  try {
    sphereP = program(gl, sphereVS, sphereFS);
    atmosphereP = program(gl, atmosphereVS, atmosphereFS);
    ringP = program(gl, ringVS, ringFS);
  } catch (error) { onError?.(error); return null; }

  const sphere = meshBuffer(gl, packMeshes([sphereMesh(),sphereMesh(48,96),sphereMesh(24,48)])), rings = meshBuffer(gl, ringMesh());
  function locations(p, uniforms, attributes) {
    return { ...Object.fromEntries(uniforms.map(n => [n, gl.getUniformLocation(p, 'u_' + n)])),
      ...Object.fromEntries(attributes.map(n => [n, gl.getAttribLocation(p, 'a_' + n)])) };
  }
  const su = locations(sphereP, ['model', 'view', 'projection', 'eye', 'texture', 'normal_texture', 'ring_texture', 'atmosphere', 'center', 'material', 'radius', 'planet'], ['position', 'normal', 'uv']);
  const au = locations(atmosphereP, ['model', 'view', 'projection', 'eye', 'color', 'center', 'radius', 'shell', 'strength'], ['position']);
  const ru = locations(ringP, ['model', 'view', 'projection', 'eye', 'texture'], ['position', 'uv']);
  const mobile = matchMedia('(max-width: 680px)').matches;
  const constrained = (navigator.deviceMemory || 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2;
  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const balanced=mobile||(navigator.deviceMemory||8)<=4||(navigator.hardwareConcurrency||8)<=4||maxTexture<4096;
  const highSuffix = constrained || maxTexture < 2048 ? '-mobile' : balanced ? '-medium' : '';
  const normalSuffix = mobile || constrained || maxTexture < 2048 ? '-mobile' : '';
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  const maxAnisotropy = anisotropy ? Math.min(mobile ? 4 : 8, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 1;
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)');
  const allocated = new Set(), highMaps = new Map();
  let disposed = false, lost = false, replacement = null, ready = false;
  let progress = start, target = start, velocity = 0, frame = 0, last = 0, spinTime = 0, aspect = 1, dirty = true;
  let flight = 0, covered = false, pointerX = 0, pointerY = 0;
  let scene=null,sceneFactory=null,sceneOptions=null;
  const camera = {x:0,y:0,z:17};
  const budget=createRenderBudget({constrained,mobile:balanced,dpr:devicePixelRatio||1});
  const viewport={width:1,height:1,ratio:1};
  let inViewport = true;
  let wantedHigh = normalizeIndex(start), inFlight = null, requestStamp = 0;
  const view = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -17, 1]);
  let projection = perspective(48, 1);
  function wake() {
    if (!frame && !disposed && !lost && !covered && inViewport && !document.hidden) frame = requestAnimationFrame(draw);
  }

  function pixelTexture(pixel) {
    const tex = gl.createTexture(); allocated.add(tex);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pixel));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }
  const neutralNormal = pixelTexture([128, 128, 255, 242]);
  function release(tex) { if (tex && allocated.delete(tex) && !lost && !gl.isContextLost()) gl.deleteTexture(tex); }
  function loadTexture(url, repeat = true, priority='auto') {
    return new Promise((resolve, reject) => {
      const image = new Image(); image.decoding = 'async'; image.fetchPriority=priority;
      image.onload = () => {
        if (disposed || lost) { resolve(null); return; }
        let tex;
        try {
          tex = pixelTexture([0, 0, 0, 255]);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          let source = image;
          if (image.width > maxTexture || image.height > maxTexture) {
            // Legacy GPUs may expose only 1024px textures, including ring maps.
            const ratio = Math.min(maxTexture / image.width, maxTexture / image.height);
            source = document.createElement('canvas');
            source.width = Math.max(1, Math.round(image.width * ratio));
            source.height = Math.max(1, Math.round(image.height * ratio));
            source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
          }
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          if (anisotropy) gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, maxAnisotropy);
          dirty = true; wake(); resolve(tex);
        } catch (error) { release(tex); reject(error); }
      };
      image.onerror = () => reject(new Error(`Planet texture could not be loaded: ${url}`));
      image.src = url;
    });
  }

  // 1K base maps keep satellites cheap. At most two high-resolution materials
  // are retained; a single-flight queue avoids decoding five 4K maps on a swipe.
  const lowMaps = DESTINATIONS.map(() => pixelTexture([112, 108, 100, 255]));
  let ringTexture = pixelTexture([200, 184, 160, 0]);
  let loadedColors = 0;
  const bases = DESTINATIONS.map(async (name, i) => {
    try {
      const tex = await loadTexture(`assets/planet-${name}-mobile.webp`);
      if (tex) { release(lowMaps[i]); lowMaps[i] = tex; loadedColors++; }
    } catch (error) { console.warn(error.message); }
  });
  bases.push(loadTexture('assets/saturn-rings.webp', false).then(tex => {
    if (tex) { release(ringTexture); ringTexture = tex; }
  }).catch(error => console.warn(error.message)));

  async function upgrade() {
    const i = wantedHigh;
    if (disposed || lost) return;
    if (highMaps.has(i)) { highMaps.get(i).used = ++requestStamp; return; }
    if (inFlight !== null) return;
    inFlight = i;
    let color = null, normal = null;
    try {
      const name = DESTINATIONS[i];
      color = highSuffix === '-mobile' ? null : await loadTexture(`assets/planet-${name}${highSuffix}.webp`,true,'high');
      // A missing detail map must not discard a successfully uploaded color map.
      if (i < 3) {
        try { normal = await loadTexture(`assets/planet-${name}-normal${normalSuffix}.webp`); }
        catch (error) { console.warn(error.message); }
      }
      if (disposed || lost) { release(color); release(normal); return; }
      highMaps.set(i, { color, normal, used: ++requestStamp });
      while (highMaps.size > 2) {
        const oldest = [...highMaps.entries()].filter(([key]) => key !== i).sort((a, b) => a[1].used - b[1].used)[0];
        release(oldest[1].color); release(oldest[1].normal); highMaps.delete(oldest[0]);
      }
      dirty = true; wake();
    } catch (error) {
      release(color); release(normal);
      // Keep the valid 1K material rather than hiding the working carousel.
      console.warn(error.message);
    } finally {
      inFlight = null;
      if (!disposed && !lost && wantedHigh !== i) upgrade();
    }
  }
  const firstUpgrade = upgrade();
  Promise.all([...bases, firstUpgrade]).then(() => {
    if (!disposed && !lost) {
      if (!loadedColors && !highMaps.get(normalizeIndex(start))?.color) throw new Error('No planetary color maps could be loaded');
      ready = true; dirty = true; canvas.style.display = ''; wake(); onReady?.();
    }
  }).catch(error => { if (!disposed) onError?.(error); });

  function resize() {
    const w = Math.max(10, canvas.clientWidth), h = Math.max(10, canvas.clientHeight);
    const ratio = Math.min(devicePixelRatio || 1, budget.cap);
    viewport.width=w;viewport.height=h;viewport.ratio=ratio;
    const width=Math.round(w*ratio),height=Math.round(h*ratio);
    // Assigning even an unchanged canvas dimension reallocates its backing store.
    if(canvas.width!==width)canvas.width=width;
    if(canvas.height!==height)canvas.height=height;
    aspect = w / h;
    gl.viewport(0, 0, canvas.width, canvas.height);
    projection = perspective(w < 650 ? 51 : 48, aspect); dirty = true; wake();
  }
  function bind(p, mesh, uniforms) {
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    // Disable unused locations; WebGL1 otherwise retains other programs' arrays.
    for (let i = 0; i < 3; i++) gl.disableVertexAttribArray(i);
    for (const [key, size, offset] of [['position', 3, 0], ['normal', 3, 12], ['uv', 2, mesh.stride === 32 ? 24 : 12]]) {
      if (uniforms[key] === undefined || uniforms[key] < 0) continue;
      gl.enableVertexAttribArray(uniforms[key]); gl.vertexAttribPointer(uniforms[key], size, gl.FLOAT, false, mesh.stride, offset);
    }
    gl.uniformMatrix4fv(uniforms.projection, false, projection); gl.uniformMatrix4fv(uniforms.view, false, view);
    gl.uniform3f(uniforms.eye, -view[12], -view[13], -view[14]);
  }
  function texture(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }
  function level(o){
    const pixels=projection[5]*canvas.height*.5*o.r/Math.max(.01,-view[14]-o.z-o.r);
    return o.weight>.04?sphere.ranges[0]:sphereLOD(sphere.ranges,pixels);
  }
  function drawSphere(o) {
    const m = MATERIALS[o.i], maps = highMaps.get(o.i);
    bind(sphereP, sphere, su);
    texture(0, maps?.color || lowMaps[o.i]); texture(1, maps?.normal || neutralNormal); texture(2, ringTexture);
    gl.uniform1i(su.texture, 0); gl.uniform1i(su.normal_texture, 1); gl.uniform1i(su.ring_texture, 2);
    gl.uniformMatrix4fv(su.model, false, model(o.x, o.y, o.z, o.r, m.rotation + spinTime * .009, o.i === 3));
    gl.uniform3fv(su.atmosphere, m.color); gl.uniform3f(su.center, o.x, o.y, o.z);
    gl.uniform4f(su.material, maps?.normal ? m.normal : 0, m.rough, m.f0, m.haze);
    gl.uniform1f(su.radius, o.r); gl.uniform1f(su.planet, o.i);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    const lod=level(o);gl.drawElements(gl.TRIANGLES, lod.count, gl.UNSIGNED_SHORT, lod.offset);
  }
  function drawAtmosphere(o) {
    const m = MATERIALS[o.i];
    if (m.density === 0 || o.weight < .04 || constrained) return;
    bind(atmosphereP, sphere, au);
    gl.uniformMatrix4fv(au.model, false, model(o.x, o.y, o.z, o.r * m.shell));
    gl.uniform3fv(au.color, m.color); gl.uniform3f(au.center, o.x, o.y, o.z);
    gl.uniform1f(au.radius, o.r); gl.uniform1f(au.shell, m.shell); gl.uniform1f(au.strength, m.density);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    const lod=level(o);gl.drawElements(gl.TRIANGLES, lod.count, gl.UNSIGNED_SHORT, lod.offset);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  function drawRing(o) {
    bind(ringP, rings, ru);
    gl.uniformMatrix4fv(ru.model, false, model(o.x, o.y, o.z, o.r));
    texture(0, ringTexture); gl.uniform1i(ru.texture, 0);
    gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
    // Correct alpha accumulation for the browser's premultiplied canvas compositor.
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, rings.count, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  function sceneObjects() {
    const small = aspect < .76;
    return DESTINATIONS.map((name, i) => {
      const offset = wrappedOffset(i - progress), distance = Math.abs(offset);
      const weight = 1 - smoothstep(0, 1, distance), foreground = weight ** .88, arc = 4 * weight * (1 - weight);
      const spread = (small ? 2.7 : 3.45) + arc * (small ? 1.15 : 1.75);
      const backgroundY = small ? 2.95 : 4.05, foregroundY = small ? -3.45 : -3.07;
      let x = offset * spread + foreground * (small ? .70 : .72);
      let y = backgroundY - (backgroundY - foregroundY) * weight ** .82 + Math.min(distance, 2) * .08;
      let z = -1.65 + 8.45 * foreground - Math.min(distance, 2) * .18;
      let r = .36 + 3.96 * weight ** .86;
      if (small) { y -= foreground * .36; r += foreground * .34; }
      if (i === 3) {
        // Retain the orbital path; fit Saturn's entire physical ring envelope
        // farther from the camera, instead of putting the near ring at the lens.
        r *= 1 - .28 * foreground;
        z -= 3.45 * foreground;
        y += (small ? .85 : 1.15) * foreground;
        x += (small ? .35 : .70) * foreground;
      }
      return { i, name, x, y, z, r, weight };
    }).sort((a, b) => a.z - b.z);
  }
  function draw(now) {
    frame = 0;
    if (disposed || lost) return;
    const rawDt = last ? (now - last) / 1000 : .016, dt = Math.min(.06, rawDt); last = now;
    if (!document.hidden && inViewport && !covered) {
      const safe=scene?scene.canAdapt?.()===true:Math.abs(progress-target)<.002&&flight===0;
      if(budget.sample(rawDt,{eligible:ready&&!prefersReduced.matches&&inFlight===null,safe}))resize();
      if(scene){
        scene.render({now,dt,width:canvas.width,height:canvas.height,reduced:prefersReduced.matches});
        dirty=false;
        if(scene.needsFrame())wake();
        return;
      }
      const before = progress;
      if (prefersReduced.matches) { progress = target; velocity = 0; }
      else {
        // Analytic critically damped motion keeps velocity continuous even when
        // the destination changes mid-flight. No competing animation timelines.
        const omega = 7.4, offset = progress - target, impulse = velocity + omega * offset;
        const decay = Math.exp(-omega * dt);
        progress = target + (offset + impulse * dt) * decay;
        velocity = (velocity - omega * impulse * dt) * decay;
        if (Math.abs(target - progress) < .00015 && Math.abs(velocity) < .001) { progress = target; velocity = 0; }
        spinTime += dt;
      }
      if (dirty || !prefersReduced.matches || before !== progress) {
        const remaining = target - progress, energy = Math.min(1, Math.abs(remaining) * 1.7);
        const objects = sceneObjects(), selected = objects.find(o => o.i === normalizeIndex(target));
        const blend = prefersReduced.matches ? 1 : 1 - Math.exp(-dt * 5.5);
        const desiredX = .12 * Math.sign(remaining || 1) * energy + pointerX * .13;
        const desiredY = -.10 * energy + pointerY * .09;
        camera.x += (desiredX - camera.x) * blend;
        camera.y += (desiredY - camera.y) * blend;
        camera.z += (17 + .32 * energy - camera.z) * blend;
        // The endpoint stays outside the sphere/ring bounding envelope. The
        // photographic resort reveal takes over before any geometry can clip.
        const approach = flight * flight * (3 - 2 * flight);
        const destinationZ = selected.z + selected.r * (selected.i === 3 ? 2.30 : 1) + (selected.i === 3 ? 1.6 : .95);
        view[12] = -(camera.x * (1-approach) + selected.x * approach);
        view[13] = -(camera.y * (1-approach) + selected.y * approach);
        view[14] = -(camera.z * (1-approach) + destinationZ * approach);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        for (const o of objects) { drawSphere(o); drawAtmosphere(o); if (o.i === 3) drawRing(o); }
        dirty = false;
      }
    }
    // Stop callbacks entirely behind a resort, in hidden tabs, offscreen, or
    // once a reduced-motion frame is clean. Texture uploads wake the renderer.
    if (!prefersReduced.matches || dirty || progress !== target) wake();
  }
  function selectHigh() { wantedHigh = normalizeIndex(target); dirty = true; upgrade(); wake(); }
  function setIndex(i, immediate=false) {
    if (replacement) return replacement.setIndex(i,immediate);
    const desired = normalizeIndex(i), current = Math.round(target), normalized = normalizeIndex(current);
    let delta = desired - normalized; if (delta > 2) delta -= 5; if (delta < -2) delta += 5;
    target = current + delta; if (prefersReduced.matches||immediate) { progress = target; velocity = 0; } selectHigh();
  }
  function moveBy(delta) {
    if (replacement) return replacement.moveBy(delta);
    target = Math.round(target) + delta; if (prefersReduced.matches) { progress = target; velocity = 0; } selectHigh();
  }
  function setFlight(value) {
    if (replacement) return replacement.setFlight(value);
    flight = Math.max(0, Math.min(1, Number(value) || 0)); dirty = true; wake();
  }
  function setCovered(value) {
    if (replacement) return replacement.setCovered(value);
    covered = !!value; last = 0;budget.reset();
    if (covered) { cancelAnimationFrame(frame); frame = 0; }
    else { dirty = true; wake(); }
  }
  function setScene(factory,options={}){
    if(replacement)return replacement.setScene(factory,options);
    scene?.dispose();scene=null;sceneFactory=factory;sceneOptions=options;
    if(factory)scene=factory({gl,canvas,sphere,rings,program,meshBuffer,sphereMesh,loadTexture,release,
      maps:()=>lowMaps,material:i=>highMaps.get(i)?.color||lowMaps[i],ringTexture:()=>ringTexture,viewport:()=>viewport,constrained,mobile,wake,isLost:()=>lost},options);
    if(!factory){gl.clearColor(0,0,0,0);gl.depthMask(true);gl.disable(gl.BLEND);}
    flight=0;covered=false;dirty=true;last=0;budget.reset();resize();wake();
    return scene;
  }
  function sceneAction(action,value){
    if(replacement)return replacement.sceneAction(action,value);
    scene?.action?.(action,value);dirty=true;wake();
  }
  const pointerMove = event => {
    if (scene || mobile || prefersReduced.matches || event.pointerType !== 'mouse') return;
    const bounds = canvas.getBoundingClientRect();
    pointerX = (event.clientX - bounds.left) / bounds.width - .5;
    pointerY = .5 - (event.clientY - bounds.top) / bounds.height;
    dirty = true; wake();
  };
  const pointerLeave = () => { pointerX = pointerY = 0; dirty = true; wake(); };
  const pointerSurface=canvas;
  pointerSurface.addEventListener('pointermove', pointerMove, {passive:true});
  pointerSurface.addEventListener('pointerleave', pointerLeave);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  const intersection = new IntersectionObserver(entries => {
    inViewport = entries[0].isIntersecting; last = 0; dirty = true;budget.reset();
    if (inViewport) wake(); else { cancelAnimationFrame(frame); frame = 0; }
  });
  intersection.observe(canvas);
  const visibility = () => { last = 0; dirty = true;budget.reset(); if(document.hidden){cancelAnimationFrame(frame);frame=0;}else wake(); };
  const motionChanged = () => { dirty = true; pointerX = pointerY = 0; wake(); };
  const contextLost = event => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; onError?.(new Error('WebGL context lost; waiting for restoration')); };
  const contextRestored = () => {
    const selected = normalizeIndex(target),factory=sceneFactory,options=sceneOptions,retained=scene?.snapshot?.(); destroy();
    canvas.style.display = '';
    replacement = createPlanetarium(canvas, { start: selected, onReady, onError });
    replacement?.setFlight(flight); replacement?.setCovered(covered);
    if(factory)replacement?.setScene(factory,{...options,restored:retained});
  };
  document.addEventListener('visibilitychange', visibility);
  prefersReduced.addEventListener('change', motionChanged);
  canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('webglcontextrestored', contextRestored);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clearColor(0, 0, 0, 0);
  resize(); wake();
  function destroy() {
    if (replacement) return replacement.destroy();
    disposed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect();
    scene?.dispose();scene=null;
    document.removeEventListener('visibilitychange', visibility);
    prefersReduced.removeEventListener('change', motionChanged);
    pointerSurface.removeEventListener('pointermove', pointerMove);
    pointerSurface.removeEventListener('pointerleave', pointerLeave);
    canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
    // Context loss already invalidates every GPU object. After restoration,
    // deleting those stale handles would pollute the new context with errors.
    if (!lost && !gl.isContextLost()) {
      allocated.forEach(tex => gl.deleteTexture(tex));
      for (const mesh of [sphere, rings]) { gl.deleteBuffer(mesh.vbo); gl.deleteBuffer(mesh.ibo); }
      for (const p of [sphereP, atmosphereP, ringP]) gl.deleteProgram(p);
    }
    allocated.clear();
  }
  return { setIndex, moveBy, setFlight, setCovered, setScene,sceneAction,getSceneState:()=>replacement?replacement.getSceneState():scene?.snapshot?.(), getSelected: () => replacement ? replacement.getSelected() : normalizeIndex(target),
    getQuality:()=>replacement?replacement.getQuality():({tier:budget.tier,pixelRatio:viewport.ratio,pixelCap:budget.cap,colorTier:highSuffix||'4k'}),
    getMotion: () => replacement ? replacement.getMotion() : ({ progress, target, velocity, flight, covered }), destroy };
}
