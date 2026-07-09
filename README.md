# HAVN — landing site

Marketing / commerce landing page for **HAVN**, a three-part daily supplement ritual: **Rise** (focus) · **Calm** (balance) · **Rest** (sleep).

Static, dependency-free. Bold "Spectrum" design system (Archivo Expanded + Space Mono, per-SKU color coding), official Supliful product photography, and a vanilla-JS motion system: staggered hero cards, marquee ribbon, scroll reveals, count-up stats, facts lightbox, hover image swaps. Working cart drawer with the free-shipping ($75) + free-gift progress mechanic and a Subscribe/One-time price toggle.

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

Production domain: **havnritual.store** (set in canonical/OG/JSON-LD meta, `sitemap.xml`, `robots.txt`).

## Wire up checkout (go live)
Checkout is **Shopify headless**: this static site stays the storefront, Shopify provides checkout/payments/subscriptions, and the **Supliful app** on the Shopify store auto-fulfills every order.

- `index.html` has a `SHOPIFY` config block (near the top of the script, after `FREE_SHIP`). While its values are empty, the Buy button falls back to the pre-launch waitlist modal — the site is safe to deploy at any time.
- When the Shopify store is set up, paste in the store domain, the public Storefront API token, 4 variant GIDs, and 4 selling-plan GIDs. `checkout()` then creates a Shopify cart via the Storefront API (`cartCreate`) and redirects to the returned `checkoutUrl`.
- The **complete step-by-step go-live runbook is in [`LAUNCH.md`](LAUNCH.md)** — Shopify plan, Supliful connect, subscriptions, discounts, shipping, domain, email, deploy, and smoke tests.

Offer architecture: single $36 / $31 sub · Trio $108 / $93 sub (3 × the single price) · free U.S. shipping at $75 · Steady (N°04) free with the complete ritual, via a Shopify automatic Buy-X-Get-Y discount.

## Notes
- Fonts are self-hosted in `/fonts` (SIL OFL / Fontshare) — no external requests, works offline.
- Barcodes on the print labels are placeholders; add the real UPC/EAN before printing.
- Product labels (print-ready PDFs) live in `Downloads/Havn-Labels/PRINT/`.
