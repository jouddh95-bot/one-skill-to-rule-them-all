# Writes chargix/theme-v9/templates/index.json (the "Night studio" home page).
# Edit the data below and re-run:  python3 chargix/tools/v9-index.py
# Film chapters: one short line each (<= 8 words) plus a tiny label; a/b are the scroll window in %.
# Optional overrides: theme-v9/story-cookie.json / theme-v9/story-nova.json with the same shape as
# STORIES[...] below ({"settings": {...}, "chapters": [...]}) replace the built-in data.
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'theme-v9')

def ch(n, rail, a, b, time, day, line, label='', link='', demo=False):
    assert len(line.split()) <= 8, f'caption too long: {line}'
    return {"chapter": n, "rail": rail, "a": str(a), "b": str(b), "time": time, "day": day, "line": line, "label": label, "link": link, "demo": demo}

STORIES = {
  # Story one: a cookie business, in the box. Timings follow the v8 story (480 frames).
  "cookie": {
    "settings": {
      "anchor": "work", "label": "Story one: a cookie business grows inside one miniature room", "prefix": "cookie", "frames": 480, "poster": "000",
      "poster_alt": "A miniature apartment on a dark plinth at dusk: a sofa, a kitchen, a desk and a big window over the city.",
      "track": True, "eager": True, "h1": True, "length": 2000, "intro_end": 3,
      "eyebrow": "CHARGIX · websites & 3D", "heading": "Every business starts <em>in a small room.</em>",
      "text": "Two days of a new cookie business.", "cue": "Scroll to play",
      "note": "Pre-rendered animation played by your scroll. Brands and orders are made-up demo data.",
    },
    "chapters": [
      ch(1, "The idea", "4.0", "7.8", "6:40 PM", "Day one", "A small idea, after a long day."),
      ch(2, "Finding CHARGIX", "7.8", "31.5", "8:30 PM", "Day one", "One search. Three fixed prices.", "See the packages", "#packages"),
      ch(3, "Setting up", "31.5", "43.0", "8:00 AM", "Day two", "Next morning, the kitchen becomes a bakery."),
      ch(4, "First batch", "43.0", "56.3", "10:00 AM", "Day two", "Twelve on the tray. Into the oven."),
      ch(5, "The build", "56.3", "78.9", "1:00 PM", "Day two", "We build the store. She bakes."),
      ch(6, "Launch", "78.9", "84.4", "4:30 PM", "Day two", "Sweet & Co. goes live.", "See the demo store", "/?view=launch-demo", True),
      ch(7, "Orders", "84.4", "93.3", "6:30 PM", "Day two", "Demo orders, packed by hand.", demo=True),
      ch(8, "Morning", "93.3", "100.2", "7:00 AM", "Day three", "The next morning. Your turn.", "Start your project", "#packages"),
    ],
  },
  # Story two: a clothing label in the same box. Placeholder timings: align a/b/time to the film.
  "nova": {
    "settings": {
      "anchor": "nova", "label": "Story two: a clothing label in the same miniature room", "prefix": "nova", "frames": 480, "poster": "000",
      "poster_alt": "The same miniature room at night, set up as a small print studio with a heat press and a garment rack.",
      "track": True, "eager": False, "h1": False, "length": 1800, "intro_end": 4,
      "eyebrow": "Story two · a clothing label", "heading": "NOVA, <em>a made-up label.</em>",
      "text": "A clothing label, printed at home.", "cue": "Scroll to play",
      "note": "Pre-rendered animation played by your scroll. Brands and orders are made-up demo data.",
    },
    "chapters": [
      ch(1, "The design", "4", "12.2", "9:40 PM", "Day one", "Late night. Picking the first design."),
      ch(2, "The pick", "12.2", "29.6", "10:30 PM", "Day one", "She picks Business Launch, then sleeps.", "See the packages", "#packages"),
      ch(3, "The press", "29.6", "56.7", "8:30 AM", "Day two", "Blank tee, transfer, heat. Peel."),
      ch(4, "The rack", "56.7", "64.1", "11:00 AM", "Day two", "Tee after tee. The rack fills."),
      ch(5, "The build", "64.1", "78.1", "2:00 PM", "Day two", "We build the store. She folds."),
      ch(6, "Launch", "78.1", "84.8", "6:00 PM", "Day two", "NOVA goes live. A made-up label.", demo=True),
      ch(7, "Orders", "84.8", "93.7", "7:30 PM", "Day two", "Demo orders, folded into mailers.", demo=True),
      ch(8, "Next", "93.7", "100.2", "9:30 PM", "Day two", "Same box. Your business next.", "Start your project", "#packages"),
    ],
  },
}

for key in STORIES:
    over = os.path.join(ROOT, f'story-{key}.json')
    if os.path.exists(over):
        STORIES[key] = json.load(open(over))

def blocks(prefix, items):
    b = {f"{prefix}{i+1}": it for i, it in enumerate(items)}
    return b, list(b)

def film(key):
    s = STORIES[key]
    fb, fo = blocks('ch', [{"type": "chapter", "settings": c} for c in s["chapters"]])
    return {"type": "film", "settings": s["settings"], "blocks": fb, "block_order": fo}

S = {}
S["film"] = film("cookie")

S["interlude"] = {"type": "interlude", "settings": {"anchor": "interlude", "eyebrow": "Story two", "heading": "Same box. <em>A different business.</em>",
  "text": "Now the room becomes a small clothing label.", "label": "Keep scrolling", "link": "#nova"}}

S["film_nova"] = film("nova")

# Package copy is v8's, verbatim (templates/index.json / tools/v8-index.py).
pb, po = blocks('p', [
  {"type": "package", "settings": {"product": "essential-website", "tier": "Tier 01", "price_note": "one-time",
    "for": "For freelancers, service providers and first-time founders.", "three_d": "none", "chips": "",
    "preview": "site", "asset": "pk-essential.webp", "mini_url": "sweetandco.demo", "mini_brand": "Sweet & Co.", "mini_heading": "Baked this morning.",
    "list": "*Up to 5 pages\nPremium theme customised to your brand\nUp to 10 products or services set up\nContact form, payments and shipping basics\nMobile optimisation and launch testing\n2 revision rounds, 14 days of fixes",
    "time": "About 10 business days", "demo_link": "/?view=essential-demo", "demo_label": "See a demo"}},
  {"type": "package", "settings": {"product": "3d-experience-website", "tier": "Tier 02", "pick": True, "pick_label": "Signature", "price_note": "one-time",
    "for": "Our signature package, for brands that need to stand out.", "three_d": "premium", "chips": "",
    "preview": "model", "asset": "pk-3d.webp", "glb": "demo-box.glb", "model_alt": "A 3D gift box you can turn around",
    "list": "*1 real interactive 3D scene (WebGL)\n*Custom visual direction and motion design\nUp to 8 pages, 1 custom landing page\nUp to 20 products or services set up\nFull Shopify setup and branded emails\n3 revision rounds, 30 days of fixes",
    "time": "3 to 4 weeks", "demo_link": "/?view=3d-demo", "demo_label": "See a demo"}},
  {"type": "package", "settings": {"product": "business-launch", "tier": "Tier 03", "price_note": "one-time",
    "for": "Everything in 3D Experience, plus your store, brand and socials set up for you.", "three_d": "plus", "chips": "",
    "preview": "model", "asset": "pk-launch.webp", "glb": "nova-box.glb", "model_alt": "A 3D box you can turn around",
    "scope": "store|Store set up\nbrand|Logo & brand guide\nsocial|Social profiles\npixel|Meta & TikTok pixels\nlang|Spanish pages",
    "list": "*Everything in 3D Experience\n*Up to 40 products uploaded, descriptions written\n*Logo refresh and mini brand guide\nInstagram, Facebook and TikTok profiles set up\nMeta and TikTok pixels; 1 ad campaign drafted, not launched\nSpanish versions of key pages\nUp to 10 pages, 2 custom landing pages",
    "time": "4 to 5 weeks", "demo_link": "/?view=launch-demo", "demo_label": "See a demo"}},
])
rows = [
  ("Pages", "Up to 5 | Up to 8 | Up to 10"),
  ("Interactive 3D scene", "- | 1 scene (WebGL) | 1 scene (WebGL)"),
  ("Design", "Premium theme, customised | Custom direction + motion | Custom direction + motion"),
  ("Products set up", "Up to 10 | Up to 20 | Up to 40, descriptions written"),
  ("Images prepared", "Up to 20 | Up to 40 | Up to 80"),
  ("Logo refresh and brand guide", "- | - | yes"),
  ("Social profiles and pixels", "- | - | yes"),
  ("Spanish pages", "- | - | Key pages"),
  ("Revision rounds", "2 | 3 | 3"),
  ("Handover", "30-min video | 45-min call + video | 2 × 45-min calls + video"),
  ("Post-launch fixes", "14 days | 30 days | 30 days"),
  ("Timeline", "About 10 business days | 3 to 4 weeks | 4 to 5 weeks"),
]
S["packages"] = {"type": "packages", "settings": {"anchor": "packages", "index": "01", "eyebrow": "Packages", "heading": "Three fixed prices. Pick how far you want to go.",
  "text": "Every package is a complete website. The difference is how much we build for you: a clean site, a site with a real 3D scene, or the whole launch.",
  "note": "Prices in USD, paid once at checkout. Not included in any package: Shopify plan, domain, paid apps, photography or ad spend. No package guarantees sales or rankings. Demo storefronts use made-up brands.",
  "compare_anchor": "compare", "compare_index": "02", "compare_eyebrow": "Side by side", "compare_heading": "What changes between the three",
  "matrix": "\n".join(f"{l} | {c}" for l, c in rows)}, "blocks": pb, "block_order": po}

wb, wo = blocks('w', [
  {"type": "pillar", "settings": {"icon": "flat", "title": "Websites that sell", "text": "Shopify stores and service sites, designed for your brand, set up properly and tested on phones before launch."}},
  {"type": "pillar", "settings": {"icon": "box", "title": "3D people remember", "text": "A real interactive 3D scene on your site: your product, space or idea, built for the browser with a light fallback for phones."}},
  {"type": "pillar", "settings": {"icon": "store", "title": "Launches done for you", "text": "Products, logo refresh, social profiles, pixels and Spanish pages, set up end to end so you can start selling."}},
  {"type": "serve", "settings": {"title": "Who it is for", "items": "First-time founders, Bakers and food makers, Product brands, Service businesses, Shops moving to Shopify, Brands in the US and Mexico"}},
])
S["studio"] = {"type": "what-we-do", "settings": {"anchor": "studio", "index": "03", "eyebrow": "What CHARGIX does", "heading": "We build the website your business runs on.",
  "text": "CHARGIX is a small studio that designs, builds and launches Shopify websites. Three fixed prices, paid online, built in English or Spanish."}, "blocks": wb, "block_order": wo}

sb, so = blocks('s', [
  {"type": "step", "settings": {"when": "Day 0", "title": "You pay at checkout", "text": "Secure Shopify checkout. Your order email arrives right away with a link to the project form."}},
  {"type": "step", "settings": {"when": "Day 0–1", "title": "You send the project form", "text": "About 10 minutes: your business, the look you want and a link to your logo and photos."}},
  {"type": "step", "settings": {"when": "Within 1 business day", "title": "We confirm your start date", "text": "Your timeline starts once the form and files are complete."}},
  {"type": "step", "settings": {"when": "Build", "title": "We design and build, you review", "text": "You see the work in progress and get the revision rounds your package includes."}},
  {"type": "step", "settings": {"when": "Launch", "title": "We launch and hand over", "text": "A recorded walkthrough (live calls on the bigger packages), then free fixes for 14 or 30 days."}},
])
S["process"] = {"type": "steps", "settings": {"anchor": "process", "index": "04", "eyebrow": "After you buy", "heading": "From checkout to launch in five steps.",
  "button": "Already bought? Send your project form", "link": "/pages/onboarding"}, "blocks": sb, "block_order": so}

S["care"] = {"type": "care", "settings": {"anchor": "care", "index": "05", "eyebrow": "After launch", "heading": "Keep it running.",
  "text": "Optional monthly care for Shopify sites. Shopify handles hosting and security; we do the human checks and the edits.", "product": "care-plan",
  "desc_1": "Monthly health check, 30 minutes of edits, reply within 3 business days",
  "desc_2": "Twice-monthly checks, 2 hours of edits, reply within 1 business day",
  "desc_3": "Weekly checks, 3D checks on every device, 4 hours of edits, same-day reply",
  "fine": "Extra work is always quoted first, at $65/hour."}}

qs = [
  ("Is the 3D in the $1,650 package real 3D?", "<p>Yes. 3D Experience and Business Launch include one real, interactive 3D scene built with WebGL, with a lighter fallback for phones. The story at the top of this page is different: it is a pre-rendered animation that your scrolling plays forwards and backwards.</p>"),
  ("Does the $750 package include 3D?", "<p>No. Essential is a clean, fast, professional website with no 3D. If you want 3D, choose 3D Experience or Business Launch.</p>"),
  ("What do you need from me?", "<p>After checkout you fill in a short project form and share your logo, photos and product information. Your timeline starts once those are in.</p>"),
  ("What is not included?", "<p>Your Shopify plan, domain, paid apps, photography and ad spend. We never guarantee sales, rankings or ad results.</p>"),
  ("Do you need my Shopify password?", "<p>No. We use Shopify collaborator access, which you approve and can remove at any time.</p>"),
  ("Do you work in Spanish?", "<p>Yes, we work in English or Spanish. Business Launch also includes Spanish versions of your key pages.</p>"),
  ("Can I get a refund?", "<p>See our <a href=\"/policies/refund-policy\">refund policy</a> for exactly when and how refunds work.</p>"),
]
qb, qo = blocks('q', [{"type": "q", "settings": {"q": q, "a": a}} for q, a in qs])
S["faq"] = {"type": "faq", "settings": {"anchor": "faq", "index": "06", "eyebrow": "Questions", "heading": "Before you buy"}, "blocks": qb, "block_order": qo}

S["closing"] = {"type": "closing", "settings": {"asset": "cookie-479.webp", "eyebrow": "Ready when you are", "heading": "Your business, <em>open for orders.</em>",
  "text": "Pick a package and pay online. We start as soon as your project form is in.",
  "label": "Start your project", "link": "/#packages", "label2": "Talk to us", "link2": "/pages/contact"}}

order = ["film", "interlude", "film_nova", "packages", "studio", "process", "care", "faq", "closing"]
out = os.path.join(ROOT, 'templates', 'index.json')
with open(out, 'w') as fh:
    json.dump({"sections": S, "order": order}, fh, ensure_ascii=False, indent=2)
print("index.json written:", ", ".join(f"{k} {len(v['chapters'])} chapters" for k, v in STORIES.items()))
