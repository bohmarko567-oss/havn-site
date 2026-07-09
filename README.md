# HAVN — storefront

E-commerce site for **HAVN**, a four-piece daily supplement ritual: **Rise** (focus) · **Calm** (balance) · **Rest** (sleep) · **Steady** (the earned N°04, free with the full ritual).

Static "Spectrum"-design front end (Archivo Expanded + Space Mono, per-SKU color coding, vanilla-JS motion system, working cart drawer with the $75 free-shipping + free-gift mechanic) **plus a real commerce backend**: Stripe Checkout, order webhooks, and a Supliful fulfillment pipeline. Fulfillment is white-label dropship via [Supliful](https://supliful.com) — print-ready label PDFs live in `Downloads/Havn-Labels/PRINT/`.

**▶ To take this live, follow [GO_LIVE.md](GO_LIVE.md) — the ordered runbook of owner-only steps.**

## How an order flows (A → Z)

```
customer on index.html → cart drawer → POST /api/checkout
  → server re-prices the cart from api/_catalog.js   (client is never trusted)
  → Stripe Checkout (collects address + phone, pays)
  → success.html (cart cleared, timeline)
  → Stripe fires /api/stripe-webhook (checkout.session.completed / invoice.paid renewals)
      → order logged + "🟠 ship it" picklist email to OWNER_EMAIL (Resend)
      → [optional] auto-created in headless Shopify → Supliful auto-fulfills (api/_shopify.js)
  → you (or the bridge) place the Supliful order → they bottle, label, ship
  → tracking → customer's door
```

With **no env vars set, `/api/checkout` runs in demo mode** (simulated success page) — the whole flow stays clickable without a Stripe account.

## Structure
```
havn-site/
├── index.html            # the storefront (inline CSS + JS)
├── success.html          # order confirmation (clears cart, demo banner)
├── policies.html · 404.html · sitemap.xml · robots.txt · b.html (parked prototype)
├── api/
│   ├── checkout.js       # cart → Stripe Checkout Session (or demo URL)
│   ├── stripe-webhook.js # payments → fulfillment records + owner emails
│   ├── subscribe.js      # waitlist/newsletter capture
│   ├── _catalog.js       # THE price authority + cart rules (shared, not routed)
│   ├── _email.js         # Resend helper + owner picklist template
│   └── _shopify.js       # optional headless-Shopify auto-fulfillment bridge
├── server.local.js       # local dev: static + /api on :8123 (no deps)
├── package.json          # stripe SDK (functions only — site itself is dependency-free)
├── .env.example          # every env var, documented
├── GO_LIVE.md            # ← the runbook
├── assets/ · fonts/      # official renders, OG images, self-hosted fonts
└── vercel.json           # cleanUrls + cache headers (zero-config functions)
```

## Pricing model (locked)

Single $36 / $31 sub · Trio $108 / **$92 sub** · Steady $18 / $15 sub, **free with the complete ritual** (repeats monthly on the trio sub) · free U.S. shipping ≥ $75, else $6.95 (subs under $75 carry a recurring $6.95 line). All enforced server-side in `api/_catalog.js`; change prices there + in `index.html`'s `PRODUCTS`.

## Run locally
```
npm run dev           # → http://localhost:8123  (demo checkout, no keys needed)
```
Add a `.env` (copy `.env.example`) with Stripe **test** keys to exercise real Checkout locally. Test the webhook with the Stripe CLI: `stripe listen --forward-to localhost:8123/api/stripe-webhook`.

## Deploy
**Vercel (the real store):** import the repo, add env vars from `.env.example`, deploy — static + `/api` just work. **GitHub Pages** (current mirror at bohmarko567-oss.github.io/havn-site) serves the static site only; its checkout button gracefully falls back to the waitlist modal, or set `HAVN_API_BASE` in `index.html` to the Vercel URL to give the mirror a live checkout.

## Notes
- Customer receipts = enable in Stripe → Settings → Emails. Subscriber self-service = enable the Stripe customer portal.
- Renewal shipments arrive as `invoice.paid` webhook emails — each one is a shipment to place (or the bridge places it).
- Supplement compliance: structure-function claims + FDA disclaimer only; policies.html is a draft — counsel review before scale.
