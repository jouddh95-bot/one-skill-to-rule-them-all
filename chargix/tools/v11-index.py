# Writes chargix/theme-v11/templates/index.json (CHARGIX v11, "From the ground up").
# The home page opens on sections/grow.liquid: a live WebGL desert (assets/cx-grow.js) where a seed grows into a
# tree and a store is built around it. Chapters, package cards and the care card are keyed to the scroll (0-1).
# Package, process, care and FAQ sections below it keep the v10 copy, updated to sam's 2026-11-04 brief.
# Prices are never typed here: every card reads them from the Shopify products.
# Run:  python3 chargix/tools/v11-index.py
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'theme-v11')

def blocks(prefix, items):
    b = {f"{prefix}{i+1}": it for i, it in enumerate(items)}
    return b, list(b)

def ch(a, b, heading, kicker='', text='', items=(), style='ticks', hold=False, btn=None, btn2=None):
    s = {"from": f"{a}", "to": f"{b}", "hold": hold, "kicker": kicker, "heading": heading, "text": text,
         "list": "\n".join(items), "list_style": style}
    if btn: s.update(btn_label=btn[0], btn_link=btn[1])
    if btn2: s.update(btn2_label=btn2[0], btn2_link=btn2[1])
    return {"type": "chapter", "settings": s}

def pk(a, b, product, kicker, items, time, **kw):
    s = {"from": f"{a}", "to": f"{b}", "product": product, "kicker": kicker, "list": "\n".join(items), "time": time,
         "price_note": "one-time", "buy_label": "Buy now", "more_label": "Everything included", "more_link": "/#packages"}
    s.update(kw)
    return {"type": "package", "settings": s}

def bar(a, b, label):
    return {"type": "bar", "settings": {"from": f"{a}", "to": f"{b}", "label": label}}

def still(a, b, name):
    return {"type": "still", "settings": {"from": f"{a}", "to": f"{b}", "desktop": f"grow-d-{name}.webp", "mobile": f"grow-m-{name}.webp"}}

S = {}
gb, go = blocks('g', [
    ch(0.05, 0.115, "Every big brand was once <em>a small idea.</em>", "01 · The idea",
       "A product, a plan and a lot of empty space. That is where most brands start, and it is where we start with you."),
    pk(0.122, 0.225, "essential-website", "02 · Plant the seed",
       ["Up to 5 pages", "Premium theme customised to your brand", "Up to 10 products or services set up",
        "Contact form, payments and shipping basics", "Mobile optimisation and launch testing", "2 revision rounds, 14 days of fixes"],
       "About 10 business days", tagline="A clean, professional start.",
       **{"for": "For freelancers, service providers and first-time founders."}),
    ch(0.235, 0.33, "Strong roots <em>before anything grows.</em>", "03 · Roots",
       "Every CHARGIX store is built on Shopify and set up properly from day one, so it is ready to sell the moment it opens.",
       ["Shopify set up end to end", "Secure checkout, payments and shipping", "Fast pages, designed for phones first", "Tested on real devices before launch"]),
    pk(0.34, 0.455, "3d-experience-website", "04 · Stand out",
       ["1 real interactive 3D scene (WebGL), like this one", "Custom visual direction and motion design", "Up to 8 pages + 1 custom landing page",
        "Up to 20 products or services set up", "Full Shopify setup and branded emails", "3 revision rounds, 30 days of fixes"],
       "3 to 4 weeks", pick=True, pick_label="Signature", tagline="A site people remember.",
       **{"for": "For brands that need to stand out. The desert you are scrolling is live 3D, rendered in your browser."}),
    ch(0.465, 0.585, "We build the store <em>around your idea.</em>", "05 · The build",
       "A clear process with fixed prices. You always know what happens next.",
       ["Day 0 | You pay at a secure Shopify checkout", "Day 0–1 | You send the project form, about 10 minutes",
        "Within 1 business day | We confirm your start date", "Build | We design and build, you review each round",
        "Launch | We launch, hand over and fix anything for free"], style="steps"),
    pk(0.595, 0.705, "business-launch", "06 · Bloom",
       ["Everything in 3D Experience", "Up to 40 products uploaded, descriptions written", "Logo refresh and mini brand guide",
        "Instagram, Facebook and TikTok profiles set up", "Meta and TikTok pixels + 1 ad campaign drafted (not launched)",
        "Spanish versions of key pages", "Up to 10 pages, 2 custom landing pages"],
       "About 4 to 5 weeks", tagline="Complete brand domination.",
       **{"for": "Your store, brand and socials, launched together."}),
    ch(0.715, 0.795, "Websites, 3D and launches, <em>under one roof.</em>", "07 · What we do",
       "CHARGIX is a small studio that designs, builds and launches Shopify websites, in English or Spanish.",
       ["Websites that sell | Shopify stores and service sites, built for your brand",
        "3D people remember | A real interactive scene, with a light fallback for phones",
        "Launches done for you | Products, brand, socials, pixels and Spanish pages"]),
    {"type": "care", "settings": {"from": "0.805", "to": "0.885", "product": "care-plan", "kicker": "08 · Open all night",
        "heading": "Keep it growing <em>after launch.</em>",
        "text": "Optional monthly care. Shopify handles hosting and security; we do the human checks and the edits.",
        "name_1": "Care Plan", "name_2": "Care Plus", "name_3": "Premium Care",
        "desc_1": "Monthly health check, 30 minutes of edits", "desc_2": "Twice-monthly checks, 2 hours of edits",
        "desc_3": "Weekly checks, 3D checks, 4 hours of edits", "btn_label": "Compare care plans", "btn_link": "/#care"}},
    ch(0.9, 1, "Imagine what we could <em>grow for you.</em>", "09 · Your turn",
       "Pick a package and pay online. We start as soon as your project form is in.", hold=True,
       btn=("Start your project", "/#packages"), btn2=("Talk to us", "/pages/contact")),
    bar(0, 0.12, "Idea"), bar(0.12, 0.23, "Seed"), bar(0.23, 0.335, "Roots"), bar(0.335, 0.46, "Grow"), bar(0.46, 0.59, "Build"),
    bar(0.59, 0.71, "Bloom"), bar(0.71, 0.8, "Dusk"), bar(0.8, 0.89, "Care"), bar(0.89, 1, "Open"),
    still(0, 0.12, "0"), still(0.12, 0.3, "1"), still(0.3, 0.46, "2"), still(0.46, 0.66, "3"), still(0.66, 0.84, "4"), still(0.84, 1.01, "5"),
])
S["grow"] = {"type": "grow", "settings": {
    "anchor": "work", "label": "From the ground up: a seed in the desert grows into a tree and a store", "length": 1400,
    "poster_d": "grow-d-0.webp", "poster_m": "grow-m-0.webp",
    "eyebrow": "CHARGIX · Shopify website studio", "heading": "Every great store <em>starts as a seed.</em>",
    "text": "We design and build Shopify stores that are made to sell, from the ground up.",
    "btn_label": "See packages", "btn_link": "/#packages", "btn2_label": "Watch it grow", "cue": "Scroll to grow",
    "note": "Live 3D, rendered in your browser as you scroll"}, "blocks": gb, "block_order": go}

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
    "for": "Complete brand domination: everything in 3D Experience, plus your store, brand and socials set up for you.", "three_d": "plus", "chips": "",
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
  "name_1": "Care Plan", "name_2": "Care Plus", "name_3": "Premium Care",
  "desc_1": "Monthly health check, 30 minutes of edits, reply within 3 business days",
  "desc_2": "Twice-monthly checks, 2 hours of edits, reply within 1 business day",
  "desc_3": "Weekly checks, 3D checks on every device, 4 hours of edits, same-day reply",
  "fine": "Extra work is always quoted first, at $65/hour."}}

qs = [
  ("Is the 3D in the $1,650 package real 3D?", "<p>Yes. 3D Experience and Business Launch include one real, interactive 3D scene built with WebGL, with a lighter fallback for phones. The desert at the top of this page is the same kind of work: real-time 3D, rendered live in your browser as you scroll.</p>"),
  ("Does the $750 package include 3D?", "<p>No. Essential is a clean, fast, professional website with no 3D. If you want 3D, choose 3D Experience or Business Launch.</p>"),
  ("What do you need from me?", "<p>After checkout you fill in a short project form and share your logo, photos and product information. Your timeline starts once those are in.</p>"),
  ("What is not included?", "<p>Your Shopify plan, domain, paid apps, photography and ad spend. We never guarantee sales, rankings or ad results.</p>"),
  ("Do you need my Shopify password?", "<p>No. We use Shopify collaborator access, which you approve and can remove at any time.</p>"),
  ("Do you work in Spanish?", "<p>Yes, we work in English or Spanish. Business Launch also includes Spanish versions of your key pages.</p>"),
  ("Can I get a refund?", "<p>See our <a href=\"/policies/refund-policy\">refund policy</a> for exactly when and how refunds work.</p>"),
]
qb, qo = blocks('q', [{"type": "q", "settings": {"q": q, "a": a}} for q, a in qs])
S["faq"] = {"type": "faq", "settings": {"anchor": "faq", "index": "06", "eyebrow": "Questions", "heading": "Before you buy"}, "blocks": qb, "block_order": qo}

S["closing"] = {"type": "closing", "settings": {"asset": "grow-d-5.webp", "eyebrow": "Ready when you are", "heading": "Your business, <em>open for orders.</em>",
  "text": "Pick a package and pay online. We start as soon as your project form is in.",
  "label": "Start your project", "link": "/#packages", "label2": "Talk to us", "link2": "/pages/contact"}}

order = ["grow", "packages", "studio", "process", "care", "faq", "closing"]
out = os.path.join(ROOT, 'templates', 'index.json')
with open(out, 'w') as fh:
    json.dump({"sections": S, "order": order}, fh, ensure_ascii=False, indent=2)
txt = open(out).read()
assert '{{' not in txt and '}}' not in txt, 'template values must not contain double braces'
print("index.json written:", len(S["grow"]["blocks"]), "grow blocks")
