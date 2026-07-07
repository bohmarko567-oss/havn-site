# HAVN — landing site

Marketing / commerce landing page for **HAVN**, a three-part daily supplement ritual: **Rise** (focus) · **Calm** (balance) · **Rest** (sleep).

Static, dependency-free. Bold "Spectrum" design system (Archivo Expanded + Space Mono, per-SKU color coding), official Supliful product photography, and a vanilla-JS motion system: staggered hero cards, marquee ribbon, scroll reveals, count-up stats, facts lightbox, hover image swaps. Working cart drawer with the free-shipping ($79) + free-gift progress mechanic and a Subscribe/One-time price toggle.

## Structure
```
havn-site/
├── index.html              # the whole site (inline CSS + JS)
├── policies.html · 404.html · sitemap.xml · robots.txt
├── assets/
│   ├── og_official.jpg     # social share image (1200×630, official render)
│   ├── favicon.png / apple-touch-icon.png
│   └── products/           # official Supliful renders: {sku}_front/duo/stack.jpg,
│                           # facts_{sku}.png, trio_official.jpg, capsules.jpg
└── fonts/                  # Archivo, Hanken Grotesk, Space Grotesk/Mono (self-hosted)
```

## Run locally
Just open `index.html` in a browser, or serve the folder:
```
npx serve havn-site      # or: python -m http.server 8080
```

## Deploy (static — no build step)
- **Vercel:** `vercel --prod` from this folder (config in `vercel.json`), or drag-drop in the dashboard.
- **Netlify:** drag the folder into the Netlify dashboard, or `netlify deploy --prod` (config in `netlify.toml`).
- **Cloudflare Pages / GitHub Pages:** point at this folder as the publish/root directory.

Set the real domain in the OG/`og:url` meta and the JSON-LD `url` fields once you have it.

## Wire up checkout (go live)
The cart is a front-end demo. To take payments, pick one:

1. **Stripe Payment Links (fastest, no backend).** Create a Payment Link per product + the Trio in the Stripe dashboard, then point the buy buttons at them. In `index.html`, replace the body of `checkout()` (and/or the `addItem`/`addTrio` buttons) with `window.location = '<payment-link-url>'`. Add product/price IDs to the `PRODUCTS` array.
2. **Stripe Checkout Session (recommended for a real cart).** Add a tiny serverless function (Vercel/Netlify Functions) that creates a Checkout Session from the cart and returns its URL; `checkout()` redirects there. Enables subscriptions (Subscribe & Save 15%) and the trio bundle.
3. **Supliful native storefront / Shopify.** If selling through Supliful's connected store, link buttons to those product URLs instead.

Subscriptions map to the offer architecture: single $36 / $31 sub · Trio $108 / $92 sub · free shipping $79 · free gift with Trio.

## Notes
- Fonts are self-hosted in `/fonts` (SIL OFL / Fontshare) — no external requests, works offline.
- Barcodes on the print labels are placeholders; add the real UPC/EAN before printing.
- Product labels (print-ready PDFs) live in `Downloads/Havn-Labels/PRINT/`.
