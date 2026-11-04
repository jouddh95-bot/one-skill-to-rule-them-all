// CHARGIX · Room 02 · Maison Solenne — the walk-in part of the 3D Experience demo.
// A real-time pavilion for the fictional watch brand: pivoting lacquer doors,
// a gallery of fins and light, three vitrines holding the three colourways and
// a round salon where a brass ring turns over the hero piece. Scroll moves the
// camera along a choreographed spline; the doors open with the scroll (or on a
// click); clicking a vitrine lifts its glass and picks that colourway for the
// product viewer further down; dragging looks around. The floor is a real
// planar reflection. Exposes init({ root, onColourway }) → { setColourway }.
import * as THREE from 'three';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

const CW = {
  steel: { metal: 0xcfd3d8, rough: 0.2, dial: '#14213d', dial2: '#3a5590', ink: '#e9e5dc', strap: 0x1b1a1f },
  gold: { metal: 0xe2bd77, rough: 0.2, dial: '#11281b', dial2: '#2f5b40', ink: '#f0e3bc', strap: 0x3e2414 },
  titanium: { metal: 0x9ca0a6, rough: 0.42, dial: '#d98f74', dial2: '#f6c9b5', ink: '#2b2a2e', strap: 0xd3c5b8 },
};

// ------------------------------------------------------------------ camera choreography
// [p, camera, look-at]: outside the doors, through them, past each vitrine, a turn into the salon
const KEYS = [
  [0.00, [0, 1.7, 24], [0, 4.6, 0]],
  [0.12, [0, 1.75, 12], [0, 3.8, 0]],
  [0.24, [0, 1.8, 3.2], [0, 2.4, -10]],
  [0.33, [-0.2, 1.65, -8.6], [-2.2, 1.55, -12]],
  [0.42, [0.6, 1.6, -18.4], [2.2, 1.55, -22]],
  [0.51, [-0.4, 1.65, -28.6], [-2.2, 1.55, -32]],
  [0.62, [-1.2, 1.9, -39.5], [6, 2.1, -48]],
  [0.74, [3.8, 2.0, -47.2], [16, 2.2, -48]],
  [0.88, [8.6, 1.95, -47.8], [16, 2.25, -48]],
  [1.00, [10.6, 1.9, -48], [16, 2.25, -48]],
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

// ------------------------------------------------------------------ textures
function cv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function dialTex(k) {
  const c = cv(512), g = c.getContext('2d'), o = 256, d = CW[k];
  const gr = g.createRadialGradient(o * 0.8, o * 0.75, 10, o, o, o); gr.addColorStop(0, d.dial2); gr.addColorStop(0.75, d.dial); gr.addColorStop(1, d.dial);
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 700; i++) { const a = (i / 700) * Math.PI * 2, s = Math.pow(Math.abs(Math.cos(a - 0.75)), 7); g.strokeStyle = `rgba(255,255,255,${(0.02 + 0.14 * s).toFixed(3)})`; g.beginPath(); g.moveTo(o, o); g.lineTo(o + Math.cos(a) * o, o + Math.sin(a) * o); g.stroke(); }
  g.strokeStyle = d.ink; g.fillStyle = d.ink;
  for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, big = i % 5 === 0; g.lineWidth = big ? 3 : 1.4; g.beginPath(); g.moveTo(o + Math.sin(a) * o * 0.95, o - Math.cos(a) * o * 0.95); g.lineTo(o + Math.sin(a) * o * (big ? 0.88 : 0.92), o - Math.cos(a) * o * (big ? 0.88 : 0.92)); g.stroke(); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '400 30px "Italiana", Didot, Georgia, serif'; if ('letterSpacing' in g) g.letterSpacing = '8px'; g.fillText('SOLENNE', o + 4, o - o * 0.36);
  g.font = '500 11px "Manrope", Helvetica, Arial, sans-serif'; if ('letterSpacing' in g) g.letterSpacing = '4px'; g.globalAlpha = 0.8; g.fillText('AUTOMATIC', o + 2, o - o * 0.24); g.fillText('LIGNE 39', o + 2, o + o * 0.42);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function signTex() {
  const c = cv(2048, 160), g = c.getContext('2d');
  g.fillStyle = '#0b1424'; g.fillRect(0, 0, 2048, 160);
  g.fillStyle = '#d9b36c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '400 96px "Italiana", Didot, "Bodoni 72", Georgia, serif';
  if ('letterSpacing' in g) g.letterSpacing = '60px'; g.fillText('SOLENNE', 1024 + 30, 86);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function posterTex() {
  const c = cv(800, 1100), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 1100); gr.addColorStop(0, '#13213d'); gr.addColorStop(1, '#070b14'); g.fillStyle = gr; g.fillRect(0, 0, 800, 1100);
  g.strokeStyle = 'rgba(217,179,108,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(400, 470, 250, 0, 7); g.stroke(); g.beginPath(); g.arc(400, 470, 236, 0, 7); g.stroke();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(400 + Math.sin(a) * 210, 470 - Math.cos(a) * 210); g.lineTo(400 + Math.sin(a) * 186, 470 - Math.cos(a) * 186); g.lineWidth = 6; g.stroke(); }
  g.fillStyle = '#efe7d6'; g.textAlign = 'center'; g.font = '400 64px "Italiana", Didot, Georgia, serif'; g.fillText('Time,', 400, 860);
  g.font = 'italic 400 58px "Newsreader", Georgia, serif'; g.fillStyle = '#d9b36c'; g.fillText('held still.', 400, 930);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function stoneTex() {
  const c = cv(1024), g = c.getContext('2d');
  g.fillStyle = '#0d0e11'; g.fillRect(0, 0, 1024, 1024);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 30; i++) { g.strokeStyle = `rgba(150,160,180,${(0.03 + r() * 0.06).toFixed(3)})`; g.lineWidth = 0.6 + r() * 1.4; let x = r() * 1024, y = r() * 1024; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { const nx = x + (r() - 0.4) * 300, ny = y + (r() - 0.5) * 200; g.quadraticCurveTo((x + nx) / 2 + (r() - 0.5) * 90, (y + ny) / 2 + (r() - 0.5) * 90, nx, ny); x = nx; y = ny; } g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,.8)'; for (let i = 0; i <= 2; i++) { g.fillRect(i * 512 - 1, 0, 2, 1024); g.fillRect(0, i * 512 - 1, 1024, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 4, 1 / 4); t.anisotropy = 8; return t;
}

// ------------------------------------------------------------------ the watch (simplified, for the vitrines and the salon)
function watch(k) {
  const d = CW[k], g = new THREE.Group();
  const metal = new THREE.MeshPhysicalMaterial({ color: d.metal, metalness: 1, roughness: d.rough, clearcoat: 0.3 });
  const polish = new THREE.MeshPhysicalMaterial({ color: d.metal, metalness: 1, roughness: 0.08 });
  const caseG = new THREE.LatheGeometry([[0.8, -0.2], [0.98, -0.22], [1.04, -0.1], [1.05, 0.08], [1.0, 0.18], [0.82, 0.18]].map(([x, y]) => new THREE.Vector2(x, y)), 96); caseG.rotateX(Math.PI / 2);
  g.add(new THREE.Mesh(caseG, metal));
  const bez = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.07, 24, 128), polish); bez.position.z = 0.2; g.add(bez);
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.86, 96), new THREE.MeshPhysicalMaterial({ map: dialTex(k), metalness: 0.4, roughness: 0.35, clearcoat: 0.6 })); dial.position.z = 0.1; g.add(dial);
  const idx = new THREE.MeshPhysicalMaterial({ color: 0xf2efe6, metalness: 1, roughness: 0.1 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.03), idx); b.position.set(Math.sin(a) * 0.68, Math.cos(a) * 0.68, 0.12); b.rotation.z = -a; g.add(b); }
  const hand = (len, w, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.015), idx); m.geometry.translate(0, len / 2 - 0.06, 0); m.position.z = z; g.add(m); return m; };
  const hh = hand(0.5, 0.06, 0.13), mh = hand(0.74, 0.045, 0.15), sh = hand(0.8, 0.012, 0.17); sh.material = new THREE.MeshStandardMaterial({ color: 0xe56b4e, roughness: 0.4 });
  hh.rotation.z = -2.2; mh.rotation.z = -0.9;
  const glass = new THREE.Mesh(new THREE.SphereGeometry(2.6, 64, 8, 0, Math.PI * 2, 0, 0.34), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.1, envMapIntensity: 2.5, depthWrite: false }));
  glass.rotation.x = Math.PI / 2; glass.position.z = 0.22 - 2.6 * Math.cos(0.34); g.add(glass);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 32), polish); crown.rotation.z = Math.PI / 2; crown.position.x = 1.12; g.add(crown);
  const strapM = new THREE.MeshPhysicalMaterial({ color: d.strap, roughness: 0.6, sheen: 0.3, sheenColor: 0x3a3a3a });
  for (const s of [1, -1]) {
    const geo = new THREE.BoxGeometry(0.86, 1.5, 0.1, 1, 30, 1), p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const t = (v.y + 0.75) / 1.5, a = t * 1.1; const R = 1.6 - v.z; p.setXYZ(i, v.x * (1 - t * 0.12), Math.sin(a) * R, -(R - Math.cos(a) * R) - 0.05); }
    geo.computeVertexNormals(); const m = new THREE.Mesh(geo, strapM); m.position.y = s * 0.92; if (s < 0) m.rotation.z = Math.PI; g.add(m);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { sh, mh };
  return g;
}

// ------------------------------------------------------------------ planar reflection for the stone floor
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

// ------------------------------------------------------------------ the pavilion
function build(renderer, low) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  scene.fog = new THREE.FogExp2(0x070b14, 0.018);
  const lacq = new THREE.MeshPhysicalMaterial({ color: 0x14213d, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 });
  const lacqD = new THREE.MeshPhysicalMaterial({ color: 0x0b1324, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a26a, metalness: 1, roughness: 0.28 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.62).multiplyScalar(2.2) });
  const cool = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.84, 1.0).multiplyScalar(1.5) });
  const floorM = new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.12, metalness: 0 });
  const box = (w, h, d, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; scene.add(o); return o; };

  // floor (one reflective plane for outside and in) and the pool
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 160), floorM); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -20); floor.receiveShadow = true; scene.add(floor);
  const uv = floor.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 120, uv.getY(i) * 160);
  // facade: lacquer panels with brass seams, the sign band and a doorway
  box(15.5, 12, 1.2, lacq, -10.25, 6, 0); box(15.5, 12, 1.2, lacq, 10.25, 6, 0); box(5, 3.6, 1.2, lacq, 0, 10.2, 0);
  for (let x = -17.5; x <= 17.5; x += 2.5) if (Math.abs(x) > 2.6) box(0.06, 12, 1.25, brass, x, 6, 0);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.86), new THREE.MeshBasicMaterial({ map: signTex() })); sign.position.set(0, 9.4, 0.62); scene.add(sign);
  box(36, 0.3, 3.2, lacqD, 0, 12.1, 1.0); box(36, 0.06, 0.06, glow, 0, 11.94, 2.55);
  box(5.4, 0.2, 1.4, brass, 0, 8.4, 0); box(0.2, 8.4, 1.4, brass, -2.6, 4.2, 0); box(0.2, 8.4, 1.4, brass, 2.6, 4.2, 0);
  // the two pivoting doors (each turns about an axis a third of the way in)
  const doors = [-1, 1].map(s => {
    const piv = new THREE.Group(); piv.position.set(s * 1.65, 0, 0); scene.add(piv);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.45, 8.2, 0.18), lacq); leaf.position.set(s * -0.4, 4.1, 0); leaf.castShadow = leaf.receiveShadow = true; piv.add(leaf);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 7.6, 0.2), brass); seam.position.set(s * -0.4 + s * -0.9, 4.1, 0.01); piv.add(seam);
    const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 16), brass); pull.position.set(s * -1.35, 4.0, 0.2); piv.add(pull);
    leaf.userData.door = true; return piv;
  });
  // pool in front and two lit plinths
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 18), new THREE.MeshStandardMaterial({ color: 0x02040a, roughness: 0.02, metalness: 0.2 })); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.02, 15); scene.add(pool);
  for (const s of [-1, 1]) { box(0.25, 0.08, 18.4, brass, s * 2.2, 0.04, 15); box(1.2, 2.6, 1.2, lacqD, s * 6, 1.3, 7); box(1.0, 0.04, 1.0, glow, s * 6, 2.62, 7); }

  // gallery: fins, light seams, a slatted ceiling and the end poster
  const GL = 54;
  box(1, 9, GL, lacqD, -7.5, 4.5, -GL / 2); box(1, 9, 40, lacqD, 7.5, 4.5, -20); box(1, 9, 6, lacqD, 7.5, 4.5, -GL + 3);
  box(16, 0.4, GL, lacqD, 0, 9.2, -GL / 2); box(16, 9, 1, lacqD, 0, 4.5, -GL);
  const finG = new THREE.BoxGeometry(0.35, 8.6, 1.4), finM = new THREE.InstancedMesh(finG, lacq, 34); let fi = 0; const o3 = new THREE.Object3D();
  for (let z = -3; z > -GL + 1; z -= 3) for (const s of [-1, 1]) { if (s > 0 && z < -40 && z > -52) continue; o3.position.set(s * 6.7, 4.3, z); o3.updateMatrix(); finM.setMatrixAt(fi++, o3.matrix); }
  finM.count = fi; finM.castShadow = finM.receiveShadow = true; scene.add(finM);
  const seamG = new THREE.BoxGeometry(0.04, 7.8, 0.04), seamM = new THREE.InstancedMesh(seamG, glow, 34); fi = 0;
  for (let z = -4.5; z > -GL + 1; z -= 3) for (const s of [-1, 1]) { if (s > 0 && z < -40 && z > -52) continue; o3.position.set(s * 6.95, 4.3, z); o3.updateMatrix(); seamM.setMatrixAt(fi++, o3.matrix); }
  seamM.count = fi; scene.add(seamM);
  const slatM = new THREE.InstancedMesh(new THREE.BoxGeometry(13, 0.12, 0.14), brass, 70); fi = 0;
  for (let z = -1; z > -GL; z -= 0.8) { o3.position.set(0, 8.7, z); o3.updateMatrix(); slatM.setMatrixAt(fi++, o3.matrix); }
  slatM.count = fi; scene.add(slatM);
  const lightBand = new THREE.Mesh(new THREE.PlaneGeometry(12, GL), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.8, 0.65).multiplyScalar(0.9) })); lightBand.rotation.x = Math.PI / 2; lightBand.position.set(0, 8.95, -GL / 2); scene.add(lightBand);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 6), new THREE.MeshStandardMaterial({ map: posterTex(), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.12 })); poster.position.set(0, 4.2, -GL + 0.52); scene.add(poster);
  poster.material.emissiveMap = poster.material.map;

  // vitrines: plinth, brass edge, glass case, the watch turning inside, a spot from above
  const vitrines = [['steel', -2.2, -12], ['gold', 2.2, -22], ['titanium', -2.2, -32]].map(([k, x, z]) => {
    const grp = new THREE.Group(); grp.position.set(x, 0, z); scene.add(grp);
    const pl = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.05, 1.1), lacq); pl.position.y = 0.525; pl.castShadow = pl.receiveShadow = true; grp.add(pl);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.04, 1.16), brass); top.position.y = 1.07; grp.add(top);
    const ring = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.012, 1.0), glow); ring.position.y = 1.095; grp.add(ring);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), new THREE.MeshPhysicalMaterial({ color: 0xdfe8ff, roughness: 0.02, transparent: true, opacity: 0.12, envMapIntensity: 3, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.y = 1.58; grp.add(glass);
    const w = watch(k); w.scale.setScalar(0.27); w.position.y = 1.58; grp.add(w);
    const spot = new THREE.SpotLight(0xffe2bb, 0, 7, 0.28, 0.6, 1.2); spot.position.set(0, 5.5, 0.6); spot.target = w; grp.add(spot);
    pl.userData.vitrine = grp; glass.userData.vitrine = grp;
    grp.userData = { k, glass, w, spot, open: 0, target: 0, hover: 0 };
    return grp;
  });

  // the salon: a round lacquer room off the gallery, a turning brass ring, the hero piece
  const SC = new THREE.Vector3(16, 0, -48), SR = 8;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2; if (Math.cos(a) < -0.86) continue; // the opening towards the gallery
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 9, 0.6), i % 2 ? lacq : lacqD); b.position.set(SC.x + Math.cos(a) * SR, 4.5, SC.z + Math.sin(a) * SR); b.lookAt(SC.x, 4.5, SC.z); b.castShadow = b.receiveShadow = true; scene.add(b);
    if (i % 2 === 0) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 8, 0.04), glow); l.position.set(SC.x + Math.cos(a + 0.08) * (SR - 0.35), 4.4, SC.z + Math.sin(a + 0.08) * (SR - 0.35)); scene.add(l); }
  }
  const dome = new THREE.Mesh(new THREE.CircleGeometry(SR + 0.5, 64), lacqD); dome.rotation.x = Math.PI / 2; dome.position.set(SC.x, 9.2, SC.z); scene.add(dome);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.03, 8, 128), glow); halo.rotation.x = Math.PI / 2; halo.position.set(SC.x, 9.1, SC.z); scene.add(halo);
  const bigRing = new THREE.Group(); bigRing.position.set(SC.x, 3.2, SC.z); scene.add(bigRing);
  const ringT = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.12, 24, 160), brass); ringT.castShadow = true; bigRing.add(ringT);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.18), brass); m.position.set(Math.sin(a) * 2.6, Math.cos(a) * 2.6, 0); m.rotation.z = -a; bigRing.add(m); }
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.03, 8, 160), brass); bigRing.add(ring2);
  const heroPl = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 1.0, 64), lacq); heroPl.position.set(SC.x, 0.5, SC.z); heroPl.castShadow = heroPl.receiveShadow = true; scene.add(heroPl);
  const heroRim = new THREE.Mesh(new THREE.TorusGeometry(1.31, 0.025, 8, 96), glow); heroRim.rotation.x = Math.PI / 2; heroRim.position.set(SC.x, 1.0, SC.z); scene.add(heroRim);
  let hero = watch('steel'); hero.scale.setScalar(0.62); hero.position.set(SC.x, 2.25, SC.z); scene.add(hero);

  // light: moonlit outside, warm inside; a shadowed key in the salon
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), new THREE.MeshBasicMaterial({ color: 0x0a0f1a, side: THREE.BackSide })));
  for (let k = -3; k <= 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.5) })); s.position.set(0, 9, k * 5); es.add(s); }
  for (const x of [-19, 19]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 12, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.32, 0.5) })); s.position.set(x, 0, 0); es.add(s); }
  scene.environment = pm.fromScene(es, 0.03).texture; pm.dispose();
  scene.environmentIntensity = 0.8;
  const hemi = new THREE.HemisphereLight(0x324466, 0x0a0a0c, 0.9); scene.add(hemi);
  // facade uplights grazing the lacquer and the sign
  for (const x of [-9, 9]) { const u = new THREE.SpotLight(0xffd9a8, 90, 22, 0.5, 0.8, 1.4); u.position.set(x, 0.3, 4); u.target.position.set(x * 0.6, 10, 0); scene.add(u, u.target); }
  const signL = new THREE.PointLight(0xffd9a8, 30, 10, 1.5); signL.position.set(0, 9, 3); scene.add(signL);
  const moon = new THREE.DirectionalLight(0x9fb4e0, 1.6); moon.position.set(-14, 22, 26); moon.castShadow = true; moon.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 }); moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.04; scene.add(moon);
  const warm = new THREE.PointLight(0xffd6a6, 60, 26, 1.3); warm.position.set(0, 7.5, -14); scene.add(warm);
  const warm2 = new THREE.PointLight(0xffd6a6, 60, 26, 1.3); warm2.position.set(0, 7.5, -36); scene.add(warm2);
  const key = new THREE.SpotLight(0xfff0dc, 0, 22, 0.5, 0.5, 1.2); key.position.set(SC.x - 3, 8.8, SC.z + 3); key.target = hero; key.castShadow = !low; key.shadow.mapSize.set(1024, 1024); scene.add(key);
  const doorGlow = new THREE.PointLight(0xffcf96, 0, 18, 1.5); doorGlow.position.set(0, 3, -3); scene.add(doorGlow);

  return { scene, floor, doors, vitrines, bigRing, heroRef: { get: () => hero, set: h => { scene.remove(hero); hero = h; scene.add(hero); key.target = hero; } }, SC, warm, warm2, key, doorGlow, hemi, moon };
}

// ------------------------------------------------------------------ player
export async function init({ root, onColourway = () => {}, isTouch = false }) {
  const stage = root.querySelector('[data-pv-stage]'), track = root.querySelector('[data-pv-track]'), canvas = root.querySelector('[data-pv-canvas]');
  const caps = [...root.querySelectorAll('[data-pv-cap]')].map(el => ({ el, a: +el.dataset.a / 100, b: +el.dataset.b / 100, v: -1 }));
  const meter = root.querySelector('[data-pv-meter]'), doorBtn = root.querySelector('[data-pv-door]'), hint = root.querySelector('[data-pv-hint]');
  const low = isTouch || Math.min(screen.width, screen.height) < 500;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no gl');
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const S = build(renderer, low);
  const refl = reflector(renderer, S.scene, S.floor, low ? 0.35 : 0.5);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
  const path = makePath(KEYS);
  let W = 1, H = 1, dpr = Math.min(devicePixelRatio || 1, low ? 1.4 : 1.6);
  const resize = () => { W = stage.clientWidth || innerWidth; H = stage.clientHeight || innerHeight; renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = W / H < 0.9 ? 62 : 46; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(stage); resize();

  // ---- interaction state
  let p = 0, target = 0, fixed = null, active = false, raf = 0, last = performance.now(), time = 0, doorForce = 0;
  const look = { x: 0, y: 0, tx: 0, ty: 0, drag: false, sx: 0, sy: 0, bx: 0, by: 0 };
  let current = 'steel';
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pick = (e) => {
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(S.scene.children, true);
    for (const h of hits) { let o = h.object; while (o) { if (o.userData?.vitrine) return { vitrine: o.userData.vitrine }; if (o.userData?.door) return { door: true }; o = o.parent; } if (h.distance < 60) break; }
    return null;
  };
  function choose(grp) {
    S.vitrines.forEach(v => { v.userData.target = v === grp ? 1 : 0; });
    if (current !== grp.userData.k) { current = grp.userData.k; const h = watch(current); h.scale.setScalar(0.62); h.position.copy(S.heroRef.get().position); h.rotation.copy(S.heroRef.get().rotation); S.heroRef.set(h); onColourway(current); }
    kick();
  }
  canvas.addEventListener('pointerdown', e => { look.drag = true; look.sx = e.clientX; look.sy = e.clientY; look.bx = look.tx; look.by = look.ty; look.moved = false; });
  addEventListener('pointermove', e => {
    if (look.drag) { const dx = (e.clientX - look.sx) / W, dy = (e.clientY - look.sy) / H; if (Math.abs(dx) + Math.abs(dy) > 0.01) look.moved = true; look.tx = clamp(look.bx + dx * 2.4, -1, 1); look.ty = clamp(look.by + dy * 2, -1, 1); kick(); return; }
    if (isTouch || !active) return;
    const hit = pick(e); canvas.style.cursor = hit ? 'pointer' : 'grab';
    S.vitrines.forEach(v => { v.userData.hover = hit && hit.vitrine === v ? 1 : 0; }); kick();
  }, { passive: true });
  addEventListener('pointerup', e => {
    if (!look.drag) return; look.drag = false;
    if (!look.moved) { const hit = pick(e); if (hit?.vitrine) choose(hit.vitrine); else if (hit?.door) { doorForce = doorForce ? 0 : 1; } }
    else hint?.classList.add('is-used');
    // let the view drift back to the path
    setTimeout(() => { if (!look.drag) { look.tx = 0; look.ty = 0; kick(); } }, 1800);
  });
  doorBtn?.addEventListener('click', () => { doorForce = doorForce ? 0 : 1; doorBtn.setAttribute('aria-pressed', String(!!doorForce)); kick(); });
  root.querySelectorAll('[data-pv-pick]').forEach(b => b.addEventListener('click', () => { const v = S.vitrines.find(x => x.userData.k === b.dataset.pvPick); if (v) choose(v); }));

  // ---- frame
  const up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), qd = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
  let doorOpen = 0;
  function frame(now) {
    raf = 0; const dt = Math.min((now - last) / 1000, 0.1); last = now; time += dt;
    const r = track.getBoundingClientRect(); target = fixed ?? clamp(-r.top / Math.max(1, r.height - innerHeight));
    p += (target - p) * (1 - Math.exp(-dt * 6)); if (Math.abs(target - p) < 0.00005 || fixed != null) p = target;
    look.x += (look.tx - look.x) * (1 - Math.exp(-dt * 5)); look.y += (look.ty - look.y) * (1 - Math.exp(-dt * 5));
    const s = path(p);
    camera.position.copy(s.pos); camera.position.y += Math.sin(time * 0.6) * 0.015;
    m4.lookAt(camera.position, s.tgt, up); camera.quaternion.setFromRotationMatrix(m4);
    eul.set(-look.y * 0.35, -look.x * 0.6, 0); qd.setFromEuler(eul); camera.quaternion.multiply(qd);
    // doors: scroll opens them between 10% and 23%; a click can open them earlier
    const want = Math.max(smooth(0.1, 0.23, p), doorForce);
    doorOpen += (want - doorOpen) * (1 - Math.exp(-dt * 4));
    S.doors[0].rotation.y = -doorOpen * 1.35; S.doors[1].rotation.y = doorOpen * 1.35;
    S.doorGlow.intensity = 40 * doorOpen;
    // vitrines: watches turn; a chosen one lifts its glass and rises into its spotlight
    for (const v of S.vitrines) {
      const u = v.userData; u.open += (u.target - u.open) * (1 - Math.exp(-dt * 4));
      const hv = u.hover * 0.15;
      u.glass.position.y = 1.58 + u.open * 0.9; u.glass.material.opacity = 0.12 * (1 - u.open * 0.6);
      u.w.position.y = 1.58 + u.open * 0.22 + Math.sin(time * 1.4 + v.position.z) * 0.015;
      u.w.rotation.y = time * 0.5 + v.position.z; u.w.rotation.x = -0.25;
      u.spot.intensity = 14 + 40 * u.open + 30 * hv;
      const d = new Date(); u.w.userData.sh.rotation.z = -((d.getSeconds() + d.getMilliseconds() / 1000) / 60) * Math.PI * 2;
    }
    // the salon: the ring turns with the scroll, the hero piece turns slowly
    S.bigRing.rotation.y = p * Math.PI * 1.6 + time * 0.05; S.bigRing.rotation.z = Math.sin(p * 3) * 0.2;
    const hero = S.heroRef.get(); hero.rotation.y = -Math.PI / 2 + 0.35 + Math.sin(time * 0.3) * 0.25 - smooth(0.7, 1, p) * 0.3; hero.rotation.x = -0.2;
    S.key.intensity = 260 * smooth(0.62, 0.86, p);
    // exposure opens up as you come inside
    renderer.toneMappingExposure = lerp(0.95, 1.15, smooth(0.15, 0.35, p));
    if (meter) meter.style.transform = `scaleX(${p.toFixed(4)})`;
    caps.forEach(c => { const v = (c.a <= 0 ? 1 : smooth(c.a, c.a + 0.03, p)) * (c.b >= 1 ? 1 : 1 - smooth(c.b - 0.03, c.b, p)); if (Math.abs(v - c.v) > 0.002) { c.v = v; c.el.style.opacity = v.toFixed(3); c.el.style.transform = `translate3d(0,${((1 - v) * 18).toFixed(1)}px,0)`; c.el.style.visibility = v > 0.01 ? 'visible' : 'hidden'; } });
    camera.updateMatrixWorld();
    refl.update(camera, W * dpr, H * dpr);
    renderer.render(S.scene, camera);
    if (active) kick();
  }
  function kick() { if (!raf && active && !document.hidden && !window.__pvPause) raf = requestAnimationFrame(frame); }
  new IntersectionObserver(([en]) => { active = en.isIntersecting; if (active) { last = performance.now(); kick(); } }, { rootMargin: '200px 0px' }).observe(track);
  addEventListener('scroll', kick, { passive: true });
  renderer.compile(S.scene, camera);
  const api = {
    setColourway(k) { const v = S.vitrines.find(x => x.userData.k === k); if (v && k !== current) choose(v); },
    // test hook: draw one exact progress point
    shot(pp) { fixed = pp; doorOpen = Math.max(smooth(0.1, 0.23, pp), doorForce); const a = active; active = false; for (let i = 0; i < 6; i++) frame(last + 100 * (i + 1)); active = a; },
    S, camera, renderer,
  };
  return api;
}
