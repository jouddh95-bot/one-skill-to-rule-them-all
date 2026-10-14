// CHARGIX · Room 03 · Casa Ocre — the walk-in 3D showroom of the Business Launch demo.
// A real-time house for the fictional ceramics brand: an ochre entry court, a cobalt door,
// then the sala, furnished with production furniture models (Khronos glTF samples by
// Wayfair, CC0 / CC-BY 4.0) and lit by the sun plus a Poly Haven HDRI (CC0).
// Scroll walks the camera through; clicking a vessel lifts it and opens its card, whose
// button goes to the same product in the storefront below; fabric chips re-cover the sofa
// and chairs through KHR_materials_variants. Exposes init({ root, isTouch, assets }).
import * as THREE from 'three';
import { GLTFLoader, RGBELoader, RoundedBoxGeometry, EffectComposer, RenderPass, GTAOPass, OutputPass } from './cx-gl-addons.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// [p, camera, look-at]: the court, through the cobalt door, around the sala, to the console
const KEYS = [
  [0.00, [-2.2, 1.6, 13], [-2.2, 2.3, 0]],
  [0.14, [-2.2, 1.6, 5], [-2.2, 1.6, 0]],
  [0.26, [-2.0, 1.6, -0.9], [-0.8, 1.0, -6]],
  [0.40, [1.0, 1.5, -1.2], [-1, 0.7, -6]],
  [0.55, [3.2, 1.35, -2.0], [-1.0, 0.6, -6.2]],
  [0.68, [3.3, 1.45, -7.2], [-2.0, 0.8, -3.2]],
  [0.80, [-1.6, 1.4, -2.4], [-4.8, 1.0, -4]],
  [0.92, [-3.0, 1.3, -3.6], [-4.8, 1, -4]],
  [1.00, [-3.4, 1.25, -4.0], [-4.85, 0.95, -4]],
];

function monotone(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

function makePath(keys) {
  const ps = keys.map(k => k[0]);
  const pos = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k[1])), false, 'centripetal');
  const tgt = new THREE.CatmullRomCurve3(keys.map(k => new THREE.Vector3(...k[2])), false, 'centripetal');
  const lens = pos.getLengths(300), total = lens[300];
  const keyU = keys.map((_, i) => i / (keys.length - 1));
  const keyS = keyU.map(u => { const f = u * 300, i = Math.floor(f), t = f - i; return (lens[i] + ((lens[i + 1] ?? total) - lens[i]) * t) / total; });
  const sOfP = monotone(ps, keyS), uOfP = monotone(ps, keyU);
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  return p => { p = clamp(p); pos.getPointAt(clamp(sOfP(p)), P); tgt.getPoint(clamp(uOfP(p)), T); return { pos: P, tgt: T }; };
}

function reflector(renderer, scene, mesh, scale = 0.5) {
  const rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 0 });
  const vcam = new THREE.PerspectiveCamera(), tm = new THREE.Matrix4(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const n = new THREE.Vector3(0, 1, 0), rp = new THREE.Vector3(), cp = new THREE.Vector3(), rot = new THREE.Matrix4(), look = new THREE.Vector3(), view = new THREE.Vector3(), target = new THREE.Vector3();
  const uniforms = { tReflect: { value: rt.texture }, uTM: { value: tm }, uRefl: { value: 0.55 } };
  mesh.material.onBeforeCompile = s => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uTM; varying vec4 vRefUv;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRefUv = uTM * modelMatrix * vec4(transformed, 1.0);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tReflect; uniform float uRefl; varying vec4 vRefUv;')
      .replace('#include <opaque_fragment>', `{ vec2 ruv = vRefUv.xy / vRefUv.w + normal.xz * 0.012; vec3 rc = texture2D(tReflect, ruv).rgb; float fr = 0.35 + 0.65 * pow(1.0 - clamp(dot(normalize(vViewPosition), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.0); outgoingLight += rc * uRefl * fr; }\n#include <opaque_fragment>`);
  };
  return {
    uniforms,
    update(camera, w, h) {
      if (rt.width !== Math.round(w * scale)) rt.setSize(Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale)));
      rp.setFromMatrixPosition(mesh.matrixWorld); cp.setFromMatrixPosition(camera.matrixWorld);
      rot.extractRotation(mesh.matrixWorld); n.set(0, 0, 1).applyMatrix4(rot);
      view.subVectors(rp, cp); if (view.dot(n) > 0) return;
      view.reflect(n).negate().add(rp);
      rot.extractRotation(camera.matrixWorld); look.set(0, 0, -1).applyMatrix4(rot).add(cp);
      target.subVectors(rp, look).reflect(n).negate().add(rp);
      vcam.position.copy(view); vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(n); vcam.lookAt(target);
      vcam.far = camera.far; vcam.updateMatrixWorld(); vcam.projectionMatrix.copy(camera.projectionMatrix);
      tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
      // oblique near plane so nothing below the floor leaks into the reflection
      plane.setFromNormalAndCoplanarPoint(n, rp).applyMatrix4(vcam.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const pm = vcam.projectionMatrix.elements;
      q.x = (Math.sign(clip.x) + pm[8]) / pm[0]; q.y = (Math.sign(clip.y) + pm[9]) / pm[5]; q.z = -1; q.w = (1 + pm[10]) / pm[14];
      clip.multiplyScalar(2 / clip.dot(q)); pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1; pm[14] = clip.w;
      mesh.visible = false;
      const prevRT = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false; renderer.setRenderTarget(rt); renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, vcam);
      renderer.setRenderTarget(prevRT); renderer.shadowMap.autoUpdate = prevShadow; mesh.visible = true;
    },
  };
}


// ------------------------------------------------------------------ materials (photographic response comes from the HDRI, not from colour)
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function cv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// lime plaster: low-frequency trowel clouds + fine grain, as colour and as a bump map
function plaster(base, seed, rep = 1) {
  const c = cv(1024), g = c.getContext('2d'), b = cv(1024), h = b.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 1024, 1024); h.fillStyle = '#808080'; h.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 900; i++) {
    const x = r() * 1024, y = r() * 1024, rad = 30 + r() * 160, a = r();
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); const tone = a > 0.5 ? '255,250,240' : '60,40,20';
    gr.addColorStop(0, `rgba(${tone},${(0.012 + r() * 0.016).toFixed(3)})`); gr.addColorStop(1, `rgba(${tone},0)`); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    const hr = h.createRadialGradient(x, y, 0, x, y, rad * 0.7); const v = a > 0.5 ? 255 : 0; hr.addColorStop(0, `rgba(${v},${v},${v},0.06)`); hr.addColorStop(1, `rgba(${v},${v},${v},0)`); h.fillStyle = hr; h.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const img = h.getImageData(0, 0, 1024, 1024), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 26; d[i] += n; d[i + 1] += n; d[i + 2] += n; } h.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c), bump = new THREE.CanvasTexture(b);
  for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; }
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.6, roughness: 0.93, metalness: 0 });
}
// polished concrete floor with aggregate and soft wear
function concrete() {
  const c = cv(1024), g = c.getContext('2d'), r = rng(31);
  g.fillStyle = '#8e7762'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 500; i++) { const x = r() * 1024, y = r() * 1024, rad = 40 + r() * 220, gr = g.createRadialGradient(x, y, 0, x, y, rad); const t = r() > 0.5 ? '255,255,255' : '70,60,50'; gr.addColorStop(0, `rgba(${t},${(0.03 + r() * 0.04).toFixed(3)})`); gr.addColorStop(1, `rgba(${t},0)`); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  for (let i = 0; i < 9000; i++) { const s = 0.4 + r() * 1.2, v = 90 + r() * 120; g.fillStyle = `rgba(${v},${v - 6},${v - 14},${(0.06 + r() * 0.12).toFixed(2)})`; g.beginPath(); g.ellipse(r() * 1024, r() * 1024, s, s * (0.5 + r() * 0.5), r() * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(60,50,40,.18)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 1); g.lineTo(1024, 1); g.moveTo(1, 0); g.lineTo(1, 1024); g.stroke(); // saw-cut joints every 4 m
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0 });
}
function oak() {
  const c = cv(512, 1024), g = c.getContext('2d'), r = rng(5);
  g.fillStyle = '#8a6440'; g.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 260; i++) { const x = r() * 512; g.strokeStyle = `rgba(${r() > 0.5 ? '40,24,12' : '170,120,80'},${(0.06 + r() * 0.12).toFixed(2)})`; g.lineWidth = 0.5 + r() * 2.5; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= 1024; y += 64) g.lineTo(x + Math.sin(y * 0.01 + i) * (2 + r() * 5), y); g.stroke(); }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  return new THREE.MeshPhysicalMaterial({ map, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4 });
}
// glazed stoneware: glaze over the body, a raw clay foot
function glaze(hex, rough = 0.28) { return new THREE.MeshPhysicalMaterial({ color: hex, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.12, metalness: 0 }); }
const clay = new THREE.MeshStandardMaterial({ color: 0xb98a63, roughness: 0.92 });

// ------------------------------------------------------------------ the vessels (lathe profiles of the store's Cántaro range)
function vessel(kind, mat) {
  const P = {
    cantaro: [[0, 0], [0.07, 0], [0.085, 0.01], [0.11, 0.06], [0.15, 0.16], [0.16, 0.22], [0.145, 0.3], [0.1, 0.37], [0.055, 0.41], [0.048, 0.46], [0.062, 0.5], [0.058, 0.505], [0.04, 0.47], [0, 0.47]],
    jarra: [[0, 0], [0.06, 0], [0.07, 0.015], [0.09, 0.08], [0.1, 0.16], [0.085, 0.23], [0.06, 0.27], [0.065, 0.3], [0.06, 0.302], [0.05, 0.28], [0, 0.28]],
    cuenco: [[0, 0], [0.05, 0], [0.055, 0.012], [0.11, 0.05], [0.14, 0.09], [0.145, 0.1], [0.135, 0.098], [0.1, 0.06], [0.04, 0.03], [0, 0.03]],
  }[kind];
  const pts = P.map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(90), 96);
  const g = new THREE.Group(); const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; g.add(m);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(pts[1].x + 0.002, pts[1].x + 0.004, 0.012, 64), clay); foot.position.y = 0.006; foot.castShadow = true; g.add(foot);
  if (kind === 'cantaro') for (const s of [-1, 1]) { // two strap handles
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 12, 40, Math.PI * 1.1), mat); h.position.set(s * 0.1, 0.36, 0); h.rotation.set(0, s > 0 ? 0 : Math.PI, -0.5 * s); h.castShadow = true; g.add(h);
  }
  return g;
}

// woven wool rug: cream ground, a faded ochre band, fine weave as bump
function rug() {
  const c = cv(1024, 512), g = c.getContext('2d'), r = rng(77);
  g.fillStyle = '#d8ccb6'; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = 'rgba(176,112,50,.55)'; g.fillRect(0, 60, 1024, 26); g.fillRect(0, 426, 1024, 26); g.fillStyle = 'rgba(42,66,130,.35)'; g.fillRect(0, 98, 1024, 6); g.fillRect(0, 408, 1024, 6);
  for (let y = 0; y < 512; y += 2) { g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '60,45,30'},${(0.03 + r() * 0.05).toFixed(3)})`; g.fillRect(0, y, 1024, 1); }
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(80,60,40,${(r() * 0.12).toFixed(3)})`; g.fillRect(r() * 1024, r() * 512, 2, 1); }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map, roughness: 1, bumpMap: map, bumpScale: 0.8 });
}

// ------------------------------------------------------------------ the house (metres; the glTF furniture is real-world scale)
function build(renderer, low, A) {
  const scene = new THREE.Scene();
  const ochre = plaster('#b97a3e', 11, 1), pink = plaster('#c06a63', 12, 1), lime = plaster('#ebe4d8', 13, 1), cobalt = plaster('#26468f', 14, 1);
  const floorM = concrete(), wood = oak();
  const add = (o, cast = true) => { o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = true; } }); scene.add(o); return o; };
  const slab = (w, h, d, mat, x, y, z) => {
    const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(0.03, w / 3, h / 3, d / 3)); const uv = geo.attributes.uv, p = geo.attributes.position, n = geo.attributes.normal;
    for (let i = 0; i < uv.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); const u = ax > 0.5 ? p.getZ(i) + z : p.getX(i) + x, v = ay > 0.5 ? p.getZ(i) + z : p.getY(i) + y; uv.setXY(i, u / 4, v / 4); }
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return add(m);
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorM); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -2); floor.receiveShadow = true; scene.add(floor);
  { const uv = floor.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 15, uv.getY(i) * 15); }

  // ── the entry court: a tall ochre wall with a deep cobalt door, a pink screen wall, a still water trough
  const H = 5.6, DX0 = -3.3, DX1 = -1.1, DH = 3.0;
  slab(DX0 + 9.5, H, 0.5, ochre, (-9.5 + DX0) / 2, H / 2, 0); slab(9.5 - DX1, H, 0.5, ochre, (DX1 + 9.5) / 2, H / 2, 0); slab(DX1 - DX0, H - DH, 0.5, ochre, (DX0 + DX1) / 2, DH + (H - DH) / 2, 0);
  slab(0.1, DH, 0.56, cobalt, DX0 + 0.05, DH / 2, 0); slab(0.1, DH, 0.56, cobalt, DX1 - 0.05, DH / 2, 0); slab(DX1 - DX0, 0.1, 0.56, cobalt, (DX0 + DX1) / 2, DH - 0.05, 0);
  slab(0.45, 3.6, 8, pink, 6.4, 1.8, 5.0); slab(0.45, 2.2, 5, ochre, -8.6, 1.1, 6.5);
  const trough = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 6.2), new THREE.MeshPhysicalMaterial({ color: 0x0c1517, roughness: 0.04, metalness: 0.1, clearcoat: 1 })); trough.position.set(4.6, 0.36, 5.2); scene.add(trough);
  slab(1.3, 0.36, 6.6, lime, 4.6, 0.17, 5.2);
  { const c = cv(2048, 256), g = c.getContext('2d'); g.fillStyle = 'rgba(48,28,12,0.9)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 128px "Archivo", "Helvetica Neue", Arial, sans-serif'; if ('letterSpacing' in g) g.letterSpacing = '48px'; g.fillText('CASA OCRE', 1024 + 24, 132);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; const sgn = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.55), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9 })); sgn.position.set(2.6, 4.2, 0.26); scene.add(sgn); }

  // ── the sala: about 9.8 × 8 m, 3.5 m to the beams; lime walls, an ochre north wall, a deep window east
  const RH = 3.5, X0 = -5.2, X1 = 4.6, Z1 = -8;
  slab(0.35, RH, -Z1, lime, X0, RH / 2, Z1 / 2);
  slab(X1 - X0 + 0.35, RH, 0.35, ochre, (X0 + X1) / 2, RH / 2, Z1);
  slab(0.35, RH, 2, lime, X1, RH / 2, -1); slab(0.35, RH, 2, lime, X1, RH / 2, -7); slab(0.35, 0.55, 4, lime, X1, 0.275, -4); slab(0.35, 0.5, 4, lime, X1, RH - 0.25, -4);
  slab(0.8, 0.06, 4, lime, X1 - 0.1, 0.58, -4); // deep sill, a seat
  slab(X1 - X0 + 0.35, 0.25, -Z1 + 0.35, lime, (X0 + X1) / 2, RH + 0.125, Z1 / 2);
  for (let x = X0 + 0.7; x < X1 - 0.3; x += 0.95) slab(0.12, 0.18, -Z1, wood, x, RH - 0.09, Z1 / 2);
  // the console along the west wall
  { const g = new THREE.Group(); const top = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.05, 3.6, 2, 0.01), wood); top.position.set(X0 + 0.45, 0.86, -4); g.add(top);
    for (const z of [-2.35, -5.65]) { const leg = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.835, 0.06, 2, 0.01), wood); leg.position.set(X0 + 0.45, 0.4175, z); g.add(leg); }
    add(g); }
  // coffee table (travertine block) on a wool rug
  slab(1.3, 0.34, 0.7, plaster('#d9cab0', 21, 2), -0.4, 0.17, -5.2);
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.3), rug()); m.rotation.x = -Math.PI / 2; m.position.set(-0.4, 0.006, -5.5); m.receiveShadow = true; scene.add(m); }

  // ── the product vessels on the console: the clickable Cántaro range
  const picks = [];
  const vs = [['cantaro', 0xc6862c, -2.75, 1.0, 'Cántaro jar · ochre'], ['jarra', 0xe6dfcf, -3.35, 1.0, 'Cántaro jar · bone'], ['cantaro', 0x25428e, -3.95, 0.9, 'Cántaro jar · cobalt'], ['cuenco', 0xa54a2d, -4.6, 1.1, 'Bowl · barro'], ['cantaro', 0xe6dfcf, -5.2, 0.8, 'Cántaro jar · bone']];
  for (const [k, col, z, sc, name] of vs) { const v = vessel(k, glaze(col)); v.scale.setScalar(sc); v.position.set(X0 + 0.45, 0.885, z); v.rotation.y = z * 5; add(v); v.userData = { pick: true, name, cat: 'table', base: 0.885 }; picks.push(v); }
  { const v = vessel('cantaro', glaze(0x25428e, 0.32)); v.scale.setScalar(1.9); v.position.set(3.7, 0, -7.2); add(v); v.userData = { pick: true, name: 'Cántaro jar · cobalt', cat: 'table', base: 0 }; picks.push(v); }

  // ── light: low sun from the south-east across the court and in through the east window; sky fill from the HDRI
  const sun = new THREE.DirectionalLight(0xffdcb4, 4.6); sun.position.set(14, 9, 8); sun.target.position.set(0, 0, -3); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  const bounce = new THREE.PointLight(0xffc690, 3.2, 9, 1.6); bounce.position.set(1.5, 0.8, -4.2); scene.add(bounce);
  const fill = new THREE.HemisphereLight(0xd6e2f2, 0x8a6a4a, 0.25); scene.add(fill);

  // ── the furniture models, loaded after first paint
  const models = {};
  const load = async () => {
    const L = new GLTFLoader();
    const get = (k) => L.loadAsync(A[k]).then((g) => { g.scene.traverse((o) => { if (o.isLight) o.visible = false; if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); models[k] = g; return g; });
    const [sofa, chair, pouf, cup, lamp] = await Promise.all(['sofa', 'chair', 'pouf', 'cup', 'lamp'].map(get));
    sofa.scene.position.set(-0.6, 0, -7.0); scene.add(sofa.scene);
    for (const [x, z, ry] of [[1.9, -5.9, -1.2], [1.8, -4.3, -1.95]]) { const c = chair.scene.clone(); c.position.set(x, 0, z); c.rotation.y = ry; scene.add(c); (models.chairs ||= []).push(c); }
    pouf.scene.position.set(-2.5, 0, -4.6); scene.add(pouf.scene);
    cup.scene.position.set(-0.1, 0.34, -5.15); cup.scene.rotation.y = 0.6; scene.add(cup.scene); cup.scene.userData = { pick: true, name: 'Taza cup and saucer', cat: 'table', base: 0.34 }; picks.push(cup.scene);
    lamp.scene.scale.setScalar(1.7); lamp.scene.rotation.y = Math.PI / 2; lamp.scene.position.set(X0 + 0.2, 1.9, -4); scene.add(lamp.scene); lamp.scene.userData = { pick: true, name: 'Farol wall light', cat: 'light', base: 1.9, still: true }; picks.push(lamp.scene);
    const glow = new THREE.SpotLight(0xffd29a, 10, 5, 0.9, 0.7, 1.5); glow.position.set(X0 + 0.5, 1.75, -4); glow.target.position.set(X0 + 0.5, 0.9, -4); scene.add(glow, glow.target);
    return models;
  };
  return { scene, floor, picks, load, models, sun };
}

export async function init({ root, isTouch = false, assets = {} }) {
  const stage = root.querySelector('[data-cs-stage]'), track = root.querySelector('[data-cs-track]'), canvas = root.querySelector('[data-cs-canvas]');
  const caps = [...root.querySelectorAll('[data-cs-cap]')].map(el => ({ el, a: +el.dataset.a / 100, b: +el.dataset.b / 100, v: -1 }));
  const meter = root.querySelector('[data-cs-meter]'), hint = root.querySelector('[data-cs-hint]');
  const card = root.querySelector('[data-cs-card]'), cardName = card?.querySelector('[data-cs-card-name]'), cardGo = card?.querySelector('[data-cs-card-go]');
  const low = isTouch || Math.min(screen.width, screen.height) < 500;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no gl');
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const S = build(renderer, low, assets);
  // image-based light: the HDRI lights everything; the sky behind the court is a soft gradient, not a photo
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (assets.hdr) { try { const hdr = await new RGBELoader().loadAsync(assets.hdr); S.scene.environment = pmrem.fromEquirectangular(hdr).texture; S.scene.environmentIntensity = 0.45; hdr.dispose(); } catch (e) { /* the sun and fill still light the scene */ } }
  { const c = cv(16, 256), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#6f93bf'); gr.addColorStop(0.55, '#b9cbdc'); gr.addColorStop(1, '#efe3cf'); g.fillStyle = gr; g.fillRect(0, 0, 16, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; S.scene.background = t; }
  S.scene.fog = new THREE.Fog(0xe9dccb, 40, 90);
  const refl = reflector(renderer, S.scene, S.floor, low ? 0.3 : 0.5); refl.uniforms.uRefl.value = 0.1;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  const path = makePath(KEYS);
  let W = 1, H = 1, dpr = Math.min(devicePixelRatio || 1, low ? 1.4 : 1.6);
  // ambient occlusion (desktop only): grounds the furniture and the wall/floor junctions
  let composer = null, gtao = null;
  if (!low) { composer = new EffectComposer(renderer); composer.addPass(new RenderPass(S.scene, camera)); gtao = new GTAOPass(S.scene, camera, 2, 2); gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 }); gtao.blendIntensity = 0.85; composer.addPass(gtao); composer.addPass(new OutputPass()); }
  const resize = () => { W = stage.clientWidth || innerWidth; H = stage.clientHeight || innerHeight; renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); composer?.setPixelRatio(dpr); composer?.setSize(W, H); camera.aspect = W / H; camera.fov = W / H < 0.9 ? 66 : 50; camera.updateProjectionMatrix(); kick(); };
  new ResizeObserver(resize).observe(stage);

  // ---- interaction
  let p = 0, target = 0, fixed = null, active = false, raf = 0, last = performance.now(), time = 0, chosen = null;
  const look = { x: 0, y: 0, tx: 0, ty: 0, drag: false, sx: 0, sy: 0, bx: 0, by: 0 };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pickAt = (e) => {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(S.scene.children, true)) { let o = h.object; while (o) { if (o.userData?.pick) return o; o = o.parent; } return null; }
    return null;
  };
  function choose(o) {
    chosen = chosen === o ? null : o;
    S.picks.forEach(x => { x.userData.t = x === chosen ? 1 : 0; });
    if (card) { if (chosen) { cardName.textContent = chosen.userData.name; card.dataset.cat = chosen.userData.cat; card.hidden = false; card.classList.add('is-on'); } else { card.classList.remove('is-on'); card.hidden = true; } }
    kick();
  }
  cardGo?.addEventListener('click', () => {
    // hand over to the storefront below: the cántaro range opens its product page, other pieces their category
    const store = root.querySelector('#co-store') || document.querySelector('#co-store');
    const cat = card.dataset.cat, isJar = /Cántaro/.test(cardName.textContent);
    const btn = (store || document).querySelector(isJar ? '[data-co-go="product"][data-co-pid="cantaro"]' : `[data-co-go="shop"][data-co-cat="${cat}"]`);
    btn?.click(); (store || btn)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  card?.querySelector('[data-cs-card-close]')?.addEventListener('click', () => chosen && choose(chosen));
  canvas.addEventListener('pointerdown', e => { look.drag = true; look.sx = e.clientX; look.sy = e.clientY; look.bx = look.tx; look.by = look.ty; look.moved = false; });
  addEventListener('pointermove', e => {
    if (look.drag) { const dx = (e.clientX - look.sx) / W, dy = (e.clientY - look.sy) / H; if (Math.abs(dx) + Math.abs(dy) > 0.01) look.moved = true; look.tx = clamp(look.bx + dx * 2.4, -1, 1); look.ty = clamp(look.by + dy * 2, -1, 1); kick(); return; }
    if (isTouch || !active) return;
    const o = pickAt(e); canvas.style.cursor = o ? 'pointer' : 'grab'; S.picks.forEach(x => { x.userData.h = x === o ? 1 : 0; }); kick();
  }, { passive: true });
  addEventListener('pointerup', e => {
    if (!look.drag) return; look.drag = false;
    if (!look.moved) { const o = pickAt(e); if (o) choose(o); } else hint?.classList.add('is-used');
    setTimeout(() => { if (!look.drag) { look.tx = 0; look.ty = 0; kick(); } }, 1800);
  });
  // fabric chips: KHR_materials_variants on the sofa and the chairs
  const fabrics = root.querySelectorAll('[data-cs-fabric]');
  function setVariant(gltf, objs, name) {
    // three's GLTFLoader keeps the variant mappings in userData; resolve them through the parser
    const names = (gltf.parser.json.extensions?.KHR_materials_variants?.variants || []).map(v => v.name), idx = names.indexOf(name);
    if (idx < 0) return Promise.resolve();
    const jobs = [];
    for (const root of objs) root.traverse(o => {
      const d = o.isMesh && o.userData.gltfExtensions?.KHR_materials_variants; if (!d) return;
      o.userData.mat0 ||= o.material;
      const m = d.mappings.find(x => x.variants.includes(idx));
      if (!m) { o.material = o.userData.mat0; return; }
      jobs.push(gltf.parser.getDependency('material', m.material).then(mat => { o.material = mat; gltf.parser.assignFinalMaterial(o); }));
    });
    return Promise.all(jobs);
  }
  fabrics.forEach(b => b.addEventListener('click', () => {
    const [which, name] = b.dataset.csFabric.split(':');
    const job = which === 'sofa' && S.models.sofa ? setVariant(S.models.sofa, [S.models.sofa.scene], name) : which === 'chair' && S.models.chair ? setVariant(S.models.chair, S.models.chairs || [], name) : null;
    job?.then(() => kick());
    root.querySelectorAll(`[data-cs-fabric^="${which}:"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    kick();
  }));

  // ---- frame
  const up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), qd = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
  function frame(now) {
    raf = 0; const dt = Math.min((now - last) / 1000, 0.1); last = now; time += dt;
    const r = track.getBoundingClientRect(); target = fixed ?? clamp(-r.top / Math.max(1, r.height - innerHeight));
    p += (target - p) * (1 - Math.exp(-dt * 6)); if (Math.abs(target - p) < 0.00005 || fixed != null) p = target;
    look.x += (look.tx - look.x) * (1 - Math.exp(-dt * 5)); look.y += (look.ty - look.y) * (1 - Math.exp(-dt * 5));
    const s = path(p);
    camera.position.copy(s.pos); camera.position.y += Math.sin(time * 0.6) * 0.01;
    m4.lookAt(camera.position, s.tgt, up); camera.quaternion.setFromRotationMatrix(m4);
    eul.set(-look.y * 0.35, -look.x * 0.6, 0); qd.setFromEuler(eul); camera.quaternion.multiply(qd);
    let moving = Math.abs(target - p) > 0.0001 || Math.abs(look.tx - look.x) > 0.001 || Math.abs(look.ty - look.y) > 0.001;
    for (const o of S.picks) {
      const u = o.userData; u.o = (u.o || 0); const want = (u.t || 0) * 1 + (u.h || 0) * 0.25;
      u.o += (want - u.o) * (1 - Math.exp(-dt * 5)); if (Math.abs(want - u.o) > 0.002) moving = true;
      if (!u.still) { o.position.y = u.base + u.o * 0.12; o.rotation.y = (u.ry ??= o.rotation.y) + u.o * 0.6; }
    }
    renderer.toneMappingExposure = lerp(0.88, 1.05, smooth(0.18, 0.36, p));
    if (meter) meter.style.transform = `scaleX(${p.toFixed(4)})`;
    caps.forEach(c => { const v = (c.a <= 0 ? 1 : smooth(c.a, c.a + 0.03, p)) * (c.b >= 1 ? 1 : 1 - smooth(c.b - 0.03, c.b, p)); if (Math.abs(v - c.v) > 0.002) { c.v = v; c.el.style.opacity = v.toFixed(3); c.el.style.transform = `translate3d(0,${((1 - v) * 18).toFixed(1)}px,0)`; c.el.style.visibility = v > 0.01 ? 'visible' : 'hidden'; } });
    camera.updateMatrixWorld();
    refl.update(camera, W * dpr, H * dpr);
    if (composer) composer.render(); else renderer.render(S.scene, camera);
    if (active && moving) kick();
  }
  function kick() { if (!raf && active && !document.hidden && !window.__csPause) raf = requestAnimationFrame(frame); }
  new IntersectionObserver(([en]) => { active = en.isIntersecting; if (active) { last = performance.now(); kick(); } }, { rootMargin: '200px 0px' }).observe(track);
  addEventListener('scroll', kick, { passive: true });
  resize();
  renderer.compile(S.scene, camera);
  const ready = S.load().then(() => { root.classList.add('cs--models'); renderer.compile(S.scene, camera); kick(); }).catch(() => {});
  const api = {
    ready,
    shot(pp) { fixed = pp; const a = active; active = false; for (let i = 0; i < 8; i++) frame(last + 100 * (i + 1)); active = a; },
    fabric(sel) { root.querySelector(`[data-cs-fabric="${sel}"]`)?.click(); },
    choose(name) { const o = S.picks.find(x => x.userData.name === name) || S.picks[0]; choose(o); },
    S, camera, renderer,
  };
  return api;
}
