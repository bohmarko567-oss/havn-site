# HAVN — GO LIVE RUNBOOK

**Where things stand:** the store is built, live, and fully wired end-to-end — website → cart → Stripe checkout → order alert → Supliful shipment → customer's door. The code side is DONE and runs in demo mode today. What remains are the account/identity/money steps that only you can do. Follow this top-to-bottom; **total active time ≈ 2 hours**, spread over 2–3 days (waiting on label review + Stripe activation). Steps 0 and 2 are Denmark-specific — you register a CVR first because Stripe DK requires a business (sole trader is enough).

- Live site (static mirror): https://bohmarko567-oss.github.io/havn-site/
- Repo: https://github.com/bohmarko567-oss/havn-site
- Print labels: `Downloads/Havn-Labels/PRINT/` (4 PDFs, Supliful-compliant boxes)
- Ads/copy/launch kit: `Downloads/Havn-Labels/` (ADS, COPY, LAUNCH_CHECKLIST.md)

---

## PART 1 — The unavoidable steps (in this order)

### 0 · CVR — register the business FIRST (Denmark · free · ~15 min online)
You're in Denmark, so this moved from "later" to "first": **Stripe Denmark only accepts businesses — including sole proprietors (enkeltmandsvirksomhed) — not private persons** (their own [Denmark services agreement](https://stripe.com/legal/ssa/dk)). The good news: an enkeltmandsvirksomhed is the lightest form there is.
1. Go to https://virk.dk → "Start virksomhed" → log in with MitID → register **enkeltmandsvirksomhed**. Free, ~15 minutes, CVR number usually issued immediately.
2. Branch/industry code: e.g. 479112 (internet retail) works; describe it as online sale of dietary supplements.
3. **Moms (VAT):** registration is only mandatory above 50.000 kr revenue per 12 months — and your US sales are exports (0% moms) anyway. Ask Skattestyrelsen or a revisor when you get traction; keep every invoice (bogføringsloven).
4. This CVR is what you'll type into Stripe (step 2) and can later put on labels + policies.

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
Stripe is the right rails for this build even though it's invisible in Denmark: it's the payment *infrastructure* behind the checkouts you know, it does subscriptions natively (your $92/mo trio), and every event is automatable by code — which is exactly how the order pipeline works.
1. Sign up at https://dashboard.stripe.com/register → **Activate payments**: business type *Enkeltmandsvirksomhed*, your CVR from step 0, MitID-verified identity, and your bank for payouts.
2. Grab keys (Developers → API keys): `sk_live_…` — and the `sk_test_…` pair for rehearsal.
3. Settings → **Payment methods**: switch ON **Apple Pay, Google Pay, Link, Klarna, Cash App Pay**. Zero code changes — the checkout auto-shows what fits each customer, so your US buyers get Apple Pay/Link/Klarna. (Shop Pay specifically is Shopify-only; **Link is Stripe's equivalent** — one-click checkout for the millions of shoppers already saved with Stripe.)
4. Settings → **Emails**: turn ON "Successful payments" receipts (that's the customer's confirmation email — no extra code needed).
5. Settings → Public details: statement descriptor **HAVN** + your support email.
6. Settings → **Customer portal**: enable it, so subscribers can cancel/skip themselves via the link in their receipts.
7. Payouts land in DKK by default (~2% currency conversion on USD sales). Once volume is real: add a USD account (e.g. Wise Business) as a USD payout destination and skip the FX cut.
8. Bonus already wired: the site's **15%-popup starts minting real unique codes** (single-use, first order only, 30-day expiry) the moment your key is in Vercel — nothing to configure.

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

### 8 · Analytics — see the funnel & the drop-offs (~10 min, ~$9/mo)
The site already fires a full event stream (`page_view → add_to_cart → begin_checkout → purchase`, plus promo claims, fallbacks, and a server-side purchase event with revenue). It just needs a dashboard:
1. Create a site at https://plausible.io (EU-hosted, GDPR-clean, **no cookie banner needed** — a real conversion advantage vs GA4, which would force a consent popup). 30-day trial, then ~$9/mo.
2. Uncomment the one `<script … plausible.io …>` line in the `<head>` of `index.html` and `success.html`, set your domain in it.
3. Add `PLAUSIBLE_DOMAIN=your-domain` in Vercel env → redeploy.
4. In Plausible: mark `add_to_cart`, `begin_checkout`, `purchase` as Goals → build the funnel → you now see exactly where people drop off, with revenue attached. Abandoned checkouts additionally land in your inbox with a 30-day resume link.

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

## PART 3 — Unit economics (real numbers, repriced 2026-07-10)

Costs verified from Supliful's help center: **fulfillment fee $1.99 per product** (first unit; $1.29 repeats) + **weight-based USPS shipping** (≤0.5 lb $4.50 · 1–2 lb $9.00 — a trio box is 1–2 lb). No Alaska/Hawaii. Stripe = Danish account charging US cards incl. ~2% FX to DKK.

**Price ladder (v2, live):** single **$38 / $32 sub** · trio **$114 / $96 sub** (= 3×$32, "save 15%+" vs $114) · STEADY $18 / $15, **free with the full ritual** · one-time free shipping at **$79** (two bottles = $76 — still misses by $3, the third clears it) · **subscriptions from $30/mo always ship free** (kills the "$32 + $6.95 shipping" bad look; sub is always the better deal).

| Per order | Trio sub $96 | Trio once $114 | Single sub $32 | Single once $38+$6.95 | Steady solo sub $15+$6.95 |
|---|---|---|---|---|---|
| Wholesale | 32.88 | 32.88 | 6.99–11.65 | 6.99–11.65 | 5.35 |
| Fulfillment fees | 7.96 | 7.96 | 1.99 | 1.99 | 1.99 |
| Supliful shipping | 9.00 | 9.00 | 4.50 | 4.50 | 4.50 |
| Stripe + FX | ≈5.29 | ≈6.24 | ≈1.93 | ≈2.61 | ≈1.40 |
| **Your margin** | **≈$40.87 (43%)** | **≈$57.92 (51%)** | ≈$11.90–16.60 | ≈$24.20–28.90 | ≈$8.70 |

What this means: month-1 breakeven customer-acquisition cost on the trio sub is ≈$41; every retained month adds ≈$41. Singles are profitable feeders; STEADY solo is a low-margin entry ramp (by design — its job is pulling people toward the trio). Verify wholesale in your dashboard — Supliful reprices occasionally.

---

## PART 4 — Legal & compliance (owner's list — not legal advice)

- **Business form (DK):** start as **enkeltmandsvirksomhed** (step 0 — free, you're personally liable). Upgrade to an **ApS** (40.000 kr capital) for liability separation once revenue is real — supplements are a litigious category, don't stay personally liable forever. A revisor is worth the ~few hundred kr/month once money flows.
- **Danish tax:** business profit is taxed as personal income (B-skat — file a forskudsopgørelse update). Moms: only register above 50.000 kr/12mo, and US sales are exports (0-rated) — but registration lets you deduct Danish VAT on expenses. Keep records per bogføringsloven (5 years).
- **US sales tax:** as a foreign (Danish) seller you only owe US sales tax after crossing per-state *economic nexus* thresholds (typically $100k sales or 200 transactions **per state, per year**) — far away for now. When it matters, flip on **Stripe Tax** (Settings → Tax), set `STRIPE_TAX=1` in Vercel, and checkout collects it automatically — the code path is already in.
- **Label address:** labels currently carry Supliful's Arvada, CO address — their explicitly *temporary* option. Once you have the CVR (or a US virtual address), tell me and I'll regenerate the 4 label PDFs same-day. (US FDA labeling wants a name + place of business of the distributor; run the final wording past counsel.)
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
- Soft-launch idea: the waitlist emails collected pre-launch get the announcement email — unique 15% codes are minted automatically by `/api/subscribe` (no dashboard work needed), and the site popup hands them out on its own once Stripe is live.

---

## PART 7 — Honest audit: where you hit, where you're exposed

**Working for you:** a differentiated brand (nothing about the site reads template); an offer with real mechanics (completion → gift → retention lock); subscriptions as the core = recurring revenue; ~43% trio-sub margin with $0/mo fixed costs until sales; the whole ops loop automated except one 3-minute step; compliant labels already validated.

**Exposure, ranked by how much it matters:**
1. **Traffic is the missing organ.** The store converts; nothing sends people to it yet. Post-launch plan, in order: TikTok/Reels UGC-style content (bottle mockups + ADS/ assets exist), the waitlist email, then a small Meta test ($10–20/day). Kill-metric: trio-sub CAC must stay under ≈$41 (month-1 breakeven); every retained month is +$41.
2. **The reviews are placeholders.** Under the FTC's fake-review rule (2024), fabricated consumer reviews risk real fines once you market in the US. They're fine as design-preview copy, but **replace with real ones before paid traffic**: the guarantee makes asking easy, seed the first ten via friends/early customers, and a day-21 "how's the ritual?" review-request email is a planned automation.
3. **Renewal discipline.** Until the Shopify bridge is on, every subscription renewal is an email → 3-minute manual order. Missed renewals = angry subscribers. Make the order inbox a daily 5-minute habit, or flip on Part 5 at ~10 orders/week.
4. **Supliful is a single point of failure.** Stockouts, wholesale price changes, or SKU discontinuation hit you directly. Check wholesale monthly; keep one backup SKU per formula in mind.
5. **No customer database** — Stripe is the system of record. Completely fine below ~100 orders/mo; revisit when support queries need history at a glance.
6. **Deliverability**: customer-facing email (codes, tracking) needs the domain + Resend verification (steps 4/6) — before the launch blast, not after.
7. **Chargebacks/fraud**: supplements attract some; Stripe Radar handles the bulk. Always forward tracking numbers — they win disputes.
8. **AK/HI**: Supliful can't ship there. Policy excludes it and your order alerts flag it with a refund instruction (wired in).
9. **Legal residuals**: policies are strong drafts, not lawyer-reviewed; final label/distributor wording needs your CVR. Both are known, deliberate deferrals.

## Quick reference — what runs where

| Piece | Where | State |
|---|---|---|
| Storefront (static) | GitHub Pages + Vercel | LIVE |
| `/api/checkout` | Vercel function | built · demo until Stripe keys |
| `/api/stripe-webhook` | Vercel function | built · needs webhook secret |
| `/api/subscribe` | Vercel function | built · needs Resend key |
| Order fulfillment | You + Supliful manual orders | needs account + labels approved |
| Auto-fulfillment | `api/_shopify.js` bridge | pre-built · Part 5 |
| 15%-popup + unique codes | site + `/api/subscribe` | LIVE · demo codes until Stripe key |
| Funnel events + revenue | site `track()` + webhook → Plausible | built · needs step 8 account |
| Abandoned-cart alerts | `/api/stripe-webhook` (session.expired) | built · works when Stripe is live |
| Local dev | `npm run dev` → http://localhost:8123 | works (demo mode) |
