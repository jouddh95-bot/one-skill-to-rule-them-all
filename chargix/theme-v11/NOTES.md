# CHARGIX v11 · "From the ground up"

Home page = `sections/grow.liquid`: a live WebGL desert (`assets/cx-grow.js`, Three.js r170 bundled with esbuild from
`../v11-src/grow.js`). One continuous shot driven by the scroll: a seed opens in the sand, sprouts, grows into a palo
verde, a pavilion store rises around it, the tree blooms gold, a garden spreads and the day turns to night.
Everything is a pure function of the smoothed scroll position, so it plays backwards exactly as forwards.

- Build the scene: `cd chargix/v11-src && npm install && npm run build`.
- Write the home template: `python3 chargix/tools/v11-index.py` (chapters, package cards, care card, progress bar).
  Chapter timings are 0-1 of the section's scroll. Prices are read from the products, never typed.
- Posters and no-WebGL stills: `grow-d-N.webp` (1600×1000) and `grow-m-N.webp` (780×1688), rendered from the
  scene itself with `?cxdpr=N` (fixed pixel ratio).
- Fallbacks: no WebGL2 or a lost context → the stills crossfade with the scroll; script never starts → after 8 s the
  section drops to the static layout (poster, intro, every chapter in order).
- Performance: growth and construction run in vertex shaders (birth attributes + one uniform each); the shadow map
  only re-renders when the scroll moves; pixel ratio adapts to frame time; rendering stops when the stage is off
  screen; every shader is compiled under the poster before the first frame.
