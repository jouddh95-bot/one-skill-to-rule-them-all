# Writes chargix/theme-v10/templates/index.json (CHARGIX v10, "Small room").
# Two story stages (sections/story.liquid) play Higgsfield films of one miniature box, keyed by film frame.
# Frame maps come from tools/v10-frames.py (cookie: 263 frames, clip starts 0/61/121/143/203;
# NOVA: 237 frames, clip starts 0/61/121/181). Packages, process, care and FAQ copy is v8/v9 verbatim.
# Run:  python3 chargix/tools/v10-index.py
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'theme-v10')
LOOP = json.load(open(os.path.join(ROOT, 'loops.json'))) if os.path.exists(os.path.join(ROOT, 'loops.json')) else {}

def blocks(prefix, items):
    b = {f"{prefix}{i+1}": it for i, it in enumerate(items)}
    return b, list(b)

def cap(a, b, line, kicker='', hold=False):
    assert len(line.replace('<em>', '').replace('</em>', '').split()) <= 9, line
    return {"type": "caption", "settings": {"from": a, "to": b, "line": line, "kicker": kicker, "hold": hold}}

def chap(a, b, label):
    return {"type": "chapter", "settings": {"from": a, "to": b, "label": label}}

def card(kind, a, b, **kw):
    s = {"kind": kind, "from": a, "to": b, "place": "right", "mplace": "bottom"}
    s.update(kw)
    if 'rows' in s and isinstance(s['rows'], list): s['rows'] = "\n".join(s['rows'])
    return {"type": "card", "settings": s}

def story(settings, items):
    b, o = blocks('b', items)
    return {"type": "story", "settings": settings, "blocks": b, "block_order": o}

J = lambda v: json.dumps(v, separators=(',', ':'))
DEMO = "Demo store · made-up brand"
ORD = "Illustrative orders, not real sales"
H = 60  # minutes per hour, for the clock keys

S = {}
# ---------------------------------------------------------------- story one: a cookie business
S["story_cookie"] = story({
    "anchor": "work", "label": "Story one: a cookie business grows inside one miniature room", "prefix": "ck", "frames": 263,
    "length": 1250, "eager": True, "h1": True,
    "poster_alt": "A miniature apartment on a dark plinth at sunset: a man sits on the sofa, head in his hands, beside a kitchen and a desk.",
    "loop_mp4": LOOP.get("ck_mp4", ""), "loop_webm": LOOP.get("ck_webm", ""),
    "eyebrow": "CHARGIX · Shopify website studio", "heading": "Every brand starts in a <em>small room.</em>",
    "text": "We design and build Shopify websites for new brands, from the first idea to the first order.",
    "btn_label": "See packages", "btn_link": "/#packages", "btn2_label": "Follow his story", "cue": "Scroll to play",
    "day": "Day 01", "time": "6:40 PM", "note": "Rendered film, played by your scroll. Brands and orders are made up.",
    "framing": J({"d": {"w": 0.64, "cx": 0.655, "cy": 0.5}, "m": {"w": 1.04, "cx": 0.5, "cy": 0.33}}), "hero_end": "0.03",
    "camera": J({
        "d": [[0, .475, .47, 1], [34, .475, .47, 1], [52, .42, .45, 1.16], [76, .42, .45, 1.16], [92, .52, .46, 1.04], [106, .6, .43, 1.18],
              [118, .6, .43, 1.18], [130, .475, .47, 1], [152, .49, .47, 1.02], [172, .5, .5, 1.12], [198, .5, .5, 1.12], [214, .475, .47, 1],
              [240, .475, .47, 1], [262, .43, .47, 1.12]],
        "m": [[0, .475, .47, 1.0], [34, .44, .46, 1.2], [52, .38, .44, 1.7], [76, .38, .44, 1.7], [92, .52, .45, 1.3], [106, .64, .42, 1.7],
              [118, .64, .42, 1.7], [130, .475, .47, 1.0], [152, .5, .45, 1.15], [172, .5, .5, 1.45], [198, .5, .5, 1.45], [214, .475, .47, 1.0],
              [240, .45, .47, 1.1], [262, .37, .46, 1.6]]}),
    "clock": J([[0, 18*H+40, "Day 01"], [60, 19*H+35, "Day 01"], [120, 23*H+50, "Day 01"], [124, 23*H+55, "Day 01"], [125, 24*H, "Day 02"],
                [134, 24*H+6*H+25, "Day 02"], [143, 24*H+7*H+5, "Day 02"], [170, 24*H+9*H+40, "Day 02"], [202, 24*H+12*H+30, "Day 02"],
                [203, 24*H+12*H+30, "Day 14"], [262, 24*H+18*H+45, "Day 14"]]),
}, [
    cap(4, 34, "He has the recipe. <em>Not the store.</em>", "Sweet & Co. · before it existed"),
    cap(38, 74, "One evening, one search, <em>one studio.</em>"),
    cap(80, 118, "He picks Essential and sends the brief."),
    cap(136, 168, "Morning. The kitchen becomes a bakery.", "Overnight"),
    cap(172, 200, "He bakes. <em>We build the store.</em>"),
    cap(205, 234, "Sweet & Co. is open.", "Launch day"),
    cap(238, 262, "And the first orders come in.", hold=True),
    chap(0, 40, "The idea"), chap(40, 80, "Finding CHARGIX"), chap(80, 122, "The brief"), chap(122, 136, "Overnight"),
    chap(136, 170, "Baking"), chap(170, 202, "The build"), chap(202, 236, "Launch"), chap(236, 262, "First orders"),
    card("phone", 40, 80, at="0.37,0.435", k_from=50, k_to=74, sub="7:22", url="chargix.store",
         title="Your brand, <em>open for business.</em>",
         rows=["essential-website|Essential|Clean site · about 10 days|hot",
               "3d-experience-website|3D Experience|Real 3D scene · 3 to 4 weeks|",
               "business-launch|Business Launch|3D + brand + socials · 4 to 5 weeks|"]),
    card("brief", 86, 124, at="0.66,0.40", k_from=92, k_to=118, url="chargix.store/pages/onboarding", title="Project brief · Sweet & Co.",
         rows=["Package|Essential Website", "Business|Home bakery, cookie boxes", "Pages|Home · Shop · About · Contact",
               "Look|Warm kraft, cream, handwritten", "Products|3 boxes to start"],
         sub="Order paid · Project form sent · Start date confirmed", label="Demo brief · made-up brand"),
    card("store", 205, 238, at="0.5,0.56", k_from=207, k_to=228, brand="Sweet & Co.", url="sweetandco.demo",
         title="Baked this morning.", sub="Small-batch cookies, boxed by hand.", image_asset="sw-hero.webp",
         rows=["The Classic Six|$18|sw-p1.webp", "Brown Butter Sea-Salt|$22|sw-p2.webp", "The Gift Box|$34|sw-p3.webp"], label=DEMO),
    card("orders", 238, 262, hold=True, at="0.34,0.46", k_from=240, k_to=258, brand="Sweet & Co.", title="New orders",
         rows=["Order #1001|Classic Six × 2|$36.00", "Order #1002|The Gift Box|$34.00", "Order #1003|Brown Butter, Classic Six|$40.00"],
         label=ORD),
])

# ---------------------------------------------------------------- story two: a clothing label
S["story_nova"] = story({
    "anchor": "nova", "label": "Story two: a clothing label in a different miniature room", "prefix": "nv", "frames": 237,
    "length": 1150, "eager": False, "h1": False,
    "poster_alt": "A miniature print studio at night: a woman sketches at a work table beside a heat press and rails of plain tees.",
    "loop_mp4": LOOP.get("nv_mp4", ""), "loop_webm": LOOP.get("nv_webm", ""),
    "eyebrow": "Story two · a clothing label", "heading": "Same box. <em>A different business.</em>",
    "text": "NOVA is a made-up label. Watch it go from late-night sketches to launch day.",
    "btn_label": "", "btn2_label": "Follow her story", "cue": "Keep scrolling",
    "day": "Day 01", "time": "10:40 PM", "note": "Rendered film, played by your scroll. Brands and orders are made up.",
    "framing": J({"d": {"w": 0.64, "cx": 0.655, "cy": 0.5}, "m": {"w": 1.04, "cx": 0.5, "cy": 0.33}}), "hero_end": "0.04",
    "camera": J({
        "d": [[0, .475, .47, 1], [6, .46, .45, 1.14], [28, .46, .45, 1.14], [44, .475, .47, 1], [60, .47, .46, 1.04], [76, .55, .4, 1.14],
              [112, .52, .44, 1.12], [124, .475, .47, 1], [150, .47, .48, 1.14], [176, .47, .48, 1.14], [190, .475, .47, 1], [214, .475, .47, 1],
              [236, .34, .44, 1.14]],
        "m": [[0, .475, .47, 1.0], [6, .45, .44, 1.65], [28, .45, .44, 1.65], [44, .475, .47, 1.1], [60, .46, .45, 1.4], [76, .56, .4, 1.6],
              [112, .5, .44, 1.55], [124, .475, .47, 1.05], [150, .47, .48, 1.5], [176, .47, .48, 1.5], [190, .475, .47, 1.0], [214, .45, .47, 1.1],
              [236, .3, .44, 1.55]]}),
    "clock": J([[0, 22*H+40, "Day 01"], [26, 23*H+30, "Day 01"], [29, 24*H, "Day 02"], [52, 24*H+7*H+10, "Day 02"], [60, 24*H+7*H+40, "Day 02"],
                [120, 24*H+11*H+20, "Day 02"], [121, 24*H+11*H+20, "Day 02"], [180, 24*H+16*H+10, "Day 02"],
                [181, 24*H+16*H+10, "Day 30"], [236, 24*H+19*H+20, "Day 30"]]),
}, [
    cap(4, 28, "She has the designs. <em>Not the brand.</em>", "NOVA · before it existed"),
    cap(31, 58, "She picks Business Launch: store, brand, socials."),
    cap(64, 90, "The blanks arrive.", "Morning"),
    cap(92, 120, "Transfer, heat, press. <em>Peel.</em>"),
    cap(126, 178, "She folds. <em>We build the launch.</em>"),
    cap(184, 214, "NOVA goes live, in English and Spanish.", "Launch day"),
    cap(218, 236, "And the first orders come in.", hold=True),
    chap(0, 30, "The design"), chap(30, 60, "The pick"), chap(60, 90, "Blanks"), chap(90, 121, "The press"),
    chap(121, 181, "Packing"), chap(181, 216, "Launch"), chap(216, 236, "First orders"),
    card("picks", 4, 30, at="0.47,0.42", k_from=8, k_to=26, title="Pick the first print", sub="3 prints · 2 colours · 1 drop",
         rows=["Orbit|nv-d1.webp|", "Pebble|nv-d2.webp|hot", "Line|nv-d3.webp|"]),
    card("brief", 32, 60, at="0.47,0.42", k_from=38, k_to=56, url="chargix.store/pages/onboarding", title="Project brief · NOVA",
         rows=["Package|Business Launch", "Store|Heavyweight tees, 1 drop", "Brand|Logo refresh + mini guide",
               "Socials|Instagram, Facebook, TikTok", "Languages|English + Spanish pages"],
         sub="Order paid · Project form sent · Start date confirmed", label="Demo brief · made-up brand"),
    card("store", 185, 218, at="0.5,0.52", k_from=187, k_to=208, brand="NOVA", url="nova.demo",
         title="Drop 01.", sub="Heavyweight tees, printed by hand. EN · ES", image_asset="nv-hero.webp",
         rows=["Pebble Tee, Bone|$38|nv-p1.webp", "Line Tee, Black|$38|nv-p2.webp", "The Mailer Set|$70|nv-p3.webp"], label=DEMO),
    card("orders", 218, 236, hold=True, at="0.22,0.43", k_from=220, k_to=234, brand="NOVA", title="New orders",
         rows=["Order #1001|Pebble Tee · M|$38.00", "Pedido #1002|Line Tee · L × 2|$76.00", "Order #1003|The Mailer Set|$70.00"],
         label=ORD),
])

# Package copy is v8's, verbatim (templates/index.json / tools/v8-index.py).
pb, po = blocks('p', [
  {"type": "package", "settings": {"product": "essential-website", "tier": "Tier 01", "price_note": "one-time",
    "for": "For freelancers, service providers and first-time founders.", "three_d": "none", "chips": "",
    "preview": "site", "asset": "pk-essential.webp", "mini_url": "sweetandco.demo", "mini_brand": "Sweet & Co.", "mini_heading": "Baked this morning.",
    "list": "*Up to 5 pages\nPremium theme customised to your brand\nUp to 10 products or services set up\nContact form, payments and shipping basics\nMobile optimisation and launch testing\n2 revision rounds, 14 days of fixes",
    "time": "About 10 business days", "demo_link": "/?view=essential-demo", "demo_label": "See a demo"}},
  {"type": "package", "settings": {"product": "3d-experience-website", "tier": "Tier 02", "pick": True, "pick_label": "Signature", "price_note": "one-time",
    "for": "Our signature package, for brands that need to stand out.", "three_d": "premium", "chips": "",
    "preview": "model", "asset": "pk-3d.webp", "glb": "pk-3d.glb", "model_alt": "A 3D gift box you can turn around",
    "list": "*1 real interactive 3D scene (WebGL)\n*Custom visual direction and motion design\nUp to 8 pages, 1 custom landing page\nUp to 20 products or services set up\nFull Shopify setup and branded emails\n3 revision rounds, 30 days of fixes",
    "time": "3 to 4 weeks", "demo_link": "/?view=3d-demo", "demo_label": "See a demo"}},
  {"type": "package", "settings": {"product": "business-launch", "tier": "Tier 03", "price_note": "one-time",
    "for": "Everything in 3D Experience, plus your store, brand and socials set up for you.", "three_d": "plus", "chips": "",
    "preview": "image", "asset": "pk-launch.webp", "mini_url": "nova.demo",
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

S["closing"] = {"type": "closing", "settings": {"asset": "ck-d-262.webp", "eyebrow": "Ready when you are", "heading": "Your business, <em>open for orders.</em>",
  "text": "Pick a package and pay online. We start as soon as your project form is in.",
  "label": "Start your project", "link": "/#packages", "label2": "Talk to us", "link2": "/pages/contact"}}

order = ["story_cookie", "story_nova", "packages", "studio", "process", "care", "faq", "closing"]
out = os.path.join(ROOT, 'templates', 'index.json')
with open(out, 'w') as fh:
    json.dump({"sections": S, "order": order}, fh, ensure_ascii=False, indent=2)
print("index.json written:", ", ".join(f"{k} {len(S[k]['blocks'])} blocks" for k in ("story_cookie", "story_nova")))
