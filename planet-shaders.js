// Lighting is evaluated in linear space. All photographic maps are decoded
// from sRGB; normal/roughness/opacity maps remain linear data.
const common = `
const float PI = 3.14159265359;
// A slightly grazing sun exposes small relief without sacrificing the lit disc.
const vec3 SUN = vec3(-0.719991, 0.279997, 0.634992);
uniform vec3 u_eye;
// Must match ringMesh(): RING_TILT = -.22, RING_OPENING = .42.
const vec3 RING_NORMAL = vec3(0.198049, 0.885650, -0.420000);
vec3 linearRGB(vec3 c) {
  return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(vec3(.04045), c));
}
vec3 displayRGB(vec3 c) {
  c = max(c, vec3(0.0));
  // Narkowicz ACES fit, then the display transfer function (once only).
  c = clamp((c * (2.51 * c + .03)) / (c * (2.43 * c + .59) + .14), 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - .055, step(vec3(.0031308), c));
}
`;

export const sphereVS = `
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_uv;
uniform mat4 u_model, u_projection, u_view;
varying vec3 v_normal, v_tangent, v_world;
varying vec2 v_uv;
void main() {
  vec4 p = u_model * vec4(a_position, 1.0);
  v_world = p.xyz;
  v_normal = normalize(mat3(u_model) * a_normal);
  vec3 tangent = vec3(-a_normal.z, 0.0, a_normal.x);
  if (length(tangent) < .001) tangent = vec3(0.0, 0.0, 1.0);
  v_tangent = normalize(mat3(u_model) * normalize(tangent));
  v_uv = a_uv;
  gl_Position = u_projection * u_view * p;
}`;

export const sphereFS = `precision highp float;
uniform sampler2D u_texture, u_normal_texture, u_ring_texture;
uniform vec3 u_center, u_atmosphere;
uniform vec4 u_material; // normal strength, roughness, dielectric F0, haze
uniform float u_radius, u_planet;
varying vec3 v_normal, v_tangent, v_world;
varying vec2 v_uv;
${common}
float density(float r) {
  if (r < 1.24 || r > 2.30) return 0.0;
  return texture2D(u_ring_texture, vec2((r - 1.24) / 1.06, .5)).a;
}
float ringShadow(vec3 p) {
  float t = -dot(p, RING_NORMAL) / dot(SUN, RING_NORMAL);
  if (t <= 0.0) return 1.0;
  float r = length(p + SUN * t);
  // A small penumbra keeps fine radial features stable during transitions.
  float opacity = (density(r - .004) + 2.0 * density(r) + density(r + .004)) * .25;
  return 1.0 - opacity * .88;
}
float regolithDiffuse(float nl, float nv, float lv, float roughness) {
  // Oren–Nayar: unresolved dry grains scatter over a rough surface rather than
  // producing the broad plastic highlight of a smooth diffuse/specular blend.
  float variance = roughness * roughness * .38;
  float a = 1.0 - .5 * variance / (variance + .33);
  float b = .45 * variance / (variance + .09);
  float s = lv - nl * nv;
  float t = s > 0.0 ? max(max(nl, nv), .02) : 1.0;
  return nl * (a + b * s / t);
}
void main() {
  vec3 photographic = texture2D(u_texture, v_uv).rgb;
  vec3 albedo = linearRGB(photographic);
  vec4 detail = texture2D(u_normal_texture, v_uv);
  vec3 geometric = normalize(v_normal);
  vec3 t = normalize(v_tangent - geometric * dot(v_tangent, geometric));
  vec3 b = normalize(cross(t, geometric));
  vec3 tangentNormal = detail.rgb * 2.0 - 1.0;
  tangentNormal.xy *= u_material.x;
  vec3 n = normalize(t * tangentNormal.x + b * tangentNormal.y + geometric * max(.2, tangentNormal.z));
  vec3 v = normalize(u_eye - v_world), h = normalize(SUN + v);
  float ndl = max(dot(n, SUN), 0.0), ndv = max(dot(n, v), .001);
  float geometricLight = dot(geometric, SUN);
  // A bumped normal cannot see the sun through the body of the planet. This
  // matters for deep lunar craters and icy ridges along the geometric horizon.
  float horizon = smoothstep(-.007, .018, geometricLight);
  float rough = clamp(u_material.x > 0.0 ? detail.a : u_material.y, .24, 1.0);
  float alpha = rough * rough, a2 = alpha * alpha;
  float ndh = max(dot(n, h), 0.0), vdh = max(dot(v, h), 0.0);
  float denom = ndh * ndh * (a2 - 1.0) + 1.0;
  float distribution = a2 / max(PI * denom * denom, .0001);
  float k = (rough + 1.0) * (rough + 1.0) * .125;
  float geometry = ndl / (ndl * (1.0 - k) + k) * ndv / (ndv * (1.0 - k) + k);
  vec3 fresnel = vec3(u_material.z) + (1.0 - u_material.z) * pow(1.0 - vdh, 5.0);
  vec3 specular = distribution * geometry * fresnel / max(4.0 * ndl * ndv, .001);
  float shadow = u_planet > 2.5 && u_planet < 3.5 ? ringShadow((v_world - u_center) / u_radius) : 1.0;
  float diffuse = ndl;
  if (u_planet < 1.5) {
    diffuse = mix(ndl, regolithDiffuse(ndl, ndv, dot(SUN, v), rough) * 1.12, .66);
    // Lunar regolith has a modest backscattering response, not a velvet rim.
    if (u_planet < .5) diffuse = mix(diffuse, ndl / max(ndl + ndv, .02), .18);
  }
  // Keep cloud/ice highlights below the shoulder of the tone curve so their
  // measured brightness variation and fine bands remain legible in sunlight.
  vec3 light = vec3(1.0, .98, .95) * 3.50;
  if (u_planet > 1.5 && u_planet < 2.5) light = vec3(.96, 1.0, 1.035) * 2.85;
  if (u_planet > 2.5 && u_planet < 3.5) light *= .90;
  vec3 color = ((1.0 - fresnel) * albedo * diffuse / PI + specular * ndl) * light * shadow * horizon;
  // Extremely low artistic fill retains form without illuminating the night side.
  color += albedo * vec3(.008, .010, .015);
  if (u_planet > 3.5) {
    // View-dependent optical depth through Titan's thick aerosol envelope.
    // Cloud texture modulates density, not surface bump/specular highlights.
    float cloud = clamp((dot(photographic, vec3(.2126, .7152, .0722)) - .59) * 8.0, -.48, .48);
    float latitude = (v_uv.y - .5) * PI;
    float longitude = v_uv.x * 2.0 * PI;
    // Latitude-coherent aerosol layering is intentionally broad and subtle.
    // Most opacity variation still comes from NASA's observed cloud map.
    float layering = sin(latitude * 23.0 + .65 * sin(longitude * 3.0) * cos(latitude));
    layering += .28 * sin(latitude * 57.0 + .35 * sin(longitude * 5.0));
    float polarHood = smoothstep(.48, 1.25, abs(latitude));
    float opticalDepth = .40 + cloud * .32 + layering * .018 + polarHood * .065;
    float viewPath = 1.0 / max(.19, dot(geometric, v));
    // Blue light is absorbed more strongly by the orange aerosol column.
    // The long grazing path creates depth without a brighter additive halo.
    vec3 transmission = exp(-opticalDepth * viewPath * vec3(.78, 1.02, 1.42));
    float day = smoothstep(-.11, .88, geometricLight);
    vec3 aerosol = mix(u_atmosphere, albedo * 1.55, .34);
    float forwardScatter = .88 + .12 * pow(max(dot(SUN, v), 0.0), 3.0);
    vec3 scattered = aerosol * (.006 + .39 * day) * forwardScatter * (1.0 + cloud * .64 + layering * .032 - polarHood * .045);
    color = color * transmission + scattered * (1.0 - transmission);
  } else if (u_material.w > 0.0) {
    float rim = pow(1.0 - max(dot(geometric, v), 0.0), 3.5);
    color += u_atmosphere * rim * u_material.w * smoothstep(-.12, .6, dot(geometric, SUN));
  }
  gl_FragColor = vec4(displayRGB(color), 1.0);
}`;

export const atmosphereVS = `
attribute vec3 a_position;
uniform mat4 u_model, u_projection, u_view;
varying vec3 v_world;
void main() {
  vec4 p = u_model * vec4(a_position, 1.0);
  v_world = p.xyz;
  gl_Position = u_projection * u_view * p;
}`;

export const atmosphereFS = `precision highp float;
uniform vec3 u_center, u_color;
uniform float u_radius, u_shell, u_strength;
varying vec3 v_world;
${common}
void main() {
  // Integrate a short exponential-density ray through the actual spherical
  // atmosphere. Soft outer density prevents the old double-sided hard halo.
  vec3 eye = (u_eye - u_center) / u_radius;
  vec3 ray = normalize(v_world - u_eye);
  float projection = dot(eye, ray);
  float impact2 = dot(eye, eye) - projection * projection;
  float outer = u_shell;
  float halfChord = sqrt(max(outer * outer - impact2, 0.0));
  float start = -projection - halfChord;
  float end = -projection + halfChord;
  if (impact2 < 1.0) end = min(end, -projection - sqrt(1.0 - impact2));
  float stride = max(0.0, end - start) / 5.0;
  float depth = 0.0, illumination = 0.0;
  float scaleHeight = (outer - 1.0) * .25;
  for (int i = 0; i < 5; i++) {
    vec3 p = eye + ray * (start + (float(i) + .5) * stride);
    float altitude = max(0.0, length(p) - 1.0);
    float density = exp(-altitude / scaleHeight);
    if (u_shell > 1.025) {
      // Titan's detached haze is a faint second density layer. The broad
      // latitude modulation is continuous across the limb, with no noisy glow.
      float latitude = asin(clamp(normalize(p).y, -1.0, 1.0));
      float detached = exp(-pow((altitude / scaleHeight - 2.25) / .42, 2.0));
      density = density * (1.0 + .075 * sin(latitude * 23.0)) + detached * .085;
    }
    density *= 1.0 - smoothstep((outer - 1.0) * .6, outer - 1.0, altitude);
    float mu = dot(normalize(p), SUN);
    float sunPath = dot(p, SUN);
    float sunImpact2 = dot(p, p) - sunPath * sunPath;
    float sunlight = sunPath > 0.0 ? 1.0 : smoothstep(.995, 1.018, sunImpact2);
    float attenuation = exp(-density * .18 / max(.12, mu + .24));
    depth += density * stride / scaleHeight;
    illumination += density * stride / scaleHeight * sunlight * attenuation;
  }
  float opacity = (1.0 - exp(-depth * u_strength)) * .62;
  // The Titan surface pass already accounts for on-disc aerosol extinction.
  // Restrict this shell to the limb instead of washing the entire disc twice.
  if (u_shell > 1.025) opacity *= smoothstep(.88, 1.006, sqrt(max(impact2, 0.0)));
  float lit = illumination / max(depth, .0001);
  float phase = .76 + .24 * pow(max(dot(-ray, SUN), 0.0), 4.0);
  vec3 color = displayRGB(u_color * lit * phase * .54);
  // Premultiplied alpha: no unbounded additive glow or bloom.
  gl_FragColor = vec4(color * opacity, opacity);
}`;

export const ringVS = `
attribute vec3 a_position;
attribute vec2 a_uv;
uniform mat4 u_model, u_projection, u_view;
varying vec2 v_uv;
varying vec3 v_local, v_world;
void main() {
  v_uv = a_uv;
  v_local = a_position;
  vec4 p = u_model * vec4(a_position, 1.0);
  v_world = p.xyz;
  gl_Position = u_projection * u_view * p;
}`;

export const ringFS = `precision highp float;
uniform sampler2D u_texture;
varying vec2 v_uv;
varying vec3 v_local, v_world;
${common}
void main() {
  vec4 band = texture2D(u_texture, vec2(clamp((v_uv.x - 1.24) / 1.06, 0.0, 1.0), .5));
  if (band.a < .004) discard;
  float alongSun = dot(v_local, SUN);
  float closest = sqrt(max(0.0, dot(v_local, v_local) - alongSun * alongSun));
  float shadow = alongSun < 0.0 ? mix(.07, 1.0, smoothstep(.985, 1.015, closest)) : 1.0;
  float incidence = abs(dot(RING_NORMAL, SUN));
  vec3 view = normalize(u_eye - v_world);
  float viewing = max(.16, abs(dot(RING_NORMAL, view)));
  // Optical depth increases at grazing angles; thin C/A ring bands still transmit.
  float opticalDepth = -log(max(.025, 1.0 - band.a * .88));
  float opacity = 1.0 - exp(-opticalDepth / viewing);
  // Single-scattering response of an optically finite ice-particle sheet. Dense
  // B-ring strands reflect softly; low-density A/C strands remain translucent.
  float reflected = incidence / max(incidence + viewing, .08);
  float sameFace = step(0.0, dot(RING_NORMAL, SUN) * dot(RING_NORMAL, view));
  float transmission = exp(-opticalDepth / max(incidence, .08));
  float phase = .92 + .08 * pow(max(dot(SUN, view), 0.0), 6.0);
  float scattered = mix(.15 + transmission * .24, .22 + reflected * 1.12, sameFace);
  vec3 color = linearRGB(band.rgb) * vec3(1.0, .975, .93) * scattered * phase * shadow;
  gl_FragColor = vec4(displayRGB(color), opacity);
}`;
