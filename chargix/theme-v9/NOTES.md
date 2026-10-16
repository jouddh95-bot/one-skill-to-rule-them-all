# CHARGIX theme v9 · "Night studio"

The whole site is one evening scene: dark warm stage, frosted-glass panels, one lamp-amber accent,
dusk blue used sparingly. Section labels reuse the film's chapter mark (mono label + lit dot), so
packages, process, care and FAQ read as later scenes of the same evening.

## Files
- layout/ theme.liquid, password.liquid (Fraunces / Manrope / JetBrains Mono from Google Fonts)
- assets/ cx.css (design system), cx.js (header, sheet menu, fail-safe reveal, lazy model-viewer,
  form helpers), film.js (scroll film player), cx-demo.css (demo storefronts, new CHARGIX demo bar),
  demo-*.webp, demo-box.glb, pk-*.webp (copied from v8)
- sections/ film, interlude (new), packages (cards + comparison matrix; compare.liquid is gone),
  what-we-do, steps (process timeline), care, faq, closing, header, footer, header/footer-group.json,
  contact, onboarding, demo-store, main-* (product, cart, collection, list-collections, search,
  blog, article, page, 404, password)
- snippets/ icon (new icons), logo, meta, card, delivery-estimate (v8 verbatim), address-fields (v8)
- templates/ index.json (generated), product/cart/collection/... json, index.*-demo.json,
  customers/*.liquid, gift_card.liquid
- locales/ en.default.json, es.json (v8 keys + new: packages.no_3d_badge, interactive_3d, drag,
  includes, timeline, scope, demo; cart.count; demo.chip)
- ../tools/v9-index.py writes templates/index.json (stories, packages, matrix, steps, care, FAQ)

## Design tokens (:root in cx.css)
--bg #0f0e11 · --bg-2 #16141a · --bg-3 #1e1b22 · --panel rgba(255,246,236,.05) · --panel-2 .08
--line rgba(255,240,225,.10) · --line-2 .18 · --text #f3eee7 · --text-2 #b9b0a5 · --text-3 #7d756c
--lamp #f2a65a (primary) · --lamp-2 #f7bd80 · --dusk #9db8d6 (secondary, sparing) · --ok #8fc79a · --err #f0937c
Type: --f-display Fraunces (300–600, italic em), --f-sans Manrope, --f-mono JetBrains Mono;
fluid scale --t-body … --t-h1 via clamp(). Radii 10/16/24/pill. Glass = .glass (panel + border + blur).
Components: .btn--lamp / .btn--glass / .btn--text, .chip, .badge, .tier, .glass, .field/.input/.select/
.textarea/.alert, .qty, .acc (details accordion), .tbl--stack (table → cards under 750px), .timeline.
Reveal is fail-safe: [data-reveal] only hides under html.cx-ready, which cx.js adds after the
observer is set up; nothing hides with reduced motion.

## Film data contract (sections/film.liquid + assets/film.js)
- Frames: theme assets `{prefix}-NNN.webp` (3 digits, 000 … frames-1), 1920×1200 (any 16:10 works).
  Phones (≤749px) load every 2nd frame. Poster = `{prefix}-{poster}.webp`.
- Camera track (optional, setting "Use camera track" on by default): asset `{prefix}-track.json` =
  JSON array, one entry per frame, `[cx, cy, z]` (cx, cy 0..1 image coords of the action, z ≥ 1).
  Resampled to the frame count if lengths differ, gaussian-smoothed (±6 frames), sampled at the same
  fractional frame index as the cross-dissolve, then eased (τ≈160 ms). Portrait zoom =
  clamp(z·1.6, 1.4, 2.4) relative to fit-width; landscape zoom = clamp(z, 1, 1.35) relative to cover;
  crop always clamped inside the image. Missing/invalid file → v8 framing.
- Chapters: blocks with a/b window (% of scroll), time, day, label (rail), one-line caption
  (≤ 8 words, enforced by v9-index.py), optional button, demo flag.
- Test hook: `window.__cxFilm.work.seek(p)`, `window.__cxFilm.nova.seek(p)`, and
  `window.__cxFilm.seek(p)` / `.ready` for the first film.
- No JS / reduced motion: poster + intro + chapter list (default markup; JS adds .is-live).

## Things to fill / upload
1. Story one frames `cookie-000…479.webp` (+ optional `cookie-track.json`); closing uses `cookie-479.webp`.
   Chapter timings were copied from the v8 story — re-time if the cookie film differs.
2. Story two frames `nova-000…479.webp` (+ optional `nova-track.json`). Frame count 480 is assumed;
   chapter windows/times/captions are placeholders: align them to the film in tools/v9-index.py.
3. `nova-box.glb` (Business Launch 3D preview). Until it exists the card keeps its poster pk-launch.webp.
4. `pk-essential.webp`: the current file is a product photo, so the Essential card uses the drawn flat
   website mockup (preview "site") with it as the hero. If you upload a real flat website mockup, set
   that block's Preview to "Website mockup image in a browser frame".
5. Header menu `studio-main` (links like /#work, /#packages, /#process, /#faq, /pages/contact).
