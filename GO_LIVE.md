# HAVN — GO LIVE RUNBOOK

**Where things stand:** the store is built, live, and fully wired end-to-end — website → cart → Stripe checkout → order alert → Supliful shipment → customer's door. The code side is DONE and runs in demo mode today. What remains are the account/identity/money steps that only you can do. Follow this top-to-bottom; **total active time ≈ 90 minutes**, spread over 2–3 days (waiting on label review + Stripe activation).

- Live site (static mirror): https://bohmarko567-oss.github.io/havn-site/
- Repo: https://github.com/bohmarko567-oss/havn-site
- Print labels: `Downloads/Havn-Labels/PRINT/` (4 PDFs, Supliful-compliant boxes)
- Ads/copy/launch kit: `Downloads/Havn-Labels/` (ADS, COPY, LAUNCH_CHECKLIST.md)

---

## PART 1 — The unavoidable steps (in this order)

### 1 · Supliful account + labels (~25 min + 1–2 business days review)
1. Sign up at https://supliful.com (free plan is enough for manual fulfillment).
2. Add the 4 products to **My Products** (catalog → "Start selling" on each):
   | HAVN name | Supliful product | SKU | Label PDF |
   |---|---|---|---|
   | Rise | Lion's Mane Mushroom | `RLC3LION` | `HAVN_RISE_RLC3LION_LionsMane_label.pdf` |
   | Calm | Ashwagandha Plus | `JTP4APLU` | `HAVN_CALM_JTP4APLU_Ashwagandha_label.pdf` |
   | Rest | Magnesium Glycinate | `VOX4MGNE` | `HAVN_REST_VOX4MGNE_Magnesium_label.pdf` |
   | Steady | Normal Blood Sugar Drops | `JTP0BLDR` | `HAVN_STEADY_JTP0BLDR_BloodSugarDrops_label.pdf` |
3. Upload each label PDF, submit for review (their compliance check: 1–2 business days). The PDFs already carry the required TrimBox/BleedBox/ArtBox and verbatim legal text — they validated against Supliful's checker before.
4. **Billing → add a payment card.** This is what pays wholesale + shipping per order.
5. Products can stay as drafts — drafts are orderable via manual orders.

### 2 · Stripe account (~20 min + activation wait, sometimes instant)
1. Sign up at https://dashboard.stripe.com/register → **Activate payments** (identity + your bank account for payouts).
   - You can start as an *individual/sole proprietor* — no LLC required to begin (see Part 4).
2. Grab keys (Developers → API keys): `sk_live_…` — and the `sk_test_…` pair for rehearsal.
3. Settings → **Emails**: turn ON "Successful payments" receipts (that's the customer's confirmation email — no extra code needed).
4. Settings → Public details: statement descriptor **HAVN** + your support email.
5. Settings → **Customer portal**: enable it, so subscribers can cancel/skip themselves via the link in their receipts.

### 3 · Vercel deploy — this flips checkout from demo to REAL (~15 min)
1. Sign up at https://vercel.com with your GitHub (bohmarko567-oss).
2. **Add New → Project → import `havn-site`.** Framework preset "Other", no build command — deploy as-is. (Zero config: it serves the static site + the `/api` functions automatically.)
3. Project → Settings → **Environment Variables**, add:
   | Var | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_test_…` first, later `sk_live_…` |
   | `STRIPE_WEBHOOK_SECRET` | from step 4 below |
   | `OWNER_EMAIL` | bohmarko567@gmail.com |
   | `RESEND_API_KEY` | from step 5 below |
   | `SITE_URL` | your Vercel URL, e.g. `https://havn-site.vercel.app` |
4. **Stripe webhook**: Stripe → Developers → Webhooks → Add endpoint → `https://YOUR-VERCEL-URL/api/stripe-webhook`, events: `checkout.session.completed` + `invoice.paid` → copy the signing secret `whsec_…` into the Vercel env var → **Redeploy**.
5. Note: Vercel's free Hobby tier technically excludes commercial use — it will work, but the by-the-book plan is Pro ($20/mo) once revenue flows. Netlify has the same posture. Fine to start on Hobby while testing.

### 4 · Resend — your order-alert inbox (~5 min)
1. Sign up at https://resend.com (free 100 emails/day) → create an API key → add to Vercel env → redeploy.
2. Without any domain setup, alerts deliver from `onboarding@resend.dev` **to your own email only** — exactly what the order alerts need. (Customer-facing email needs the domain from step 6 — later.)

### 5 · REHEARSAL, then go live (~15 min — do not skip)
1. With `sk_test_…` keys in Vercel: buy the Trio on your live site with test card `4242 4242 4242 4242` (any future date/CVC, any US zip, any phone).
2. Confirm: Stripe test dashboard shows the payment ✓ · your inbox gets the 🟠 ship-it email with address + SKU picklist ✓ · success page shows ✓.
3. Swap env to `sk_live_…` + live webhook secret → redeploy → **place one real order to yourself** (~$36 + you'll pay its wholesale in Supliful). This tests money, fulfillment, and the physical product in one shot — you'll hold your own bottle in a week.
4. When Supliful's tracking email arrives, forward it to the customer (you). That's the loop.

### 6 · Domain (~$25–35/yr for .co, ~20 min — recommended before ads)
1. **`havn.co` is AVAILABLE right now** (registry-checked 2026-07-09) — and it's the domain already printed on the site (`hello@havn.co`). **Buy it first, before anything else in this step** (Cloudflare/Namecheap/Porkbun). Checked backups, also available: `havnritual.com`, `takehavn.com`, `havnsupply.com`, `havndaily.com`. Taken: havn.com, gethavn.com, havn.shop, havn.health.
2. Vercel → Project → Settings → Domains → add it (they hand you the 2 DNS records).
3. Free email forwarding for `hello@your-domain` → your Gmail: Cloudflare Email Routing or ImprovMX.
4. Tell me when you have it — I'll sweep the repo (mailto links, og:url, canonical, JSON-LD, sitemap, this file), verify Resend domain records so alerts/customer emails send from `orders@your-domain`, and redeploy.

### 7 · Tell Stripe & the site the truth (~10 min, with me)
Once 1–6 are done, come back and say "go" — I'll: flip the GitHub Pages mirror to point at the live API (or retire it), update metas to the real domain, and re-run the full E2E against production.

---

## PART 2 — Per-order fulfillment loop (~3 min/order, until you automate)

Every paid order (and every monthly renewal) lands in your inbox as **"🟠 NEW HAVN ORDER — ship it"** with the exact picklist + address:

1. Open https://app.supliful.com/orders → **Order products** → *manual order*.
2. Add the SKUs from the email (a Trio = 1× RLC3LION + 1× JTP4APLU + 1× VOX4MGNE + 1× JTP0BLDR free gift).
3. Paste the customer's name/address/phone/email from the email.
4. Pay (your card on file — that's the wholesale cost).
5. Supliful prints your labels, bottles it, ships it, and emails tracking in 1–3 business days → forward tracking to the customer.

Backstop: even if an alert email ever fails, every order sits in **Stripe → Payments** with the full shipping address and cart summary in metadata. Check it daily at launch.

---

## PART 3 — Unit economics (sanity check, from locked pricing)

| | Trio sub $92/mo | Single sub $31 | Steady solo $18 |
|---|---|---|---|
| Wholesale (Rise 11.65 + Calm 6.99 + Rest 8.89 + Steady 5.35) | ≈ $32.88 | ≈ $6.99–11.65 | $5.35 |
| Supliful shipping (their charge to you, varies) | ≈ $6–8 | ≈ $5–6 | ≈ $5 |
| Stripe (2.9% + 30¢) | ≈ $2.97 | ≈ $1.20 | ≈ $0.82 |
| Customer paid shipping | $0 (free ≥$75) | +$6.95 | +$6.95 |
| **Margin** | **≈ $48–50** | ≈ $18–24 | ≈ $13 |

Verify real wholesale + shipping in your Supliful dashboard — these come from the July 7 research snapshot.

---

## PART 4 — Legal & compliance (owner's list — not legal advice)

- **Business form:** you can launch as a sole proprietor (Stripe supports individuals). An LLC (~$50–$500 by state, or Stripe Atlas $500) adds liability separation — worth doing once revenue is real. Supplements are a litigious category; don't stay unincorporated forever.
- **Label address:** labels currently carry Supliful's Arvada, CO address — their explicitly *temporary* option. When you register the business, tell me the address and I'll regenerate the 4 label PDFs same-day.
- **Sales tax:** you have nexus in your home state at minimum. When sales start, flip on **Stripe Tax** (Settings → Tax → add registration), then set `STRIPE_TAX=1` in Vercel and checkout collects it automatically — the code path is already in.
- **Claims discipline:** the site/labels use only structure-function claims + FDA disclaimer (DSHEA). Never say a product *treats/cures/prevents* anything — including in ads and social. FTC applies to marketing too.
- **Policies:** `policies.html` (privacy/terms/refunds/shipping) is a solid draft — have a lawyer review before serious ad spend.
- **Records:** download Certificates of Analysis from Supliful per batch and keep them.

---

## PART 5 — Full automation (when >10 orders/week — skip at launch)

The webhook already contains a ready **headless-Shopify bridge** (`api/_shopify.js`) using Supliful's officially supported custom-storefront path:

1. Shopify Basic (~$39/mo) + install the Supliful app + publish your 4 products from Supliful into it.
2. Supliful **Pro** plan ($49/mo) + Shopify Settings → Checkout → "Automatically fulfill the order's line items".
3. Shopify custom app (Settings → Apps → Develop apps) with `write_orders, write_customers, read_products` → Admin token.
4. Set 4 Vercel env vars (`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_VARIANT_MAP`, optional `SHOPIFY_API_VERSION`) — variant GIDs come from the Shopify products the Supliful app created.
5. Run ONE test order and check it auto-appears in Supliful. From then on: customer pays → order auto-fulfills → Supliful ships → zero touches. (~$88/mo total → worth it around 30+ orders/mo.)

Until then, the 3-minute manual loop in Part 2 does the same job for $0/mo.

---

## PART 6 — Launch week (assets already made)

- `Downloads/Havn-Labels/ADS/` — 5 square + 1 story ad, Instagram grid
- `Downloads/Havn-Labels/COPY/` — launch copy, announcement email, social calendar, SEO pillar article, Amazon listing pack
- `Downloads/Havn-Labels/LAUNCH_CHECKLIST.md` — the original checklist
- Soft-launch idea: the waitlist emails collected pre-launch (localStorage + `/api/subscribe` once Resend is on) get the announcement email with a WELCOME15 promo code (create it in Stripe → Products → Coupons; checkout already accepts promo codes).

---

## Quick reference — what runs where

| Piece | Where | State |
|---|---|---|
| Storefront (static) | GitHub Pages + Vercel | LIVE |
| `/api/checkout` | Vercel function | built · demo until Stripe keys |
| `/api/stripe-webhook` | Vercel function | built · needs webhook secret |
| `/api/subscribe` | Vercel function | built · needs Resend key |
| Order fulfillment | You + Supliful manual orders | needs account + labels approved |
| Auto-fulfillment | `api/_shopify.js` bridge | pre-built · Part 5 |
| Local dev | `npm run dev` → http://localhost:8123 | works (demo mode) |
