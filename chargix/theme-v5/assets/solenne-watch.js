// CHARGIX · the Solenne Ligne 39 watch, modelled in code at product-shot detail.
// 39 mm case (1 unit = 10 mm): brushed flanks with polished chamfers, faceted lugs,
// a sunburst dial whose brushing is real anisotropy (not a painted gradient), applied
// bevelled indices, faceted dauphine hands, a domed sapphire with refraction, and a
// grained, stitched leather strap. buildWatch({ cw, renderer }) → { group, setColourway, tick }.
import * as THREE from './three.module.min.js';

export const CW = {
  steel: { metal: 0xd9dce0, dial: '#13213f', dial2: '#3a5aa0', ink: '#ece8de', idx: 0xf2f2f4, sec: 0xe2643f, strap: 0x1d1a1a, stitch: '#d9d2c3' },
  gold: { metal: 0xe7c27d, dial: '#0f2a1b', dial2: '#3a7350', ink: '#f2e6c4', idx: 0xf0d18e, sec: 0xf0d18e, strap: 0x3b2314, stitch: '#c9a46a' },
  titanium: { metal: 0xa7abb1, dial: '#d58b70', dial2: '#f7cdb9', ink: '#2a272a', idx: 0x2f3036, sec: 0x1d3f7a, strap: 0xcdbfb2, stitch: '#f3ede2' },
};

const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ---- textures
function dialMap(d, size) {
  const c = cv(size), g = c.getContext('2d'), o = size / 2, k = size / 1024;
  const gr = g.createRadialGradient(o, o, 0, o, o, o); gr.addColorStop(0, d.dial2); gr.addColorStop(0.55, d.dial); gr.addColorStop(1, d.dial);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  // darkened outer edge (the dial falls away under the rehaut)
  const vg = g.createRadialGradient(o, o, o * 0.82, o, o, o); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = vg; g.fillRect(0, 0, size, size);
  // printed minute track
  g.strokeStyle = d.ink; g.fillStyle = d.ink;
  for (let i = 0; i < 60; i++) { if (i % 5 === 0) continue; const a = (i / 60) * Math.PI * 2; g.lineWidth = 2.2 * k; g.beginPath(); g.moveTo(o + Math.sin(a) * o * 0.965, o - Math.cos(a) * o * 0.965); g.lineTo(o + Math.sin(a) * o * 0.93, o - Math.cos(a) * o * 0.93); g.stroke(); }
  for (let i = 0; i < 240; i++) { if (i % 4 === 0) continue; const a = (i / 240) * Math.PI * 2; g.lineWidth = 0.9 * k; g.globalAlpha = 0.55; g.beginPath(); g.moveTo(o + Math.sin(a) * o * 0.965, o - Math.cos(a) * o * 0.965); g.lineTo(o + Math.sin(a) * o * 0.952, o - Math.cos(a) * o * 0.952); g.stroke(); }
  g.globalAlpha = 1; g.lineWidth = 1.4 * k; g.beginPath(); g.arc(o, o, o * 0.968, 0, 7); g.stroke(); g.beginPath(); g.arc(o, o, o * 0.926, 0, 7); g.stroke();
  // print
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `400 ${64 * k}px "Italiana", Didot, "Bodoni 72", Georgia, serif`; if ('letterSpacing' in g) g.letterSpacing = `${18 * k}px`; g.fillText('SOLENNE', o + 9 * k, o - o * 0.36);
  g.font = `500 ${19 * k}px "Manrope", "Helvetica Neue", Arial, sans-serif`; if ('letterSpacing' in g) g.letterSpacing = `${7 * k}px`; g.globalAlpha = 0.85;
  g.fillText('AUTOMATIQUE', o + 3 * k, o - o * 0.245);
  g.fillText('LIGNE 39', o + 3 * k, o + o * 0.4); g.font = `500 ${14 * k}px "Manrope", "Helvetica Neue", Arial, sans-serif`; g.fillText('GENÈVE', o + 3 * k, o + o * 0.47);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// anisotropy direction map: radial brushing (a sunburst), strength in blue
let _sun = null;
function sunburstAniso(size = 512) {
  if (_sun) return _sun;
  const c = cv(size), g = c.getContext('2d'), img = g.createImageData(size, size), o = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - o, dy = o - y, r = Math.hypot(dx, dy) || 1, i = (y * size + x) * 4;
    img.data[i] = ((dx / r) * 0.5 + 0.5) * 255; img.data[i + 1] = ((dy / r) * 0.5 + 0.5) * 255; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); _sun = new THREE.CanvasTexture(c); _sun.colorSpace = THREE.NoColorSpace; return _sun;
}
// circular brushing for the case flanks (tangential direction on a lathe UV = along u)
let _grain = null;
function leatherGrain() {
  if (_grain) return _grain;
  const c = cv(1024), g = c.getContext('2d'), r = rng(41);
  g.fillStyle = '#808080'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 26000; i++) { const x = r() * 1024, y = r() * 1024, s = 1 + r() * 3.2, v = r() > 0.5 ? 200 : 40; g.fillStyle = `rgba(${v},${v},${v},${(0.08 + r() * 0.12).toFixed(2)})`; g.beginPath(); g.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(30,30,30,${(0.1 + r() * 0.15).toFixed(2)})`; g.lineWidth = 0.6; g.beginPath(); let x = r() * 1024, y = r() * 1024; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
  _grain = new THREE.CanvasTexture(c); _grain.wrapS = _grain.wrapT = THREE.RepeatWrapping; _grain.repeat.set(2, 5); return _grain;
}

// ---- geometry helpers
const lathe = (pts, seg = 160) => { const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg); g.rotateX(Math.PI / 2); return g; };
// faceted dauphine hand: two flat facets meeting on a raised centre ridge
function dauphine(len, w, tail, h) {
  const B = [0, -tail, 0], L = [-w, len * 0.06, 0], T = [0, len, 0], R = [w, len * 0.06, 0], Bt = [0, -tail, h], Tt = [0, len, h * 0.25];
  const tri = []; const f = (a, b, c) => tri.push(...a, ...b, ...c);
  f(B, L, Bt); f(L, Tt, Bt); f(L, T, Tt); // left facet (ridge to edge)
  f(B, Bt, R); f(R, Bt, Tt); f(R, Tt, T); // right facet
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3)); g.computeVertexNormals(); return g;
}
function leatherStrap(width, thick, len, R) {
  // a tapered padded strap that curves down and away from the case
  const g = new THREE.BoxGeometry(width, len, thick, 8, 70, 3), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + len / 2) / len, a = t / R * len, taper = 1 - t * 0.16;
    const pad = 1 - Math.pow(Math.abs(v.x) / (width / 2), 6) * 0.45; // softly rounded padded edges
    const z = v.z * (v.z > 0 ? pad : 1), rr = R - z;
    p.setXYZ(i, v.x * taper, Math.sin(a) * rr, -(R - Math.cos(a) * rr));
  }
  g.computeVertexNormals(); return g;
}

export function buildWatch({ cw = 'steel', renderer, hq = true } = {}) {
  const d = CW[cw] || CW.steel, aniso = renderer?.capabilities?.getMaxAnisotropy?.() || 8;
  const M = {
    brushed: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(d.metal).multiplyScalar(0.82), metalness: 1, roughness: 0.34, anisotropy: 0.8, anisotropyRotation: Math.PI / 2 }),
    polish: new THREE.MeshPhysicalMaterial({ color: d.metal, metalness: 1, roughness: 0.05 }),
    idx: new THREE.MeshPhysicalMaterial({ color: d.idx, metalness: 1, roughness: 0.07 }),
    hand: new THREE.MeshPhysicalMaterial({ color: d.idx, metalness: 1, roughness: 0.06, side: THREE.DoubleSide }),
    sec: new THREE.MeshPhysicalMaterial({ color: d.sec, metalness: 0.6, roughness: 0.3, clearcoat: 1 }),
    lume: new THREE.MeshStandardMaterial({ color: 0xf1eee2, roughness: 0.55 }),
    dial: new THREE.MeshPhysicalMaterial({ map: null, metalness: 0.55, roughness: 0.32, anisotropy: 0.9, anisotropyMap: sunburstAniso(), clearcoat: 0.9, clearcoatRoughness: 0.08 }),
    rehaut: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(d.dial).multiplyScalar(0.7), metalness: 0.4, roughness: 0.45 }),
    crystal: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transmission: hq ? 1 : 0, transparent: !hq, opacity: hq ? 1 : 0.06, ior: 1.77, thickness: 0.25, specularIntensity: 1, attenuationColor: 0xeef4ff, attenuationDistance: 3, depthWrite: !!hq }),
    strap: new THREE.MeshPhysicalMaterial({ color: d.strap, roughness: 0.62, bumpMap: leatherGrain(), bumpScale: 1.2, sheen: 0.35, sheenRoughness: 0.6, sheenColor: 0x555049, clearcoat: 0.15, clearcoatRoughness: 0.6 }),
    stitch: new THREE.MeshStandardMaterial({ color: d.stitch, roughness: 0.8 }),
    date: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
  };
  const dm = dialMap(d, hq ? 2048 : 1024); dm.anisotropy = aniso; M.dial.map = dm;
  const group = new THREE.Group(), dialG = new THREE.Group(); group.add(dialG);
  const add = (geo, mat, parent = group) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  // case middle: brushed flank between two polished chamfers
  add(lathe([[1.70, -0.44], [1.86, -0.47], [1.94, -0.42]], 160), M.polish);
  add(lathe([[1.94, -0.42], [1.985, -0.25], [1.995, 0.0], [1.985, 0.22], [1.955, 0.3]], 160), M.brushed);
  add(lathe([[1.955, 0.3], [1.9, 0.345], [1.7, 0.345]], 160), M.polish);
  // bezel: thin, polished, slightly concave, fine coin edge
  add(lathe([[1.62, 0.345], [1.955, 0.345], [1.968, 0.38], [1.94, 0.47], [1.8, 0.525], [1.66, 0.52], [1.6, 0.49], [1.62, 0.345]], 200), M.polish);
  { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.022, 0.08), M.polish, 240), o = new THREE.Object3D();
    for (let i = 0; i < 240; i++) { const a = (i / 240) * Math.PI * 2; o.position.set(Math.cos(a) * 1.966, Math.sin(a) * 1.966, 0.41); o.rotation.set(0, 0, a); o.updateMatrix(); im.setMatrixAt(i, o.matrix); } group.add(im); }
  // lugs: bevelled extrusions, brushed tops with polished bevels
  { const s = new THREE.Shape(); s.moveTo(1.45, -0.38); s.lineTo(2.44, -0.29); s.quadraticCurveTo(2.66, -0.24, 2.65, -0.08); s.lineTo(2.58, 0.1); s.quadraticCurveTo(2.46, 0.25, 2.22, 0.26); s.lineTo(1.45, 0.33); s.lineTo(1.45, -0.38);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.045, bevelSegments: 4, curveSegments: 16 });
    geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
    for (const sx of [-1, 1]) for (const sy of [1, -1]) { const m = add(geo, [M.brushed, M.polish]); m.position.x = sx * 0.84 - 0.13; if (sy < 0) { m.rotation.z = Math.PI; m.position.x = -m.position.x; } } }
  // crown with knurling and a polished end
  { const cr = new THREE.Group(); cr.position.set(2.02, 0, -0.03); group.add(cr);
    const c1 = add(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 32), M.brushed, cr); c1.rotation.z = Math.PI / 2;
    const c2 = add(new THREE.CylinderGeometry(0.26, 0.26, 0.3, 64), M.polish, cr); c2.rotation.z = Math.PI / 2; c2.position.x = 0.22;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.022, 0.04), M.polish, 36), o = new THREE.Object3D();
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; o.position.set(0.22, Math.cos(a) * 0.262, Math.sin(a) * 0.262); o.rotation.set(a, 0, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); } cr.add(im); }

  // dial, rehaut, indices, date
  add(new THREE.CircleGeometry(1.62, 160), M.dial, dialG).position.z = 0.16;
  add(lathe([[1.62, 0.16], [1.68, 0.16], [1.68, 0.335], [1.6, 0.335], [1.52, 0.2], [1.62, 0.16]], 160), M.rehaut, dialG);
  { const bevel = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.lineTo(-w / 2, -h / 2); return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2 }); };
    const big = bevel(0.06, 0.3), small = bevel(0.05, 0.24), lumeG = new THREE.BoxGeometry(0.022, 0.16, 0.01);
    for (let i = 0; i < 12; i++) {
      if (i === 3) continue; const a = Math.PI / 2 - (i / 12) * Math.PI * 2, offs = i === 0 ? [-0.055, 0.055] : [0];
      for (const off of offs) { const m = add(i % 3 === 0 ? big : small, M.idx, dialG); m.position.set(Math.cos(a) * 1.3 + Math.cos(a - Math.PI / 2) * off, Math.sin(a) * 1.3 + Math.sin(a - Math.PI / 2) * off, 0.165); m.rotation.z = a - Math.PI / 2;
        const l = add(lumeG, M.lume, dialG); l.position.copy(m.position); l.position.z = 0.215; l.rotation.z = m.rotation.z; }
    }
    { const fs = new THREE.Shape(); fs.moveTo(-0.16, -0.12); fs.lineTo(0.16, -0.12); fs.lineTo(0.16, 0.12); fs.lineTo(-0.16, 0.12); fs.lineTo(-0.16, -0.12);
      const hole = new THREE.Path(); hole.moveTo(-0.12, -0.085); hole.lineTo(-0.12, 0.085); hole.lineTo(0.12, 0.085); hole.lineTo(0.12, -0.085); hole.lineTo(-0.12, -0.085); fs.holes.push(hole);
      const frame = add(new THREE.ExtrudeGeometry(fs, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.012, bevelSegments: 2 }), M.idx, dialG); frame.position.set(1.2, 0, 0.165); }
    const c = cv(160, 120), g = c.getContext('2d'); g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, 160, 120); g.fillStyle = '#18181b'; g.font = '600 76px "Manrope", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('14', 80, 66);
    M.date.map = new THREE.CanvasTexture(c); M.date.map.colorSpace = THREE.SRGBColorSpace;
    const win = add(new THREE.PlaneGeometry(0.24, 0.17), M.date, dialG); win.position.set(1.2, 0, 0.163); }
  // hands
  const hh = add(dauphine(0.98, 0.085, 0.16, 0.04), M.hand, dialG); hh.position.z = 0.24;
  const mh = add(dauphine(1.45, 0.07, 0.2, 0.035), M.hand, dialG); mh.position.z = 0.29;
  const sh = new THREE.Group(); sh.position.z = 0.33; dialG.add(sh);
  { const n = add(new THREE.BoxGeometry(0.014, 1.88, 0.01), M.sec, sh); n.position.y = 0.5;
    const cw2 = add(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 32), M.sec, sh); cw2.rotation.x = Math.PI / 2; cw2.position.y = -0.3;
    const hub = add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 32), M.sec, sh); hub.rotation.x = Math.PI / 2; }
  // domed sapphire
  { const R = 4.2, a = Math.asin(1.62 / R), geo = new THREE.SphereGeometry(R, 128, 16, 0, Math.PI * 2, 0, a); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, M.crystal); m.position.z = 0.53 - R * Math.cos(a); m.renderOrder = 10; group.add(m); }
  // strap: two padded leather halves with saddle stitching and spring bars
  { const geo = leatherStrap(1.86, 0.16, 3.6, 2.8);
    for (const s of [1, -1]) {
      const half = new THREE.Group(); half.position.set(0, s * 2.38, -0.05); if (s < 0) half.rotation.z = Math.PI; group.add(half);
      add(geo, M.strap, half);
      const st = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.06, 0.012), M.stitch, 120), o = new THREE.Object3D(); let k = 0;
      const p = new THREE.Vector3();
      for (const sx of [-0.76, 0.76]) for (let i = 0; i < 60; i++) {
        const t = (i + 0.5) / 60, len = 3.6, a = (t * len) / 2.8, rr = 2.8 - 0.085, taper = 1 - t * 0.16;
        p.set(sx * taper, Math.sin(a) * rr, -(2.8 - Math.cos(a) * rr)); o.position.copy(p); o.rotation.set(a, 0, 0); o.updateMatrix(); st.setMatrixAt(k++, o.matrix);
      }
      half.add(st);
      const bar = add(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 16), M.polish, half); bar.rotation.z = Math.PI / 2; bar.position.z = 0.0;
    }
  }

  function tick(date = new Date()) {
    const s = date.getSeconds() + date.getMilliseconds() / 1000, m = date.getMinutes() + s / 60, h = (date.getHours() % 12) + m / 60;
    sh.rotation.z = -(s / 60) * Math.PI * 2; mh.rotation.z = -(m / 60) * Math.PI * 2; hh.rotation.z = -(h / 12) * Math.PI * 2;
  }
  // the classic display time (10:10:32) unless a live time is asked for
  tick(new Date(2026, 0, 1, 10, 10, 32));
  function setColourway(k) {
    const n = CW[k]; if (!n) return;
    M.polish.color.set(n.metal); M.brushed.color.set(n.metal).multiplyScalar(0.82);
    M.idx.color.set(n.idx); M.hand.color.set(n.idx); M.sec.color.set(n.sec); M.strap.color.set(n.strap); M.stitch.color.set(n.stitch); M.rehaut.color.set(n.dial).multiplyScalar(0.7);
    M.dial.map = dialMap(n, hq ? 2048 : 1024); M.dial.map.anisotropy = aniso; M.dial.needsUpdate = true;
  }
  group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group, tick, setColourway, M, hands: { hh, mh, sh } };
}
