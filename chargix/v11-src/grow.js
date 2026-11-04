// CHARGIX v11 · "From the ground up"
// A real-time WebGL desert. Scrolling plays one continuous shot: a seed in the sand opens, sprouts, grows
// into a palo verde tree, a pavilion store rises around it, the tree blooms gold and a garden spreads into
// the dunes while the day turns to dusk and the store lights up.
//
// Everything on screen is a pure function of one number, the smoothed scroll position p (0..1), so the
// whole shot plays backwards exactly as it plays forwards. Growth and construction run in the vertex
// shaders (per-vertex birth times + one uniform), so scrolling costs almost no JavaScript: per frame the
// CPU sets a few uniforms, moves the camera and the sun, and only re-renders the shadow map when the scene
// actually changed. Quality adapts to the device (pixel ratio, shadow size, instance counts).
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Vector3, Vector2, Matrix4, Quaternion, Euler, Object3D,
  BufferGeometry, BufferAttribute, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Mesh, Points, Group,
  PlaneGeometry, SphereGeometry, CylinderGeometry, BoxGeometry, LatheGeometry, ExtrudeGeometry, ShapeGeometry, Shape, Path,
  MeshStandardMaterial, MeshDepthMaterial, ShaderMaterial, PointsMaterial,
  DirectionalLight, HemisphereLight, PointLight, CanvasTexture, PMREMGenerator,
  SRGBColorSpace, ACESFilmicToneMapping, PCFSoftShadowMap, DoubleSide, BackSide, RGBADepthPacking, AdditiveBlending, MathUtils,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const root = document.querySelector('[data-grow]');
if (root) boot(root);

function boot(root) {
  root.classList.add('is-on');
  const canvas = root.querySelector('[data-grow-gl]');
  const stick = root.querySelector('[data-grow-stick]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const probe = document.createElement('canvas');
  const ok = !!(window.WebGL2RenderingContext && probe.getContext('webgl2'));
  if (!ok) { root.classList.add('is-still'); stills(root); return; }

  // ---------------------------------------------------------------------------------------------
  // helpers
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const ease3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // Catmull-Rom track over keyed rows [p, v0, v1, ...]: continuous velocity, so the camera never stops dead at a key.
  const track = (keys) => {
    const n = keys.length, w = keys[0].length - 1, out = new Array(w).fill(0);
    return (p) => {
      if (p <= keys[0][0]) { for (let j = 0; j < w; j++) out[j] = keys[0][j + 1]; return out; }
      if (p >= keys[n - 1][0]) { for (let j = 0; j < w; j++) out[j] = keys[n - 1][j + 1]; return out; }
      let i = 0; while (i < n - 2 && p > keys[i + 1][0]) i++;
      const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
      const h = k2[0] - k1[0], t = (p - k1[0]) / h, t2 = t * t, t3 = t2 * t;
      for (let j = 1; j <= w; j++) {
        const m1 = i === 0 ? 0 : ((k2[j] - k0[j]) / (k2[0] - k0[0])) * h;
        const m2 = i + 2 >= n ? 0 : ((k3[j] - k1[j]) / (k3[0] - k1[0])) * h;
        out[j - 1] = (2 * t3 - 3 * t2 + 1) * k1[j] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * k2[j] + (t3 - t2) * m2;
      }
      return out;
    };
  };
  const ctrack = (keys) => { const t = track(keys.map((k) => [k[0], ...new Color(k[1]).toArray()])); const c = new Color(); return (p) => c.fromArray(t(p)); };

  // 2D simplex noise (JS) for terrain and scattering.
  const perm = new Uint8Array(512); { const r = rng(7); const a = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } for (let i = 0; i < 512; i++) perm[i] = a[i & 255]; }
  const G2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  function snoise(x, y) {
    const F = 0.366025404, Gc = 0.211324865, s = (x + y) * F, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * Gc;
    const x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + Gc, y1 = y0 - j1 + Gc, x2 = x0 - 1 + 2 * Gc, y2 = y0 - 1 + 2 * Gc, ii = i & 255, jj = j & 255;
    let n = 0;
    const c = (gx, gy, xx, yy) => { let q = 0.5 - xx * xx - yy * yy; if (q < 0) return 0; q *= q; const g = G2[perm[gx + perm[gy]] & 7]; return q * q * (g[0] * xx + g[1] * yy); };
    n += c(ii, jj, x0, y0); n += c(ii + i1, jj + j1, x1, y1); n += c(ii + 1, jj + 1, x2, y2);
    return 70 * n;
  }
  const fbm = (x, y, o = 4) => { let a = 0.5, f = 1, s = 0; for (let k = 0; k < o; k++) { s += a * snoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; };

  // ---------------------------------------------------------------------------------------------
  // device class
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  const Q = mobile
    ? { dpr: 1.5, shadow: 1024, terrain: 170, grass: 1100, flowers: 320, leaves: 1, aa: true }
    : { dpr: 1.75, shadow: 2048, terrain: 230, grass: 2600, flowers: 700, leaves: 1, aa: true };

  let renderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance', alpha: false, stencil: false }); }
  catch (e) { root.classList.add('is-still'); stills(root); return; }
  // If the GPU drops the context (driver reset, too many tabs), switch to the stills rather than a frozen frame.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); active = false; root.classList.remove('is-gl'); root.classList.add('is-still'); stills(root); }, { once: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const fixedDpr = +new URLSearchParams(location.search).get('cxdpr') || 0; // for rendering posters and stills
  let dpr = fixedDpr || Math.min(devicePixelRatio || 1, Q.dpr);
  renderer.setPixelRatio(dpr);

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.01, 6000);

  // ---------------------------------------------------------------------------------------------
  // shared sky / fog uniforms. Every lit material fogs towards the exact sky colour in its view direction,
  // so the dunes melt into the horizon with no band.
  const U = {
    uZen: { value: new Color() }, uHor: { value: new Color() }, uSunCol: { value: new Color() }, uSunDir: { value: new Vector3(0, 1, 0) },
    uGlow: { value: 1 }, uHaze: { value: 1 }, uFogDen: { value: 0.002 }, uNight: { value: 0 }, uTime: { value: 0 }, uSunVis: { value: 1 },
    uLamp: { value: 0 },
  };
  const NOISE = /* glsl */`
    vec3 n_mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;} vec2 n_mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec3 n_perm(vec3 x){return n_mod289(((x*34.0)+1.0)*x);}
    float snoise(vec2 v){const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
      vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
      vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=n_mod289(i);vec3 p=n_perm(n_perm(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
      vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);m=m*m;m=m*m;
      vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;
      m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.0*dot(m,g);}
    float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
    float hash13(vec3 p3){p3=fract(p3*.1031);p3+=dot(p3,p3.zyx+31.32);return fract((p3.x+p3.y)*p3.z);}
  `;
  const SKY = /* glsl */`
    uniform vec3 uZen, uHor, uSunCol, uSunDir; uniform float uGlow, uHaze, uFogDen, uNight, uTime, uSunVis, uLamp;
    vec3 skyCol(vec3 d){
      float h = d.y;
      vec3 c = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.42));
      float s = max(dot(d, uSunDir), 0.0);
      vec2 a = normalize(d.xz + 1e-5), b = normalize(uSunDir.xz + 1e-5);
      float az = max(dot(a, b), 0.0);
      c += uSunCol * (pow(s, 6.0) * 0.22 + pow(s, 48.0) * 0.55 + pow(s, 900.0) * 2.0) * uGlow;
      c += uSunCol * pow(az, 4.0) * exp(-abs(h) * 7.0) * 0.35 * uHaze;
      return c;
    }
  `;
  const FOG = /* glsl */`
    { vec3 fv = vW - cameraPosition; float fd = length(fv);
      float fa = 1.0 - exp(-pow(fd * uFogDen, 1.3));
      fa *= mix(1.0, 0.6, smoothstep(4.0, 90.0, vW.y));
      vec3 sc = skyCol(fv / max(fd, 1e-4));
      #if defined( TONE_MAPPING )
        sc = toneMapping(sc);
      #endif
      sc = linearToOutputTexel(vec4(sc, 1.0)).rgb;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, sc, clamp(fa, 0.0, 1.0)); }
  `;
  // Patch a built-in material: world-position varying, sky fog, plus optional extra code.
  const patch = (mat, key, opt = {}) => {
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, opt.uniforms || {});
      let v = sh.vertexShader, f = sh.fragmentShader;
      v = v.replace('#include <common>', `#include <common>\nvarying vec3 vW;\n${NOISE}\n${SKY}\n${opt.vdecl || ''}`);
      if (opt.vbegin) v = v.replace('#include <begin_vertex>', opt.vbegin);
      if (opt.vnormal) v = v.replace('#include <beginnormal_vertex>', opt.vnormal);
      v = v.replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
          vW = (modelMatrix * wp).xyz; }`);
      f = f.replace('#include <common>', `#include <common>\nvarying vec3 vW;\n${NOISE}\n${SKY}\n${opt.fdecl || ''}`);
      if (opt.fcolor) f = f.replace('#include <color_fragment>', `#include <color_fragment>\n${opt.fcolor}`);
      if (opt.frough) f = f.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${opt.frough}`);
      if (opt.fnormal) f = f.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${opt.fnormal}`);
      if (opt.femit) f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${opt.femit}`);
      if (opt.falpha) f = f.replace('#include <opaque_fragment>', `${opt.falpha}\n#include <opaque_fragment>`);
      f = f.replace('#include <fog_fragment>', FOG);
      sh.vertexShader = v; sh.fragmentShader = f;
    };
    return mat;
  };
  // Depth material twin for shadow casting, sharing the vertex growth code.
  const depthTwin = (key, opt, extra = {}) => {
    const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, ...extra });
    m.customProgramCacheKey = () => key + '-depth';
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, opt.uniforms || {});
      let v = sh.vertexShader;
      v = v.replace('#include <common>', `#include <common>\n${NOISE}\n${SKY}\n${opt.vdecl || ''}`);
      if (opt.vbegin) v = v.replace('#include <begin_vertex>', opt.vbegin);
      sh.vertexShader = v;
    };
    return m;
  };

  // ---------------------------------------------------------------------------------------------
  // sky dome (drawn after opaque geometry, only where nothing else covers the pixel)
  const skyMat = new ShaderMaterial({
    uniforms: U, depthWrite: false, side: BackSide,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `${NOISE}\n${SKY}\nvarying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); vec3 c = skyCol(d);
        float s = dot(d, uSunDir);
        c += uSunCol * smoothstep(0.99988, 0.99994, s) * 40.0 * uSunVis + uSunCol * pow(max(s, 0.0), 2000.0) * 3.0 * uSunVis;
        if (uNight > 0.002 && d.y > 0.0) {
          vec3 p = d * 260.0; vec3 cell = floor(p); float h = hash13(cell);
          if (h > 0.985) { vec3 f = fract(p) - 0.5 - (vec3(hash13(cell + 1.7), hash13(cell + 3.1), hash13(cell + 5.3)) - 0.5) * 0.6;
            float st = smoothstep(0.11, 0.0, length(f)) * (0.55 + 0.45 * sin(uTime * (1.0 + h * 3.0) + h * 40.0));
            c += vec3(0.9, 0.93, 1.0) * st * uNight * smoothstep(0.0, 0.25, d.y) * (h - 0.985) * 400.0; }
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new Mesh(new SphereGeometry(1000, 48, 24), skyMat);
  sky.frustumCulled = false; sky.renderOrder = 1000; scene.add(sky);

  // ---------------------------------------------------------------------------------------------
  // terrain: one grid, dense at the centre (a seed's-eye view) and coarse at the horizon dunes
  const WIND = new Vector2(0.906, 0.423);
  function height(x, z) {
    const r = Math.hypot(x, z);
    const wx = x * WIND.x + z * WIND.y;
    const warp = fbm(x * 0.0035 + 3.1, z * 0.0035 - 1.7, 3) * 70 + fbm(x * 0.012, z * 0.012, 2) * 9;
    const t = (wx + warp) / 150, ph = t - Math.floor(t), c = 0.8;
    const prof = ph < c ? 0.5 - 0.5 * Math.cos((Math.PI * ph) / c) : 1 - Math.pow((ph - c) / (1 - c), 0.85);
    const amp = 16 * (0.45 + 0.55 * (0.5 + 0.5 * fbm(x * 0.002 + 9, z * 0.002 - 4, 3)));
    let h = prof * amp + 4 * fbm(x * 0.009 - 2, z * 0.009 + 5, 3);
    h *= 1 + smooth(250, 900, r) * 1.8;
    const near = 0.35 * fbm(x * 0.05, z * 0.05, 3) * smooth(18, 40, r) + 0.06 * fbm(x * 0.4, z * 0.4, 2);
    return lerp(near, h, smooth(34, 120, r));
  }
  const h0 = height(0, 0);
  const H = (x, z) => height(x, z) - h0;
  {
    const N = Q.terrain, R = 1400, a = 0.0035;
    const g = new PlaneGeometry(2, 2, N, N); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i), v = pos.getZ(i);
      const m = (s) => R * (a * s + (1 - a) * Math.sign(s) * Math.abs(s) ** 3);
      const x = m(u), z = m(v);
      pos.setXYZ(i, x, H(x, z), z);
    }
    g.computeVertexNormals();
    g.computeBoundingSphere();
    var terrainGeo = g;
  }
  const uWet = { value: 0 }, uGardenR = { value: 0 };
  const LIGHTS = [];
  const sandMat = patch(new MeshStandardMaterial({ color: new Color('#e2aa6c'), roughness: 0.92, metalness: 0 }), 'sand', {
    uniforms: { uWet, uGardenR, uPathL: { value: [] } },
    fdecl: `uniform float uWet, uGardenR; uniform vec3 uPathL[14];
      float rip(vec2 q, out float dh){
        vec2 w = vec2(0.906, 0.423);
        float warp = snoise(q * 0.31) * 0.42 + snoise(q * 1.9) * 0.05;
        float ph = (dot(q, w) + warp) * 8.5;
        float a = 6.2831853 * ph;
        dh = cos(a) + 0.55 * cos(2.0 * a);
        return ph;
      }`,
    fcolor: `
      vec2 q = vW.xz; float rq = length(q);
      float tone = snoise(q * 0.018) * 0.5 + snoise(q * 0.11) * 0.25 + snoise(q * 0.9) * 0.08;
      diffuseColor.rgb *= 1.0 + tone * 0.16;
      { float dg = distance(cameraPosition, vW); float gf = 1.0 - smoothstep(0.4, 2.5, dg);
        float gr = hash12(floor(q / 0.0009)) - 0.5; float gr2 = snoise(q * 140.0);
        diffuseColor.rgb *= 1.0 + (gr * 0.28 + gr2 * 0.08) * gf;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.33, 0.27), step(0.985, hash12(floor(q / 0.0011) + 7.0)) * gf * 0.7); }
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 0.98, 0.9), smoothstep(-0.2, 0.6, snoise(q * 0.004)));
      float edgeN = snoise(q * 0.35) * 0.9 + snoise(q * 2.1) * 0.25;
      float wet = 1.0 - smoothstep(uWet * 0.65, uWet, rq + edgeN * 0.2 * uWet);
      float garden = 1.0 - smoothstep(uGardenR * 0.78, uGardenR * 0.98, rq + edgeN * 2.0);
      garden *= step(0.01, uGardenR);
      vec3 soil = vec3(0.42, 0.30, 0.20) * (0.9 + 0.2 * snoise(q * 3.3));
      float grit = step(0.82, hash12(floor(q * 34.0)));
      soil = mix(soil, vec3(0.62, 0.55, 0.47), grit * 0.6);
      diffuseColor.rgb = mix(diffuseColor.rgb, soil, garden * 0.75);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.52, 0.45, 0.40), wet * 0.85);
    `,
    frough: `roughnessFactor = mix(roughnessFactor, 0.8, wet);`,
    fnormal: `{
      float dh; float ph = rip(vW.xz, dh);
      float fw = fwidth(ph);
      float amp = (1.0 - smoothstep(0.06, 0.3, fw)) * (1.0 - garden) * (1.0 - wet * 0.7);
      vec2 g = vec2(0.906, 0.423) * dh * 0.085 * amp;
      float dh2; float ph2 = rip(vW.xz * 0.23 + 17.0, dh2);
      float amp2 = (1.0 - smoothstep(0.06, 0.3, fwidth(ph2))) * (1.0 - garden);
      g += vec2(0.906, 0.423) * dh2 * 0.035 * amp2;
      normal = normalize(normal - (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz);
    }`,
    femit: `{
      float dcam = distance(cameraPosition, vW);
      vec2 cell = floor(vW.xz / 0.0016);
      float hs = hash12(cell) * step(length(fract(vW.xz / 0.0016) - 0.5), 0.28);
      vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
      vec3 vd = normalize(cameraPosition - vW);
      float spec = pow(max(dot(reflect(-uSunDir, nW), vd), 0.0), 6.0);
      totalEmissiveRadiance += uSunCol * step(0.9965, hs) * spec * (1.0 - smoothstep(0.25, 2.2, dcam)) * 2.2 * uSunVis;
      if (uLamp > 0.001) { // path-lamp pools only after dusk (uniform branch: free in daylight)
        vec3 lamp = vec3(0.0);
        for (int i = 0; i < 14; i++) { vec3 lp = uPathL[i]; float d2 = dot(vW.xz - lp.xz, vW.xz - lp.xz); lamp += vec3(1.0, 0.62, 0.3) * exp(-d2 * 0.55) * lp.y; }
        totalEmissiveRadiance += lamp * uLamp * 0.55 * diffuseColor.rgb;
      }
    }`,
  });
  const terrain = new Mesh(terrainGeo, sandMat);
  terrain.receiveShadow = true; scene.add(terrain);

  // ---------------------------------------------------------------------------------------------
  // the seed (a palo verde seed, oversized a little so it reads on a phone) and the sprout
  const R0 = rng(11);
  const seedGroup = new Group(); scene.add(seedGroup);
  const seedMat = patch(new MeshStandardMaterial({ color: new Color('#a8784a'), roughness: 0.3, metalness: 0 }), 'seed', {
    fcolor: `float st = snoise(vec2(vW.x * 900.0, vW.z * 60.0)); diffuseColor.rgb *= 0.86 + 0.18 * st;`,
    femit: `totalEmissiveRadiance += diffuseColor.rgb * (uSunCol * 0.22 * uSunVis + vec3(0.9, 0.7, 0.5) * 0.08);`,
  });
  const halfProfile = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; halfProfile.push(new Vector2(Math.sin(Math.PI * t) ** 0.8 * 0.0085 + 0.0002, (t - 0.5) * 0.034)); }
  const seedHalfGeo = new LatheGeometry(halfProfile, 24, 0, Math.PI);
  seedHalfGeo.rotateZ(Math.PI / 2); // long axis along x
  const capShape = new Shape(); halfProfile.forEach((v, i) => (i ? capShape.lineTo(v.x, v.y) : capShape.moveTo(v.x, v.y))); for (let i = halfProfile.length - 1; i >= 0; i--) capShape.lineTo(-halfProfile[i].x, halfProfile[i].y);
  const capGeo = new ShapeGeometry(capShape, 1); capGeo.rotateY(-Math.PI / 2); capGeo.rotateZ(Math.PI / 2);
  const innerMat = patch(new MeshStandardMaterial({ color: new Color('#d9c98f'), roughness: 0.6 }), 'seedin');
  const seedA = new Mesh(seedHalfGeo, seedMat), seedB = new Mesh(seedHalfGeo, seedMat);
  seedA.add(new Mesh(capGeo, innerMat)); seedB.add(new Mesh(capGeo, innerMat));
  seedB.rotation.x = Math.PI;
  seedA.castShadow = seedB.castShadow = true;
  seedGroup.add(seedA, seedB);
  seedGroup.position.set(0, 0.0045, 0); seedGroup.rotation.y = 0.5;

  // Sprout: a tube rebuilt on the CPU only while it changes (a few hundred vertices).
  const SPR = { rings: 36, sides: 8 };
  const sproutGeo = new BufferGeometry();
  const sp = new Float32Array((SPR.rings + 1) * (SPR.sides + 1) * 3), sn = new Float32Array(sp.length);
  const sidx = [];
  for (let i = 0; i < SPR.rings; i++) for (let j = 0; j < SPR.sides; j++) { const a = i * (SPR.sides + 1) + j, b = a + SPR.sides + 1; sidx.push(a, b, a + 1, b, b + 1, a + 1); }
  sproutGeo.setIndex(sidx); sproutGeo.setAttribute('position', new BufferAttribute(sp, 3)); sproutGeo.setAttribute('normal', new BufferAttribute(sn, 3));
  const stemMat = patch(new MeshStandardMaterial({ color: new Color('#93ab52'), roughness: 0.5 }), 'stem', {
    fcolor: `diffuseColor.rgb = mix(vec3(0.78, 0.62, 0.48), diffuseColor.rgb, smoothstep(0.0, 0.045, vW.y)) * (0.92 + 0.12 * snoise(vec2(vW.y * 900.0, 0.0)));`,
  });
  const sprout = new Mesh(sproutGeo, stemMat); sprout.castShadow = true; sprout.frustumCulled = false; scene.add(sprout);
  const cotGeo = new SphereGeometry(1, 20, 12); cotGeo.scale(0.0078, 0.0032, 0.0122); cotGeo.translate(0, 0, 0.0115);
  const cotMat = patch(new MeshStandardMaterial({ color: new Color('#7c973c'), roughness: 0.45 }), 'cot', {
    fcolor: `diffuseColor.rgb *= 0.9 + 0.15 * snoise(vW.xz * 400.0);`,
  });
  const cot1 = new Mesh(cotGeo, cotMat), cot2 = new Mesh(cotGeo, cotMat); cot1.castShadow = cot2.castShadow = true;
  scene.add(cot1, cot2);
  // first true leaves: little bipinnate fronds
  const frondGeo = (() => {
    const parts = [];
    for (let k = 0; k < 9; k++) {
      for (const side of [-1, 1]) {
        const l = new SphereGeometry(1, 8, 5); l.scale(0.0016, 0.0005, 0.0034);
        l.rotateY(side * 1.2); l.translate(side * 0.0032, 0, 0.004 + k * 0.0042); parts.push(l);
      }
    }
    const rach = new CylinderGeometry(0.0005, 0.0007, 0.042, 5, 1); rach.rotateX(Math.PI / 2); rach.translate(0, 0, 0.021); parts.push(rach);
    return mergeGeometries(parts.map((p) => p.toNonIndexed()));
  })();
  const fr1 = new Mesh(frondGeo, cotMat), fr2 = new Mesh(frondGeo, cotMat); fr1.castShadow = fr2.castShadow = true; scene.add(fr1, fr2);

  const tmpC = new Color(), tmpV = new Vector3(), tmpV2 = new Vector3(), tmpQ = new Quaternion(), tmpM = new Matrix4(), tmpE = new Euler(), UP = new Vector3(0, 1, 0);
  let sproutKey = '';
  const stemPt = (s, L, hook, out) => {
    // s along the stem (0 base .. 1 tip); hook bends the top third over (1 = fully hooked).
    const y = s * L - 0.004;
    const bendStart = 0.55; const b = s < bendStart ? 0 : (s - bendStart) / (1 - bendStart);
    const ang = hook * Math.PI * 0.95 * b * b;
    out.set(Math.sin(ang) * L * 0.18 * b, y - (1 - Math.cos(ang)) * L * 0.25 * b, 0);
    out.x += Math.sin(s * 3.1) * 0.0012;
    return out;
  };
  function buildSprout(L, hook, thick) {
    const key = `${L.toFixed(4)}|${hook.toFixed(3)}|${thick.toFixed(3)}`;
    if (key === sproutKey) return; sproutKey = key;
    const prev = new Vector3(), cur = new Vector3(), nxt = new Vector3(), T = new Vector3(), N = new Vector3(), B = new Vector3();
    for (let i = 0; i <= SPR.rings; i++) {
      const s = i / SPR.rings;
      stemPt(s, L, hook, cur); stemPt(Math.min(1, s + 0.01), L, hook, nxt); stemPt(Math.max(0, s - 0.01), L, hook, prev);
      T.subVectors(nxt, prev).normalize(); N.set(0, 0, 1); B.crossVectors(T, N).normalize(); N.crossVectors(B, T).normalize();
      const r = thick * (0.0022 - 0.0007 * s) * (L > 0.0005 ? 1 : 0);
      for (let j = 0; j <= SPR.sides; j++) {
        const a = (j / SPR.sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const o = (i * (SPR.sides + 1) + j) * 3;
        const nx = N.x * ca + B.x * sa, ny = N.y * ca + B.y * sa, nz = N.z * ca + B.z * sa;
        sp[o] = cur.x + nx * r; sp[o + 1] = cur.y + ny * r; sp[o + 2] = cur.z + nz * r;
        sn[o] = nx; sn[o + 1] = ny; sn[o + 2] = nz;
      }
    }
    sproutGeo.attributes.position.needsUpdate = true; sproutGeo.attributes.normal.needsUpdate = true;
    sproutGeo.computeBoundingSphere();
  }

  // ---------------------------------------------------------------------------------------------
  // the palo verde: branches grow in the vertex shader from per-vertex birth times
  const uG = { value: 0 }, uBloom = { value: 0 };
  const GROW_V = {
    vdecl: `uniform float uG; attribute vec3 aA; attribute vec3 aD; attribute vec3 aOff; attribute vec3 aTB;`,
    vbegin: `
      float sG = clamp((uG - aTB.y) / aTB.z, 0.0, 1.0);
      float tt = min(aTB.x, sG);
      vec3 axis = aA + aD * tt;
      float girth = mix(0.07, 1.0, smoothstep(0.0, 1.0, uG));
      float rf = clamp((sG - aTB.x) * 8.0 + 0.15 + sG * sG * sG * 0.85, 0.0, 1.0) * step(0.0001, sG);
      vec3 transformed = axis + aOff * girth * rf;
    `,
  };
  function buildTree(seed, scale = 1) {
    const r = rng(seed), segs = [];
    const add = (a, b, r0, r1, birth, dur, depth) => segs.push({ a, b, r0, r1, birth, dur, depth });
    const tips = []; // leaf cluster anchors
    const DUR = [0.17, 0.2, 0.17, 0.12];
    function branch(a, dir, len, r0, depth, birth) {
      const n = depth === 0 ? 2 : depth === 1 ? 3 : 2;
      let p = a.clone(), d = dir.clone().normalize(), b = birth;
      const dur = DUR[depth] / n;
      for (let i = 0; i < n; i++) {
        const l = len / n, q = p.clone().addScaledVector(d, l);
        const rA = r0 * (1 - 0.45 * (i / n)), rB = r0 * (1 - 0.45 * ((i + 1) / n));
        add(p.clone(), q, rA, rB, b, dur, depth);
        if (depth < 3) {
          const kids = depth === 0 ? (i === n - 1 ? 3 : 0) : depth === 1 ? 2 : 2 + ((r() * 2) | 0);
          for (let k = 0; k < kids; k++) {
            const f = depth === 0 ? 1 : 0.35 + 0.6 * r();
            const at = p.clone().lerp(q, f);
            const az = depth === 0 ? (k / kids) * Math.PI * 2 + r() * 0.6 : r() * Math.PI * 2;
            const tilt = depth === 0 ? 0.55 + r() * 0.2 : depth === 1 ? 0.85 + r() * 0.4 : 0.7 + r() * 0.6;
            const out = new Vector3(Math.cos(az), 0, Math.sin(az));
            const nd = d.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(out, Math.sin(tilt)).normalize();
            if (depth > 0) nd.y = Math.max(nd.y, 0.05);
            const nl = depth === 0 ? 2.5 + r() * 0.6 : depth === 1 ? 1.4 + r() * 0.5 : 0.65 + r() * 0.35;
            branch(at, nd, nl * scale, rB * (depth === 0 ? 0.62 : 0.55), depth + 1, b + dur * f + 0.01);
          }
        }
        if (depth >= 2) for (let k = 0; k < (depth === 3 ? 2 : 1); k++) tips.push({ p: p.clone().lerp(q, 0.4 + 0.6 * r()), birth: b + dur * 0.8, depth });
        if (depth === 0) for (let k = 0; k < 4; k++) { const f = 0.35 + 0.2 * k; tips.push({ p: p.clone().lerp(q, f), birth: b + dur * f + 0.005, depth: 0 }); }
        if (depth === 1 && i > 0) tips.push({ p: q.clone(), birth: b + dur * 0.5, depth });
        p = q;
        d.add(new Vector3((r() - 0.5) * 0.35, (r() - 0.35) * 0.25, (r() - 0.5) * 0.35)).normalize();
        if (depth === 0) d.lerp(UP, 0.6).normalize();
        b += dur;
      }
    }
    branch(new Vector3(0, -0.05, 0), new Vector3(0.06, 1, 0.03), 0.95 * scale, 0.17 * scale, 0, 0);
    // geometry
    const SIDES = [10, 8, 6, 5], LS = 4;
    let nv = 0; for (const s of segs) nv += (LS + 1) * (SIDES[s.depth] + 1);
    const A = new Float32Array(nv * 3), D = new Float32Array(nv * 3), O = new Float32Array(nv * 3), TB = new Float32Array(nv * 3), P = new Float32Array(nv * 3);
    const idx = []; let v = 0;
    const dir = new Vector3(), nA = new Vector3(), nB = new Vector3();
    for (const s of segs) {
      const S = SIDES[s.depth];
      dir.subVectors(s.b, s.a);
      const dn = dir.clone().normalize();
      nA.set(0, 1, 0); if (Math.abs(dn.y) > 0.9) nA.set(1, 0, 0);
      nB.crossVectors(dn, nA).normalize(); nA.crossVectors(nB, dn).normalize();
      const base = v;
      for (let i = 0; i <= LS; i++) {
        const t = i / LS, rad = lerp(s.r0, s.r1, t);
        for (let j = 0; j <= S; j++) {
          const a = (j / S) * Math.PI * 2, ox = nA.x * Math.cos(a) + nB.x * Math.sin(a), oy = nA.y * Math.cos(a) + nB.y * Math.sin(a), oz = nA.z * Math.cos(a) + nB.z * Math.sin(a);
          A.set([s.a.x, s.a.y, s.a.z], v * 3); D.set([dir.x, dir.y, dir.z], v * 3);
          O.set([ox * rad, oy * rad, oz * rad], v * 3); TB.set([t, s.birth, s.dur], v * 3);
          P.set([s.a.x + dir.x * t + ox * rad, s.a.y + dir.y * t + oy * rad, s.a.z + dir.z * t + oz * rad], v * 3);
          v++;
        }
      }
      for (let i = 0; i < LS; i++) for (let j = 0; j < S; j++) { const a = base + i * (S + 1) + j, b = a + S + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    const g = new BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new BufferAttribute(P, 3)); g.setAttribute('normal', new BufferAttribute(O.slice(), 3));
    g.setAttribute('aA', new BufferAttribute(A, 3)); g.setAttribute('aD', new BufferAttribute(D, 3));
    g.setAttribute('aOff', new BufferAttribute(O, 3)); g.setAttribute('aTB', new BufferAttribute(TB, 3));
    g.computeBoundingSphere(); g.boundingSphere.radius += 2;
    return { geo: g, tips };
  }
  const barkOpt = {
    ...GROW_V, uniforms: { uG }, fdecl: `uniform float uG;`,
    vnormal: `vec3 objectNormal = normalize(aOff + vec3(1e-6));`,
    fcolor: `
      float bn = snoise(vec2(vW.y * 3.0, atan(vW.z, vW.x) * 2.0)) * 0.5 + snoise(vW.xz * 9.0 + vW.y * 4.0) * 0.25;
      vec3 green = vec3(0.47, 0.55, 0.27), gray = vec3(0.52, 0.49, 0.42);
      diffuseColor.rgb = mix(green, gray, smoothstep(0.9, 0.0, vW.y) * 0.7 * smoothstep(0.45, 1.0, uG)) * (0.88 + bn * 0.2);
    `,
  };
  const barkMat = patch(new MeshStandardMaterial({ color: '#7f8f4e', roughness: 0.62 }), 'bark', barkOpt);

  // Foliage and blossom cards: crossed quads with painted textures, normals bent outwards for soft shading.
  function paintTex(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); const r = rng(kind === 'leaf' ? 3 : 5);
    x.lineCap = 'round';
    if (kind === 'leaf') {
      for (let f = 0; f < 15; f++) {
        const a0 = -Math.PI / 2 + (r() - 0.5) * 2.3, len = 150 + r() * 120, cx = 256 + (r() - 0.5) * 60, cy = 470 - r() * 40;
        const col = ['#5f7a33', '#6f8a3a', '#809a45', '#91a852', '#a2b65e'][(r() * 5) | 0];
        x.strokeStyle = '#55692b'; x.lineWidth = 2.2;
        x.beginPath(); x.moveTo(cx, cy);
        const pts = [];
        for (let k = 0; k <= 12; k++) { const t = k / 12, a = a0 + Math.sin(t * 2) * 0.25; const px = cx + Math.cos(a) * len * t, py = cy + Math.sin(a) * len * t; pts.push([px, py, a]); x.lineTo(px, py); }
        x.stroke();
        x.fillStyle = col;
        for (let k = 2; k < pts.length; k++) {
          const [px, py, a] = pts[k];
          for (const s of [-1, 1]) { x.save(); x.translate(px + Math.cos(a + s * 1.4) * 8, py + Math.sin(a + s * 1.4) * 8); x.rotate(a + s * 0.9); x.beginPath(); x.ellipse(0, 0, 7.5, 3, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
        }
      }
    } else {
      for (let f = 0; f < 10; f++) { const a = -Math.PI / 2 + (r() - 0.5) * 2.4, len = 120 + r() * 120; x.strokeStyle = '#6c7f39'; x.lineWidth = 2; x.beginPath(); x.moveTo(256, 470); x.lineTo(256 + Math.cos(a) * len, 470 + Math.sin(a) * len); x.stroke(); }
      for (let k = 0; k < 95; k++) {
        const ang = r() * Math.PI * 2, rad = Math.sqrt(r()) * 200, fx = 256 + Math.cos(ang) * rad, fy = 250 + Math.sin(ang) * rad * 0.8;
        const s = 8 + r() * 9, base = ['#f5c228', '#ffd34a', '#f0b41b', '#ffdd6b'][(r() * 4) | 0];
        x.save(); x.translate(fx, fy); x.rotate(r() * 6.28);
        for (let pI = 0; pI < 5; pI++) { x.rotate((Math.PI * 2) / 5); x.fillStyle = pI === 0 ? '#f7d04a' : base; x.beginPath(); x.ellipse(0, -s * 0.55, s * 0.42, s * 0.6, 0, 0, Math.PI * 2); x.fill(); }
        x.fillStyle = '#d9761f'; x.beginPath(); x.arc(0, 0, s * 0.22, 0, Math.PI * 2); x.fill();
        x.restore();
      }
    }
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t;
  }
  const leafTex = paintTex('leaf'), bloomTex = paintTex('bloom');
  const cardGeo = (() => {
    const parts = [];
    for (let k = 0; k < 3; k++) { const pl = new PlaneGeometry(1, 1); pl.translate(0, 0.5, 0); pl.rotateY((k / 3) * Math.PI); parts.push(pl); }
    const g = mergeGeometries(parts);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { tmpV.set(p.getX(i), p.getY(i) - 0.35, p.getZ(i)).normalize(); tmpV.y += 0.35; tmpV.normalize(); n.setXYZ(i, tmpV.x, tmpV.y, tmpV.z); }
    return g;
  })();
  const CARD_V = {
    vdecl: `uniform float uG; uniform float uBloom; uniform float uKind; attribute vec2 aBirth;`,
    vbegin: `
      float on = uKind < 0.5 ? smoothstep(aBirth.x, aBirth.x + 0.06, uG) : smoothstep(aBirth.x, aBirth.x + 0.05, uBloom);
      on *= (uKind < 0.5) ? 1.0 : 1.0;
      vec3 transformed = position * on;
      transformed.x += sin(uTime * 1.3 + aBirth.y * 6.0) * 0.015 * position.y;
    `,
  };
  function cards(tips, kind, scale, count, uniforms) {
    const r = rng(kind === 'leaf' ? 21 : 23);
    const list = tips.filter(() => true);
    const n = Math.min(count, list.length * (kind === 'leaf' ? 2 : 2));
    const mesh = new InstancedMesh(cardGeo, null, n);
    const birth = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const t = list[i % list.length];
      tmpV.copy(t.p).add(tmpV2.set((r() - 0.5) * 0.5, (r() - 0.3) * 0.4, (r() - 0.5) * 0.5).multiplyScalar(scale));
      const s = (t.depth === 0 ? 0.38 : t.depth === 1 ? 0.5 : 0.6 + r() * 0.35) * scale * (kind === 'leaf' ? 1 : 0.8);
      tmpE.set((r() - 0.5) * 0.7, r() * Math.PI * 2, (r() - 0.5) * 0.7); tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV, tmpQ, tmpV2.set(s, s * 0.8, s)); mesh.setMatrixAt(i, tmpM);
      const b = kind === 'leaf' ? t.birth + 0.02 + r() * 0.04 : clamp(0.05 + (t.p.y / 6) * 0.55 + r() * 0.3, 0, 0.92);
      birth[i * 2] = b; birth[i * 2 + 1] = r();
    }
    mesh.geometry = cardGeo.clone(); mesh.geometry.setAttribute('aBirth', new InstancedBufferAttribute(birth, 2));
    const opt = { ...CARD_V, uniforms };
    mesh.material = patch(new MeshStandardMaterial({ map: kind === 'leaf' ? leafTex : bloomTex, alphaTest: 0.42, side: DoubleSide, roughness: 0.75, alphaToCoverage: true }), 'card-' + kind, {
      ...opt,
      fcolor: kind === 'leaf' ? `diffuseColor.rgb *= vec3(0.95, 1.0, 0.92);` : `diffuseColor.rgb *= 1.08;`,
      femit: kind === 'leaf' ? `totalEmissiveRadiance += diffuseColor.rgb * uSunCol * 0.06 * uSunVis;` : `totalEmissiveRadiance += diffuseColor.rgb * (uSunCol * 0.1 * uSunVis + vec3(1.0, 0.7, 0.35) * uLamp * 0.25);`,
    });
    mesh.customDepthMaterial = depthTwin('card-' + kind, opt, { map: kind === 'leaf' ? leafTex : bloomTex, alphaTest: 0.42 });
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); mesh.frustumCulled = false;
    return mesh;
  }
  const trees = [];
  function addTree(seed, scale, at, rot, uniformsG, uniformsBloom, leafN, bloomN) {
    const t = buildTree(seed, scale);
    const grp = new Group(); grp.position.copy(at); grp.rotation.y = rot;
    const bm = barkMat.clone(); bm.onBeforeCompile = barkMat.onBeforeCompile; bm.customProgramCacheKey = barkMat.customProgramCacheKey;
    const opt = { ...barkOpt, uniforms: { uG: uniformsG } };
    patch(bm, 'bark', opt);
    const trunk = new Mesh(t.geo, bm); trunk.castShadow = true; trunk.receiveShadow = true;
    trunk.customDepthMaterial = depthTwin('bark', opt);
    const leaves = cards(t.tips, 'leaf', scale, leafN, { uG: uniformsG, uBloom: uniformsBloom, uKind: { value: 0 } });
    const blooms = cards(t.tips, 'bloom', scale, bloomN, { uG: uniformsG, uBloom: uniformsBloom, uKind: { value: 1 } });
    grp.add(trunk, leaves, blooms); scene.add(grp);
    trees.push(grp); return grp;
  }
  const mainTree = addTree(5, 1, new Vector3(0, 0, 0), 0.4, uG, uBloom, mobile ? 380 : 520, mobile ? 320 : 460);
  const uG2 = { value: 0 }, uBloom2 = { value: 0 };
  const sat = [[13.5, 18.5, 0.55, 2], [-16, 17, 0.5, 4], [21, -6, 0.6, 1], [-24, 4, 0.5, 3], [-7, 30, 0.45, 5]];
  for (const [x, z, s, k] of (mobile ? sat.slice(0, 3) : sat)) addTree(40 + k, s, new Vector3(x, H(x, z), z), k, uG2, uBloom2, mobile ? 120 : 200, mobile ? 90 : 160);

  // ---------------------------------------------------------------------------------------------
  // architecture: a travertine plinth, rammed-earth walls, bronze columns, a roof with an oculus over
  // the tree, glass, and a small store inside. Parts rise out of the sand; the roof is laid outwards.
  const arch = new Group(); scene.add(arch);
  const uRoofR = { value: 0 };
  const trav = patch(new MeshStandardMaterial({ color: '#c9b28f', roughness: 0.72 }), 'trav', {
    fcolor: `float vn = snoise(vec2(vW.x * 0.6 + snoise(vW.xz * 0.2) * 2.0, vW.y * 9.0 + vW.z * 0.3)); diffuseColor.rgb *= 0.93 + vn * 0.06; diffuseColor.rgb -= step(0.93, hash12(floor(vW.xz * 40.0))) * 0.05;`,
  });
  const earthMat = patch(new MeshStandardMaterial({ color: '#b07c55', roughness: 0.92 }), 'earth', {
    fcolor: `float L = vW.y * 7.0 + snoise(vec2(vW.x + vW.z, vW.y) * 0.35) * 1.2; float band = snoise(vec2(floor(L) * 1.7, 0.5));
      vec3 e1 = vec3(0.63, 0.44, 0.30), e2 = vec3(0.72, 0.53, 0.37), e3 = vec3(0.55, 0.38, 0.27);
      diffuseColor.rgb = mix(mix(e1, e2, smoothstep(-0.4, 0.4, band)), e3, smoothstep(0.5, 0.9, band)) * (0.94 + 0.08 * snoise(vW.xz * 4.0 + vW.y * 9.0));`,
  });
  const roofMat = patch(new MeshStandardMaterial({ color: '#a8977f', roughness: 0.9, side: DoubleSide }), 'roof', {
    uniforms: { uRoofR }, fdecl: `uniform float uRoofR;`,
    fcolor: `float rr = length(vW.xz); if (rr > uRoofR) discard; float gv = hash12(floor(vW.xz * 60.0)); diffuseColor.rgb *= 0.86 + 0.2 * gv + 0.06 * snoise(vW.xz * 0.15);`,
  });
  const soffitMat = patch(new MeshStandardMaterial({ color: '#8a5b3c', roughness: 0.6, side: DoubleSide }), 'soffit', {
    uniforms: { uRoofR }, fdecl: `uniform float uRoofR;`,
    fcolor: `float rr = length(vW.xz); if (rr > uRoofR) discard; diffuseColor.rgb *= 0.85 + 0.15 * snoise(vec2(vW.x * 0.4, vW.z * 30.0));`,
    femit: `{ vec2 g = fract(vW.xz / 2.4) - 0.5; float dl = smoothstep(0.09, 0.05, length(g)); totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * dl * uLamp * 6.0; }`,
  });
  const bronze = patch(new MeshStandardMaterial({ color: '#3a2c22', roughness: 0.38, metalness: 0.75 }), 'bronze');
  const PL = { w: 32, d: 25, y: 0.5 };
  const rectShape = (w, d, cx = 0, cz = 0) => { const s = new Shape(); s.moveTo(cx - w / 2, cz - d / 2); s.lineTo(cx + w / 2, cz - d / 2); s.lineTo(cx + w / 2, cz + d / 2); s.lineTo(cx - w / 2, cz + d / 2); s.closePath(); return s; };
  const holeC = (r, n = 72) => { const p = new Path(); p.absarc(0, 0, r, 0, Math.PI * 2, true); return p; };
  const flatExtrude = (shape, depth, y) => { const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 72 }); g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g; };
  // plinth with the courtyard hole, plus the pool apron in front
  const plShape = rectShape(PL.w, PL.d); plShape.holes.push(holeC(4.8));
  const plinth = new Mesh(flatExtrude(plShape, 1.3, PL.y), trav); plinth.receiveShadow = plinth.castShadow = true; arch.add(plinth);
  const apron = rectShape(26, 6.4, 0, PL.d / 2 + 3.2); apron.holes.push((() => { const p = new Path(); p.moveTo(-10.5, PL.d / 2 + 1.4); p.lineTo(-10.5, PL.d / 2 + 5); p.lineTo(10.5, PL.d / 2 + 5); p.lineTo(10.5, PL.d / 2 + 1.4); p.closePath(); return p; })());
  const apronM = new Mesh(flatExtrude(apron, 1.3, PL.y - 0.05), trav); apronM.receiveShadow = apronM.castShadow = true; arch.add(apronM);
  const waterMat = patch(new MeshStandardMaterial({ color: '#0a1f22', roughness: 0.06, metalness: 0.0, envMapIntensity: 0.65 }), 'water', {
    fnormal: `{ vec2 q = vW.xz; float t = uTime; vec2 g = vec2(snoise(q * 5.0 + t * 0.4) - snoise(q * 5.0 + vec2(0.02, 0.0) + t * 0.4), snoise(q * 5.0 + t * 0.4) - snoise(q * 5.0 + vec2(0.0, 0.02) + t * 0.4)) * 0.35 + vec2(snoise(q * 13.0 - t * 0.6), snoise(q * 13.0 + 3.0 - t * 0.6)) * 0.015;
      normal = normalize(normal + (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz); }`,
    femit: `totalEmissiveRadiance += vec3(0.95, 0.6, 0.3) * uLamp * 0.06;`,
  });
  const water = new Mesh(new PlaneGeometry(21, 3.6).rotateX(-Math.PI / 2), waterMat);
  water.position.set(0, 0, PL.d / 2 + 3.2); water.receiveShadow = true; arch.add(water);
  // walls (rammed earth) reaching into the dunes
  const walls = [];
  const wallDefs = [[-27, -7.5, 26, 1.0, 3.4], [25, 5, 18, 0.9, 2.6], [-20.5, 12.5, 9, 0.8, 2.2], [0, -8.45, 27.5, 0.7, 4.3]];
  for (const [x, z, len, th, h] of wallDefs) {
    const g = new BoxGeometry(len, h + 2, th); g.translate(0, (h + 2) / 2 - 2, 0);
    const m = new Mesh(g, earthMat); m.position.set(x, 0, z); m.castShadow = m.receiveShadow = true; m.userData.h = h + 2.2; arch.add(m); walls.push(m);
  }
  walls[3].rotation.y = 0; // back wall of the store
  // columns
  const colPos = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; colPos.push([Math.cos(a) * 5.4, Math.sin(a) * 5.4]); }
  for (const x of [-12, -6, 0, 6, 12]) { colPos.push([x, 9.6]); }
  for (const z of [-5, 3]) { colPos.push([-13.2, z]); colPos.push([13.2, z]); }
  const uCol = { value: 0 };
  const colOpt = { uniforms: { uCol }, vdecl: `uniform float uCol; attribute float aB;`, vbegin: `float cg = smoothstep(aB, aB + 0.25, uCol); vec3 transformed = vec3(position.x, position.y * cg, position.z);` };
  const colGeo = new CylinderGeometry(0.09, 0.09, 3.8, 10); colGeo.translate(0, 1.9, 0);
  const colMesh = new InstancedMesh(colGeo.clone(), patch(bronze.clone(), 'col', colOpt), colPos.length);
  const colB = new Float32Array(colPos.length);
  colPos.forEach(([x, z], i) => { tmpM.makeTranslation(x, PL.y, z); colMesh.setMatrixAt(i, tmpM); colB[i] = clamp(Math.hypot(x, z) / 20) * 0.75; });
  colMesh.geometry.setAttribute('aB', new InstancedBufferAttribute(colB, 1));
  colMesh.customDepthMaterial = depthTwin('col', colOpt); colMesh.castShadow = true; colMesh.frustumCulled = false; arch.add(colMesh);
  // roof slab + wood soffit
  const RF = { w: 30, d: 21, y: 4.3, t: 0.34 };
  const rfShape = rectShape(RF.w, RF.d, 0, 0.6); rfShape.holes.push(holeC(5.7));
  const roof = new Mesh(flatExtrude(rfShape, RF.t, RF.y + RF.t), roofMat); roof.castShadow = roof.receiveShadow = true; arch.add(roof);
  roof.customDepthMaterial = depthTwin('roof', { uniforms: { uRoofR } });
  roof.customDepthMaterial.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uRoofR });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW2;').replace('#include <project_vertex>', '#include <project_vertex>\nvW2 = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW2; uniform float uRoofR;').replace('void main() {', 'void main() { if (length(vW2.xz) > uRoofR) discard;');
  };
  // bronze fascia around the roof edge, laid with the roof
  const fasMat = patch(new MeshStandardMaterial({ color: '#4a3526', roughness: 0.32, metalness: 0.8 }), 'fascia', {
    uniforms: { uRoofR }, fdecl: `uniform float uRoofR;`,
    fcolor: `if (length(vW.xz) > uRoofR + 0.2) discard;`,
    femit: `totalEmissiveRadiance += vec3(1.0, 0.7, 0.4) * uLamp * 0.35 * smoothstep(0.2, 0.0, abs(vW.y - ${(RF.y + 0.04).toFixed(2)}));`,
  });
  const fascia = new Mesh(mergeGeometries([
    new BoxGeometry(RF.w + 0.16, 0.46, 0.08).translate(0, RF.y + 0.17, 0.6 + RF.d / 2 + 0.04),
    new BoxGeometry(RF.w + 0.16, 0.46, 0.08).translate(0, RF.y + 0.17, 0.6 - RF.d / 2 - 0.04),
    new BoxGeometry(0.08, 0.46, RF.d).translate(RF.w / 2 + 0.04, RF.y + 0.17, 0.6),
    new BoxGeometry(0.08, 0.46, RF.d).translate(-RF.w / 2 - 0.04, RF.y + 0.17, 0.6),
  ]), fasMat);
  fascia.castShadow = true; arch.add(fascia);
  const sofGeo = new ShapeGeometry(rfShape, 72); sofGeo.rotateX(Math.PI / 2); sofGeo.translate(0, RF.y - 0.005, 0);
  const soffit = new Mesh(sofGeo, soffitMat); arch.add(soffit);
  // glass: courtyard ring + outer facade with mullions; transparent at normal incidence, mirror-like at grazing
  const uGlass = { value: 0 };
  const glassMat = patch(new MeshStandardMaterial({ color: '#8fa3ad', roughness: 0.03, metalness: 0, transparent: true, depthWrite: false, side: DoubleSide, envMapIntensity: 1.0 }), 'glass', {
    uniforms: { uGlass }, fdecl: `uniform float uGlass; varying vec2 vUv2;`, vdecl: `varying vec2 vUv2;`,
    vbegin: `vec3 transformed = vec3(position); vUv2 = uv;`,
    fcolor: `if (vUv2.y > uGlass - 0.002) discard;`,
    falpha: `{ float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0); diffuseColor.a = mix(0.1, 0.8, fres);
      float mul = step(0.985, fract(vUv2.x * 22.0)) + step(0.97, fract(vUv2.y * 1.0)) ;
      if (mul > 0.5) { outgoingLight = vec3(0.04, 0.035, 0.03); diffuseColor.a = 1.0; } }`,
  });
  const ring = new Mesh(new CylinderGeometry(5.0, 5.0, 3.8, 96, 1, true), glassMat); ring.position.y = PL.y + 1.9; arch.add(ring);
  const facadeGeo = (() => {
    const W = RF.w - 4, Dd = RF.d - 4.4, hgt = 3.8, parts = [];
    const add = (w, x, z, ry) => { const g = new PlaneGeometry(w, hgt); g.rotateY(ry); g.translate(x, PL.y + hgt / 2, z + 0.6); parts.push(g); };
    add(W, 0, Dd / 2, 0); add(Dd, W / 2, 0, Math.PI / 2); add(Dd, -W / 2, 0, -Math.PI / 2);
    return mergeGeometries(parts);
  })();
  const facade = new Mesh(facadeGeo, glassMat); arch.add(facade);
  // the store inside: display plinths with products, a long lit shelf, a counter
  const oak = patch(new MeshStandardMaterial({ color: '#9a6a43', roughness: 0.55 }), 'oak', { fcolor: `diffuseColor.rgb *= 0.88 + 0.14 * snoise(vec2(vW.x * 0.8, vW.z * 26.0 + vW.y * 26.0));` });
  const uStore = { value: 0 };
  const storeOpt = { uniforms: { uStore }, vdecl: `uniform float uStore; attribute float aB;`, vbegin: `float sgr = smoothstep(aB, aB + 0.18, uStore); vec3 transformed = position * sgr;` };
  const prodCols = ['#efe6d6', '#1d1a18', '#c98a4a', '#e9d2b0', '#7a5135', '#f3efe8'];
  function storeSet() {
    const r = rng(31), boxes = [], bottles = [], plinths = [];
    const spots = [[-9, 4.5], [-9, -2.2], [9, 4.5], [9, -2.2], [0, 7.6], [-4.8, 7.4], [4.8, 7.4]];
    for (const [x, z] of spots) {
      plinths.push([x, z, 1.5, 0.95, 0.9]);
      for (let k = 0; k < 4; k++) { const px = x + (r() - 0.5) * 1.0, pz = z + (r() - 0.5) * 0.5; if (r() > 0.45) boxes.push([px, PL.y + 0.95, pz, 0.18 + r() * 0.14, 0.12 + r() * 0.2, 0.12 + r() * 0.08, (r() * prodCols.length) | 0]); else bottles.push([px, PL.y + 0.95, pz, 0.6 + r() * 0.5, (r() * prodCols.length) | 0]); }
    }
    return { boxes, bottles, plinths };
  }
  const S = storeSet();
  const instBoxes = (list, mat, key, geoF) => {
    const m = new InstancedMesh(geoF(), patch(mat, key, storeOpt), list.length);
    const b = new Float32Array(list.length);
    list.forEach((e, i) => { const [x, y, z, sx, sy, sz, ci] = e; tmpM.compose(tmpV.set(x, y, z), tmpQ.identity(), tmpV2.set(sx, sy, sz)); m.setMatrixAt(i, tmpM); if (ci !== undefined) m.setColorAt(i, new Color(prodCols[ci])); b[i] = 0.15 + (i / list.length) * 0.6; });
    m.geometry.setAttribute('aB', new InstancedBufferAttribute(b, 1));
    m.customDepthMaterial = depthTwin('store', storeOpt);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; arch.add(m); return m;
  };
  const unitBox = () => { const g = new BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; };
  instBoxes(S.plinths.map(([x, z, w, h, d]) => [x, PL.y, z, w, h, d]), trav.clone(), 'plinth', unitBox);
  instBoxes(S.boxes, new MeshStandardMaterial({ roughness: 0.6 }), 'prod', unitBox);
  instBoxes(S.bottles.map(([x, y, z, h, ci]) => [x, y, z, 0.32, h * 0.4, 0.32, ci]), new MeshStandardMaterial({ roughness: 0.25 }), 'bottle', () => { const g = new LatheGeometry([new Vector2(0, 0), new Vector2(0.18, 0), new Vector2(0.2, 0.05), new Vector2(0.2, 0.62), new Vector2(0.09, 0.78), new Vector2(0.06, 0.95), new Vector2(0.065, 1), new Vector2(0, 1)], 14); return g; });
  // the long shelf on the back wall, backlit at dusk
  const shelfMat = patch(new MeshStandardMaterial({ color: '#3a2a1f', roughness: 0.5 }), 'shelf', {
    femit: `totalEmissiveRadiance += vec3(1.0, 0.68, 0.36) * uLamp * 1.4 * smoothstep(0.3, 0.0, abs(fract(vW.y * 1.1 + 0.2) - 0.5) - 0.2);`,
  });
  const shelf = new Mesh(new BoxGeometry(20, 3.2, 0.25).translate(0, 1.6, 0), shelfMat); shelf.position.set(0, PL.y, -7.98); arch.add(shelf);
  const counter = new Mesh(new BoxGeometry(4.2, 1.05, 0.9).translate(0, 0.525, 0), oak); counter.position.set(-8.6, PL.y, -5.2); counter.castShadow = counter.receiveShadow = true; arch.add(counter);
  // path stones and lights out to the dunes
  const pathPts = []; for (let i = 0; i < 14; i++) { const t = i / 13; pathPts.push([Math.sin(t * 2.2) * 6 + 2, PL.d / 2 + 7.5 + t * 34]); }
  const stoneGeo = new BoxGeometry(1.6, 0.16, 0.9); stoneGeo.translate(0, 0.02, 0);
  const stones = new InstancedMesh(stoneGeo, patch(trav.clone(), 'stone', { ...storeOpt, uniforms: { uStore: uGardenR }, vdecl: `uniform float uStore; attribute float aB;`, vbegin: `float sgr = smoothstep(aB, aB + 3.0, uStore); vec3 transformed = position * sgr;` }), pathPts.length * 2);
  const stB = new Float32Array(pathPts.length * 2);
  pathPts.forEach(([x, z], i) => { for (let k = 0; k < 2; k++) { const zz = z + k * 1.2, xx = x + (k - 0.5) * 0.3; tmpE.set(0, 0.1 * Math.sin(i), 0); tmpQ.setFromEuler(tmpE); tmpM.compose(tmpV.set(xx, H(xx, zz), zz), tmpQ, tmpV2.set(1, 1, 1)); stones.setMatrixAt(i * 2 + k, tmpM); stB[i * 2 + k] = Math.hypot(xx, zz) - 1; } });
  stones.geometry.setAttribute('aB', new InstancedBufferAttribute(stB, 1)); stones.receiveShadow = true; stones.frustumCulled = false; arch.add(stones);
  const lampPos = pathPts.map(([x, z], i) => [x + (i % 2 ? 1.3 : -1.3), z + 0.6]);
  sandMat.userData.lamps = lampPos;
  const bollGeo = new CylinderGeometry(0.07, 0.09, 0.6, 8); bollGeo.translate(0, 0.3, 0);
  const bollMat = patch(new MeshStandardMaterial({ color: '#2b211b', roughness: 0.4, metalness: 0.6 }), 'boll', {
    uniforms: { uStore: uGardenR },
    vdecl: `uniform float uStore; attribute float aB; varying float vLy;`, fdecl: `varying float vLy;`,
    vbegin: `float sgr = smoothstep(aB, aB + 3.0, uStore); vec3 transformed = position * sgr; vLy = position.y;`,
    femit: `totalEmissiveRadiance += vec3(1.0, 0.65, 0.32) * uLamp * 5.0 * smoothstep(0.47, 0.56, vLy);`,
  });
  const boll = new InstancedMesh(bollGeo, bollMat, lampPos.length);
  const bB = new Float32Array(lampPos.length);
  lampPos.forEach(([x, z], i) => { tmpM.makeTranslation(x, H(x, z), z); boll.setMatrixAt(i, tmpM); bB[i] = Math.hypot(x, z) - 1; });
  boll.geometry.setAttribute('aB', new InstancedBufferAttribute(bB, 1)); boll.frustumCulled = false; arch.add(boll);
  const pathU = sandMat.onBeforeCompile;
  sandMat.onBeforeCompile = (sh) => { pathU(sh); sh.uniforms.uPathL = { value: lampPos.map(([x, z]) => new Vector3(x, 1, z)) }; };

  // ---------------------------------------------------------------------------------------------
  // the garden: desert grass, agaves and gold wildflowers spreading from the courtyard into the dunes
  const inBuilding = (x, z) => (Math.abs(x) < PL.w / 2 + 0.3 && Math.abs(z) < PL.d / 2 + 0.3 && Math.hypot(x, z) > 4.6) || (Math.abs(x) < 13.3 && z > PL.d / 2 - 0.2 && z < PL.d / 2 + 6.6);
  const onWall = (x, z) => wallDefs.some(([wx, wz, len, th]) => Math.abs(x - wx) < len / 2 + 0.4 && Math.abs(z - wz) < th / 2 + 0.4);
  function scatter(n, seed, maxR, accept) {
    const r = rng(seed), out = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 40) {
      const a = r() * Math.PI * 2, rr = Math.pow(r(), 0.75) * maxR, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (inBuilding(x, z) || onWall(x, z)) continue;
      if (!accept(x, z, rr, r)) continue;
      out.push([x, z, r()]);
    }
    return out;
  }
  const density = (x, z, rr, r) => {
    if (rr < 4.5) return r() < 0.9;
    const nearB = Math.max(Math.abs(x) - PL.w / 2, Math.abs(z) - PL.d / 2);
    const path = pathPts.some(([px, pz]) => Math.hypot(x - px, z - pz) < 3.2);
    const n = fbm(x * 0.08, z * 0.08, 2);
    const p = (nearB < 5 ? 0.85 : 0) + (path ? 0.7 : 0) + clamp(1 - rr / 50) * 0.55 + n * 0.5;
    return r() < p;
  };
  const GRASS_V = {
    uniforms: { uGardenR }, vdecl: `uniform float uGardenR; attribute vec2 aGB; attribute float aH;`,
    vbegin: `
      float gg = smoothstep(aGB.x, aGB.x + 2.5, uGardenR);
      vec3 transformed = position * gg;
      float sway = sin(uTime * 1.7 + aGB.y * 9.0 + position.x * 3.0) * 0.06 + sin(uTime * 0.7 + aGB.y * 3.0) * 0.04;
      transformed.x += sway * aH * aH * gg; transformed.z += sway * 0.6 * aH * aH * gg;
    `,
  };
  const grassGeo = (() => {
    const r = rng(77), P = [], C = [], Hh = [], I = [];
    let v = 0;
    for (let b = 0; b < 9; b++) {
      const a = r() * Math.PI * 2, ox = Math.cos(a) * r() * 0.07, oz = Math.sin(a) * r() * 0.07, h = 0.38 + r() * 0.42, lean = 0.12 + r() * 0.35, w = 0.012 + r() * 0.006;
      const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
      for (let k = 0; k <= 4; k++) {
        const t = k / 4, bend = lean * t * t, ww = w * (1 - t * 0.92);
        const cx = ox + dx * bend, cy = h * t * (1 - lean * t * 0.25), cz = oz + dz * bend;
        P.push(cx - px * ww, cy, cz - pz * ww, cx + px * ww, cy, cz + pz * ww);
        const c0 = [0.30, 0.31, 0.15], c1 = [0.62, 0.58, 0.33], c2 = [0.86, 0.79, 0.56];
        const cc = t < 0.5 ? c0.map((q, i) => lerp(q, c1[i], t * 2)) : c1.map((q, i) => lerp(q, c2[i], (t - 0.5) * 2));
        C.push(...cc, ...cc); Hh.push(t, t);
        if (k < 4) I.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        v += 2;
      }
    }
    const g = new BufferGeometry(); g.setIndex(I);
    g.setAttribute('position', new Float32BufferAttribute(P, 3)); g.setAttribute('color', new Float32BufferAttribute(C, 3)); g.setAttribute('aH', new Float32BufferAttribute(Hh, 1));
    g.computeVertexNormals();
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { tmpV.set(n.getX(i), n.getY(i), n.getZ(i)).lerp(UP, 0.65).normalize(); n.setXYZ(i, tmpV.x, tmpV.y, tmpV.z); }
    return g;
  })();
  const grassPts = scatter(Q.grass, 91, 56, density);
  const grass = new InstancedMesh(grassGeo, patch(new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: DoubleSide }), 'grass', {
    ...GRASS_V, femit: `totalEmissiveRadiance += diffuseColor.rgb * uSunCol * 0.05 * uSunVis;`,
  }), grassPts.length);
  {
    const gb = new Float32Array(grassPts.length * 2);
    grassPts.forEach(([x, z, r], i) => { const s = 0.7 + r * 0.8; tmpE.set(0, r * 6.28, 0); tmpQ.setFromEuler(tmpE); tmpM.compose(tmpV.set(x, H(x, z) - 0.02, z), tmpQ, tmpV2.set(s, s * (0.8 + r * 0.5), s)); grass.setMatrixAt(i, tmpM); const rr = Math.hypot(x, z); gb[i * 2] = rr < 4.6 ? rr * 0.8 : rr; gb[i * 2 + 1] = r; if (rr < 4.6) { tmpM.compose(tmpV.set(x, H(x, z) - 0.02, z), tmpQ, tmpV2.set(s * 0.6, s * 0.5, s * 0.6)); grass.setMatrixAt(i, tmpM); } });
    grass.geometry.setAttribute('aGB', new InstancedBufferAttribute(gb, 2));
    grass.receiveShadow = true; grass.frustumCulled = false; scene.add(grass);
  }
  // agave rosettes
  const agaveGeo = (() => {
    const r = rng(55), parts = [];
    for (let k = 0; k < 22; k++) {
      const whorl = k < 8 ? 0 : k < 15 ? 1 : 2, a = (k / (whorl === 0 ? 8 : whorl === 1 ? 7 : 7)) * Math.PI * 2 + whorl * 0.4;
      const len = [0.95, 0.75, 0.5][whorl] * (0.85 + r() * 0.3), tilt = [1.05, 0.7, 0.35][whorl];
      const g = new CylinderGeometry(0.001, 0.07, len, 4, 6); g.scale(1, 1, 0.45); g.translate(0, len / 2, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) / len; p.setZ(i, p.getZ(i) + y * y * 0.18); }
      g.rotateX(tilt); g.rotateY(a);
      parts.push(g.toNonIndexed());
    }
    const g = mergeGeometries(parts); g.computeVertexNormals();
    const c = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) { const y = clamp(g.attributes.position.getY(i) / 0.8); c.set([lerp(0.55, 0.42, y), lerp(0.62, 0.55, y), lerp(0.55, 0.47, y)], i * 3); }
    g.setAttribute('color', new BufferAttribute(c, 3));
    return g;
  })();
  const agPts = scatter(mobile ? 28 : 46, 17, 34, (x, z, rr, r) => rr > 5 && (Math.max(Math.abs(x) - PL.w / 2, Math.abs(z) - PL.d / 2) < 7 || pathPts.some(([px, pz]) => Math.hypot(x - px, z - pz) < 4)) && r() < 0.8);
  const agave = new InstancedMesh(agaveGeo, patch(new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), 'agave', { ...GRASS_V, vdecl: GRASS_V.vdecl, vbegin: `float gg = smoothstep(aGB.x, aGB.x + 2.5, uGardenR); vec3 transformed = position * gg;` }), agPts.length);
  {
    const gb = new Float32Array(agPts.length * 2), hh = new Float32Array(agaveGeo.attributes.position.count);
    agPts.forEach(([x, z, r], i) => { const s = 0.8 + r * 0.7; tmpE.set(0, r * 6.28, 0); tmpQ.setFromEuler(tmpE); tmpM.compose(tmpV.set(x, H(x, z) - 0.05, z), tmpQ, tmpV2.set(s, s, s)); agave.setMatrixAt(i, tmpM); gb[i * 2] = Math.hypot(x, z) + 1; gb[i * 2 + 1] = r; });
    agave.geometry.setAttribute('aGB', new InstancedBufferAttribute(gb, 2)); agave.geometry.setAttribute('aH', new BufferAttribute(hh, 1));
    agave.castShadow = agave.receiveShadow = true; agave.frustumCulled = false;
    agave.customDepthMaterial = depthTwin('agave', { uniforms: { uGardenR }, vdecl: GRASS_V.vdecl, vbegin: `float gg = smoothstep(aGB.x, aGB.x + 2.5, uGardenR); vec3 transformed = position * gg;` });
    scene.add(agave);
  }
  // wildflowers (desert marigold): little gold heads on stems
  const flowerGeo = (() => {
    const parts = [];
    const stem = new CylinderGeometry(0.004, 0.006, 0.3, 4); stem.translate(0, 0.15, 0); parts.push(stem.toNonIndexed());
    const head = new CylinderGeometry(0.035, 0.03, 0.012, 10); head.translate(0, 0.305, 0); parts.push(head.toNonIndexed());
    const g = mergeGeometries(parts);
    const c = new Float32Array(g.attributes.position.count * 3), hh = new Float32Array(g.attributes.position.count);
    for (let i = 0; i < g.attributes.position.count; i++) { const y = g.attributes.position.getY(i); c.set(y > 0.29 ? [0.98, 0.74, 0.12] : [0.45, 0.5, 0.3], i * 3); hh[i] = y / 0.31; }
    g.setAttribute('color', new BufferAttribute(c, 3)); g.setAttribute('aH', new BufferAttribute(hh, 1));
    return g;
  })();
  const flPts = scatter(Q.flowers, 63, 50, density);
  const flowers = new InstancedMesh(flowerGeo, patch(new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), 'flower', { ...GRASS_V, femit: `totalEmissiveRadiance += diffuseColor.rgb * uSunCol * 0.08 * uSunVis;` }), flPts.length);
  {
    const gb = new Float32Array(flPts.length * 2);
    flPts.forEach(([x, z, r], i) => { const s = 0.8 + r * 0.6; tmpM.compose(tmpV.set(x + 0.3, H(x, z), z), tmpQ.identity(), tmpV2.set(s, s, s)); flowers.setMatrixAt(i, tmpM); gb[i * 2] = Math.hypot(x, z) + 2.5; gb[i * 2 + 1] = r; });
    flowers.geometry.setAttribute('aGB', new InstancedBufferAttribute(gb, 2)); flowers.frustumCulled = false; scene.add(flowers);
  }

  // ---------------------------------------------------------------------------------------------
  // wind-blown sand and falling blossoms (points, animated in the vertex shader)
  const sandPts = (() => {
    const n = mobile ? 700 : 1400, r = rng(99), p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.set([r(), r(), r()], i * 3);
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(p, 3));
    const m = new ShaderMaterial({
      uniforms: { ...U, uBox: { value: new Vector3(1, 1, 1) }, uCtr: { value: new Vector3() }, uPx: { value: 1 }, uAlpha: { value: 1 } },
      transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime, uPx; uniform vec3 uBox, uCtr; varying float vA;
        void main(){ vec3 q = position; q.x = fract(q.x + uTime * 0.05 * (0.6 + q.y)); q.z = fract(q.z + uTime * 0.022 * (0.6 + q.y));
          vec3 w = uCtr + (q - vec3(0.5, 0.0, 0.5)) * uBox; w.y = uCtr.y + q.y * q.y * uBox.y;
          vec4 mv = modelViewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uPx * (0.6 + fract(position.x * 91.0) * 1.4) / -mv.z, 1.0, 6.0);
          vA = (1.0 - q.y) * smoothstep(0.0, 0.08, q.x) * smoothstep(1.0, 0.92, q.x); }`,
      fragmentShader: `uniform float uAlpha; uniform vec3 uSunCol; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; gl_FragColor = vec4(mix(vec3(0.95, 0.78, 0.55), uSunCol, 0.3), (1.0 - d * 2.0) * vA * 0.5 * uAlpha); }`,
    });
    const pts = new Points(g, m); pts.frustumCulled = false; scene.add(pts); return pts;
  })();
  const petals = (() => {
    const n = mobile ? 90 : 180, r = rng(42), p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.set([(r() - 0.5) * 9, r(), (r() - 0.5) * 9], i * 3);
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(p, 3));
    const m = new ShaderMaterial({
      uniforms: { ...U, uPx: { value: 1 }, uAlpha: { value: 0 } }, transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime, uPx; varying float vA; void main(){ vec3 q = position; float t = fract(q.y + uTime * 0.035);
        vec3 w = vec3(q.x + sin(uTime * 0.8 + q.x * 3.0) * 0.4 + t * 1.5, 5.6 * (1.0 - t), q.z + cos(uTime * 0.7 + q.z * 2.0) * 0.4);
        vec4 mv = modelViewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(uPx * 0.05 / -mv.z, 1.0, 8.0); vA = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.85, t); }`,
      fragmentShader: `uniform float uAlpha; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; if (abs(c.x) * 1.6 + abs(c.y) > 0.5) discard; gl_FragColor = vec4(1.0, 0.8, 0.25, vA * uAlpha); }`,
    });
    const pts = new Points(g, m); pts.frustumCulled = false; scene.add(pts); return pts;
  })();
  // the glint that marks the seed from far away
  const glint = (() => {
    const m = new ShaderMaterial({ uniforms: { uA: { value: 1 }, uS: { value: 30 }, uTime: U.uTime }, transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
      vertexShader: `uniform float uS; void main(){ vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uS; }`,
      fragmentShader: `uniform float uA, uTime; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
        float star = max(0.0, 1.0 - abs(c.x) * 40.0) * smoothstep(0.5, 0.0, abs(c.y)) + max(0.0, 1.0 - abs(c.y) * 40.0) * smoothstep(0.5, 0.0, abs(c.x));
        float core = exp(-d * d * 120.0); float pulse = 0.8 + 0.2 * sin(uTime * 2.2);
        gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * (core * 1.2 + star * 0.5) * uA * pulse, 1.0); }` });
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
    const p = new Points(g, m); p.position.set(0, 0.012, 0); p.frustumCulled = false; p.renderOrder = 2000; scene.add(p); return p;
  })();

  // ---------------------------------------------------------------------------------------------
  // lights
  const sun = new DirectionalLight('#ffffff', 3);
  sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const hemi = new HemisphereLight('#9fb6d6', '#b08a64', 0.8); scene.add(hemi);
  const storeLight = new PointLight('#ffb36b', 0, 26, 1.6); storeLight.position.set(0, 3.6, -3); scene.add(storeLight);
  const treeLight = new PointLight('#ffc27a', 0, 18, 1.6); treeLight.position.set(1.2, 1.1, 2.0); scene.add(treeLight);

  // Reflections for glass, water and bronze: a few pre-baked sky environments, picked by time of day.
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Scene(); const envSky = new Mesh(new SphereGeometry(100, 32, 16), skyMat); envSky.frustumCulled = false; envScene.add(envSky);
  const envs = [];
  const envMats = [glassMat, waterMat, bronze, colMesh.material, fasMat];
  const ENV_P = [0.05, 0.35, 0.6, 0.78, 0.92];

  // ---------------------------------------------------------------------------------------------
  // the timeline (all in p, 0..1)
  // time of day: sun elevation and azimuth (deg), sky palette
  const SUN = track([[0, 8.5, 25], [0.12, 17, 40], [0.24, 21, 55], [0.36, 26, 75], [0.5, 32, 110], [0.62, 22, 150], [0.72, 9, 175], [0.8, 2, 188], [0.88, -3.5, 196], [1, -7, 202]]);
  const ZEN = ctrack([[0, '#5a86c2'], [0.3, '#3f76c0'], [0.55, '#3a72bd'], [0.72, '#41639a'], [0.8, '#36507e'], [0.88, '#1f2f52'], [1, '#0c1427']]);
  const HOR = ctrack([[0, '#f7cc96'], [0.3, '#ecdcc4'], [0.55, '#eadcc6'], [0.72, '#f6b878'], [0.8, '#f5904c'], [0.88, '#b9714e'], [1, '#33384c']]);
  const SUNC = ctrack([[0, '#ffad55'], [0.14, '#ffc47e'], [0.3, '#ffecd2'], [0.55, '#fff1de'], [0.7, '#ffbf80'], [0.8, '#ff8c42'], [0.88, '#ff7a3d'], [1, '#ff7a3d']]);
  const MISC = track([
    // p, exposure, sunI, hemiI, fogDen, glow, haze
    [0, 0.95, 7.5, 0.5, 0.0021, 1.2, 1.3],
    [0.14, 0.85, 6.5, 0.55, 0.0016, 1.0, 1.0],
    [0.3, 0.72, 5.6, 0.6, 0.0013, 0.8, 0.8],
    [0.55, 0.64, 5.4, 0.62, 0.0012, 0.8, 0.8],
    [0.72, 0.8, 5.5, 0.55, 0.0016, 1.1, 1.2],
    [0.8, 0.95, 3.4, 0.5, 0.0019, 1.3, 1.5],
    [0.88, 1.35, 0.0, 0.5, 0.0021, 0.9, 1.2],
    [1, 1.7, 0.0, 0.42, 0.0019, 0.5, 0.7],
  ]);
  // camera: target xyz, distance (log), azimuth, elevation (deg), fov
  const CAM = track([
    [0.0, 0, 1.25, 0, Math.log(17), 196, 2.2, 42],
    [0.06, 0, 0.6, 0, Math.log(5), 186, 4.5, 40],
    [0.12, 0, 0.016, 0, Math.log(0.26), 166, 13, 33],
    [0.2, 0, 0.026, 0, Math.log(0.29), 172, 9, 33],
    [0.27, 0, 0.06, 0, Math.log(0.4), 182, 8, 34],
    [0.34, 0, 0.22, 0, Math.log(1.25), 196, 8, 36],
    [0.42, 0, 0.75, 0, Math.log(3.6), 214, 9, 38],
    [0.5, 0, 1.7, 0.4, Math.log(13), 236, 13, 40],
    [0.58, 0, 2.4, 1.0, Math.log(30), 262, 17, 40],
    [0.67, 0, 3.4, 1.5, Math.log(26), 292, 9, 40],
    [0.76, 0, 3.2, 3, Math.log(40), 332, 8.5, 40],
    [0.86, 0, 3.0, 4, Math.log(46), 368, 9.5, 40],
    [1.0, 0, 3.0, 4, Math.log(62), 384, 13, 40],
  ]);

  // ---------------------------------------------------------------------------------------------
  // DOM: chapters, bar, hero
  const put = (el, k, v) => { const c = el.__g || (el.__g = {}); if (c[k] !== v) { c[k] = v; if (k[0] === '-') el.style.setProperty(k, v); else el.style[k] = v; } };
  const chapters = [...root.querySelectorAll('[data-ch]')].map((el) => ({ el, a: +el.dataset.from, b: +el.dataset.to, hold: el.hasAttribute('data-hold') }));
  const bars = [...root.querySelectorAll('[data-bar]')].map((el) => ({ el, a: +el.dataset.from, b: +el.dataset.to, on: null }));
  const hero = root.querySelector('[data-grow-hero]'), poster = root.querySelector('[data-grow-poster]'), scrim = root.querySelector('[data-grow-scrim]');
  const cue = root.querySelector('[data-grow-cue]');

  // ---------------------------------------------------------------------------------------------
  // state
  let W = 1, Hh = 1, aspect = 1, top = 0, len = 1, pT = 0, p = 0, last = 0, active = true, shown = false, frameN = 0;
  let ftAvg = 16, slow = 0, fast = 0;
  const camPos = new Vector3(), camTgt = new Vector3(), lastShadow = { k: '' };
  function measure() {
    W = stick.clientWidth; Hh = stick.clientHeight; aspect = W / Hh;
    renderer.setSize(W, Hh, false);
    camera.aspect = aspect;
    const r = root.getBoundingClientRect(); top = r.top + scrollY; len = Math.max(1, root.offsetHeight - Hh);
    const px = Hh * dpr;
    sandPts.material.uniforms.uPx.value = px * 0.006; petals.material.uniforms.uPx.value = px;
  }
  const readP = () => clamp((scrollY - top) / len);

  function setTime(pp) {
    const [el, az] = SUN(pp);
    const e = MathUtils.degToRad(el), a = MathUtils.degToRad(az);
    U.uSunDir.value.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).normalize();
    U.uZen.value.copy(ZEN(pp)); U.uHor.value.copy(HOR(pp)); U.uSunCol.value.copy(SUNC(pp));
    const [exp, sunI, hemiI, fog, glow, haze] = MISC(pp);
    renderer.toneMappingExposure = exp;
    U.uFogDen.value = fog; U.uGlow.value = glow; U.uHaze.value = haze;
    U.uSunVis.value = smooth(-2.5, 1.5, el);
    U.uNight.value = smooth(0.84, 0.97, pp);
    U.uLamp.value = smooth(0.74, 0.86, pp);
    sun.color.copy(U.uSunCol.value); sun.intensity = sunI * U.uSunVis.value;
    hemi.color.copy(U.uZen.value).lerp(U.uHor.value, 0.35).lerp(tmpC.set('#3d5277'), U.uNight.value * 0.7); hemi.groundColor.set('#a67f5a').multiplyScalar(0.6 + 0.4 * U.uSunVis.value); hemi.intensity = hemiI;
    storeLight.intensity = U.uLamp.value * 140; treeLight.intensity = U.uLamp.value * 110;
    return el;
  }
  function pickEnv(pp) {
    if (!envs.length) return;
    let i = 0; for (let k = 1; k < ENV_P.length; k++) if (Math.abs(ENV_P[k] - pp) < Math.abs(ENV_P[i] - pp)) i = k;
    for (const m of envMats) if (m.envMap !== envs[i]) { m.envMap = envs[i]; m.needsUpdate = false; }
  }

  function update(pp, t) {
    U.uTime.value = t * 0.001;
    const el = setTime(pp);
    // story state
    const opn = smooth(0.12, 0.17, pp);
    seedA.rotation.x = -opn * 0.45; seedB.rotation.x = Math.PI + opn * 0.45;
    const sink = smooth(0.3, 0.38, pp);
    seedGroup.position.y = 0.0045 - sink * 0.012; seedGroup.scale.setScalar(1 - smooth(0.34, 0.4, pp));
    const L = 0.06 * smooth(0.13, 0.25, pp) + 0.035 * smooth(0.25, 0.34, pp);
    const hook = 1 - smooth(0.17, 0.235, pp);
    const sproutOn = 1 - smooth(0.36, 0.42, pp);
    buildSprout(L * sproutOn, hook, sproutOn);
    sprout.visible = L * sproutOn > 0.001;
    // cotyledons at the stem tip
    stemPt(1, L, hook, tmpV);
    const unfold = smooth(0.19, 0.25, pp), cs = smooth(0.15, 0.2, pp) * sproutOn;
    for (const [m, s] of [[cot1, 1], [cot2, -1]]) {
      m.position.copy(tmpV); m.scale.setScalar(Math.max(0.0001, cs * (0.7 + 0.3 * unfold)));
      m.rotation.set(0, s > 0 ? 0 : Math.PI, 0);
      m.rotateX(lerp(1.5 - hook * 0.4, -0.25, unfold));
      m.visible = cs > 0.001;
    }
    const fu = smooth(0.24, 0.31, pp) * sproutOn;
    for (const [m, s] of [[fr1, 1], [fr2, -1]]) {
      m.position.copy(tmpV); m.position.y += 0.002; m.scale.setScalar(Math.max(0.0001, fu));
      m.rotation.set(0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0); m.rotateX(lerp(1.2, -0.5, fu)); m.visible = fu > 0.001;
    }
    uWet.value = 0.04 * smooth(0.14, 0.2, pp) + 0.5 * smooth(0.24, 0.36, pp) + 4 * smooth(0.36, 0.46, pp);
    uG.value = smooth(0.3, 0.74, pp); mainTree.scale.setScalar(1 + 0.45 * ease3(smooth(0.5, 0.76, pp)));
    uBloom.value = smooth(0.62, 0.8, pp);
    uG2.value = smooth(0.6, 0.8, pp); uBloom2.value = smooth(0.7, 0.86, pp);
    uGardenR.value = 4.8 * smooth(0.47, 0.57, pp) + 52 * smooth(0.6, 0.84, pp);
    // construction
    const rise = (a, b) => ease3(smooth(a, b, pp));
    plinth.position.y = -1.9 * (1 - rise(0.44, 0.5)); apronM.position.y = -1.9 * (1 - rise(0.46, 0.52));
    water.position.y = lerp(-1.2, PL.y - 0.1, rise(0.6, 0.68));
    walls.forEach((w, i) => { const k = rise(0.45 + i * 0.02, 0.53 + i * 0.02); w.position.y = -w.userData.h * (1 - k); w.visible = k > 0.0001; });
    plinth.visible = plinth.position.y > -1.89; apronM.visible = apronM.position.y > -1.89; water.visible = pp > 0.6;
    uCol.value = smooth(0.49, 0.56, pp); colMesh.visible = uCol.value > 0;
    uRoofR.value = 5.7 + 34 * ease3(smooth(0.535, 0.6, pp));
    roof.visible = soffit.visible = uRoofR.value > 5.75; fascia.visible = uRoofR.value > 15;
    uGlass.value = smooth(0.58, 0.64, pp); ring.visible = facade.visible = uGlass.value > 0.002;
    uStore.value = smooth(0.6, 0.7, pp);
    { const st = Math.max(0.0001, ease3(smooth(0.58, 0.66, pp))); shelf.scale.y = st; counter.scale.y = st; shelf.visible = counter.visible = st > 0.001; }
    // particles / glint
    glint.material.uniforms.uA.value = 1 - smooth(0.02, 0.09, pp);
    glint.material.uniforms.uS.value = 18 + 26 * (1 - smooth(0, 0.08, pp));
    petals.material.uniforms.uAlpha.value = smooth(0.66, 0.72, pp) * (1 - smooth(0.88, 0.96, pp));
    // camera
    const c = CAM(pp);
    const dist = Math.exp(c[3]) * (aspect < 0.8 ? lerp(1, 1.45, smooth(0.32, 0.5, pp)) * (pp < 0.3 ? 1.08 : 1) : 1);
    const az = MathUtils.degToRad(c[4] + Math.sin(t * 0.00011) * 1.2), elv = MathUtils.degToRad(c[5] + Math.sin(t * 0.00017) * 0.4);
    camTgt.set(c[0], c[1], c[2]);
    camPos.set(Math.cos(elv) * Math.sin(az), Math.sin(elv), Math.cos(elv) * Math.cos(az)).multiplyScalar(dist).add(camTgt);
    const gy = H(camPos.x, camPos.z) + Math.max(0.012, dist * 0.04);
    if (camPos.y < gy) camPos.y = gy;
    camera.position.copy(camPos); camera.lookAt(camTgt);
    camera.fov = c[6] * (aspect < 0.8 ? 1.12 : 1); camera.near = Math.max(0.004, dist * 0.015); camera.far = 6000;
    camera.updateProjectionMatrix();
    // composition: subject right of the text on desktop, above the text on phones
    const sx = aspect >= 0.8 ? -0.22 * smooth(0.05, 0.14, pp) * (1 - smooth(0.82, 0.95, pp)) : 0;
    const sy = aspect < 0.8 ? -0.16 * (1 - smooth(0.9, 1, pp)) : -0.04;
    camera.projectionMatrix.elements[8] = sx; camera.projectionMatrix.elements[9] = sy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    sky.position.copy(camera.position);
    // sand particles follow the view
    const sp2 = sandPts.material.uniforms;
    sp2.uCtr.value.set(camTgt.x, H(camTgt.x, camTgt.z) - 0.02, camTgt.z); sp2.uBox.value.set(dist * 1.6, Math.max(0.06, dist * 0.18), dist * 1.6);
    sp2.uAlpha.value = (1 - smooth(0.62, 0.8, pp)) * (reduce ? 0 : 1);
    // shadow frustum follows the subject's scale
    const sz = clamp(dist * 0.55, 0.12, 46);
    sun.target.position.copy(camTgt); sun.target.position.y = 0;
    sun.position.copy(U.uSunDir.value).multiplyScalar(Math.max(4, sz * 3)).add(sun.target.position);
    const sc = sun.shadow.camera; sc.left = -sz; sc.right = sz; sc.top = sz; sc.bottom = -sz; sc.near = 0.01; sc.far = Math.max(8, sz * 6); sc.updateProjectionMatrix();
    sun.shadow.normalBias = sz * 0.0025; sun.shadow.bias = -0.00025;
    const key = `${pp.toFixed(4)}|${W}x${Hh}`;
    if (key !== lastShadow.k) { lastShadow.k = key; renderer.shadowMap.needsUpdate = true; }
    pickEnv(pp);
    // overlays
    if (hero) { const ho = 1 - smooth(0.0, 0.045, pp); put(hero, 'opacity', ho.toFixed(3)); put(hero, 'transform', `translateY(${(-(1 - ho) * 30).toFixed(1)}px)`); put(hero, 'visibility', ho < 0.01 ? 'hidden' : 'visible'); }
    if (cue) put(cue, 'opacity', (1 - smooth(0, 0.03, pp)).toFixed(3));
    let scr = 0;
    for (const ch of chapters) {
      const o = ch.hold ? smooth(ch.a, ch.a + 0.02, pp) : Math.min(smooth(ch.a, ch.a + 0.02, pp), 1 - smooth(ch.b - 0.02, ch.b, pp));
      put(ch.el, 'opacity', o.toFixed(3)); put(ch.el, 'transform', `translateY(${((1 - o) * 18).toFixed(1)}px)`); put(ch.el, 'visibility', o < 0.01 ? 'hidden' : 'visible');
      scr = Math.max(scr, o);
    }
    if (scrim) put(scrim, 'opacity', Math.max(scr, 1 - smooth(0, 0.05, pp)).toFixed(3));
    for (const b of bars) { put(b.el, '--f', clamp((pp - b.a) / (b.b - b.a)).toFixed(3)); const on = pp >= b.a && pp < b.b; if (on !== b.on) { b.on = on; b.el.classList.toggle('is-on', on); } }
    put(root, '--p', pp.toFixed(4));
  }

  // ---------------------------------------------------------------------------------------------
  // loop: smoothed scroll, adaptive resolution, render only while the stage is on screen
  let raf = 0;
  function frame(t) {
    raf = 0;
    if (!active || document.hidden) return;
    const dt = Math.min(64, t - (last || t)); last = t;
    pT = readP();
    p = reduce ? pT : p + (pT - p) * (1 - Math.exp(-dt / 110));
    if (Math.abs(pT - p) < 0.00005) p = pT;
    const t0 = performance.now();
    update(p, t);
    renderer.render(scene, camera);
    frameN++;
    if (!shown && frameN > 2) { shown = true; root.classList.add('is-gl'); }
    // adaptive pixel ratio from frame-to-frame time
    if (frameN > 30 && !fixedDpr) {
      ftAvg = ftAvg * 0.94 + dt * 0.06;
      if (ftAvg > 21) { slow++; fast = 0; } else if (ftAvg < 14.5) { fast++; slow = 0; } else { slow = fast = 0; }
      if (slow > 45 && dpr > 0.75) { dpr = Math.max(0.75, dpr - 0.2); renderer.setPixelRatio(dpr); measure(); slow = 0; ftAvg = 16; }
      if (fast > 240 && dpr < Math.min(devicePixelRatio || 1, Q.dpr)) { dpr = Math.min(Math.min(devicePixelRatio || 1, Q.dpr), dpr + 0.15); renderer.setPixelRatio(dpr); measure(); fast = 0; }
    }
    window.__cxGrow.cpu = performance.now() - t0;
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && active && !document.hidden) raf = requestAnimationFrame(frame); };
  window.__cxGrow = { p: () => p, target: () => pT, dpr: () => dpr, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }), cpu: 0, ready: false, frames: () => frameN, jump: (v) => { p = pT = v; }, dbg: { scene, terrain, arch, grass, sky, sun, U } };

  new IntersectionObserver((es) => { active = es.some((e) => e.isIntersecting); if (active) { last = 0; kick(); } }, { rootMargin: '10% 0px' }).observe(root);
  document.addEventListener('visibilitychange', () => { last = 0; kick(); });
  addEventListener('resize', () => { measure(); lastShadow.k = ''; kick(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); kick(); }).observe(root);

  measure();
  // compile every program up front (async where the driver allows) so nothing hitches when it first appears
  (async () => {
    p = pT = readP();
    update(p, performance.now());
    for (const [i, pp] of ENV_P.entries()) { setTime(pp); envs[i] = pmrem.fromScene(envScene, 0, 1, 2000).texture; }
    setTime(p); pickEnv(p);
    for (const m of envMats) m.needsUpdate = true;
    // Everything that is hidden at p = 0 is shown for one warm-up render under the poster, so its shaders
    // (and shadow shaders) are compiled now instead of the moment it first appears.
    const hidden = [sprout, cot1, cot2, fr1, fr2, roof, soffit, fascia, shelf, counter, plinth, apronM, water, colMesh, ring, facade, ...walls];
    for (const o of hidden) o.visible = true;
    try { await renderer.compileAsync(scene, camera); } catch (e) { /* compiled on the warm-up render instead */ }
    renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera);
    update(p, performance.now());
    renderer.shadowMap.needsUpdate = true;
    window.__cxGrow.ready = true;
    kick();
  })();
}

// No WebGL2 (or it failed): crossfade the pre-rendered stills with the scroll so the story still reads.
function stills(root) {
  const imgs = [...root.querySelectorAll('[data-still]')], chapters = [...root.querySelectorAll('[data-ch]')];
  const hero = root.querySelector('[data-grow-hero]');
  const on = () => {
    const r = root.getBoundingClientRect(), len = Math.max(1, root.offsetHeight - innerHeight), pp = Math.min(1, Math.max(0, -r.top / len));
    imgs.forEach((im) => { const a = +im.dataset.from, b = +im.dataset.to; im.style.opacity = pp >= a && pp < b ? 1 : 0; });
    chapters.forEach((c) => { const a = +c.dataset.from, b = +c.dataset.to; const v = pp >= a && (pp < b || c.hasAttribute('data-hold')); c.style.opacity = v ? 1 : 0; c.style.visibility = v ? 'visible' : 'hidden'; });
    if (hero) hero.style.opacity = pp < 0.04 ? 1 : 0;
  };
  addEventListener('scroll', on, { passive: true }); on();
}
