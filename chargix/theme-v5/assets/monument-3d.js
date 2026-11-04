// CHARGIX · MONUMENT — the building, rendered live with Three.js.
// One connected world: forecourt, bronze door, threshold corridor, the hall
// with its steel monoliths and sun blades, the six-storey structure, the
// pivoting wall, the galleries and, through the galleries' end, the rotunda.
// Scroll progress through each story region drives a camera along a smooth
// spline (C1 position, speed eased between keys); doors, walls and the
// oculus move with the narrative. Chapter titles, labels pinned to real 3D
// points, the rail and the threshold flash are synced to the same progress.
// Reduced motion holds one rendered still per chapter (CSS). Without WebGL
// the previous frame film (film-core.js) takes over.
import * as THREE from './three.module.min.js';

const doc = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// Blender (x right, y forward, z up) → three (x right, y up, z towards viewer)
const V = (x, y, z) => new THREE.Vector3(x, z, -y);

// ------------------------------------------------------------------ narrative
const ROT_Y = 236;            // rotunda centre, beyond the galleries
const R = 17, RH = 20, OCULUS = 4.4;
const HALL = [
  // p, camera, look-at, focal mm, exposure EV   (same keys the offline film used)
  [0.000, [0, -64, 1.7], [0, 0, 9.5], 30, -0.2],
  [0.070, [0, -55, 1.75], [0, 0, 9.0], 30, -0.2],
  [0.140, [0, -32, 1.9], [0, 0, 7.5], 30, -0.15],
  [0.195, [0, -12, 2.0], [0, 10, 6.0], 28, -0.1],
  [0.232, [0, 4.5, 2.0], [0, 30, 4.8], 26, 0.25],
  [0.262, [0, 20, 2.0], [0, 40, 5.5], 24, 0.55],
  [0.300, [0, 36.5, 2.4], [0, 70, 16], 22, 0.3],
  [0.380, [2.5, 42, 3.4], [-6, 72, 26], 20, 0.2],
  [0.430, [1.0, 45.5, 2.2], [0, 70, 10], 22, 0.2],
  [0.480, [-1.6, 52, 1.35], [1.5, 72, 6.0], 24, 0.15],
  [0.530, [1.2, 61, 1.4], [-1, 80, 5.0], 24, 0.15],
  [0.580, [-2.0, 70, 2.6], [0, 92, 5.0], 26, 0.1],
  [0.620, [-5.0, 68.5, 5.0], [0, 90, 7.5], 26, 0.05],
  [0.680, [-7.5, 67.5, 13.0], [0, 90, 14.0], 26, 0],
  [0.740, [-5.0, 67.0, 22.0], [0, 90, 22.0], 26, 0],
  [0.800, [1.0, 67.5, 30.0], [0, 90, 28.5], 26, 0],
  [0.840, [11.0, 78.0, 38.5], [0, 98, 31.0], 24, 0],
  [0.880, [15.0, 104.0, 24.0], [0, 128, 10.0], 24, 0.05],
  [0.915, [6.0, 118.0, 6.0], [1.5, 134, 5.0], 24, 0.05],
  [0.950, [3.1, 126.0, 2.6], [2.0, 150, 4.2], 24, 0.1],
  [1.000, [2.6, 141.0, 2.4], [1.0, 175, 4.2], 24, 0.1],
];
const LIGHT = [
  [0.00, [-1.4, -36, 1.8], [0.6, 0, 3.2], 28, 0.2],
  [0.18, [-0.4, -22, 1.8], [0.2, 0, 4.2], 26, 0.1],
  [0.34, [0.0, -9.0, 1.8], [0.0, 10, 9.0], 22, -0.1],
  [0.50, [0.0, -3.0, 1.8], [0.0, 4.0, 20.0], 20, -0.2],
  [0.66, [0.0, -0.8, 1.8], [0.0, 0.4, 30.0], 18, -0.3],
  [0.82, [0.0, -0.1, 1.8], [0.0, 0.25, 34.0], 18, -0.4],
  [1.00, [0.0, 0.0, 1.8], [0.0, 0.2, 36.0], 18, -0.4],
].map(([p, c, t, f, e]) => [p, [c[0], c[1] + ROT_Y, c[2]], [t[0], t[1] + ROT_Y, t[2]], f, e]);

const FILMS = {
  hall: { keys: HALL, flash: p => 0.1 * smooth(0.24, 0.262, p) * (1 - smooth(0.27, 0.31, p)), fade: p => smooth(0.97, 1, p) },
  light: { keys: LIGHT, flash: p => 0.22 * smooth(0.86, 1, p), fade: () => 0 },
};

// ------------------------------------------------------------------ camera path
// Position and look-at follow centripetal Catmull-Rom curves through the keys.
// Scroll progress maps to arc length with a monotone cubic, so speed changes
// smoothly through each key instead of jumping when a segment changes length.
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
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
function makePath(keys) {
  const ps = keys.map(k => k[0]);
  const pos = new THREE.CatmullRomCurve3(keys.map(k => V(...k[1])), false, 'centripetal');
  const tgt = new THREE.CatmullRomCurve3(keys.map(k => V(...k[2])), false, 'centripetal');
  // arc-length fraction at each key (the curve passes through key i at u = i/(n-1))
  const lens = pos.getLengths(400), total = lens[lens.length - 1];
  const keyU = keys.map((_, i) => i / (keys.length - 1));
  const arcAt = u => { const f = u * 400, i = Math.floor(f), t = f - i; return (lens[Math.min(i, 400)] + ((lens[Math.min(i + 1, 400)] ?? total) - lens[Math.min(i, 400)]) * t) / total; };
  const keyS = keyU.map(arcAt);
  const sOfP = monotone(ps, keyS);
  // look-at uses its own key timing (keyU) through the same progress mapping
  const uOfP = monotone(ps, keyU);
  const fov = monotone(ps, keys.map(k => k[3]));
  const ev = monotone(ps, keys.map(k => k[4]));
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  return p => {
    p = clamp(p);
    pos.getPointAt(clamp(sOfP(p)), P);
    tgt.getPoint(clamp(uOfP(p)), T);
    return { pos: P, tgt: T, mm: fov(p), ev: ev(p) };
  };
}

// ------------------------------------------------------------------ procedural textures
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// value noise: a small random grid drawn up with bilinear smoothing, several octaves
function noise(g, size, seed, octaves = [[8, 0.5], [32, 0.3], [128, 0.2]], dark = '0,0,0', light = '255,255,255') {
  const r = rng(seed);
  for (const [cells, amt] of octaves) {
    const s = canvas(cells); const sg = s.getContext('2d'); const im = sg.createImageData(cells, cells);
    for (let i = 0; i < cells * cells; i++) { const v = r() * 255; im.data.set([v, v, v, 255], i * 4); }
    sg.putImageData(im, 0, 0);
    g.save(); g.globalAlpha = amt; g.globalCompositeOperation = 'soft-light'; g.imageSmoothingEnabled = true; g.drawImage(s, 0, 0, size, size); g.restore();
  }
}
function tex(c, repeatM, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / repeatM, 1 / repeatM);
  t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// stone: base, bedding streaks, pits, joints (block w×h metres on a tile of `tile` metres)
function stoneMaps({ base, streak, tile, bw, bh, seed, joint = '#3a3026', pits = 600, size = 1024 }) {
  const c = canvas(size), g = c.getContext('2d'), b = canvas(size), bg = b.getContext('2d');
  const r = rng(seed), px = size / tile;
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  noise(g, size, seed, [[3, 0.18], [12, 0.12], [64, 0.1], [256, 0.12], [1024, 0.1]]);
  bg.fillStyle = '#808080'; bg.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const y = r() * size, x = r() * size, len = 40 + r() * 400, w = 0.6 + r() * 2.2;
    g.strokeStyle = `rgba(${streak},${(0.02 + r() * 0.05).toFixed(3)})`; g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.7, y + (r() - 0.5) * 6, x + len, y + (r() - 0.5) * 4); g.stroke();
  }
  for (let i = 0; i < pits; i++) {
    const x = r() * size, y = r() * size, rx = 0.8 + r() * 3.5, ry = rx * (0.3 + r() * 0.4);
    g.fillStyle = `rgba(90,72,52,${(0.18 + r() * 0.25).toFixed(2)})`; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill();
    bg.fillStyle = '#404040'; bg.beginPath(); bg.ellipse(x, y, rx, ry, 0, 0, 7); bg.fill();
  }
  if (bw) {
    const rows = Math.round(tile / bh), cols = Math.round(tile / bw);
    for (let j = 0; j < rows; j++) {
      const y = j * bh * px, off = (j % 2) * bw * px / 2;
      g.fillStyle = joint; g.fillRect(0, y - 1.5, size, 3); bg.fillStyle = '#000'; bg.fillRect(0, y - 2, size, 4);
      g.fillStyle = 'rgba(255,248,236,.18)'; g.fillRect(0, y + 1.5, size, 1.5);
      for (let i = 0; i <= cols; i++) { const x = (i * bw * px + off) % size; g.fillStyle = joint; g.fillRect(x - 1.5, y, 3, bh * px); bg.fillStyle = '#000'; bg.fillRect(x - 2, y, 4, bh * px); }
      // a slight tone shift per block
      for (let i = 0; i <= cols; i++) { const x = (i * bw * px + off) % size; g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,250,240'},${(r() * 0.035).toFixed(3)})`; g.fillRect(x + 2, y + 2, bw * px - 4, bh * px - 4); }
    }
  }
  return { map: tex(c, tile), bump: tex(b, tile, false) };
}
function concreteMaps(seed, tone = '#8f8a83', size = 1024) {
  const tile = 4.8, c = canvas(size), g = c.getContext('2d'), b = canvas(size), bg = b.getContext('2d'), r = rng(seed), px = size / tile;
  g.fillStyle = tone; g.fillRect(0, 0, size, size); noise(g, size, seed, [[4, 0.14], [16, 0.1], [96, 0.1], [512, 0.14], [1024, 0.1]]);
  bg.fillStyle = '#808080'; bg.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 0.15 * px) { g.fillStyle = `rgba(0,0,0,${(0.01 + r() * 0.025).toFixed(3)})`; g.fillRect(0, y, size, 1 + r() * 1.5); }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) {
    const x = i * 2.4 * px, y = j * 1.2 * px;
    g.fillStyle = 'rgba(30,28,26,.35)'; g.fillRect(x, y, size, 2); g.fillRect(x, y, 2, 1.2 * px); bg.fillStyle = '#000'; bg.fillRect(x, y, size, 3); bg.fillRect(x, y, 3, 1.2 * px);
    for (const [u, v] of [[0.3, 0.3], [0.3, 0.9], [2.1, 0.3], [2.1, 0.9]]) { g.fillStyle = 'rgba(40,38,35,.7)'; g.beginPath(); g.arc(x + u * px, y + v * px, 4, 0, 7); g.fill(); bg.fillStyle = '#202020'; bg.beginPath(); bg.arc(x + u * px, y + v * px, 4, 0, 7); bg.fill(); }
  }
  return { map: tex(c, tile), bump: tex(b, tile, false) };
}
function floorMaps(seed) {
  const size = 1024, tile = 6, c = canvas(size), g = c.getContext('2d'), r = rng(seed), px = size / tile, rough = canvas(256), rg = rough.getContext('2d');
  g.fillStyle = '#1f1c19'; g.fillRect(0, 0, size, size); noise(g, size, seed, [[4, 0.15], [32, 0.08], [256, 0.06]]);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(190,170,140,${(0.04 + r() * 0.08).toFixed(3)})`; g.lineWidth = 0.6 + r() * 1.6;
    let x = r() * size, y = r() * size; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { const nx = x + (r() - 0.3) * 260, ny = y + (r() - 0.5) * 200; g.quadraticCurveTo((x + nx) / 2 + (r() - 0.5) * 80, (y + ny) / 2 + (r() - 0.5) * 80, nx, ny); x = nx; y = ny; }
    g.stroke();
  }
  for (let i = 0; i <= 3; i++) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(i * 2 * px - 1, 0, 2, size); g.fillRect(0, i * 2 * px - 1, size, 2); }
  rg.fillStyle = '#2e2e2e'; rg.fillRect(0, 0, 256, 256); noise(rg, 256, seed + 3, [[8, 0.5], [64, 0.3]]);
  const rm = tex(rough, tile * 2, false);
  return { map: tex(c, tile), rough: rm };
}
function plasterMap(seed) { const c = canvas(512), g = c.getContext('2d'); g.fillStyle = '#d9d3c8'; g.fillRect(0, 0, 512, 512); noise(g, 512, seed, [[8, 0.06], [64, 0.05], [256, 0.05]]); return tex(c, 6); }
function brushedRough(seed, base = 110) { const c = canvas(256), g = c.getContext('2d'), r = rng(seed); g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 1400; i++) { const v = base + (r() - 0.5) * 70; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, r() * 256, 256, 0.6 + r()); } return tex(c, 1.5, false); }
function cofferMap() {
  // dome coffers on the sphere's UVs: 40 columns × 12 rows, each a stepped recess lit from below
  const w = 2048, h = 512, c = canvas(w, h), g = c.getContext('2d'), b = canvas(w, h), bg = b.getContext('2d');
  g.fillStyle = '#c8b79c'; g.fillRect(0, 0, w, h); noise(g, w, 9, [[16, 0.15], [128, 0.12]]);
  bg.fillStyle = '#fff'; bg.fillRect(0, 0, w, h);
  const cw = w / 40, ch = h / 12;
  for (let j = 0; j < 12; j++) for (let i = 0; i < 40; i++) {
    const x = i * cw, y = j * ch, k = 1 - j / 14;
    for (let s = 0; s < 3; s++) {
      const ix = x + cw * (0.12 + s * 0.09) * k, iy = y + ch * (0.12 + s * 0.09), iw = cw - 2 * cw * (0.12 + s * 0.09) * k, ih = ch - 2 * ch * (0.12 + s * 0.09);
      g.fillStyle = `rgba(60,46,32,${0.1 + s * 0.06})`; g.fillRect(ix, iy, iw, ih);
      g.fillStyle = 'rgba(255,240,215,.16)'; g.fillRect(ix, iy + ih - 2, iw, 2);
      const v = 200 - s * 60; bg.fillStyle = `rgb(${v},${v},${v})`; bg.fillRect(ix, iy, iw, ih);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { map: t, bump: new THREE.CanvasTexture(b) };
}
function artMap(i) {
  // five large abstract canvases for the galleries
  const c = canvas(512, 640), g = c.getContext('2d'), r = rng(40 + i);
  const pal = [['#1d2b3a', '#c8a26a', '#e9e2d4', '#7a2f22'], ['#e8dfcf', '#2b2a28', '#b4532a', '#d9c39a'], ['#0f3b3a', '#e5d7b6', '#c2843f', '#1a1a1c'], ['#d6cbb6', '#3a4b63', '#a4472d', '#efe7d8'], ['#262321', '#cfa569', '#5f6e5a', '#e7e0d2']][i];
  g.fillStyle = pal[0]; g.fillRect(0, 0, 512, 640);
  if (i % 2) { g.fillStyle = pal[1]; g.fillRect(60, 80, 392, 300); g.fillStyle = pal[2]; g.beginPath(); g.arc(256, 430, 120, 0, 7); g.fill(); g.fillStyle = pal[3]; g.fillRect(0, 560, 512, 24); }
  else { for (let k = 0; k < 7; k++) { g.fillStyle = pal[1 + (k % 3)]; g.globalAlpha = 0.85; g.fillRect(40 + r() * 300, 40 + k * 82, 120 + r() * 200, 30 + r() * 40); } g.globalAlpha = 1; g.fillStyle = pal[3]; g.beginPath(); g.arc(380, 160, 70, 0, 7); g.fill(); }
  noise(g, 640, 70 + i, [[64, 0.08], [256, 0.06]]);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ------------------------------------------------------------------ geometry builders
// Boxes are written straight into one buffer per (zone, material) so the whole
// building is a few dozen draw calls. UVs are in metres (textures repeat per metre).
class Bucket {
  constructor() { this.p = []; this.n = []; this.u = []; this.i = []; }
  quad(a, b, c, d, nrm, ua, ub, uc, ud) {
    const o = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v.x, v.y, v.z);
    for (let k = 0; k < 4; k++) this.n.push(nrm.x, nrm.y, nrm.z);
    this.u.push(...ua, ...ub, ...uc, ...ud);
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i); g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
const _m3 = new THREE.Matrix3();
// box from Blender bounds; optional matrix (three space) applied after
function addBox(bk, x0, x1, y0, y1, z0, z1, mat4) {
  const X0 = x0, X1 = x1, Y0 = z0, Y1 = z1, Z0 = -y1, Z1 = -y0;
  const P = (x, y, z) => { const v = new THREE.Vector3(x, y, z); return mat4 ? v.applyMatrix4(mat4) : v; };
  const N = (x, y, z) => { const v = new THREE.Vector3(x, y, z); if (mat4) { _m3.getNormalMatrix(mat4); v.applyMatrix3(_m3).normalize(); } return v; };
  // +x / -x  (u = z, v = y)
  bk.quad(P(X1, Y0, Z1), P(X1, Y0, Z0), P(X1, Y1, Z0), P(X1, Y1, Z1), N(1, 0, 0), [-Z1, Y0], [-Z0, Y0], [-Z0, Y1], [-Z1, Y1]);
  bk.quad(P(X0, Y0, Z0), P(X0, Y0, Z1), P(X0, Y1, Z1), P(X0, Y1, Z0), N(-1, 0, 0), [Z0, Y0], [Z1, Y0], [Z1, Y1], [Z0, Y1]);
  // +y / -y  (u = x, v = z)
  bk.quad(P(X0, Y1, Z1), P(X1, Y1, Z1), P(X1, Y1, Z0), P(X0, Y1, Z0), N(0, 1, 0), [X0, -Z1], [X1, -Z1], [X1, -Z0], [X0, -Z0]);
  bk.quad(P(X0, Y0, Z0), P(X1, Y0, Z0), P(X1, Y0, Z1), P(X0, Y0, Z1), N(0, -1, 0), [X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]);
  // +z / -z  (u = x, v = y)
  bk.quad(P(X0, Y0, Z1), P(X1, Y0, Z1), P(X1, Y1, Z1), P(X0, Y1, Z1), N(0, 0, 1), [X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]);
  bk.quad(P(X1, Y0, Z0), P(X0, Y0, Z0), P(X0, Y1, Z0), P(X1, Y1, Z0), N(0, 0, -1), [-X1, Y0], [-X0, Y0], [-X0, Y1], [-X1, Y1]);
}
// a box centred at local origin, placed at a Blender position with a rotation about the vertical
function placeMat(bx, by, bz, rotDeg = 0) {
  return new THREE.Matrix4().makeTranslation(bx, bz, -by).multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(rotDeg)));
}

// ------------------------------------------------------------------ the world
function buildWorld(renderer, lowGPU) {
  const scene = new THREE.Scene();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // ---- materials
  const trav = stoneMaps({ base: '#cbbca3', streak: '120,96,68', tile: 3.2, bw: 1.6, bh: 0.8, seed: 3 });
  const travD = stoneMaps({ base: '#8f7f69', streak: '70,56,40', tile: 3.2, bw: 1.6, bh: 0.8, seed: 5 });
  const pav = stoneMaps({ base: '#a99d8b', streak: '96,84,70', tile: 4, bw: 2, bh: 1, seed: 7, pits: 300 });
  const conc = concreteMaps(11, '#8c8b88'), concD = concreteMaps(13, '#45433f');
  const flo = floorMaps(17);
  for (const t of [trav.map, trav.bump, travD.map, travD.bump, pav.map, pav.bump, conc.map, conc.bump, concD.map, concD.bump, flo.map, flo.rough]) t.anisotropy = aniso;
  const brushed = brushedRough(19);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // soft contact darkening near the floor and under high ceilings (cheap ambient occlusion)
  const ao = (m, k = 0.45, h = 2.2) => {
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n{ float a = mix(${(1 - k).toFixed(3)}, 1.0, smoothstep(0.0, ${h.toFixed(2)}, vWp.y)); reflectedLight.indirectDiffuse *= a; reflectedLight.directDiffuse *= mix(1.0, a, 0.5); }`);
    };
    return m;
  };
  const M = {
    trav: ao(std({ map: trav.map, bumpMap: trav.bump, bumpScale: 1.2, roughness: 0.78, color: 0xffffff })),
    travD: ao(std({ map: travD.map, bumpMap: travD.bump, bumpScale: 1.2, roughness: 0.82 })),
    pav: ao(std({ map: pav.map, bumpMap: pav.bump, bumpScale: 1, roughness: 0.86 }), 0.35, 1.5),
    conc: ao(std({ map: conc.map, bumpMap: conc.bump, bumpScale: 0.9, roughness: 0.9 }), 0.5, 3),
    concD: ao(std({ map: concD.map, bumpMap: concD.bump, bumpScale: 0.9, roughness: 0.9 }), 0.5, 2),
    floor: std({ map: flo.map, roughness: 0.2, roughnessMap: flo.rough, metalness: 0.0, envMapIntensity: 1.4 }),
    water: std({ color: 0x0c0e0f, roughness: 0.03, metalness: 0.1, envMapIntensity: 2.2 }),
    bronze: std({ color: 0x8a6440, metalness: 1, roughness: 0.38, roughnessMap: brushed }),
    steel: std({ color: 0xb4b9bf, metalness: 1, roughness: 0.22, roughnessMap: brushed, envMapIntensity: 1.3 }),
    steelL: std({ color: 0xd8dade, metalness: 1, roughness: 0.15 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xbfd2cd, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.16, envMapIntensity: 2, depthWrite: false, side: THREE.DoubleSide }),
    plaster: ao(std({ map: plasterMap(23), roughness: 0.92 }), 0.35, 2),
    slot: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.82, 0.6).multiplyScalar(2.2) }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.58).multiplyScalar(1.6) }),
    panel: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.93, 0.82).multiplyScalar(1.25) }),
    galLight: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.96, 0.9).multiplyScalar(2.4) }),
    dark: std({ color: 0x141312, roughness: 0.9 }),
  };
  const zones = {};
  const bucket = (zone, mat) => { zones[zone] ??= {}; return (zones[zone][mat] ??= new Bucket()); };
  const B = (zone, mat, ...a) => addBox(bucket(zone, mat), ...a);
  const dyn = {};
  const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); return m; };

  // ---- forecourt
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), M.pav); ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -50);
  ground.geometry.attributes.uv.array.forEach((_, i, a) => { a[i] *= 600; }); ground.receiveShadow = true; scene.add(ground);
  B('court', 'water', -2.0, 2.0, -48, -3.2, -0.6, -0.04);
  B('court', 'trav', -2.45, -2.0, -48.45, -2.75, -0.6, 0.06); B('court', 'trav', 2.0, 2.45, -48.45, -2.75, -0.6, 0.06);
  B('court', 'trav', -2.45, 2.45, -48.45, -48.0, -0.6, 0.06); B('court', 'trav', -2.45, 2.45, -3.2, -2.75, -0.6, 0.06);
  const hs = [17, 21, 15, 19, 23, 16];
  for (let i = 0, y = -52; y < -4; y += 8, i++) for (const [x, k] of [[-8, 0], [8, 1], [-14.5, 2], [14.5, 3]]) {
    const h = hs[(i + k) % hs.length] - (Math.abs(x) > 10 ? 3 : 0);
    B('court', 'trav', x - 0.8, x + 0.8, y - 0.8, y + 0.8, 0, h);
  }
  // ---- facade
  B('facade', 'trav', -24, -2.6, 0, 10, 0, 26); B('facade', 'trav', 2.6, 24, 0, 10, 0, 26); B('facade', 'trav', -2.6, 2.6, 0, 10, 10, 26);
  B('facade', 'travD', -24.4, -2.95, -0.4, 10.4, 0, 0.45); B('facade', 'travD', 2.95, 24.4, -0.4, 10.4, 0, 0.45); B('facade', 'travD', -2.95, 2.95, -0.4, 0, 0, 0.05);
  for (const x of [-21, -17.5, -14, -10.5, -7, 7, 10.5, 14, 17.5, 21]) B('facade', 'trav', x - 0.45, x + 0.45, -1.2, 0, 0.45, 23.5);
  B('facade', 'trav', -24.2, 24.2, -1.5, 1.5, 23.5, 26.6);
  B('facade', 'travD', -8.5, 8.5, -8.0, 0.5, 12.0, 13.1); B('facade', 'slot', -8.2, 8.2, -7.7, 0.4, 11.92, 12.0);
  B('facade', 'bronze', -2.95, -2.6, -0.35, 0.6, 0.45, 10.35); B('facade', 'bronze', 2.6, 2.95, -0.35, 0.6, 0.45, 10.35); B('facade', 'bronze', -2.95, 2.95, -0.35, 0.6, 10.0, 10.35);
  // the bronze leaves, hinged at the jambs
  dyn.door = [-1, 1].map(side => {
    const xh = side * 2.6, piv = new THREE.Group(); piv.position.copy(V(xh, 0.11, 0));
    const bk = new Bucket(), bb = new Bucket();
    addBox(bk, Math.min(xh, 0) - xh, Math.max(xh, 0) - xh, -0.11, 0.11, 0.45, 10.0);
    // recessed panel grid on the leaf face
    for (let j = 0; j < 4; j++) addBox(bk, side < 0 ? 0.25 : -2.35, side < 0 ? 2.35 : -0.25, -0.16, -0.11, 0.9 + j * 2.25, 2.85 + j * 2.25);
    addBox(bb, side * 0.35 - 0.04 - xh, side * 0.35 + 0.04 - xh, -0.29, -0.16, 3.2, 7.2);
    piv.add(mesh(bk.geometry(), M.bronze), mesh(bb.geometry(), M.steelL));
    scene.add(piv); return piv;
  });
  // ---- threshold corridor (y 10 → 34)
  B('corr', 'floor', -3.2, 3.2, 0, 34, -0.5, 0.02);
  B('corr', 'concD', -4.0, -2.6, 10, 34, 0, 10.5); B('corr', 'concD', 2.6, 4.0, 10, 34, 0, 10.5); B('corr', 'concD', -4.0, 4.0, 10, 34, 10.0, 11.0);
  for (let y = 3; y < 34; y += 3) B('corr', 'slot', -2.4, 2.4, y, y + 0.14, 9.96, 10.0);
  // ---- the hall (y 34 → 132, x ±24, 48 m)
  const HX = 24, HY0 = 34, HY1 = 132, HZ = 48;
  B('hall', 'floor', -HX, HX, HY0, HY1, -0.5, 0.02);
  B('hall', 'conc', -HX - 1, -2.6, HY0 - 1, HY0, 0, HZ); B('hall', 'conc', 2.6, HX + 1, HY0 - 1, HY0, 0, HZ); B('hall', 'conc', -2.6, 2.6, HY0 - 1, HY0, 10.5, HZ);
  B('hall', 'conc', -HX - 1, -HX, HY0, HY1, 0, HZ); B('hall', 'conc', HX, HX + 1, HY0, HY1, 0, HZ);
  B('hall', 'conc', -HX - 1, -5.2, HY1, HY1 + 1.2, 0, HZ); B('hall', 'conc', 5.2, HX + 1, HY1, HY1 + 1.2, 0, HZ); B('hall', 'conc', -5.2, 5.2, HY1, HY1 + 1.2, 16.2, HZ);
  const slits = [];
  for (let y = HY0, k = 0; y < HY1; y += 6.4, k++) { B('roof', 'conc', -HX - 1, HX + 1, y, Math.min(y + 4.4, HY1 + 1.2), HZ, HZ + 1.0); if (y + 4.4 < HY1) slits.push(y + 4.4); }
  for (let yy = 38; yy < 130; yy += 9) for (const side of [-1, 1]) { const x0 = side * HX; B('hall', 'conc', Math.min(x0, x0 - side * 1.1), Math.max(x0, x0 - side * 1.1), yy - 0.7, yy + 0.7, 0, HZ); }
  const balconies = [[-1, 10, 46, 64], [1, 16, 52, 74], [-1, 24, 70, 86], [1, 32, 40, 58], [-1, 38, 54, 70], [1, 8, 80, 96]];
  for (const [side, z, y0, y1] of balconies) {
    const xw = side * HX, xe = side * (HX - 5), xa = Math.min(xw, xe), xb = Math.max(xw, xe);
    B('hall', 'conc', xa, xb, y0, y1, z - 0.6, z);
    B('glass', 'glass', Math.min(xe, xe + side * 0.06), Math.max(xe, xe + side * 0.06), y0, y1, z, z + 1.15);
    B('hall', 'steel', Math.min(xe, xe + side * 0.08) - 0.02, Math.max(xe, xe + side * 0.08) + 0.02, y0, y1, z + 1.15, z + 1.22);
    B('hall', 'glow', xa + 0.2, xb - 0.2, y0 + 0.2, y1 - 0.2, z - 0.62, z - 0.6);
  }
  B('hall', 'water', -11, 11, 46, 80, -0.4, -0.03);
  B('hall', 'travD', -11.4, -11, 45.6, 80.4, -0.4, 0.03); B('hall', 'travD', 11, 11.4, 45.6, 80.4, -0.4, 0.03);
  B('hall', 'travD', -11.4, 11.4, 45.6, 46, -0.4, 0.03); B('hall', 'travD', -11.4, 11.4, 80, 80.4, -0.4, 0.03);
  for (const [x, yy, h, rot] of [[-5.5, 52, 13, 18], [4.0, 57, 16, -12], [-3.6, 63, 11, 8], [7.5, 61, 14, 24], [-8.5, 58, 15, -20]]) addBox(bucket('hall', 'steel'), -0.7, 0.7, -0.22, 0.22, -0.05, h, placeMat(x, yy, 0, rot));
  // ---- the structure: six storeys of glass and concrete
  const TX0 = -8.5, TX1 = 8.5, TY0 = 88, TY1 = 106, FL = 6;
  const anchors = { door: V(0, 0, 5.2), gal: V(0, HY1 + 6, 4.0) };
  for (let f = 0; f < 7; f++) {
    const z = f * FL;
    B('tower', 'conc', TX0 - 0.6, TX1 + 0.6, TY0 - 0.6, TY1 + 0.6, f ? z - 0.55 : -0.2, z + 0.05);
    if (f < 6) {
      B('tower', 'panel', TX0 + 0.5, TX1 - 0.5, TY0 + 0.5, TY1 - 0.5, z + FL - 0.62, z + FL - 0.58);
      B('tower', 'travD', -2.2, 2.2, 97, 101, z + 0.05, z + FL - 0.6);
      B('tower', 'trav', -6, -3.5, 91, 92, z + 0.05, z + 0.5);
      B('tower', 'bronze', 3.2, 6.4, 92, 94, z + 0.75, z + 0.85);
      for (const sy of [TY0, TY1]) {
        B('glass', 'glass', TX0, TX1, sy - 0.03, sy + 0.03, z + 0.05, z + FL - 0.55);
        for (let xm = TX0; xm <= TX1 + 0.01; xm += (TX1 - TX0) / 4) B('tower', 'bronze', xm - 0.035, xm + 0.035, sy - 0.1, sy + 0.04, z + 0.05, z + FL - 0.55);
      }
      for (const sx of [TX0, TX1]) {
        B('glass', 'glass', sx - 0.03, sx + 0.03, TY0, TY1, z + 0.05, z + FL - 0.55);
        for (let ym = TY0; ym <= TY1 + 0.01; ym += (TY1 - TY0) / 4) B('tower', 'bronze', sx - 0.1, sx + 0.04, ym - 0.035, ym + 0.035, z + 0.05, z + FL - 0.55);
      }
      anchors[`n${f}`] = V(-6.0 + f * 2.4, TY0 - 0.6, z + 1.2);
    }
  }
  for (const x of [TX0 - 0.3, TX1 + 0.3]) for (const yy of [TY0 - 0.3, TY1 + 0.3]) B('tower', 'conc', x - 0.45, x + 0.45, yy - 0.45, yy + 0.45, 0, 6 * FL + 0.1);
  // ---- the pivoting wall
  {
    const piv = new THREE.Group(); piv.position.copy(V(0, HY1 + 0.6, 0));
    const bk = new Bucket(), bs = new Bucket();
    addBox(bk, -5.0, 5.0, -0.4, 0.4, 0.02, 16.0); addBox(bs, -0.03, 0.03, -0.43, -0.4, 0.02, 16.0);
    piv.add(mesh(bk.geometry(), M.conc), mesh(bs.geometry(), M.slot, false)); scene.add(piv); dyn.pivot = piv;
  }
  // ---- the galleries (y 133 → 192), opening at the far end towards the rotunda
  const GY0 = HY1 + 1.2, GY1 = HY1 + 60;
  B('gal', 'floor', -9, 9, GY0, GY1, -0.5, 0.02);
  B('gal', 'plaster', -10, -9, GY0, GY1, 0, 16.2); B('gal', 'plaster', 9, 10, GY0, GY1, 0, 16.2);
  B('gal', 'plaster', -10, -2.2, GY1, GY1 + 1, 0, 16.2); B('gal', 'plaster', 2.2, 10, GY1, GY1 + 1, 0, 16.2); B('gal', 'plaster', -2.2, 2.2, GY1, GY1 + 1, 11, 16.2);
  B('gal', 'plaster', -10, 10, GY0, GY1 + 1, 16.2, 17);
  B('gal', 'galLight', -1.2, 1.2, GY0 + 1, GY1 - 1, 16.15, 16.2);
  const arts = [];
  for (let i = 0; i < 5; i++) {
    const yy = GY0 + 8 + i * 10, side = i % 2 === 0 ? -1 : 1, x = side * 8.95;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 6.8), new THREE.MeshStandardMaterial({ map: artMap(i), roughness: 0.7, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 }));
    art.position.copy(V(x - side * 0.09, yy, 5.4)); art.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; art.receiveShadow = true; scene.add(art); arts.push(art);
    B('gal', 'dark', Math.min(x, x - side * 0.08), Math.max(x, x - side * 0.08), yy - 2.7, yy + 2.7, 1.9, 8.9);
    B('gal', 'plaster', -1.2 + side * 3.5, 1.2 + side * 3.5, yy - 1.2, yy + 1.2, 0, 1.0);
    B('gal', 'bronze', -0.35 + side * 3.5, 0.35 + side * 3.5, yy - 0.35, yy + 0.35, 1.0, 2.6);
  }
  // passage from the galleries to the rotunda's vestibule
  B('pass', 'floor', -3.4, 3.4, GY1, ROT_Y - R + 0.1, -0.5, 0.02);
  B('pass', 'travD', -3.6, -2.2, GY1 + 1, ROT_Y - R - 1.6, 0, 11.8); B('pass', 'travD', 2.2, 3.6, GY1 + 1, ROT_Y - R - 1.6, 0, 11.8);
  B('pass', 'travD', -3.6, 3.6, GY1 + 1, ROT_Y - R - 1.6, 11, 11.8);
  B('pass', 'slot', -1.6, 1.6, GY1 + 3, ROT_Y - R - 3, 10.96, 11.0);
  // ---- the rotunda (centre y = ROT_Y)
  const RY = ROT_Y;
  B('rot', 'floor', -R - 2, R + 2, RY - R - 2, RY + R + 2, -0.5, 0.02);
  const SEG = 72;
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2, am = (a0 + a1) / 2;
    const cx = Math.cos(am) * (R + 0.7), cy = Math.sin(am) * (R + 0.7), w = (R + 1.4) * (a1 - a0) + 0.05;
    const inDoor = Math.abs(Math.cos(am) * R) < 2.4 && Math.sin(am) < 0;
    const mtx = placeMat(cx, RY + cy, 0, THREE.MathUtils.radToDeg(am) + 90);
    if (inDoor) addBox(bucket('rot', 'trav'), -w / 2, w / 2, -0.7, 0.7, 11, RH, mtx);
    else addBox(bucket('rot', 'trav'), -w / 2, w / 2, -0.7, 0.7, 0, RH, mtx);
  }
  for (let i = 0; i < 24; i++) {
    const am = (2 * Math.PI * i) / 24 + Math.PI / 24; if (Math.sin(am) < -0.9) continue;
    addBox(bucket('rot', 'trav'), -0.55, 0.55, -0.2, 0.2, 0, RH - 0.4, placeMat(Math.cos(am) * (R - 0.2), RY + Math.sin(am) * (R - 0.2), 0, THREE.MathUtils.radToDeg(am) + 90));
  }
  B('rot', 'trav', -3.4, -2.2, RY - R - 1.6, RY - R + 0.1, 0, 11); B('rot', 'trav', 2.2, 3.4, RY - R - 1.6, RY - R + 0.1, 0, 11);
  B('rot', 'trav', -3.4, 3.4, RY - R - 1.6, RY - R + 0.1, 11, 12.5);
  // cornice ring and the hidden cove light
  const cornice = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.1, R - 0.1, 0.7, 128, 1, true), M.trav); cornice.position.copy(V(0, RY, RH - 0.25)); cornice.material = M.trav; scene.add(cornice);
  const ledge = new THREE.Mesh(new THREE.RingGeometry(R - 1.3, R, 128), M.trav); ledge.rotation.x = -Math.PI / 2; ledge.position.copy(V(0, RY, RH + 0.1)); scene.add(ledge);
  const cove = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.35, R - 0.35, 0.18, 128, 1, true), M.slot); cove.position.copy(V(0, RY, RH + 0.3)); scene.add(cove);
  // coffered dome with the oculus
  const cof = cofferMap();
  const th0 = Math.asin(OCULUS / (R + 0.2));
  const domeGeo = new THREE.SphereGeometry(R + 0.2, 96, 48, 0, Math.PI * 2, th0, Math.PI / 2 - th0);
  const dome = new THREE.Mesh(domeGeo, ao(std({ map: cof.map, bumpMap: cof.bump, bumpScale: 3, roughness: 0.85, side: THREE.DoubleSide }), 0.2, 30));
  dome.scale.set(1, 0.92, 1); dome.position.copy(V(0, RY, RH)); dome.castShadow = true; dome.receiveShadow = true; scene.add(dome);
  const ringZ = RH + (R + 0.2) * 0.92 * Math.cos(th0);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(OCULUS + 0.4, OCULUS + 0.4, 1.4, 64, 1, true), M.bronze); ring.position.copy(V(0, RY, ringZ + 0.5)); ring.material.side = THREE.DoubleSide; scene.add(ring);
  const OZ = ringZ + 1.2;
  dyn.lids = [-1, 1].map(side => {
    const bk = new Bucket(); addBox(bk, Math.min(0, side * (OCULUS + 0.6)), Math.max(0, side * (OCULUS + 0.6)), RY - OCULUS - 0.6, RY + OCULUS + 0.6, OZ, OZ + 0.25);
    const m = mesh(bk.geometry(), M.bronze); m.matrixAutoUpdate = true; scene.add(m); return m;
  });
  anchors.rot = V(0, RY, OZ);
  anchors.rdoor = V(2.2, RY - R - 1.6, 5.5);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 96), std({ color: 0x8a6440, metalness: 1, roughness: 0.25 })); disc.rotation.x = -Math.PI / 2; disc.position.copy(V(0, RY, 0.03)); disc.receiveShadow = true; scene.add(disc);

  // ---- assemble the merged zones
  const groups = {};
  for (const [zone, mats] of Object.entries(zones)) {
    const grp = new THREE.Group(); grp.name = zone; groups[zone] = grp;
    for (const [mat, bk] of Object.entries(mats)) {
      const glow = ['slot', 'glow', 'panel', 'galLight'].includes(mat);
      grp.add(mesh(bk.geometry(), M[mat], !glow && mat !== 'glass' && mat !== 'water' && mat !== 'floor'));
      if (mat === 'glass') grp.children[grp.children.length - 1].renderOrder = 5;
    }
    scene.add(grp);
  }

  // ---- light shafts: sun blades through the hall roof, and the oculus beam
  const shaftMat = (strength) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uStrength: { value: strength }, uTime: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.82, 0.6) }, uClip: { value: 1e5 }, uEdge: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vWp; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uStrength; uniform float uTime; uniform vec3 uColor; uniform float uClip; uniform float uEdge; varying vec2 vUv; varying vec3 vWp;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){ float edge = mix(1.0, smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x), uEdge) * (1.0 - smoothstep(uClip - 1.5, uClip, abs(vWp.x))) * smoothstep(0.0, 1.5, vWp.y);
        float along = smoothstep(0.0, 0.12, vUv.y) * (0.35 + 0.65 * (1.0 - vUv.y));
        float dust = 0.75 + 0.25 * n(vWp.xz * 0.35 + vec2(uTime * 0.03, vWp.y * 0.08));
        gl_FragColor = vec4(uColor * uStrength * edge * along * dust, 1.0); }`,
  });
  const sunDirB = new THREE.Vector3(0.647, 0.485, -0.588).normalize(); // light travelling direction (Blender)
  const shafts = new THREE.Group(); const sm = shaftMat(0.04); sm.uniforms.uClip.value = HX - 0.4;
  const dT = new THREE.Vector3(sunDirB.x, sunDirB.z, -sunDirB.y).multiplyScalar(HZ / -sunDirB.z);
  for (const y0 of slits) for (const off of [0.6, 1.4]) {
    // a blade of light: the slit's line across the hall, swept down along the sun to the floor
    const a = V(-HX, y0 + off, HZ), b = V(HX, y0 + off, HZ), g = new THREE.BufferGeometry();
    const pts = [a, b, b.clone().add(dT), a.clone().add(dT)];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(v => [v.x, v.y, v.z]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(g, sm); m.frustumCulled = false; shafts.add(m);
  }
  scene.add(shafts);
  const beamMat = shaftMat(0); beamMat.uniforms.uEdge.value = 0; beamMat.uniforms.uColor.value.setRGB(0.92, 0.95, 1.0);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(OCULUS - 0.2, OCULUS * 0.8, ringZ, 48, 1, true), beamMat);
  beam.geometry.attributes.uv.array.forEach((v, i, arr) => { if (i % 2 === 1) arr[i] = 1 - v; });
  beam.position.copy(V(0, RY, ringZ / 2)); scene.add(beam);

  // ---- dust motes drifting in the light
  const DN = lowGPU ? 500 : 1400, dpos = new Float32Array(DN * 3), r = rng(91);
  for (let i = 0; i < DN; i++) { dpos[i * 3] = (r() - 0.5) * 30; dpos[i * 3 + 1] = r() * 14; dpos[i * 3 + 2] = -(r() * 30); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.035, color: 0xfff1d8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false; scene.add(dust);

  // ---- sky, environment, lights
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: V(-0.647, -0.485, 0.588).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vD;
      void main(){ float y = max(vD.y, -0.2);
        vec3 zen = vec3(0.52, 0.6, 0.72), hor = vec3(0.86, 0.80, 0.70), low = vec3(0.42, 0.38, 0.34);
        vec3 c = mix(hor, zen, pow(smoothstep(0.0, 1.0, y), 0.55));
        c = mix(low, c, smoothstep(-0.2, 0.02, vD.y));
        float s = max(dot(normalize(vD), uSun), 0.0);
        c += vec3(1.0, 0.82, 0.6) * (pow(s, 8.0) * 0.35 + pow(s, 400.0) * 3.0);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
  const ground2 = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x5a5248 })); ground2.rotation.x = -Math.PI / 2; ground2.position.y = -2; envScene.add(ground2);
  const envOut = pmrem.fromScene(envScene, 0.02).texture;
  // interior environment: a dark concrete room with warm light bands overhead
  const inScene = new THREE.Scene();
  inScene.add(new THREE.Mesh(new THREE.BoxGeometry(60, 30, 100), new THREE.MeshBasicMaterial({ color: 0x3e3830, side: THREE.BackSide })));
  for (let k = -4; k <= 4; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(50, 0.5, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 1.0) })); s.position.set(0, 14, k * 10); inScene.add(s); }
  const side = new THREE.Mesh(new THREE.BoxGeometry(1, 20, 80), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.45, 0.4) })); side.position.set(29, 0, 0); inScene.add(side);
  const envIn = pmrem.fromScene(inScene, 0.03).texture;
  pmrem.dispose();
  scene.environment = envOut;

  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.84, 0.66), 3.6);
  sun.castShadow = true; sun.shadow.mapSize.set(lowGPU ? 1024 : 2048, lowGPU ? 1024 : 2048);
  const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xb8c2d2, 0x4a4036, 0.9); scene.add(hemi);
  const warm = [new THREE.PointLight(0xffc68e, 0, 40, 1.6), new THREE.PointLight(0xffd2a0, 0, 70, 1.4), new THREE.PointLight(0xfff0dc, 0, 70, 1.3), new THREE.PointLight(0xdfe8ff, 0, 60, 1.2)];
  warm[0].position.copy(V(0, 22, 8)); warm[1].position.copy(V(0, HY1 - 14, 20)); warm[2].position.copy(V(0, GY0 + 28, 14)); warm[3].position.copy(V(0, RY, RH + 6));
  warm.forEach(l => scene.add(l));
  const fog = new THREE.FogExp2(0xb8ad9c, 0.006); scene.fog = fog;

  return { scene, M, dyn, anchors, sun, hemi, warm, fog, envOut, envIn, shafts: sm, beam: beamMat, dust, sky, arts, HY1 };
}

// ------------------------------------------------------------------ player
function readRegion(el) {
  const num = (n, d) => (n == null || n === '' ? d : parseFloat(n) / 100);
  return {
    el, name: el.dataset.cxRegion, film: FILMS[el.dataset.cxRegion] || FILMS.hall,
    beats: $$('[data-beat]', el).map(n => ({ el: n, a: num(n.dataset.a, 0), b: num(n.dataset.b, 0) })),
    lines: $$('[data-tag]', el).map(n => ({ el: n, a: num(n.dataset.a, 0), b: num(n.dataset.b, 0), key: n.dataset.key })),
    jumps: $$('[data-jump]', el), rail: el.querySelector('[data-rail]'), fx: el.querySelector('[data-fx]'),
    p: 0, target: 0,
  };
}

function boot() {
  const regions = $$('[data-cx-region]').map(readRegion);
  if (!regions.length) return;
  const canvas = document.querySelector('[data-cx-gl]');
  doc.classList.add(reduced ? 'cx-static' : 'cx-cine');
  wireJumps(regions);
  if (!canvas || reduced) { doc.classList.add('cx-static', 'cx-nogl'); if (canvas) canvas.remove(); done(); return; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    if (!renderer.getContext()) throw new Error('no gl');
  } catch (e) {
    // no WebGL: fall back to the pre-rendered frame film
    import(canvas.dataset.filmCore || './film-core.js').catch(() => { doc.classList.add('cx-static', 'cx-nogl'); canvas.remove(); done(); });
    return;
  }
  const lowGPU = coarse || Math.min(screen.width, screen.height) < 500;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = true;
  canvas.style.background = '#0a0a0b';

  const W = buildWorld(renderer, lowGPU);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1500);
  const paths = { hall: makePath(HALL), light: makePath(LIGHT) };

  // ---- sizing and adaptive resolution
  let vw = 0, vh = 0, maxDpr = Math.min(devicePixelRatio || 1, lowGPU ? 1.75 : 2), dpr = Math.min(maxDpr, lowGPU ? 1.5 : 2);
  function resize() {
    vw = innerWidth; vh = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(dpr); renderer.setSize(vw, vh, false);
    if (composer) { composer.setPixelRatio(dpr); composer.setSize(vw, vh); }
    camera.aspect = vw / vh; camera.updateProjectionMatrix();
  }
  let composer = null, aoOn = true;
  if (!lowGPU) import('./cx-gl-addons.js').then(({ EffectComposer, RenderPass, GTAOPass, OutputPass }) => {
    composer = new EffectComposer(renderer); composer.addPass(new RenderPass(W.scene, camera));
    const ao = new GTAOPass(W.scene, camera, vw, vh); ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 2, scale: 1, samples: 10 }); ao.blendIntensity = 0.75; composer.addPass(ao);
    composer.addPass(new OutputPass()); resize(); kick();
  }).catch(() => {});
  const draw = () => { if (composer && aoOn) composer.render(); else renderer.render(W.scene, camera); };
  addEventListener('resize', () => { resize(); kick(); }); resize();
  let ftAvg = 16, ftN = 0;
  function adapt(ms) {
    ftAvg += (ms - ftAvg) * 0.05; ftN++;
    if (ftN < 40) return;
    if (ftAvg > 26 && composer && aoOn) { aoOn = false; ftN = 0; return; }
    if (ftAvg > 26 && dpr > 0.6) { dpr = Math.max(0.6, dpr - 0.15); ftN = 0; resize(); }
    else if (ftAvg < 12 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + 0.1); ftN = 0; resize(); }
  }

  // ---- pointer parallax (desktop): the camera eases a few degrees towards the cursor
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!coarse) addEventListener('pointermove', e => { look.tx = (e.clientX / vw - 0.5) * 2; look.ty = (e.clientY / vh - 0.5) * 2; kick(); }, { passive: true });

  // ---- camera from progress
  const up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), mtx = new THREE.Matrix4();
  let time = 0;
  function place(r, p) {
    const s = paths[r.name] ? paths[r.name](p) : paths.hall(p);
    camera.position.copy(s.pos);
    // gentle handheld drift, scaled down when the camera is close to things
    const hh = 0.04;
    camera.position.x += Math.sin(time * 0.37) * hh; camera.position.y += Math.sin(time * 0.53 + 1.3) * hh * 0.6;
    fwd.subVectors(s.tgt, s.pos).normalize();
    // looking straight up (the oculus): roll the up vector so the view never flips
    const w = smooth(0.55, 0.97, fwd.y);
    up.set(0, 1, 0).lerp(new THREE.Vector3(0, 0, -1), w).normalize();
    mtx.lookAt(camera.position, s.tgt, up); camera.quaternion.setFromRotationMatrix(mtx);
    tmpQ.setFromEuler(new THREE.Euler(-look.y * 0.035, -look.x * 0.05, 0, 'YXZ')); camera.quaternion.multiply(tmpQ);
    // Blender lens (36 mm sensor, width fit) → vertical fov; narrow screens keep the 16:10 height and crop the sides
    const hf = 2 * Math.atan(18 / s.mm), asp = Math.max(camera.aspect, 1.6);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf / 2) / asp)) * (camera.aspect < 1 ? 1.12 : 1);
    camera.updateProjectionMatrix();
    renderer.toneMappingExposure = 0.92 * Math.pow(2, s.ev);
    return s;
  }

  // ---- world state from progress (doors, walls, light, fog)
  const fogOut = new THREE.Color(0xb9ad9b), fogIn = new THREE.Color(0x2b2622), fogGal = new THREE.Color(0x8d857a), fogRot = new THREE.Color(0xa9a197);
  function animate(r, p) {
    const z = -camera.position.z; // Blender y of the camera
    if (r.name === 'hall') {
      const a = smooth(0.105, 0.2, p) * THREE.MathUtils.degToRad(84);
      W.dyn.door[0].rotation.y = a; W.dyn.door[1].rotation.y = -a;
      W.dyn.pivot.rotation.y = smooth(0.855, 0.93, p) * THREE.MathUtils.degToRad(78);
    } else {
      // the finale starts beyond the galleries: everything behind it stands open
      W.dyn.door[0].rotation.y = 1.47; W.dyn.door[1].rotation.y = -1.47; W.dyn.pivot.rotation.y = 1.36;
      const o = smooth(0.38, 0.8, p) * 3.9;
      W.dyn.lids[0].position.x = -o; W.dyn.lids[1].position.x = o;
      W.beam.uniforms.uStrength.value = 0.16 * smooth(0.4, 0.85, p);
    }
    // fog, environment and fill lights follow where the camera stands
    const inside = smooth(1, 9, z), gal = smooth(128, 140, z), rot = smooth(ROT_Y - R - 16, ROT_Y - R, z);
    W.fog.color.copy(fogOut).lerp(fogIn, inside).lerp(fogGal, gal * 0.6).lerp(fogRot, rot);
    W.fog.density = lerp(0.0055, 0.011, inside) * (1 - 0.35 * gal) * (1 - 0.3 * rot);
    W.scene.environment = z > 6 ? W.envIn : W.envOut;
    W.hemi.intensity = lerp(1.0, 0.22, inside) + 0.25 * gal * (1 - rot) + 0.05 * rot;
    W.scene.environmentIntensity = lerp(0.9, 0.4, inside) + 0.3 * gal * (1 - rot);
    W.warm[0].intensity = 220 * smooth(2, 12, z) * (1 - smooth(34, 44, z));
    W.warm[1].intensity = 500 * smooth(40, 70, z);
    W.warm[2].intensity = 420 * smooth(120, 136, z);
    W.warm[3].intensity = r.name === 'light' ? 30 + 140 * smooth(0.4, 0.85, p) : 0;
    W.sun.intensity = r.name === 'light' ? 3 : 4.6;
    // keep the shadow frustum around what the camera sees
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const c = camera.position.clone().addScaledVector(fwd, 30);
    const sunVec = V(-0.647, -0.485, 0.588).normalize();
    W.sun.target.position.copy(c); W.sun.position.copy(c).addScaledVector(sunVec, 180);
    W.sun.target.updateMatrixWorld();
    // dust drifts with the camera
    W.dust.position.set(camera.position.x, Math.max(0, camera.position.y - 4), camera.position.z - 6);
    W.dust.rotation.y = time * 0.01;
    W.shafts.uniforms.uTime.value = time; W.beam.uniforms.uTime.value = time;
  }

  // ---- labels pinned to real points
  const proj = new THREE.Vector3();
  function anchorAt(key, out, region) {
    const k = region === 'light' && key === 'door' ? 'rdoor' : key;
    const a = W.anchors[k]; if (!a) return false;
    proj.copy(a).project(camera);
    if (proj.z > 1 || proj.z < -1) return false;
    // behind the camera?
    const tov = a.clone().sub(camera.position); fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (tov.dot(fwd) < 0.5) return false;
    out.x = (proj.x + 1) / 2 * vw; out.y = (1 - proj.y) / 2 * vh; return true;
  }

  function measure() {
    let active = null;
    for (const r of regions) {
      const b = r.el.getBoundingClientRect(), len = b.height - innerHeight;
      r.target = clamp(-b.top / Math.max(len, 1));
      if (b.top < innerHeight && b.bottom > 0 && !active) active = r;
    }
    return active;
  }
  const tmp = { x: 0, y: 0 };
  function overlays(r) {
    const p = r.p, H = innerHeight, Wd = innerWidth;
    r.beats.forEach(bt => {
      const v = (bt.a <= 0 ? 1 : smooth(bt.a, bt.a + 0.012, p)) * (bt.b >= 1 ? 1 : 1 - smooth(bt.b - 0.012, bt.b, p));
      if (v !== bt.v) { bt.v = v; bt.el.style.opacity = v.toFixed(3); bt.el.style.transform = v > 0.995 ? 'none' : `translate3d(0,${Math.round((1 - v) * (p < bt.a + 0.012 ? 24 : -24))}px,0)`; bt.el.classList.toggle('is-on', v > 0.5); bt.el.style.visibility = v > 0.001 ? 'visible' : 'hidden'; }
    });
    const boxes = [];
    r.beats.forEach(bt => { if (bt.v > 0.3) { const inn = bt.el.querySelector('.beat__in') || bt.el; const b = inn.getBoundingClientRect(); if (b.top > H * 0.3) boxes.push(b); } });
    const floorAt = sx => { let f = H - 120; for (const b of boxes) if (sx > b.left - 60 && sx < b.right + 60) f = Math.min(f, b.top - 44); return f; };
    r.lines.forEach(ln => {
      const v = smooth(ln.a, ln.a + 0.006, p) * (1 - smooth(ln.b - 0.006, ln.b, p));
      let ok = v > 0.001 && anchorAt(ln.key, tmp, r.name);
      if (ok) ok = tmp.x > -20 && tmp.x < Wd + 20 && tmp.y > 0 && tmp.y < floorAt(tmp.x) + 24;
      const vv = ok ? v : 0;
      if (vv !== ln.v) { ln.v = vv; ln.el.style.opacity = vv.toFixed(3); ln.el.style.visibility = vv > 0.001 ? 'visible' : 'hidden'; ln.el.classList.toggle('is-on', vv > 0.5); }
      if (vv > 0.001) {
        const m = Wd < 760 ? 16 : 40;
        const x = clamp(tmp.x, m, Wd - m), y = clamp(tmp.y, 90, Math.max(110, floorAt(tmp.x)));
        ln.el.style.transform = `translate3d(${x.toFixed(0)}px,${y.toFixed(0)}px,0)`;
        ln.el.classList.toggle('is-left', tmp.x > Wd * 0.62);
      }
    });
    if (r.rail) r.rail.style.setProperty('--p', p.toFixed(4));
    r.jumps.forEach(j => j.classList.toggle('is-on', p >= parseFloat(j.dataset.a) / 100 && p < parseFloat(j.dataset.b || 101) / 100));
    if (r.fx) { r.fx.style.setProperty('--fade', r.film.fade(p).toFixed(3)); r.fx.style.setProperty('--flash', r.film.flash(p).toFixed(3)); }
  }

  // ---- loop: render while a film region is on screen
  let raf = 0, last = performance.now(), current = null, first = false;
  const ease = coarse ? 6 : 7.5;
  function frame(now) {
    raf = 0;
    if (window.__cxPause) return;
    const dt = Math.min((now - last) / 1000, 0.1); last = now; time += dt;
    const active = measure();
    if (!active) { canvas.classList.remove('is-on'); current = null; return; }
    if (active !== current) { current = active; active.p = active.target; }
    canvas.classList.add('is-on');
    active.p += (active.target - active.p) * (1 - Math.exp(-dt * ease));
    if (Math.abs(active.target - active.p) < 0.00005) active.p = active.target;
    look.x += (look.tx - look.x) * (1 - Math.exp(-dt * 2.5)); look.y += (look.ty - look.y) * (1 - Math.exp(-dt * 2.5));
    const t0 = performance.now();
    place(active, active.p); animate(active, active.p);
    draw();
    overlays(active);
    if (!first) { first = true; canvas.classList.add('is-ready'); done(); }
    adapt(performance.now() - t0 + (dt * 1000 > 40 ? 10 : 0));
    kick();
  }
  function kick() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
  addEventListener('scroll', kick, { passive: true });
  document.addEventListener('visibilitychange', () => { last = performance.now(); kick(); });
  // compile shaders before the first visible frame so the opening does not hitch
  place(regions[0], 0); animate(regions[0], 0); renderer.compile(W.scene, camera);
  kick();
  window.__cxMonument = { ready: () => !!composer || lowGPU, renderer, camera, W, regions, place, animate, paths,
    // test hook: render one exact progress point synchronously
    shot(name, p) { const r = regions.find(x => x.name === name); r.p = p; place(r, p); animate(r, p); const t = performance.now(); draw(); overlays(r); renderer.getContext().finish(); return performance.now() - t; } };
}

function done() { doc.classList.add('cx-loaded'); window.__cxReady = true; window.__cxMono = true; }

function wireJumps(regions) {
  regions.forEach(r => r.jumps.forEach(j => j.addEventListener('click', e => {
    e.preventDefault();
    const a = parseFloat(j.dataset.a) / 100;
    let y;
    if (reduced) { const t = r.beats.find(b => b.a >= a - 0.001) || r.beats[0]; y = t.el.getBoundingClientRect().top + scrollY - 80; }
    else { const b = r.el.getBoundingClientRect(); y = b.top + scrollY + (b.height - innerHeight) * (a + 0.004); }
    window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  })));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
