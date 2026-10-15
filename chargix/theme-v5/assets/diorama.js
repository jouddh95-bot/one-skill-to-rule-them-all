// CHARGIX · The living miniature — a real-time three.js diorama.
// One open-front room on a lit plinth, seen from a fixed elevated three-quarter
// angle. Scroll drives the story inside it: the sun crosses the window and sets,
// lamps come on, furniture and props change, and one figure works through the
// day of a new business (cookies, or a clothing label). The figure is a rigged
// CC0 MakeHuman body (built in Blender, chargix/blender/character.py) posed with
// two-bone IK and blended between story beats; facial expression uses its 13
// expression-unit morph targets. Exposes init({ root, stage, canvas, assets, story, low }).
import * as THREE from './three.module.min.js';
import { GLTFLoader, RoomEnvironment, RoundedBoxGeometry } from './cx-gl-addons.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

// ------------------------------------------------------------------ room dimensions (metres)
const RX = 3.5, RZ = 2.5, WH = 2.7, WT = 0.14;      // floor spans x∈[-RX,RX], z∈[-RZ,RZ]; walls at x=-RX and z=-RZ

// ------------------------------------------------------------------ procedural textures
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function cv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rep = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
function noiseFill(g, w, h, amt, r) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
// oak planks: staggered boards, per-board tone, long grain streaks
function oakFloor() {
  const W = 1024, c = cv(W), g = c.getContext('2d'), b = cv(W), h = b.getContext('2d'), r = rng(7);
  const rows = 8, bh = W / rows;
  for (let row = 0; row < rows; row++) {
    let x = -r() * W * 0.5;
    while (x < W) {
      const len = W * (0.45 + r() * 0.5), tone = 0.82 + r() * 0.3;
      const base = [160 * tone, 116 * tone, 80 * tone];
      g.fillStyle = `rgb(${base.map(v => v | 0)})`; g.fillRect(x, row * bh, len, bh);
      for (let k = 0; k < 40; k++) {
        const y = row * bh + r() * bh, a = 0.04 + r() * 0.08;
        g.strokeStyle = `rgba(${r() > 0.5 ? '70,40,20' : '230,190,140'},${a})`; g.lineWidth = 0.6 + r() * 2.4;
        g.beginPath(); g.moveTo(x, y); for (let s = 0; s <= 8; s++) g.lineTo(x + (len * s) / 8, y + Math.sin(s * 0.9 + r() * 2) * 2.2); g.stroke();
      }
      h.fillStyle = '#9a9a9a'; h.fillRect(x, row * bh, len, bh);
      g.fillStyle = 'rgba(40,22,10,0.55)'; g.fillRect(x, row * bh, 2, bh); g.fillRect(x, row * bh, len, 2);
      h.fillStyle = '#202020'; h.fillRect(x, row * bh, 3, bh); h.fillRect(x, row * bh, len, 3);
      x += len;
    }
  }
  noiseFill(g, W, W, 10, r);
  const m = new THREE.MeshStandardMaterial({ map: tex(c, [3, 3]), bumpMap: tex(b, [3, 3], false), bumpScale: 0.8, roughness: 0.42, metalness: 0 });
  return m;
}
function plaster(base, seed, rep = [2, 1]) {
  const W = 512, c = cv(W), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 300; i++) {
    const x = r() * W, y = r() * W, rad = 20 + r() * 90, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const tone = r() > 0.5 ? '255,250,245' : '40,30,30'; gr.addColorStop(0, `rgba(${tone},0.025)`); gr.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  noiseFill(g, W, W, 8, r);
  return new THREE.MeshStandardMaterial({ map: tex(c, rep), roughness: 0.92, metalness: 0 });
}
function subwayTiles() {
  const W = 512, c = cv(W), g = c.getContext('2d'), r = rng(5), b = cv(W), h = b.getContext('2d');
  g.fillStyle = '#d9d2c6'; g.fillRect(0, 0, W, W); h.fillStyle = '#fff'; h.fillRect(0, 0, W, W);
  const tw = W / 4, th = W / 8;
  for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) {
    const ox = x * tw + (y % 2 ? tw / 2 : 0), t = 0.93 + r() * 0.1;
    g.fillStyle = `rgb(${236 * t | 0},${231 * t | 0},${221 * t | 0})`; g.fillRect(ox + 3, y * th + 3, tw - 6, th - 6);
    const gr = h.createLinearGradient(0, y * th, 0, y * th + th); gr.addColorStop(0, '#888'); gr.addColorStop(0.1, '#fff'); gr.addColorStop(0.9, '#fff'); gr.addColorStop(1, '#888');
    h.fillStyle = '#333'; h.fillRect(ox, y * th, tw, th); h.fillStyle = gr; h.fillRect(ox + 3, y * th + 3, tw - 6, th - 6);
  }
  return new THREE.MeshStandardMaterial({ map: tex(c, [4, 2]), bumpMap: tex(b, [4, 2], false), bumpScale: 0.7, roughness: 0.25 });
}
function weave(base, seed, rep = [3, 3], rough = 0.95) {
  const W = 256, c = cv(W), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, W, W);
  for (let y = 0; y < W; y += 2) { g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.06})`; g.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 2) { g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`; g.fillRect(x, 0, 1, W); }
  noiseFill(g, W, W, 18, r);
  return new THREE.MeshStandardMaterial({ map: tex(c, rep), roughness: rough });
}
function stripedRug() {
  const W = 512, c = cv(W), g = c.getContext('2d'), r = rng(11);
  g.fillStyle = '#d8d2c8'; g.fillRect(0, 0, W, W);
  for (let y = 0; y < W; y += 32) { g.fillStyle = '#3a3a3c'; g.fillRect(0, y + 8, W, 10); }
  noiseFill(g, W, W, 30, r);
  return new THREE.MeshStandardMaterial({ map: tex(c), roughness: 1 });
}
function shaggyRug() {
  const W = 512, c = cv(W), g = c.getContext('2d'), r = rng(13);
  g.fillStyle = '#8d8a90'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 26000; i++) { const x = r() * W, y = r() * W, v = 110 + r() * 80 | 0; g.fillStyle = `rgba(${v},${v - 4},${v + 4},0.5)`; g.fillRect(x, y, 1.5, 3 + r() * 3); }
  const m = new THREE.MeshStandardMaterial({ map: tex(c, [2, 2]), roughness: 1 });
  return m;
}
// image textures drawn into canvases: art prints, book spines, screens and holograms
function printArt(seed, mode = 'city') {
  const W = 256, H = 320, c = cv(W, H), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#f1eee8'; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 20, 0, H - 20); gr.addColorStop(0, '#6b6f76'); gr.addColorStop(1, '#1d1f24');
  g.fillStyle = gr; g.fillRect(20, 20, W - 40, H - 40);
  if (mode === 'city') for (let i = 0; i < 14; i++) { const w = 10 + r() * 22, x = 20 + r() * (W - 60), hh = 60 + r() * 170; g.fillStyle = `rgba(${200 - i * 6},${200 - i * 6},${205 - i * 6},0.85)`; g.fillRect(x, H - 20 - hh, w, hh); }
  else { g.fillStyle = '#c9b48f'; g.beginPath(); g.arc(W / 2, H / 2, 60, 0, Math.PI * 2); g.fill(); }
  return tex(c);
}

// ------------------------------------------------------------------ small helpers
function std(color, rough = 0.6, metal = 0, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }); }
function box(w, h, d, mat, x = 0, y = 0, z = 0, r = 0.01) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
function group(...kids) { const g = new THREE.Group(); kids.forEach(k => k && g.add(k)); return g; }
function at(obj, x, y, z, ry = 0) { obj.position.set(x, y, z); obj.rotation.y = ry; return obj; }

// a potted plant: a turned ceramic pot, soil, and curved leaves on stems
function leafGeo() {
  const g = new THREE.PlaneGeometry(1, 1, 4, 8); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + 0.5, w = Math.sin(Math.PI * clamp(y)) * (1 - y * 0.35);
    p.setXYZ(i, x * w, y, -Math.pow(y, 2) * 0.35 + Math.abs(x) * 0.18 * w);
  }
  g.computeVertexNormals(); return g;
}
const LEAF = leafGeo();
function plant(seed, size = 1, kind = 'broad', potCol = 0xd9d4cc) {
  const r = rng(seed), g = new THREE.Group();
  const potMat = std(potCol, 0.55), soil = std(0x2a1d14, 1);
  const pot = new THREE.Mesh(new THREE.LatheGeometry([V3(0, 0), V3(0.1, 0), V3(0.12, 0.02), V3(0.135, 0.2), V3(0.13, 0.21), V3(0, 0.21)].map(v => new THREE.Vector2(v.x, v.y)), 28), potMat);
  pot.castShadow = pot.receiveShadow = true; g.add(pot);
  const s = cyl(0.125, 0.125, 0.01, soil, 0, 0.2, 0); g.add(s);
  const leafMat = new THREE.MeshStandardMaterial({ color: kind === 'trail' ? 0x3f6b35 : 0x355e2e, roughness: 0.55, side: THREE.DoubleSide });
  const n = kind === 'broad' ? 14 : kind === 'trail' ? 22 : 30;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, tilt = kind === 'tall' ? 0.15 + r() * 0.5 : kind === 'trail' ? 1.2 + r() * 1.0 : 0.35 + r() * 0.7;
    const len = (kind === 'broad' ? 0.32 : kind === 'trail' ? 0.18 : 0.42) * (0.7 + r() * 0.6);
    const L = new THREE.Mesh(LEAF, leafMat); L.scale.set(len * (kind === 'tall' ? 0.25 : 0.45), len, len);
    L.position.set(0, 0.2 + (kind === 'tall' ? r() * 0.3 : 0), 0); L.rotation.set(0, a, 0); L.rotateX(tilt);
    L.castShadow = true; g.add(L);
    if (kind === 'trail') { const L2 = L.clone(); L2.position.y = 0.16; L2.rotateX(0.5); L2.scale.multiplyScalar(0.8); g.add(L2); }
  }
  g.scale.setScalar(size); return g;
}

// ------------------------------------------------------------------ canvas UI panels (holograms, screens)
const FONT = 'Manrope, Figtree, system-ui, sans-serif';
function panelCanvas(w, h) { const c = cv(w, h); const g = c.getContext('2d'); return { c, g }; }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function glassBG(g, w, h, hue = '150,120,255', a = 0.22) {
  g.clearRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `rgba(${hue},${a + 0.08})`); gr.addColorStop(1, `rgba(40,30,90,${a})`);
  rrect(g, 6, 6, w - 12, h - 12, 26); g.fillStyle = gr; g.fill();
  g.lineWidth = 4; g.strokeStyle = `rgba(${hue},0.9)`; g.stroke();
}
function txt(g, s, x, y, size, color = '#fff', weight = 600, align = 'left') {
  g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillText(s, x, y);
}
function cookieIcon(g, x, y, R) {
  const gr = g.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R); gr.addColorStop(0, '#e9b878'); gr.addColorStop(1, '#a8682e');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
  const r = rng(3); g.fillStyle = '#3b2314';
  for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = r() * R * 0.75; g.beginPath(); g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, R * 0.11, R * 0.08, a, 0, 6.28); g.fill(); }
}
function teeIcon(g, x, y, s, col = '#f4f2ee', print = '#1c1c22') {
  g.fillStyle = col; g.beginPath();
  g.moveTo(x - s * 0.3, y - s * 0.5); g.lineTo(x - s * 0.6, y - s * 0.3); g.lineTo(x - s * 0.5, y - s * 0.05); g.lineTo(x - s * 0.36, y - s * 0.12);
  g.lineTo(x - s * 0.36, y + s * 0.5); g.lineTo(x + s * 0.36, y + s * 0.5); g.lineTo(x + s * 0.36, y - s * 0.12); g.lineTo(x + s * 0.5, y - s * 0.05);
  g.lineTo(x + s * 0.6, y - s * 0.3); g.lineTo(x + s * 0.3, y - s * 0.5); g.quadraticCurveTo(x, y - s * 0.32, x - s * 0.3, y - s * 0.5); g.fill();
  txt(g, 'NOVA', x, y + s * 0.08, s * 0.16, print, 800, 'center');
}

// every panel is a function (g, w, h, t) → draws state t∈[0,1] of its little animation
const PANELS = {
  thoughtCookie: { w: 360, h: 300, draw(g, w, h, t) {
    g.clearRect(0, 0, w, h); const a = 0.35 + 0.65 * t;
    g.strokeStyle = `rgba(255,170,220,${a})`; g.lineWidth = 7; g.shadowColor = '#ff7ad9'; g.shadowBlur = 24;
    g.beginPath(); g.ellipse(w / 2, h / 2 - 20, 150, 105, 0, 0, 6.28); g.stroke();
    g.beginPath(); g.arc(w * 0.28, h - 34, 16, 0, 6.28); g.stroke(); g.beginPath(); g.arc(w * 0.2, h - 10, 8, 0, 6.28); g.stroke();
    g.shadowBlur = 0; cookieIcon(g, w / 2, h / 2 - 20, 62 * (0.85 + 0.15 * t));
  } },
  thoughtTee: { w: 360, h: 300, draw(g, w, h, t) {
    g.clearRect(0, 0, w, h); const a = 0.35 + 0.65 * t;
    g.strokeStyle = `rgba(255,170,220,${a})`; g.lineWidth = 7; g.shadowColor = '#ff7ad9'; g.shadowBlur = 24;
    g.beginPath(); g.ellipse(w / 2, h / 2 - 20, 150, 105, 0, 0, 6.28); g.stroke();
    g.beginPath(); g.arc(w * 0.28, h - 34, 16, 0, 6.28); g.stroke(); g.beginPath(); g.arc(w * 0.2, h - 10, 8, 0, 6.28); g.stroke();
    g.shadowBlur = 0; teeIcon(g, w / 2, h / 2 - 16, 150, 'rgba(255,240,250,0.95)');
  } },
  search: { w: 520, h: 420, draw(g, w, h, t) {
    glassBG(g, w, h, '120,150,255');
    rrect(g, 34, 34, w - 68, 70, 20); g.fillStyle = 'rgba(255,255,255,0.14)'; g.fill();
    const q = 'CHARGIX'.slice(0, Math.round(clamp(t * 1.6) * 7));
    txt(g, '⌕', 58, 82, 36, '#fff', 500); txt(g, q + (t < 0.62 ? '|' : ''), 104, 82, 36, '#fff', 800);
    const rows = ['Website design', 'Online store', '3D website'];
    rows.forEach((s, i) => { const k = clamp((t - 0.55 - i * 0.12) * 5); if (k <= 0) return;
      g.globalAlpha = k; rrect(g, 34, 132 + i * 86, w - 68, 70, 16); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fill();
      txt(g, s, 60, 178 + i * 86, 30, '#eef', 600); g.globalAlpha = 1; });
  } },
  packages: { w: 1100, h: 520, draw(g, w, h, t, sel = 2) {
    g.clearRect(0, 0, w, h);
    const P = [['$750', 'Essential Website', '120,230,210'], ['$1,650', '3D Experience', '140,150,255'], ['$2,750', 'Business Launch', '230,110,220']];
    P.forEach(([price, name, hue], i) => {
      const x = 20 + i * 360, on = i === sel ? smooth(0.45, 0.8, t) : 0, y = 30 - on * 18;
      rrect(g, x, y, 330, 440, 28); const gr = g.createLinearGradient(x, y, x, y + 440);
      gr.addColorStop(0, `rgba(${hue},${0.30 + on * 0.25})`); gr.addColorStop(1, `rgba(30,25,80,${0.30 + on * 0.2})`); g.fillStyle = gr; g.fill();
      g.lineWidth = 4 + on * 4; g.strokeStyle = `rgba(${hue},${0.8 + on * 0.2})`; g.stroke();
      txt(g, price, x + 165, y + 130, 74, '#fff', 800, 'center'); txt(g, name, x + 165, y + 188, 30, '#f0eeff', 600, 'center');
      for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + 60, y + 240 + k * 36, 210 - k * 26, 8); }
      if (i === 0) txt(g, 'No immersive 3D', x + 165, y + 410, 22, 'rgba(255,255,255,0.75)', 500, 'center');
      if (i > 0) txt(g, 'Premium interactive 3D', x + 165, y + 410, 22, 'rgba(255,255,255,0.85)', 600, 'center');
      if (on > 0.5) { txt(g, 'Selected ✓', x + 165, y + 375, 26, '#fff', 800, 'center'); }
    });
  } },
  brandCookie: { w: 560, h: 380, draw(g, w, h, t) {
    glassBG(g, w, h, '255,190,120', 0.18);
    txt(g, 'Sweet & Co.', w / 2, 120, 64, '#fff2df', 700, 'center');
    g.globalAlpha = smooth(0.2, 0.6, t); cookieIcon(g, w / 2, 230, 70); g.globalAlpha = 1;
    txt(g, 'logo · labels · boxes', w / 2, 345, 24, 'rgba(255,240,220,0.8)', 500, 'center');
  } },
  brandTee: { w: 560, h: 380, draw(g, w, h, t) {
    glassBG(g, w, h, '180,180,255', 0.18);
    txt(g, 'NOVA', w / 2, 130, 92, '#fff', 800, 'center');
    g.globalAlpha = smooth(0.2, 0.6, t); teeIcon(g, w / 2, 245, 150, '#14141a', '#f4f2ee'); g.globalAlpha = 1;
    txt(g, 'logo · tags · mailers', w / 2, 352, 24, 'rgba(235,235,255,0.8)', 500, 'center');
  } },
  storeCookie: { w: 900, h: 560, draw(g, w, h, t) { store(g, w, h, t, 'Sweet & Co.', 'cookie'); } },
  storeTee: { w: 900, h: 560, draw(g, w, h, t) { store(g, w, h, t, 'NOVA', 'tee'); } },
  ordersCookie: { w: 520, h: 520, draw(g, w, h, t) { orders(g, w, h, t, ['Box of 12 · Choc chip', 'Gift tin · Mixed', 'Box of 6 · Oat', 'Box of 12 · Choc chip', 'Party tray · 24']); } },
  ordersTee: { w: 520, h: 520, draw(g, w, h, t) { orders(g, w, h, t, ['Tee · Black · M', 'Hoodie · Black · L', 'Tee · White · S', 'Tee · Black · XL', 'Cap · Sand']); } },
  sales: { w: 640, h: 400, draw(g, w, h, t) {
    glassBG(g, w, h, '160,130,255');
    txt(g, 'Sample sales (demo)', 40, 64, 26, 'rgba(240,235,255,0.85)', 600);
    const v = Math.round(lerp(0, 4250, smooth(0, 0.9, t)));
    txt(g, '$' + v.toLocaleString('en-US'), 40, 130, 60, '#fff', 800);
    for (let i = 0; i < 14; i++) { const k = smooth(i / 18, i / 18 + 0.3, t), hh = (40 + i * 13 + Math.sin(i * 1.7) * 18) * k;
      const gr = g.createLinearGradient(0, h - 40 - hh, 0, h - 40); gr.addColorStop(0, 'rgba(170,150,255,0.95)'); gr.addColorStop(1, 'rgba(120,90,255,0.35)');
      g.fillStyle = gr; g.fillRect(48 + i * 40, h - 40 - hh, 26, hh); }
  } },
};
function store(g, w, h, t, brand, kind) {
  g.clearRect(0, 0, w, h); rrect(g, 6, 6, w - 12, h - 12, 22); g.fillStyle = '#f7f3ee'; g.fill(); g.lineWidth = 6; g.strokeStyle = 'rgba(170,150,255,0.95)'; g.stroke();
  g.save(); rrect(g, 6, 6, w - 12, h - 12, 22); g.clip();
  g.fillStyle = '#ece6dd'; g.fillRect(6, 6, w, 46); ['#e66', '#eb4', '#5c6'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(34 + i * 24, 29, 7, 0, 6.28); g.fill(); });
  txt(g, brand, 50, 120, 54, kind === 'tee' ? '#16161c' : '#3b2314', kind === 'tee' ? 800 : 700);
  txt(g, kind === 'tee' ? 'Essentials, made to last.' : 'Baked fresh, delivered today.', 50, 162, 26, '#6a5a50', 500);
  rrect(g, 50, 190, 150, 46, 23); g.fillStyle = kind === 'tee' ? '#16161c' : '#3b2314'; g.fill(); txt(g, 'Shop now', 125, 221, 20, '#fff', 700, 'center');
  if (kind === 'tee') teeIcon(g, w - 210, 170, 230, '#16161c', '#f4f2ee'); else cookieIcon(g, w - 210, 150, 110);
  for (let i = 0; i < 4; i++) { const k = smooth(0.25 + i * 0.1, 0.45 + i * 0.1, t); g.globalAlpha = k;
    const x = 50 + i * 205, y = 300; rrect(g, x, y, 185, 200, 14); g.fillStyle = '#fff'; g.fill();
    if (kind === 'tee') teeIcon(g, x + 92, y + 82, 120, i % 2 ? '#f4f2ee' : '#16161c', i % 2 ? '#16161c' : '#f4f2ee'); else cookieIcon(g, x + 92, y + 80, 52);
    txt(g, ['$4.50', '$18.00', '$32.00', '$12.00'][i], x + 16, y + 180, 22, '#333', 700); g.globalAlpha = 1; }
  g.restore();
}
function orders(g, w, h, t, rows) {
  glassBG(g, w, h, '150,160,255');
  txt(g, 'New orders (demo)', 36, 64, 30, '#fff', 800);
  rows.forEach((s, i) => { const k = smooth(0.08 + i * 0.16, 0.2 + i * 0.16, t); if (k <= 0) return; g.globalAlpha = k;
    rrect(g, 30, 90 + i * 84, w - 60, 68, 14); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fill();
    txt(g, '#10' + (21 + i), 52, 133 + i * 84, 24, 'rgba(220,220,255,0.8)', 600); txt(g, s, 140, 133 + i * 84, 24, '#fff', 600);
    g.fillStyle = '#7ef0b0'; g.beginPath(); g.arc(w - 64, 124 + i * 84, 8, 0, 6.28); g.fill(); g.globalAlpha = 1; });
}

// a floating hologram: canvas plane, additive glow frame, gentle bob; t drives its inner animation
function hologram(key, scale) {
  const P = PANELS[key], { c, g } = panelCanvas(P.w, P.h);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale * P.h / P.w), mat); mesh.renderOrder = 10;
  let last = -1;
  return { mesh, key, set(t, a) {
    mat.opacity = a; mesh.visible = a > 0.01;
    if (mesh.visible && Math.abs(t - last) > 0.004) { P.draw(g, P.w, P.h, t); map.needsUpdate = true; last = t; }
  } };
}

// ------------------------------------------------------------------ the city beyond the window (shader: sky, sun, skyline, window lights)
function skyline() {
  const W = 2048, H = 512, c = cv(W, H), g = c.getContext('2d'), r = rng(21), L = cv(W, H), l = L.getContext('2d');
  g.clearRect(0, 0, W, H); l.fillStyle = '#000'; l.fillRect(0, 0, W, H);
  for (let layer = 0; layer < 3; layer++) {
    let x = 0; const tone = [70, 45, 25][layer];
    while (x < W) {
      const w = 40 + r() * 110, hh = (0.25 + r() * 0.55 - layer * 0.08) * H;
      g.fillStyle = `rgba(${tone},${tone},${tone + 12},1)`; g.fillRect(x, H - hh, w, hh);
      if (r() > 0.6) g.fillRect(x + w * 0.4, H - hh - 40, 4, 40);
      for (let wy = H - hh + 10; wy < H - 6; wy += 12) for (let wx = x + 6; wx < x + w - 6; wx += 10)
        if (r() > 0.55) { const v = 150 + r() * 105 | 0; l.fillStyle = `rgb(${v},${v * 0.82 | 0},${v * 0.55 | 0})`; l.fillRect(wx, wy, 5, 6); }
      x += w + r() * 10;
    }
  }
  const t1 = new THREE.CanvasTexture(c), t2 = new THREE.CanvasTexture(L); t1.colorSpace = t2.colorSpace = THREE.SRGBColorSpace;
  return [t1, t2];
}
function outside() {
  const [sil, lit] = skyline();
  const u = { uSil: { value: sil }, uLit: { value: lit }, uSun: { value: new THREE.Vector2(0.3, 0.3) }, uDay: { value: 1 }, uDusk: { value: 0 }, uNight: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, toneMapped: false, depthWrite: true,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D uSil, uLit; uniform vec2 uSun; uniform float uDay, uDusk, uNight; varying vec2 vUv;
      void main(){
        vec3 dayTop = vec3(0.42,0.62,0.86), dayBot = vec3(0.86,0.9,0.92);
        vec3 duskTop = vec3(0.32,0.28,0.52), duskBot = vec3(1.0,0.62,0.36);
        vec3 nightTop = vec3(0.03,0.04,0.10), nightBot = vec3(0.10,0.08,0.20);
        float y = vUv.y;
        vec3 sky = mix(dayBot, dayTop, y) * uDay + mix(duskBot, duskTop, pow(y,0.8)) * uDusk + mix(nightBot, nightTop, y) * uNight;
        vec2 d = (vUv - uSun) * vec2(2.4, 1.0); float r = length(d);
        sky += vec3(1.0,0.85,0.6) * (smoothstep(0.06,0.045,r) * 2.5 + exp(-r*7.0) * 0.6) * (uDay + uDusk * 1.4);
        vec2 suv = vec2(vUv.x, vUv.y * 1.55); vec4 s = texture2D(uSil, suv);
        vec3 b = s.rgb * (0.55 * uDay + 0.45 * uDusk + 0.25 * uNight) + vec3(0.02,0.02,0.05) * uNight;
        b = mix(b, b * vec3(1.0,0.75,0.6), uDusk * 0.6);
        vec3 lights = texture2D(uLit, suv).rgb * (uNight * 1.6 + uDusk * 0.5);
        vec3 col = mix(sky, b + lights, s.a);
        gl_FragColor = vec4(col, 1.0);
      }` });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.3), mat); return { mesh: m, u };
}

// ------------------------------------------------------------------ the room
function buildRoom(S, A, low) {
  const room = new THREE.Group(); S.scene.add(room);
  const floorMat = oakFloor(), wallMat = plaster('#cfc3bd', 3), wallR = plaster('#c9bfc6', 4), cap = std(0xf4f1ff, 0.6);
  // plinth with neon edge on the two visible faces
  const plinth = box(RX * 2 + 0.3, 0.32, RZ * 2 + 0.3, std(0xe9e6f2, 0.35), 0, -0.17, 0, 0.02); room.add(plinth);
  const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.35, 1.0).multiplyScalar(2.2), toneMapped: false });
  const n1 = box(RX * 2 + 0.32, 0.035, 0.02, neon, 0, -0.27, RZ + 0.16, 0); n1.castShadow = false; room.add(n1);
  const n2 = box(0.02, 0.035, RZ * 2 + 0.32, neon, RX + 0.16, -0.27, 0, 0); n2.castShadow = false; room.add(n2);
  S.neon = [n1, n2];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; room.add(floor);
  // walls: x=-RX (window wall) and z=-RZ (kitchen + desk wall); a pale lavender cap on the cut tops
  const wz0 = -1.45, wz1 = 1.05, wy0 = 0.62, wy1 = 2.38;   // window opening on the x=-RX wall
  const wl = new THREE.Group();
  const seg = (z0, z1, y0, y1) => { const m = box(WT, y1 - y0, z1 - z0, wallMat, -RX - WT / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0); wl.add(m); };
  seg(-RZ - WT, wz0, 0, WH); seg(wz1, RZ, 0, WH); seg(wz0, wz1, 0, wy0); seg(wz0, wz1, wy1, WH);
  room.add(wl);
  const wb = box(RX * 2 + WT, WH, WT, wallR, -WT / 2, WH / 2, -RZ - WT / 2, 0); room.add(wb);
  room.add(box(WT + 0.01, 0.02, RZ * 2 + WT, cap, -RX - WT / 2, WH + 0.01, -WT / 2, 0));
  room.add(box(RX * 2 + WT, 0.02, WT + 0.01, cap, -WT / 2, WH + 0.01, -RZ - WT / 2, 0));
  // skirting
  const sk = std(0xcfc7c0, 0.5); room.add(box(0.02, 0.08, RZ * 2, sk, -RX + 0.01, 0.04, 0, 0)); room.add(box(RX * 2, 0.08, 0.02, sk, 0, 0.04, -RZ + 0.01, 0));
  // window: frame, mullions, glass, sill
  const frame = std(0x2a2a2e, 0.4, 0.3), glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, depthWrite: false });
  const wx = -RX - WT / 2;
  [[wz0, 0.04], [wz1, 0.04], [(wz0 + wz1) / 2, 0.03]].forEach(([z, t]) => room.add(box(WT + 0.02, wy1 - wy0, t, frame, wx, (wy0 + wy1) / 2, z, 0)));
  [wy0, wy1, 1.62].forEach(y => room.add(box(WT + 0.02, 0.035, wz1 - wz0, frame, wx, y, (wz0 + wz1) / 2, 0)));
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(wz1 - wz0, wy1 - wy0), glass); gl.rotation.y = Math.PI / 2; gl.position.set(wx, (wy0 + wy1) / 2, (wz0 + wz1) / 2); room.add(gl);
  room.add(box(0.22, 0.04, wz1 - wz0 + 0.2, std(0xe8e2da, 0.5), -RX + 0.08, wy0 - 0.01, (wz0 + wz1) / 2, 0.01));
  const out = outside(); out.mesh.rotation.y = Math.PI / 2; out.mesh.position.set(-RX - 0.45, 1.45, -0.2); room.add(out.mesh); S.sky = out.u;
  // curtains: gathered panels either side of the window; vertices sway in the shader
  const cMat = new THREE.MeshStandardMaterial({ color: 0xd8c9bd, roughness: 0.9, side: THREE.DoubleSide });
  const cu = { uT: { value: 0 }, uOpen: { value: 1 } };
  cMat.onBeforeCompile = s => { Object.assign(s.uniforms, cu);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat fy = clamp((2.4 - position.y) / 2.3, 0.0, 1.0); transformed.x += sin(uT * 1.3 + position.y * 2.0 + position.z * 3.0) * 0.012 * (1.0 - fy) ;'); };
  const curtain = (z, dir) => {
    const geo = new THREE.PlaneGeometry(0.62, 2.25, 28, 20), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin((x + 0.31) * 38) * 0.035); }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, cMat); m.rotation.y = Math.PI / 2; m.position.set(-RX + 0.12, 1.36, z); m.castShadow = true; m.userData.dir = dir; return m;
  };
  S.curtains = [curtain(wz0 - 0.15, -1), curtain(wz1 + 0.15, 1)]; S.curtains.forEach(c => room.add(c)); S.curtainU = cu;
  room.add(cyl(0.012, 0.012, wz1 - wz0 + 1.1, std(0x222222, 0.4, 0.8), -RX + 0.12, 2.5, (wz0 + wz1) / 2).rotateX(Math.PI / 2));
  // wall art on the back wall + a pinboard
  const art = (x, y, w, h, map) => { const g = group(box(w + 0.05, h + 0.05, 0.03, std(0x1c1c1e, 0.5), 0, 0, 0, 0), (() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: 0.7 })); m.position.z = 0.017; return m; })()); g.position.set(x, y, -RZ + 0.02); return g; };
  room.add(art(1.15, 1.85, 0.55, 0.7, printArt(1)), art(2.95, 1.9, 0.45, 0.58, printArt(4)), art(1.85, 1.95, 0.32, 0.4, printArt(2, 'sun')));
  return room;
}

// kitchen run along the back wall, from the corner to x≈0
function buildKitchen(S) {
  const k = new THREE.Group(), cab = std(0x3d3f44, 0.55), top = std(0x9c7350, 0.45), steel = std(0xb9bcc0, 0.25, 0.85);
  const x0 = -RX + 0.85, x1 = -0.2, d = 0.62, z = -RZ + d / 2;
  k.add(box(x1 - x0, 0.86, d, cab, (x0 + x1) / 2, 0.43, z, 0.01));
  k.add(box(x1 - x0 + 0.03, 0.04, d + 0.03, top, (x0 + x1) / 2, 0.88, z + 0.01, 0.006));
  for (let x = x0 + 0.3; x < x1; x += 0.6) { k.add(box(0.57, 0.8, 0.02, std(0x45474d, 0.5), x, 0.42, z + d / 2 + 0.005, 0.006)); k.add(box(0.2, 0.012, 0.02, steel, x, 0.76, z + d / 2 + 0.02, 0.004)); }
  // oven door with glass + glow (the glow rises while baking)
  const ovenX = x0 + 1.5, oven = box(0.58, 0.55, 0.02, std(0x111114, 0.15, 0.2), ovenX, 0.4, z + d / 2 + 0.012, 0.006); k.add(oven);
  const ovGlow = new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0, toneMapped: false });
  const og = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), ovGlow); og.position.set(ovenX, 0.38, z + d / 2 + 0.024); k.add(og); S.ovenGlow = ovGlow;
  // cooktop + sink + tap
  k.add(box(0.55, 0.01, 0.45, std(0x101012, 0.1, 0.1), ovenX, 0.905, z, 0));
  k.add(box(0.5, 0.02, 0.36, steel, x0 + 2.4, 0.9, z, 0.005)); k.add(cyl(0.012, 0.012, 0.3, steel, x0 + 2.4, 1.05, z - 0.2));
  // backsplash tiles + upper cabinets + open shelf
  const bs = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 0.6), subwayTiles()); bs.position.set((x0 + x1) / 2, 1.2, -RZ + 0.005); bs.receiveShadow = true; k.add(bs);
  k.add(box(1.5, 0.7, 0.36, cab, x0 + 1.6, 1.95, -RZ + 0.18, 0.01));
  const strip = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }); const ls = box(1.4, 0.012, 0.02, strip, x0 + 1.6, 1.595, -RZ + 0.3, 0); ls.castShadow = false; k.add(ls); S.kStrip = strip;
  const shelf = box(1.2, 0.035, 0.26, top, -0.9, 1.75, -RZ + 0.13, 0.005); k.add(shelf);
  const jars = std(0xe9e4dc, 0.35); for (let i = 0; i < 5; i++) k.add(cyl(0.05, 0.05, 0.14 + (i % 2) * 0.05, jars, -1.38 + i * 0.22, 1.84 + (i % 2) * 0.025, -RZ + 0.13));
  // fridge in the corner
  const fr = group(box(0.78, 1.95, 0.7, steel, 0, 0.975, 0, 0.02), box(0.02, 0.5, 0.03, std(0x777777, 0.3, 0.9), 0.3, 1.25, 0.37, 0.005), box(0.02, 0.5, 0.03, std(0x777777, 0.3, 0.9), 0.3, 0.55, 0.37, 0.005), box(0.76, 0.01, 0.01, std(0x333333), 0, 0.92, 0.355, 0));
  fr.position.set(-RX + 0.45, 0, -RZ + 0.38); k.add(fr);
  // pendant over the counter
  S.scene.add(k); return k;
}

// desk + office chair + monitor + shelving at the right of the back wall
function buildDesk(S) {
  const d = new THREE.Group(), wood = std(0x8a5a36, 0.45), black = std(0x1d1d20, 0.4, 0.4);
  d.add(box(1.6, 0.04, 0.7, wood, 0, 0.74, 0, 0.008));
  [[-0.75, -0.3], [0.75, -0.3], [-0.75, 0.3], [0.75, 0.3]].forEach(([x, z]) => d.add(box(0.035, 0.72, 0.035, black, x, 0.36, z, 0)));
  // monitor with a live screen texture
  const sc = cv(512, 300), sg = sc.getContext('2d'); const sm = new THREE.CanvasTexture(sc); sm.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), new THREE.MeshBasicMaterial({ map: sm, toneMapped: false }));
  const mon = group(box(0.66, 0.4, 0.025, black, 0, 0, 0, 0.01), screen); screen.position.z = 0.014;
  mon.position.set(0.1, 1.12, -0.18); d.add(mon, box(0.05, 0.22, 0.04, black, 0.1, 0.86, -0.2, 0), box(0.24, 0.015, 0.16, black, 0.1, 0.765, -0.2, 0));
  d.add(box(0.42, 0.015, 0.14, std(0x2a2a2e, 0.6), 0.1, 0.77, 0.08, 0.004));
  // desk lamp
  const lamp = group(cyl(0.07, 0.08, 0.02, black, 0, 0.01, 0), cyl(0.008, 0.008, 0.38, black, 0, 0.2, 0), cyl(0.04, 0.075, 0.1, black, 0.06, 0.38, 0).rotateZ(-0.6));
  lamp.position.set(-0.62, 0.76, -0.15); d.add(lamp);
  d.position.set(1.95, 0, -RZ + 0.4); S.scene.add(d);
  S.screen = { canvas: sc, g: sg, tex: sm, mesh: screen };
  // chair: seat, back, gas lift, five-star base
  const ch = new THREE.Group(), fab = weave('#2e2f35', 9, [1, 1]);
  ch.add(box(0.5, 0.08, 0.48, fab, 0, 0.5, 0, 0.03), box(0.48, 0.55, 0.06, fab, 0, 0.84, -0.24, 0.03), cyl(0.025, 0.025, 0.36, black, 0, 0.29, 0));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, leg = box(0.34, 0.03, 0.04, black, Math.cos(a) * 0.17, 0.08, Math.sin(a) * 0.17, 0); leg.rotation.y = -a; ch.add(leg); ch.add(cyl(0.025, 0.025, 0.04, black, Math.cos(a) * 0.32, 0.03, Math.sin(a) * 0.32)); }
  ch.position.set(1.95, 0, -RZ + 1.15); ch.rotation.y = Math.PI; S.scene.add(ch); S.chair = ch;
  // shelving unit at the far right
  const sh = new THREE.Group();
  [0, 1.75].forEach(x => 0);
  sh.add(box(0.03, 1.9, 0.34, black, -0.45, 0.95, 0, 0), box(0.03, 1.9, 0.34, black, 0.45, 0.95, 0, 0));
  const r = rng(17);
  for (let i = 0; i < 5; i++) {
    const y = 0.1 + i * 0.44; sh.add(box(0.9, 0.025, 0.34, wood, 0, y, 0, 0.004));
    if (i < 4) { let x = -0.4; while (x < 0.3) { const w = 0.03 + r() * 0.03, hh = 0.22 + r() * 0.1; const b = box(w, hh, 0.22, std(new THREE.Color().setHSL(r(), 0.25, 0.25 + r() * 0.35), 0.8), x + w / 2, y + 0.0125 + hh / 2, 0.02, 0.003); sh.add(b); x += w + 0.004; } }
  }
  const glow = new THREE.MeshBasicMaterial({ color: 0xffcf8a, toneMapped: false }); for (let i = 1; i < 5; i++) { const g = box(0.86, 0.006, 0.01, glow, 0, 0.1 + i * 0.44 - 0.02, 0.15, 0); g.castShadow = false; sh.add(g); }
  S.shelfGlow = glow; sh.add(at(plant(5, 0.7, 'trail'), -0.15, 1.88, 0)); sh.add(at(plant(6, 0.55, 'broad'), 0.25, 1.86, 0));
  sh.position.set(RX - 0.55, 0, -RZ + 0.2); S.scene.add(sh);
  return d;
}

// living area: sofa (glTF), coffee table, rug, accent chair, TV console, floor lamp
function buildLiving(S, M) {
  const L = new THREE.Group(); S.scene.add(L);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), shaggyRug()); rug.rotation.x = -Math.PI / 2; rug.position.set(-1.7, 0.005, 0.2); rug.receiveShadow = true; L.add(rug);
  const krug = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), stripedRug()); krug.rotation.x = -Math.PI / 2; krug.position.set(-1.5, 0.004, -1.55); krug.receiveShadow = true; L.add(krug);
  if (M.sofa) { const s = M.sofa.clone(); recolor(s, 0xb9b1ad);fit(s, 2.25, 'x'); s.rotation.y = Math.PI / 2; s.position.set(-RX + 0.62, 0, 0.0); L.add(s); S.sofa = s; }
  else { const s = group(box(0.9, 0.42, 2.2, weave('#c9c3c3', 2), 0, 0.21, 0, 0.06), box(0.25, 0.75, 2.2, weave('#c9c3c3', 2), -0.33, 0.45, 0, 0.06)); s.position.set(-RX + 0.6, 0, 0); L.add(s); S.sofa = s; }
  const wood = std(0x6b4128, 0.4), metal = std(0x1c1c1e, 0.35, 0.6);
  const ct = group(box(1.1, 0.04, 0.6, wood, 0, 0.42, 0, 0.006), ...[[-0.52, -0.27], [0.52, -0.27], [-0.52, 0.27], [0.52, 0.27]].map(([x, z]) => box(0.025, 0.4, 0.025, metal, x, 0.2, z, 0)), box(1.05, 0.02, 0.55, metal, 0, 0.12, 0, 0));
  ct.rotation.y = Math.PI / 2; ct.position.set(-1.65, 0, 0.15); L.add(ct); S.coffee = ct;
  const books = group(box(0.26, 0.04, 0.2, std(0xe8e2d4), 0, 0.46, 0, 0.004), box(0.24, 0.035, 0.18, std(0x47506a), 0, 0.5, 0, 0.004)); books.position.set(-1.6, 0, 0.45); L.add(books);
  if (M.cup) { const c = M.cup.clone(); fit(c, 0.11, 'y'); c.position.set(-1.62, 0.44, -0.1); L.add(c); S.cup = c; }
  if (M.chair) { const c = M.chair.clone(); recolor(c, 0xa98fa6); fit(c, 0.85, 'y'); c.rotation.y = -Math.PI * 0.75; c.position.set(0.15, 0, 1.0); L.add(c); S.accent = c; }
  // TV console + TV, near the front edge, facing the sofa
  const tv = group(box(1.9, 0.5, 0.45, std(0x232327, 0.5), 0, 0.25, 0, 0.01), box(1.95, 0.03, 0.47, wood, 0, 0.515, 0, 0.004),
    box(1.2, 0.7, 0.05, std(0x0c0c0e, 0.2, 0.3), 0, 0.98, -0.02, 0.01), box(0.3, 0.03, 0.18, metal, 0, 0.545, -0.02, 0));
  tv.position.set(-1.0, 0, RZ - 0.35); tv.rotation.y = Math.PI + 0.12; L.add(tv); S.tv = tv;
  L.add(at(plant(9, 0.6, 'broad'), -0.35, 0.53, RZ - 0.3));
  // floor lamp by the sofa (glTF) with a warm point light
  if (M.lamp) { const l = M.lamp.clone(); fit(l, 1.65, 'y'); l.position.set(-RX + 0.45, 0, -1.65); L.add(l); }
  else L.add(group(cyl(0.12, 0.14, 0.03, metal, -RX + 0.45, 0.015, -1.65), cyl(0.012, 0.012, 1.5, metal, -RX + 0.45, 0.76, -1.65), cyl(0.12, 0.2, 0.25, std(0xe8dfd0, 0.8), -RX + 0.45, 1.55, -1.65)));
  // plants around the room
  L.add(at(plant(1, 1.4, 'broad', 0xcfc8be), -RX + 0.45, 0, 1.55), at(plant(2, 1.1, 'tall', 0x2c2c30), -RX + 0.35, 0, -2.15),
    at(plant(3, 1.0, 'broad', 0xddd6cc), RX - 0.4, 0, -1.2), at(plant(4, 0.8, 'tall', 0xddd6cc), 0.35, 0, RZ - 0.25),
    at(plant(7, 0.55, 'trail'), -0.6, 1.79, -RZ + 0.13), at(plant(8, 0.5, 'broad'), -RX + 0.2, 0.62, -1.2), at(plant(10, 0.45, 'broad'), -RX + 0.2, 0.62, 0.7));
  return L;
}
function recolor(obj, hex) {
  // re-cover the upholstery (keeps its normal/sheen maps, drops the coloured base map)
  obj.traverse(o => { if (!o.isMesh || !/fabric/i.test(o.name)) return;
    const m = o.material.clone(); m.map = null; m.color = new THREE.Color(hex); if ('sheenColor' in m) m.sheenColor = new THREE.Color(hex).multiplyScalar(0.8); o.material = m; });
}
function fit(obj, size, axis) {
  obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj), s = b.getSize(V3());
  const k = size / s[axis]; obj.scale.multiplyScalar(k);
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  obj.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(obj); obj.position.y -= b2.min.y;
  const c = b2.getCenter(V3()); obj.children.forEach(ch => { ch.position.x -= c.x / obj.scale.x; ch.position.z -= c.z / obj.scale.z; });
  return obj;
}

// ------------------------------------------------------------------ story props (cookie / clothing), switched by beat
function cookieMesh(mat, chip) {
  const g = new THREE.Group(), geo = new THREE.CylinderGeometry(0.04, 0.042, 0.012, 20, 1); const p = geo.attributes.position, r = rng(7);
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) + (r() - 0.5) * 0.004);
  geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m);
  for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), chip); const a = r() * 6.28, d = r() * 0.028; c.position.set(Math.cos(a) * d, 0.007, Math.sin(a) * d); c.scale.y = 0.6; g.add(c); }
  return g;
}
function labelTex(brand, kind) {
  const c = cv(256, 160), g = c.getContext('2d');
  g.fillStyle = kind === 'tee' ? '#141418' : '#f4ead9'; g.fillRect(0, 0, 256, 160);
  txt(g, brand, 128, 92, kind === 'tee' ? 64 : 44, kind === 'tee' ? '#fff' : '#3b2314', 800, 'center');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function kraftBox(w, h, d, label) {
  const kraft = std(0xb88a5a, 0.85), g = box(w, h, d, kraft, 0, h / 2, 0, 0.004);
  const grp = group(g); grp.add(box(w + 0.002, 0.012, 0.05, std(0xd8c7a8, 0.6), 0, h - 0.004, 0, 0));
  if (label) { const l = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, w * 0.35), new THREE.MeshStandardMaterial({ map: label, roughness: 0.6 })); l.position.set(0, h * 0.55, d / 2 + 0.002); grp.add(l); }
  return grp;
}
function buildProps(S, story) {
  const P = {}, root = new THREE.Group(); S.scene.add(root);
  const add = (k, obj) => { root.add(obj); P[k] = obj; obj.visible = false; return obj; };
  if (story === 'cookie') {
    const dough = std(0xc89058, 0.7), chip = std(0x2b170c, 0.5), tray = std(0x9da1a6, 0.3, 0.8);
    const lbl = labelTex('Sweet & Co.', 'cookie');
    // baking: bowl + trays of cookies on the counter
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 28, 12, 0, 6.28, Math.PI / 2, Math.PI / 2), std(0xece8e2, 0.3, 0, { side: THREE.DoubleSide })); bowl.position.y = 0.15;
    add('bowl', at(group(bowl, cyl(0.12, 0.12, 0.01, std(0xd6b68a, 0.9), 0, 0.08, 0)), -1.9, 0.9, -RZ + 0.35));
    for (let t = 0; t < 2; t++) {
      const tg = group(box(0.46, 0.015, 0.32, tray, 0, 0.0075, 0, 0.003));
      for (let i = 0; i < 12; i++) { const c = cookieMesh(dough, chip); c.position.set(-0.17 + (i % 4) * 0.113, 0.02, -0.1 + Math.floor(i / 4) * 0.1); tg.add(c); }
      add('tray' + t, at(tg, -1.2 + t * 0.55, 0.9, -RZ + 0.33));
    }
    // brand boxes: stacks that grow with the orders
    for (let i = 0; i < 14; i++) { const b = kraftBox(0.3, 0.12, 0.3, lbl); add('box' + i, at(b, 0, 0, 0)); }
    add('table', at(group(box(1.3, 0.04, 0.7, std(0xb88a5f, 0.45), 0, 0.78, 0, 0.006), ...[[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]].map(([x, z]) => box(0.04, 0.76, 0.04, std(0x1c1c1e, 0.4, 0.5), x, 0.38, z, 0)), box(0.4, 0.002, 0.3, std(0x777777), 0, 0.801, 0, 0)), 0.55, 0, 0.55));
  } else {
    const lbl = labelTex('NOVA', 'tee');
    // clothing rail with garments
    const rail = group(box(0.03, 1.6, 0.03, std(0x1a1a1c, 0.3, 0.8), -0.7, 0.8, 0, 0), box(0.03, 1.6, 0.03, std(0x1a1a1c, 0.3, 0.8), 0.7, 0.8, 0, 0), box(1.43, 0.025, 0.025, std(0x1a1a1c, 0.3, 0.8), 0, 1.58, 0, 0));
    const cols = [0x141418, 0xf2f0ec, 0x141418, 0x2a3a5a, 0xf2f0ec, 0x141418, 0x6b6b70, 0xf2f0ec, 0x141418];
    cols.forEach((c, i) => { const tee = teeMesh(c); tee.position.set(-0.6 + i * 0.15, 1.18, 0); tee.rotation.y = Math.PI / 2 + (i % 2 ? 0.08 : -0.06); rail.add(tee); });
    add('rail', at(rail, -0.2, 0, -RZ + 0.45));
    // heat press on the table
    const hp = group(box(0.42, 0.06, 0.5, std(0x1c1c1e, 0.4), 0, 0.03, 0, 0.01), box(0.4, 0.05, 0.46, std(0xb9bcc0, 0.3, 0.8), 0, 0.12, 0, 0.01), box(0.05, 0.2, 0.05, std(0x1c1c1e, 0.4), 0, 0.15, -0.26, 0));
    add('press', at(hp, 0.2, 0.8, 0.45));
    add('table', at(group(box(1.3, 0.04, 0.7, std(0xb88a5f, 0.45), 0, 0.78, 0, 0.006), ...[[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]].map(([x, z]) => box(0.04, 0.76, 0.04, std(0x1c1c1e, 0.4, 0.5), x, 0.38, z, 0))), 0.55, 0, 0.55));
    for (let i = 0; i < 10; i++) { const f = folded(i % 3 ? 0x141418 : 0xf2f0ec); add('fold' + i, at(f, 0, 0, 0)); }
    for (let i = 0; i < 14; i++) { const b = i % 2 ? kraftBox(0.3, 0.12, 0.3, lbl) : mailer(lbl); add('box' + i, at(b, 0, 0, 0)); }
  }
  // a phone that the figure holds (glowing screen)
  const phone = group(box(0.075, 0.15, 0.009, std(0x111114, 0.2, 0.5), 0, 0, 0, 0.008));
  const pScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.138), new THREE.MeshBasicMaterial({ color: 0xbcc6ff, toneMapped: false })); pScreen.position.z = 0.0052; phone.add(pScreen);
  add('phone', phone);
  return { root, P };
}
function teeMesh(col) {
  const s = new THREE.Shape(); s.moveTo(-0.12, 0.16); s.lineTo(-0.24, 0.1); s.lineTo(-0.2, 0.02); s.lineTo(-0.14, 0.05); s.lineTo(-0.14, -0.26); s.lineTo(0.14, -0.26); s.lineTo(0.14, 0.05); s.lineTo(0.2, 0.02); s.lineTo(0.24, 0.1); s.lineTo(0.12, 0.16); s.quadraticCurveTo(0, 0.1, -0.12, 0.16);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }); g.translate(0, 0, -0.01);
  const m = new THREE.Mesh(g, std(col, 0.95)); m.castShadow = true; return group(m, box(0.01, 0.07, 0.01, std(0x1a1a1c), 0, 0.2, 0, 0));
}
function folded(col) { return group(box(0.28, 0.035, 0.22, std(col, 0.95), 0, 0.0175, 0, 0.01), box(0.1, 0.004, 0.06, std(col === 0x141418 ? 0xffffff : 0x141418, 0.9), 0, 0.037, 0.03, 0)); }
function mailer(lbl) { const g = group(box(0.34, 0.05, 0.26, std(0x1a1a1e, 0.5), 0, 0.025, 0, 0.02)); const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.075), new THREE.MeshStandardMaterial({ map: lbl })); l.rotation.x = -Math.PI / 2; l.position.y = 0.051; g.add(l); return g; }

// ------------------------------------------------------------------ the figure: rig controller (IK posing in character space)
function makeFigure(gltf) {
  const root = gltf.scene, B = {}, rest = {};
  root.traverse(o => { if (o.isBone) { B[o.name] = o; rest[o.name] = o.quaternion.clone(); } if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const skin = root.getObjectByName('skin');
  // materials: skin (vertex-coloured), clothes, hair, eyes
  const M = {};
  root.traverse(o => {
    if (!o.isMesh) return; const n = o.name;
    if (n === 'skin') o.material = M.skin = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, sheen: 0.3, sheenColor: new THREE.Color(0.9, 0.5, 0.4), sheenRoughness: 0.6 });
    else if (n === 'top') o.material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.95, sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(0.35, 0.4, 0.5) });
    else if (n === 'trousers') o.material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color(0.2, 0.2, 0.22) });
    else if (n === 'shoes') o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    else if (n === 'hair') o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    else if (n === 'eyes') o.material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.1, clearcoat: 1 });
    else o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    o.material.transparent = false; o.userData.mat = o.material;
  });
  const holder = new THREE.Group(); holder.add(root); root.position.y = 0.83;   // feet on the floor
  // rest-pose lengths
  root.updateMatrixWorld(true);
  const wp = (b, v = V3()) => b.getWorldPosition(v);
  const len = (a, b) => wp(B[a]).distanceTo(wp(B[b]));
  const L = { ua: len('upperarm_l', 'lowerarm_l'), la: len('lowerarm_l', 'hand_l'), th: len('thigh_l', 'calf_l'), ca: len('calf_l', 'foot_l') };
  const restPelvis = holder.worldToLocal(wp(B.pelvis));
  const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), va = V3(), vb = V3(), vc = V3();
  function aim(bone, child, target) {           // rotate bone (world) so that child moves onto the target ray
    bone.updateWorldMatrix(true, true);
    const b = wp(bone, va), c = wp(child, vb), d0 = c.sub(b).normalize(), d1 = vc.copy(target).sub(b).normalize();
    const q = tmpQ.setFromUnitVectors(d0, d1), wq = bone.getWorldQuaternion(tmpQ2); q.multiply(wq);
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); bone.quaternion.copy(pq.multiply(q));
    bone.updateWorldMatrix(false, true);
  }
  function rotW(bone, axisW, ang) {           // rotate bone about a world axis
    bone.updateWorldMatrix(true, false);
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()), q = new THREE.Quaternion().setFromAxisAngle(axisW, ang);
    const wq = bone.getWorldQuaternion(new THREE.Quaternion()); const nw = q.multiply(wq); bone.quaternion.copy(pq.invert().multiply(nw));
    bone.updateWorldMatrix(false, true);
  }
  function ik2(a, b, c, target, pole, la, lb) {
    a.updateWorldMatrix(true, true);
    const S = wp(a, V3()), T = target.clone(), dvec = T.clone().sub(S); let d = dvec.length();
    d = clamp(d, Math.abs(la - lb) + 1e-3, (la + lb) * 0.999); const dir = dvec.normalize();
    const cosA = clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const pv = pole.clone().sub(S); pv.sub(dir.clone().multiplyScalar(pv.dot(dir))).normalize();
    const E = S.clone().add(dir.clone().multiplyScalar(la * cosA)).add(pv.multiplyScalar(la * sinA));
    aim(a, b, E); aim(b, c, S.clone().add(dir.multiplyScalar(d)));
  }
  const fingers = ['index', 'middle', 'ring', 'pinky'];
  function curl(side, k) {
    const hand = B['hand_' + side]; hand.updateWorldMatrix(true, true);
    const across = wp(B['index_01_' + side], V3()).sub(wp(B['pinky_01_' + side], V3())).normalize();
    const sign = side === 'l' ? 1 : -1;
    for (const f of fingers) for (let j = 1; j <= 3; j++) { const bn = B[`${f}_0${j}_${side}`]; if (bn) rotW(bn, across, sign * k * (j === 1 ? 0.9 : 1.1)); }
    const th = B['thumb_02_' + side]; if (th) rotW(th, across, sign * k * 0.4);
  }
  const morph = skin.morphTargetDictionary, inf = skin.morphTargetInfluences;
  const setM = (n, v) => { const i = morph[n]; if (i !== undefined) inf[i] = v; };
  const toW = (arr) => holder.localToWorld(V3(...arr));
  // a pose is a set of parameters in character space (feet on floor, facing +z, +x = figure's left)
  function apply(p, time) {
    for (const k in B) B[k].quaternion.copy(rest[k]);
    root.position.set(p.hip[0], 0.83 + p.hip[1], p.hip[2]);
    root.updateMatrixWorld(true);
    const right = holder.localToWorld(V3(1, 0, 0)).sub(holder.localToWorld(V3())).normalize();
    const up = V3(0, 1, 0), fwd = holder.localToWorld(V3(0, 0, 1)).sub(holder.localToWorld(V3())).normalize();
    const breath = Math.sin(time * 1.6) * 0.012;
    // spine: lean (forward +), twist, side bend, distributed over three segments
    for (const s of ['spine_01', 'spine_02', 'spine_03']) {
      rotW(B[s], right, (p.lean * DEG) / 3 + (s === 'spine_03' ? breath : 0));
      rotW(B[s], up, (p.twist * DEG) / 3); rotW(B[s], fwd, (p.side * DEG) / 3);
    }
    if (p.pelvisTilt) rotW(B.pelvis, right, p.pelvisTilt * DEG);
    // legs
    for (const [s, foot, knee] of [['l', p.lf, p.lk], ['r', p.rf, p.rk]]) ik2(B['thigh_' + s], B['calf_' + s], B['foot_' + s], toW(foot), toW(knee), L.th, L.ca);
    for (const s of ['l', 'r']) { const f = B['foot_' + s]; f.updateWorldMatrix(true, true); const ball = wp(B['ball_' + s], V3()); const fp = wp(f, V3()); const tgt = fp.clone().add(fwd.clone().multiplyScalar(0.12)); tgt.y = Math.min(ball.y, fp.y - 0.06); aim(f, B['ball_' + s], tgt); }
    // arms
    for (const [s, hand, el] of [['l', p.lh, p.le], ['r', p.rh, p.re]]) {
      ik2(B['upperarm_' + s], B['lowerarm_' + s], B['hand_' + s], toW(hand), toW(el), L.ua, L.la);
      const hd = p['h' + s + 'd']; if (hd) aim(B['hand_' + s], B['middle_01_' + s], wp(B['hand_' + s], V3()).add(holder.localToWorld(V3(...hd)).sub(holder.localToWorld(V3())).normalize()));
      curl(s, p['c' + s] ?? 0.25);
    }
    // head: yaw/pitch toward a point in character space, net of the spine's lean, split over neck and head
    const hl = holder.worldToLocal(wp(B.head, V3())), d = V3(...p.look).sub(hl);
    const yaw = clamp(Math.atan2(d.x, d.z), -1.2, 1.2) - (p.twist || 0) * DEG, pitch = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.9) - (p.lean || 0) * DEG;
    for (const [bn, k] of [['neck_01', 0.45], ['head', 0.55]]) { rotW(B[bn], up, yaw * k); rotW(B[bn], right, pitch * k); }
    // face
    const blink = Math.pow(Math.max(0, Math.sin(time * 0.9 + 1.3) - 0.985) / 0.015, 1.5);
    const F = p.face || {};
    setM('eye-left-closure', clamp((F.lid ?? 0.1) + blink)); setM('eye-right-closure', clamp((F.lid ?? 0.1) + blink));
    setM('eyebrows-left-inner-up', F.worry ?? 0); setM('eyebrows-right-inner-up', F.worry ?? 0);
    setM('eyebrows-left-up', F.raise ?? 0); setM('eyebrows-right-up', F.raise ?? 0);
    setM('eyebrows-left-down', F.focus ?? 0); setM('eyebrows-right-down', F.focus ?? 0);
    setM('mouth-corner-puller', F.smile ?? 0); setM('mouth-open', F.open ?? 0); setM('mouth-depression', F.sad ?? 0); setM('mouth-compression', F.press ?? 0);
  }
  function opacity(a) {
    root.traverse(o => { if (o.isMesh) { const m = o.material; const want = a < 0.999; if (m.transparent !== want) { m.transparent = want; m.needsUpdate = true; } m.opacity = a; m.depthWrite = !want || a > 0.5; o.castShadow = a > 0.5; } });
    holder.visible = a > 0.01;
  }
  return { holder, root, B, apply, opacity, hand: s => B['hand_' + s] };
}

// pose library (character space). hip = pelvis offset from standing; lf/rf feet; lk/rk knee poles; lh/rh hands; le/re elbow poles.
const STAND = { hip: [0, 0, 0], lean: 0, twist: 0, side: 0, lf: [0.11, 0.06, 0.02], rf: [-0.11, 0.06, 0.02], lk: [0.12, 0.5, 1], rk: [-0.12, 0.5, 1],
  lh: [0.24, 0.84, 0.03], rh: [-0.24, 0.84, 0.03], le: [0.6, 1.1, -0.6], re: [-0.6, 1.1, -0.6], look: [0, 1.62, 2], cl: 0.35, cr: 0.35 };
const SIT = { ...STAND, hip: [0, -0.43, -0.06], lean: -8, lf: [0.13, 0.06, 0.5], rf: [-0.13, 0.06, 0.48], lk: [0.15, 0.6, 2], rk: [-0.15, 0.6, 2] };
function pose(base, o) { return { ...base, ...o, face: { ...(base.face || {}), ...(o.face || {}) } }; }
const POSES = {
  sitThink: pose(SIT, { lean: 18, rh: [-0.06, 1.12, 0.3], re: [-0.3, 0.6, 0.5], rhd: [0, 1, 0.3], cr: 0.75, lh: [0.18, 0.62, 0.38], le: [0.6, 0.8, 0], look: [0.4, 1.35, 2], face: { worry: 0.35, lid: 0.25, press: 0.3 } }),
  sitPhone: pose(SIT, { lean: 16, lh: [0.06, 0.8, 0.36], rh: [-0.04, 0.82, 0.38], le: [0.5, 0.5, 0], re: [-0.5, 0.5, 0], lhd: [0, 0.6, 1], rhd: [0, 0.6, 1], look: [-0.04, 0.84, 0.4], cl: 0.6, cr: 0.6, face: { raise: 0.25, lid: 0.3, smile: 0.15 } }),
  standReach: pose(STAND, { rh: [-0.3, 1.5, 0.62], re: [-0.8, 1.2, 0], rhd: [0, 0.4, 1], cr: 0.15, lh: [0.22, 0.86, 0.06], look: [-0.3, 1.65, 2], face: { smile: 0.45, raise: 0.2 } }),
  counter: pose(STAND, { lean: 14, lh: [0.18, 0.98, 0.42], rh: [-0.12, 1.0, 0.45], le: [0.6, 0.9, -0.3], re: [-0.6, 0.9, -0.3], lhd: [0, -0.3, 1], rhd: [0, -0.3, 1], look: [0, 0.9, 0.9], cl: 0.6, cr: 0.8, face: { focus: 0.3, smile: 0.25 } }),
  deskType: pose(SIT, { lean: 10, lh: [0.16, 0.8, 0.5], rh: [-0.16, 0.8, 0.5], le: [0.6, 0.5, 0], re: [-0.6, 0.5, 0], lhd: [0, -0.2, 1], rhd: [0, -0.2, 1], look: [0, 1.25, 2], cl: 0.4, cr: 0.4, face: { focus: 0.35, press: 0.2 } }),
  standPresent: pose(STAND, { lh: [0.12, 1.02, 0.3], le: [0.6, 0.7, -0.2], lhd: [0, 0.6, 1], cl: 0.6, rh: [-0.38, 1.25, 0.35], re: [-0.6, 0.8, -0.3], rhd: [-0.4, 0.5, 1], cr: 0.1, look: [-0.6, 1.6, 2], face: { smile: 0.7, raise: 0.25 } }),
  pack: pose(STAND, { lean: 20, lh: [0.2, 0.92, 0.42], rh: [-0.2, 0.92, 0.42], le: [0.7, 0.9, -0.2], re: [-0.7, 0.9, -0.2], lhd: [-0.3, -0.4, 1], rhd: [0.3, -0.4, 1], look: [0, 0.8, 0.8], cl: 0.5, cr: 0.5, face: { smile: 0.35, focus: 0.1 } }),
  sitRelax: pose(SIT, { lean: -22, hip: [0, -0.43, 0.02], lh: [0.42, 0.95, -0.25], rh: [-0.42, 0.95, -0.25], le: [0.8, 0.9, -0.2], re: [-0.8, 0.9, -0.2], lf: [0.2, 0.06, 0.62], rf: [-0.12, 0.06, 0.6], look: [0.3, 1.55, 2], face: { smile: 0.75, lid: 0.3 } }),
  window: pose(STAND, { lh: [0.2, 0.95, 0.08], rh: [-0.2, 0.95, 0.08], le: [0.6, 0.9, -0.4], re: [-0.6, 0.9, -0.4], look: [0, 1.85, 2], cl: 0.8, cr: 0.8, face: { smile: 0.35, raise: 0.15, lid: 0.2 } }),
};
function mixPose(a, b, t) {
  const o = { face: {} };
  for (const k in a) {
    if (k === 'face') continue;
    const x = a[k], y = b[k] ?? x;
    o[k] = Array.isArray(x) ? (Array.isArray(y) ? x.map((v, i) => lerp(v, y[i], t)) : t < 0.5 ? x : y) : typeof x === 'number' ? lerp(x, y ?? 0, t) : x;
  }
  for (const k in b) if (!(k in a)) o[k] = t < 0.5 ? undefined : b[k];
  const fk = new Set([...Object.keys(a.face || {}), ...Object.keys(b.face || {})]);
  for (const k of fk) o.face[k] = lerp(a.face?.[k] ?? 0, b.face?.[k] ?? 0, t);
  return o;
}

// ------------------------------------------------------------------ story beats
// each beat: hour of day, where the figure is (x, z, facing yaw), its pose, the holograms showing, props shown
const BEATS = {
  cookie: [
    { h: 7.3, at: [-2.55, 0.15, 90], pose: 'sitThink', holo: { thoughtCookie: [-2.4, 1.85, 0.2, 0.8] }, cap: 0 },
    { h: 9.5, at: [-2.55, 0.15, 90], pose: 'sitPhone', holo: { search: [-1.6, 1.95, 0.95, 0.95] }, phone: 'r', cap: 1 },
    { h: 11, at: [-0.4, -0.3, 225], pose: 'standReach', holo: { packages: [-1.35, 1.6, -1.35, 2.1, 'pk'] }, cap: 2 },
    { h: 14, at: [-1.7, -1.55, 180], pose: 'counter', props: ['bowl', 'tray0'], oven: 1, cap: 3 },
    { h: 18.4, at: [1.95, -1.15, 180], pose: 'deskType', props: ['tray0', 'tray1', 'box0', 'box1', 'box2'], chair: 1, holo: { brandCookie: [1.95, 1.95, -1.0, 0.9] }, screen: 'brand', cap: 4 },
    { h: 19.6, at: [1.2, 0.9, 210], pose: 'standPresent', phone: 'l', props: ['tray1', 'box0', 'box1', 'box2', 'box3', 'box4'], holo: { storeCookie: [-0.2, 1.55, 0.4, 1.7, 'st'] }, screen: 'store', cap: 5 },
    { h: 21, at: [0.55, -0.1, 0], pose: 'pack', props: ['table', 'box0', 'box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box7', 'box8', 'box9', 'box10'], holo: { ordersCookie: [1.65, 1.6, 0.2, 0.95] }, screen: 'orders', cap: 6 },
    { h: 23, at: [-2.55, 0.15, 90], pose: 'sitRelax', props: ['table', 'box0', 'box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box7', 'box8', 'box9', 'box10', 'box11', 'box12', 'box13'], holo: { sales: [-1.05, 1.9, -0.3, 1.15] }, cap: 7 },
    { h: 24, at: [-2.85, -1.15, 270], pose: 'window', props: ['table', 'box0', 'box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box7', 'box8', 'box9', 'box10', 'box11', 'box12', 'box13'], holo: { thoughtCookie: [-2.6, 2.05, -0.6, 0.65] }, cap: 8 },
  ],
  clothing: [
    { h: 7.3, at: [-2.55, 0.15, 90], pose: 'sitThink', holo: { thoughtTee: [-2.4, 1.85, 0.2, 0.8] }, cap: 0 },
    { h: 9.5, at: [-2.55, 0.15, 90], pose: 'sitPhone', holo: { search: [-1.6, 1.95, 0.95, 0.95] }, phone: 'r', cap: 1 },
    { h: 11, at: [-0.4, -0.3, 225], pose: 'standReach', holo: { packages: [-1.35, 1.6, -1.35, 2.1, 'pk'] }, cap: 2 },
    { h: 14, at: [0.55, 1.15, 180], pose: 'pack', props: ['table', 'press', 'rail'], cap: 3 },
    { h: 18.4, at: [1.95, -1.15, 180], pose: 'deskType', props: ['table', 'press', 'rail', 'fold0', 'fold1', 'fold2', 'fold3'], chair: 1, holo: { brandTee: [1.95, 1.95, -1.0, 0.9] }, screen: 'brand', cap: 4 },
    { h: 19.6, at: [0.55, 1.15, 180], pose: 'pack', props: ['table', 'rail', 'fold0', 'fold1', 'fold2', 'fold3', 'fold4', 'fold5', 'box0', 'box1', 'box2', 'box3'], holo: { storeTee: [-0.6, 1.55, 0.2, 1.7, 'st'] }, screen: 'store', cap: 5 },
    { h: 21, at: [0.55, -0.1, 0], pose: 'pack', props: ['table', 'rail', 'fold0', 'fold1', 'fold2', 'box0', 'box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box7', 'box8', 'box9'], holo: { ordersTee: [1.65, 1.6, 0.2, 0.95] }, screen: 'orders', cap: 6 },
    { h: 23, at: [-2.55, 0.15, 90], pose: 'sitRelax', props: ['table', 'rail', 'box0', 'box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box7', 'box8', 'box9', 'box10', 'box11', 'box12', 'box13'], holo: { sales: [-1.05, 1.9, -0.3, 1.15] }, cap: 7 },
    { h: 24, at: [-2.85, -1.15, 270], pose: 'window', props: ['table', 'rail', 'box0', 'box1', 'box2', 'box3', 'box4', 'box5', 'box6', 'box7', 'box8', 'box9', 'box10', 'box11', 'box12', 'box13'], holo: { thoughtTee: [-2.6, 2.05, -0.6, 0.65] }, cap: 8 },
  ],
};
// where stacked boxes/folds sit (index → position): a growing stack by the door side
function stackSpot(i, kind) {
  if (kind === 'fold') return [0.2 + (i % 2) * 0.3, 0.8 + Math.floor(i / 2) * 0.036, 0.75];
  if (i < 4) return [0.9 + (i % 2) * 0.32, 0.8 + Math.floor(i / 2) * 0.125, 0.4];
  const j = i - 4; return [2.0 + (j % 3) * 0.34, (Math.floor(j / 3) % 3) * 0.125, 1.45 + Math.floor(j / 9) * 0.34];
}

// ------------------------------------------------------------------ lighting through the day
function sunState(h) {
  // returns elevation (rad), azimuth across the window, colour, intensity, sky weights
  const day = smooth(6.2, 8.2, h) * (1 - smooth(18.6, 20.0, h));
  const dusk = smooth(16.8, 18.8, h) * (1 - smooth(19.8, 20.8, h)) + (1 - smooth(6.0, 8.5, h)) * 0.6;
  const night = smooth(19.6, 21.0, h);
  const u = clamp((h - 6) / 14);                       // 6:00 → 20:00
  const elev = Math.sin(u * Math.PI) * 52 * DEG + 4 * DEG;
  const az = lerp(-55, 55, u) * DEG;                      // across the window, left → right
  const warm = smooth(15, 19, h) + (1 - smooth(7, 10, h));
  const col = new THREE.Color().setRGB(1, lerp(0.95, 0.62, clamp(warm)), lerp(0.88, 0.38, clamp(warm)));
  return { elev, az, col, I: (day * 3.2 + dusk * 1.6) * (1 - night), day: Math.max(0, day - dusk * 0.6), dusk, night, u };
}

// ------------------------------------------------------------------ init
export async function init({ root, stage, canvas, assets = {}, story = 'cookie', low = false, onBeat }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance', alpha: false });
  const dpr = Math.min(devicePixelRatio || 1, low ? 1.25 : 1.75);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const S = { scene: new THREE.Scene() };
  S.scene.background = new THREE.Color(0x07060c);
  const pmrem = new THREE.PMREMGenerator(renderer); S.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  S.scene.environmentIntensity = 0.35;
  const camera = new THREE.PerspectiveCamera(24, 1, 0.5, 80);
  // the fixed elevated three-quarter view of the reference image
  const TARGET = V3(0.05, 0.75, 0.05), CAM_DIR = V3(1.0, 0.92, 1.08).normalize();

  // ground below the plinth: dark gloss, catching the neon
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x07060c }));
  gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.335; S.scene.add(gnd);
  const glowTex = (() => { const c = cv(256), g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
  const neonGlow = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x9a3cff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const ng1 = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2 + 1.4, 1.2), neonGlow); ng1.rotation.x = -Math.PI / 2; ng1.position.set(0, -0.33, RZ + 0.45); S.scene.add(ng1);
  const ng2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, RZ * 2 + 1.4), neonGlow); ng2.rotation.x = -Math.PI / 2; ng2.position.set(RX + 0.45, -0.33, 0); S.scene.add(ng2);

  // models
  const loader = new GLTFLoader(); const M = {};
  const load = async (k) => { if (!assets[k]) return; try { const g = await loader.loadAsync(assets[k]); M[k] = g; } catch (e) { console.warn('diorama: failed', k); } };
  await Promise.all(['man', 'sofa', 'chair', 'lamp', 'cup'].map(load));
  const Mod = { sofa: M.sofa?.scene, chair: M.chair?.scene, lamp: M.lamp?.scene, cup: M.cup?.scene };
  buildRoom(S, assets, low); buildKitchen(S); buildDesk(S); buildLiving(S, Mod);

  // lights
  const hemi = new THREE.HemisphereLight(0xbfd3ff, 0x4a3a30, 0.4); S.scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true; sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  S.scene.add(sun, sun.target); sun.target.position.set(-0.5, 0, 0);
  const lamps = [
    { l: new THREE.PointLight(0xffb36b, 0, 6, 1.6), p: [-RX + 0.45, 1.5, -1.65] },     // floor lamp by the sofa
    { l: new THREE.PointLight(0xffc98a, 0, 3.5, 1.8), p: [-1.6, 1.55, -RZ + 0.45] },  // kitchen under-cabinet
    { l: new THREE.PointLight(0xffd29a, 0, 3.5, 1.8), p: [1.4, 1.15, -RZ + 0.6] },    // desk lamp
    { l: new THREE.PointLight(0xffc68a, 0, 4, 1.6), p: [RX - 0.55, 1.6, -RZ + 0.6] },  // shelf
    { l: new THREE.PointLight(0xb58cff, 0, 5, 1.5), p: [0.2, 2.2, 1.0] },             // hologram spill
  ];
  lamps.forEach(o => { o.l.position.set(...o.p); S.scene.add(o.l); });
  lamps[0].l.castShadow = !low; lamps[0].l.shadow.mapSize.set(512, 512); lamps[0].l.shadow.bias = -0.002;
  const lampGlows = [lamps[0], lamps[2]].map(o => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb36b, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); s.scale.set(0.9, 0.9, 1); s.position.set(...o.p); S.scene.add(s); return s; });

  // figure + story props
  let fig = null; if (M.man) { fig = makeFigure(M.man); S.scene.add(fig.holder); if (window.__dbg) window.__fig = fig; }
  const kits = { cookie: buildProps(S, 'cookie'), clothing: buildProps(S, 'clothing') };
  const holos = {};
  for (const key of Object.keys(PANELS)) { const s = key === 'packages' ? 2.6 : key.startsWith('store') ? 2.1 : key === 'sales' ? 1.5 : key === 'search' || key.startsWith('orders') ? 1.25 : 1.05; holos[key] = hologram(key, s); S.scene.add(holos[key].mesh); }

  let cur = story, p = 0, active = true, raf = 0, W = 1, H = 1, last = performance.now(), clock = 0;
  const resize = () => {
    W = stage.clientWidth || innerWidth; H = stage.clientHeight || innerHeight;
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); camera.aspect = W / H;
    // keep the whole box in frame at any aspect
    const portrait = W / H < 0.9; camera.fov = portrait ? 38 : 24; camera.updateProjectionMatrix();
    kick();
  };
  addEventListener('resize', resize, { passive: true });

  const screenDraw = (mode, t) => {
    const { g } = S.screen, w = 512, h = 300;
    if (!mode) { g.fillStyle = '#0d0f16'; g.fillRect(0, 0, w, h); txt(g, '', 0, 0, 10); S.screen.tex.needsUpdate = true; return; }
    const key = mode === 'brand' ? (cur === 'cookie' ? 'brandCookie' : 'brandTee') : mode === 'store' ? (cur === 'cookie' ? 'storeCookie' : 'storeTee') : (cur === 'cookie' ? 'ordersCookie' : 'ordersTee');
    const P = PANELS[key]; const tmp = panelCanvas(P.w, P.h); P.draw(tmp.g, P.w, P.h, t);
    g.fillStyle = '#121420'; g.fillRect(0, 0, w, h); g.drawImage(tmp.c, 0, 0, w, h); S.screen.tex.needsUpdate = true;
  };
  let lastScreen = '';

  function frame(now) {
    raf = 0; const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    const beats = BEATS[cur], nB = beats.length;
    const f = clamp(p) * (nB - 1), i0 = Math.min(nB - 2, Math.floor(f)), fr = f - i0;
    // beats hold, then transition in the last 45% of each interval
    const tr = smooth(0.55, 1, fr), A = beats[i0], Bt = beats[i0 + 1];
    const beatIdx = tr < 0.5 ? i0 : i0 + 1; onBeat?.(beats[beatIdx].cap, cur);
    const local = tr < 0.5 ? smooth(0, 0.55, fr) : 0;   // progress inside the current beat (for panel animations)
    // time of day
    const h = lerp(A.h, Bt.h, smooth(0.35, 1, fr));
    const s = sunState(h);
    const sd = V3(-Math.cos(s.elev) * Math.cos(s.az), Math.sin(s.elev), Math.cos(s.elev) * Math.sin(s.az) * 0.9);
    sun.position.copy(sd.multiplyScalar(14)).add(V3(-0.5, 0, 0)); sun.color.copy(s.col); sun.intensity = s.I;
    S.sky.uDay.value = s.day; S.sky.uDusk.value = s.dusk; S.sky.uNight.value = s.night;
    S.sky.uSun.value.set(0.5 - Math.sin(s.az) * 0.6, 0.18 + Math.sin(s.elev) * 0.9);
    const lampOn = smooth(17.5, 19.2, h);
    lamps[0].l.intensity = lampOn * 7; lamps[1].l.intensity = smooth(12.5, 14, h) * 3 + lampOn * 2; lamps[2].l.intensity = lampOn * 4; lamps[3].l.intensity = lampOn * 3;
    lampGlows[0].material.opacity = lampOn * 0.55; lampGlows[1].material.opacity = lampOn * 0.4;
    S.kStrip.color.setRGB(1, 0.85, 0.62).multiplyScalar(0.2 + 1.6 * Math.max(lampOn, smooth(12.5, 14, h)));
    S.shelfGlow.color.setRGB(1, 0.8, 0.55).multiplyScalar(0.1 + 1.8 * lampOn);
    hemi.intensity = 0.05 + 0.55 * s.day + 0.22 * s.dusk; hemi.color.setRGB(lerp(0.55, 0.75, s.day), lerp(0.55, 0.83, s.day), 1);
    S.scene.environmentIntensity = 0.05 + 0.35 * s.day + 0.1 * s.dusk;
    renderer.toneMappingExposure = 1.0 + 0.1 * s.night;
    S.curtainU.uT.value = clock;
    // oven + holo spill
    S.ovenGlow.opacity = lerp(A.oven ? 1 : 0, Bt.oven ? 1 : 0, tr) * (0.75 + 0.25 * Math.sin(clock * 3));
    // props (cookie or clothing kit only)
    for (const k of ['cookie', 'clothing']) kits[k].root.visible = k === cur;
    const kit = kits[cur].P;
    for (const [name, obj] of Object.entries(kit)) {
      if (name === 'phone') continue;
      const a = (A.props || []).includes(name) ? 1 : 0, b = (Bt.props || []).includes(name) ? 1 : 0, v = lerp(a, b, tr);
      obj.visible = v > 0.02;
      const m = /^(box|fold)(\d+)$/.exec(name);
      if (m) { const sp = stackSpot(+m[2], m[1]); obj.position.set(sp[0], sp[1] + (1 - v) * 0.25, sp[2]); obj.scale.setScalar(Math.max(0.001, v)); }
      else obj.scale.setScalar(Math.max(0.001, smooth(0, 1, v)));
    }
    // holograms: fade/scale in, bob gently
    let spill = 0;
    for (const [key, hg] of Object.entries(holos)) {
      const ha = A.holo?.[key], hb = Bt.holo?.[key];
      const a = (ha ? 1 : 0) * (1 - tr) + (hb ? 1 : 0) * tr, spec = (tr < 0.5 ? ha : hb) || ha || hb;
      if (!spec || a < 0.01) { hg.set(0, 0); continue; }
      hg.mesh.position.set(spec[0], spec[1] + Math.sin(clock * 1.2 + spec[0]) * 0.025, spec[2]);
      hg.mesh.lookAt(camera.position.x, spec[1] + 0.4, camera.position.z);
      const tIn = ha && hb ? 1 : ha ? 1 : smooth(0.5, 1, tr);
      const anim = ha && tr < 0.5 ? Math.max(local, 0) : hb && !ha ? 0 : 1;
      hg.set(ha && !hb ? 1 : clamp(anim), a * (0.92));
      hg.mesh.scale.setScalar(0.85 + 0.15 * a); spill = Math.max(spill, a);
    }
    lamps[4].l.intensity = spill * 2.2;
    // monitor screen
    const sm = tr < 0.5 ? A.screen : Bt.screen, key = sm + cur + Math.round(local * 20);
    if (key !== lastScreen) { screenDraw(sm, sm ? (A.screen === sm && tr < 0.5 ? local : 1) : 0); lastScreen = key; }
    // chair slides out when the figure sits at the desk
    const chairOn = lerp(A.chair ? 1 : 0, Bt.chair ? 1 : 0, tr);
    S.chair.position.set(1.95, 0, -RZ + 1.15 - chairOn * 0.05); S.chair.rotation.y = Math.PI + chairOn * 0.15;
    // figure: same spot → blend poses; new spot → time-lapse dissolve (out at A, in at B)
    if (fig) {
      const same = A.at[0] === Bt.at[0] && A.at[1] === Bt.at[1];
      let posA = A, posB = Bt, t = tr, op = 1, spec = A;
      if (same) { spec = A; } else { if (tr < 0.5) { spec = A; t = 0; op = 1 - smooth(0, 0.5, tr); } else { spec = Bt; t = 1; op = smooth(0.5, 1, tr); } }
      const at_ = same ? A.at : spec.at;
      fig.holder.position.set(at_[0], 0, at_[1]); fig.holder.rotation.y = lerp(A.at[2], same ? Bt.at[2] : at_[2], same ? tr : 0) * DEG;
      fig.holder.updateMatrixWorld(true);
      const pz = same ? mixPose(POSES[A.pose], POSES[Bt.pose], tr) : POSES[spec.pose];
      // small life: weight shifts, typing, stirring, scrolling
      const live = { ...pz, face: { ...pz.face } };
      const pn = same ? (tr < 0.5 ? A.pose : Bt.pose) : spec.pose;
      if (pn === 'counter') { live.rh = [live.rh[0] + Math.sin(clock * 5) * 0.04, live.rh[1], live.rh[2] + Math.cos(clock * 5) * 0.04]; }
      if (pn === 'deskType') { live.lh = [live.lh[0], live.lh[1] + Math.max(0, Math.sin(clock * 11)) * 0.01, live.lh[2]]; live.rh = [live.rh[0], live.rh[1] + Math.max(0, Math.sin(clock * 9 + 1)) * 0.01, live.rh[2]]; }
      if (pn === 'pack') { live.lean += Math.sin(clock * 1.4) * 4; live.twist = Math.sin(clock * 0.9) * 10; }
      live.look = [live.look[0] + Math.sin(clock * 0.37) * 0.06, live.look[1] + Math.sin(clock * 0.53) * 0.03, live.look[2]];
      fig.apply(live, clock); fig.opacity(op);
      // phone in hand
      const ph = kit.phone, side = (tr < 0.5 ? A.phone : Bt.phone);
      if (side && op > 0.05) {
        const hb = fig.hand(side); hb.updateWorldMatrix(true, false); const hp = hb.getWorldPosition(V3());
        const mid = fig.B['middle_01_' + side].getWorldPosition(V3()); ph.visible = true;
        ph.position.copy(hp.lerp(mid, 0.9)); ph.lookAt(fig.B.head.getWorldPosition(V3())); ph.rotateX(-0.2);
      } else ph.visible = false;
    }
    // camera: the fixed reference angle, with a slow drift toward where the story is
    const focus = V3(A.at[0], 0.9, A.at[1]).lerp(V3(Bt.at[0], 0.9, Bt.at[1]), tr);
    const tgt = window.__tgt ? V3(...window.__tgt) : TARGET.clone().lerp(focus, 0.12);
    const dist = window.__dist || (camera.fov > 30 ? 21 : 19.2);
    camera.position.copy(tgt).add(CAM_DIR.clone().multiplyScalar(dist)); camera.lookAt(tgt);
    renderer.render(S.scene, camera);
    if (active) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && active) raf = requestAnimationFrame(frame); }
  resize();
  return {
    setProgress(v) { p = clamp(v); kick(); },
    setStory(k) { if (BEATS[k]) { cur = k; lastScreen = ''; kick(); } },
    setActive(on) { active = on; if (on) { last = performance.now(); kick(); } },
    renderOnce() { active = true; frame(performance.now()); active = false; },
    get story() { return cur; },
    beats: (k = cur) => BEATS[k].length,
  };
}
