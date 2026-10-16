# Writes theme-v8/templates/index.json. Film chapters come from chargix/theme-v8/story.json
# (written once the story is locked); the commercial sections are fixed here.
import json, os, sys
root = os.path.join(os.path.dirname(__file__), '..', 'theme-v8')
story_path = os.path.join(root, 'story.json')
story = json.load(open(story_path)) if os.path.exists(story_path) else {"settings": {}, "chapters": []}

def blocks(prefix, items):
    b = {f"{prefix}{i+1}": it for i, it in enumerate(items)}
    return b, list(b)

S = {}
fb, fo = blocks('ch', [{"type": "chapter", "settings": c} for c in story["chapters"]])
S["film"] = {"type": "film", "settings": story["settings"], "blocks": fb, "block_order": fo}

wb, wo = blocks('w', [
  {"type": "pillar", "settings": {"title": "Websites that sell", "text": "Shopify stores and service sites, designed for your brand, set up properly and tested on phones before launch."}},
  {"type": "pillar", "settings": {"title": "3D people remember", "text": "A real interactive 3D scene on your site: your product, space or idea, built for the browser with a light fallback for phones."}},
  {"type": "pillar", "settings": {"title": "Launches done for you", "text": "Products, logo refresh, social profiles, pixels and Spanish pages, set up end to end so you can start selling."}},
  {"type": "serve", "settings": {"title": "Who it is for", "items": "First-time founders, Bakers and food makers, Product brands, Service businesses, Shops moving to Shopify, Brands in the US and Mexico"}},
])
S["studio"] = {"type": "what-we-do", "settings": {"anchor": "studio", "index": "01", "eyebrow": "What CHARGIX does", "heading": "We build the website your business runs on.", "text": "CHARGIX is a small studio that designs, builds and launches Shopify websites. Three fixed prices, paid online, built in English or Spanish."}, "blocks": wb, "block_order": wo}

pb, po = blocks('p', [
  {"type": "package", "settings": {"product": "essential-website", "tag": "Demo storefront · no 3D", "for": "For freelancers, service providers and first-time founders.", "three_d": "none",
    "list": "*Up to 5 pages\nPremium theme customised to your brand\nUp to 10 products or services set up\nContact form, payments and shipping basics\nMobile optimisation and launch testing\n2 revision rounds, 14 days of fixes",
    "time": "About 10 business days", "view": "site", "mini_brand": "Sweet & Co.", "mini_heading": "Baked this morning.", "asset": "pk-essential.webp", "view_link": "/?view=essential-demo", "view_label": "See a demo storefront"}},
  {"type": "package", "settings": {"product": "3d-experience-website", "pick": True, "tag": "Still from a 3D scene", "for": "Our signature package, for brands that need to stand out.", "three_d": "premium",
    "list": "*1 real interactive 3D scene (WebGL)\n*Custom visual direction and motion design\nUp to 8 pages, 1 custom landing page\nUp to 20 products or services set up\nFull Shopify setup and branded emails\n3 revision rounds, 30 days of fixes",
    "time": "3 to 4 weeks", "view": "image", "asset": "pk-3d.webp", "view_link": "/?view=3d-demo", "view_label": "See a demo"}},
  {"type": "package", "settings": {"product": "business-launch", "tag": "Still from a 3D scene", "for": "Everything in 3D Experience, plus your store, brand and socials set up for you.", "three_d": "plus",
    "list": "*Everything in 3D Experience\n*Up to 40 products uploaded, descriptions written\n*Logo refresh and mini brand guide\nInstagram, Facebook and TikTok profiles set up\nMeta and TikTok pixels; 1 ad campaign drafted, not launched\nSpanish versions of key pages\nUp to 10 pages, 2 custom landing pages",
    "time": "4 to 5 weeks", "view": "image", "asset": "pk-launch.webp", "view_link": "/?view=launch-demo", "view_label": "See a demo"}},
])
S["packages"] = {"type": "packages", "settings": {"anchor": "packages", "index": "02", "eyebrow": "Packages", "heading": "Three fixed prices. Pick how far you want to go.",
  "text": "Every package is a complete website. The difference is how much we build for you: a clean site, a site with a real 3D scene, or the whole launch.",
  "note": "Prices in USD, paid once at checkout. Not included in any package: Shopify plan, domain, paid apps, photography or ad spend. No package guarantees sales or rankings. Demo storefronts use made-up brands."}, "blocks": pb, "block_order": po}

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
cb, co = blocks('r', [{"type": "row", "settings": {"label": l, "cells": c}} for l, c in rows])
S["compare"] = {"type": "compare", "settings": {"anchor": "compare", "index": "03", "eyebrow": "Side by side", "heading": "What changes between the three",
  "products": ["essential-website", "3d-experience-website", "business-launch"]}, "blocks": cb, "block_order": co}

sb, so = blocks('s', [
  {"type": "step", "settings": {"when": "Day 0", "title": "You pay at checkout", "text": "Secure Shopify checkout. Your order email arrives right away with a link to the project form."}},
  {"type": "step", "settings": {"when": "Day 0–1", "title": "You send the project form", "text": "About 10 minutes: your business, the look you want and a link to your logo and photos."}},
  {"type": "step", "settings": {"when": "Within 1 business day", "title": "We confirm your start date", "text": "Your timeline starts once the form and files are complete."}},
  {"type": "step", "settings": {"when": "Build", "title": "We design and build, you review", "text": "You see the work in progress and get the revision rounds your package includes."}},
  {"type": "step", "settings": {"when": "Launch", "title": "We launch and hand over", "text": "A recorded walkthrough (live calls on the bigger packages), then free fixes for 14 or 30 days."}},
])
S["process"] = {"type": "steps", "settings": {"anchor": "process", "index": "04", "eyebrow": "After you buy", "heading": "From checkout to launch in five steps.", "button": "Already bought? Send your project form", "link": "/pages/onboarding"}, "blocks": sb, "block_order": so}

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

S["closing"] = {"type": "closing", "settings": {"asset": story.get("closing_asset", ""), "eyebrow": "Ready when you are", "heading": "Your business, <em>open for orders.</em>",
  "text": "Pick a package and pay online. We start as soon as your project form is in.", "label": "See the packages", "link": "/#packages", "label2": "Ask a question", "link2": "/pages/contact"}}

order = ["film", "studio", "packages", "compare", "process", "care", "faq", "closing"]
json.dump({"sections": S, "order": order}, open(os.path.join(root, 'templates', 'index.json'), 'w'), ensure_ascii=False, indent=2)
print("index.json written,", len(story["chapters"]), "chapters")
