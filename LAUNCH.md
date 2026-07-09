# HAVN — Go-Live Runbook

Everything between "customer presses Buy" and "Supliful ships the box," in order.
The website code is already done: the Buy button calls Shopify's Storefront API and
redirects to Shopify checkout as soon as the `SHOPIFY` config block in `index.html`
is filled in (step 11). Until then it safely shows the waitlist modal.

**Architecture:** your site (static, on Vercel) is the storefront → Shopify is the
checkout/payments/subscriptions backend → the Supliful app on Shopify manufactures
and ships each order under the HAVN label. You never touch inventory.

**Monthly cost at launch:** Shopify Basic ~$39/mo (~$29/mo paid annually) + Google
Workspace ~$7/mo + domain ~$2–5/yr first year. Supliful charges per order (COGS).

---

## 1. Buy the domain — `havnritual.store`

- Buy at a registrar you like (Namecheap, Porkbun, Cloudflare Registrar — all fine;
  .store first-year promos are usually $1–5, renewal ~$20–25/yr).
- Nothing else yet — DNS gets pointed in step 10.

## 2. Create the Shopify store — **Basic plan**

- [shopify.com](https://www.shopify.com) → start trial → pick **Basic** (~$39/mo, or ~$29/mo billed yearly).
  Basic (not the $5 Starter) is required: Starter can't do subscription selling plans,
  and your whole offer is Subscribe & Save.
- Store currency **USD**; store address **14701 W. 65th Way, Suite 5, Arvada, CO 80004**
  (matches the site footer).
- The `xxx.myshopify.com` name is internal — customers only see it briefly at checkout.

## 3. Connect Supliful

- Shopify admin → Apps → install **Supliful: Dropship Supplements** → connect your
  Supliful account.
- Publish the 4 products from the Supliful catalog to Shopify:
  - **Rise** — Lion's Mane 1000mg → price **$36**
  - **Calm** — Ashwagandha+ KSM-66 → price **$36**
  - **Rest** — Magnesium Glycinate → price **$36**
  - **Steady** — Normal Blood Sugar Drops → price **$18**
- Confirm each product uses your uploaded HAVN label design and the SKUs match the
  printed labels.
- In Supliful, add a payment method (they charge you COGS per order automatically).

## 4. Enable the Storefront API (the "backend link" to your site)

- Shopify admin → Apps → add the **Headless** sales channel (free, by Shopify).
- Create a storefront inside it → copy the **public access token**
  (this is safe to embed in the website — it can only read products and create carts).
- **Publish all 4 products to the Headless channel** (Products → select → Publishing).
  Unpublished products will fail at checkout with "merchandise not found."

## 5. Subscriptions — Shopify Subscriptions app

- Install **Shopify Subscriptions** (free, by Shopify).
- Create ONE plan group: **"Subscribe & Save — Monthly"**, delivery every 30 days,
  applied to all 4 products.
- Set **fixed prices** per product (NOT "percentage off" — 15% off $36 would give
  $30.60 and mismatch the site): Rise **$31** · Calm **$31** · Rest **$31** · Steady **$15**.
- Note: the site advertises the subscribed trio at **$93/mo** (3 × $31) — already consistent.

## 6. Discounts — the free Steady gift

- Discounts → Create → **Buy X Get Y**, type **Automatic** (no code):
  - Customer buys: **minimum 3 items** from products [Rise, Calm, Rest]
  - Customer gets: **1 × Steady at 100% off**
- Known loophole: 3 × Rise alone also earns the gift. Accept at launch (it's a $40+
  order either way); a Shopify Functions app can enforce one-of-each later.
- **⚠ Renewal check (do this in step 12):** place a test subscription and preview its
  next billing cycle — confirm Steady stays $0 on renewal. Automatic discounts don't
  always carry into subscription renewal orders. If it doesn't stick, the fallback is
  a dedicated $0-price "Steady — Ritual Gift" variant with its own selling plan
  (then verify Supliful still fulfills that SKU).

## 7. Shipping

- Settings → Markets: sell to **United States only** (site + policies promise US-only).
- Settings → Shipping: one profile, two rates:
  - Flat rate for orders **under $75** — pick a rate at or above what Supliful charges
    you per shipment (check your Supliful dashboard; e.g. $5.95).
  - **Free shipping** rate with condition "minimum order amount $75."

## 8. Checkout & payments

- Settings → Payments → activate **Shopify Payments** (needs your business details,
  EIN or SSN for sole prop, and bank account for payouts).
- Settings → Customer accounts → turn ON (new/passwordless accounts) — subscribers
  must be able to self-serve skip/cancel (FTC click-to-cancel).
- Settings → Policies → paste the four policies from `policies.html`
  (Refunds, Privacy, Terms, Shipping) so they're linked in the checkout footer.
- Settings → General → sender/support email: `hello@havnritual.store` (after step 9).
- Turn OFF tipping if it's on.

## 9. Email — Google Workspace

- [workspace.google.com](https://workspace.google.com) → Business Starter (~$7/mo) →
  sign up with `havnritual.store`.
- Verify domain ownership (TXT record at your registrar), add the **MX records**
  Google gives you.
- Create the mailbox **hello@havnritual.store**.
- Add it to Shopify as the sender email and approve the SPF/DKIM DNS records Shopify
  asks for (Settings → Notifications) so order emails don't land in spam.

## 10. Deploy the site + DNS

- Vercel: import the repo (it's zero-build; `vercel.json` already set) → add custom
  domain `havnritual.store` + `www.havnritual.store` → Vercel shows you the A/CNAME
  records to add at your registrar.
- Checkout will live on your `.myshopify.com` domain at launch — that's normal and
  trusted (padlock + Shopify branding). Optional later polish: connect
  `shop.havnritual.store` to Shopify as its primary domain for a branded checkout URL.

## 11. Paste the 10 values into `index.html`

Fill the `SHOPIFY` block (search for `const SHOPIFY` in `index.html`):

- `domain`: your `xxx.myshopify.com`
- `token`: the Headless public access token (step 4)
- `variants`: the 4 **variant** GIDs — Admin → Products → click the variant → the ID
  is in the URL; format `gid://shopify/ProductVariant/1234567890`
- `sellingPlans`: the 4 selling-plan GIDs — easiest via one Storefront API call:

```bash
curl -s https://YOUR-STORE.myshopify.com/api/2025-07/graphql.json \
  -H 'Content-Type: application/json' \
  -H 'X-Shopify-Storefront-Access-Token: YOUR_TOKEN' \
  -d '{"query":"{products(first:10){nodes{title variants(first:1){nodes{id}} sellingPlanGroups(first:2){nodes{sellingPlans(first:2){nodes{id name}}}}}}}"}'
```

That one command returns every product's variant GID **and** selling-plan GID.
Commit, push, deploy.

## 12. Smoke tests (before announcing anything)

Test payments first with **Bogus Gateway** (Settings → Payments → test mode), then
one real card order that you refund.

- [ ] Single product, Subscribe mode → Shopify checkout shows $31/mo subscription.
- [ ] Single product, One-time mode → shows $36, no subscription.
- [ ] Complete ritual → checkout shows Rise+Calm+Rest + Steady **$0**, total $93/mo
      (or $108 one-time), **free shipping** applied.
- [ ] Cart at $36 (under $75) → flat shipping rate appears.
- [ ] Paid Steady + complete ritual → 2 Steady units, exactly one free.
- [ ] Real order → appears in Supliful dashboard and gets fulfilled; tracking email arrives.
- [ ] Subscription order → log into customer account → skip/cancel works self-serve.
- [ ] **Renewal preview keeps Steady at $0** (see step 6 fallback if not).
- [ ] Temporarily blank the `SHOPIFY.domain` → Buy button falls back to waitlist modal.
- [ ] `policies.html` links from footer, 404 page, OG preview (opengraph.xyz), mobile pass.

## 13. Post-launch

- Google Search Console: verify domain, submit `sitemap.xml`.
- Decide fate of `b.html` (design prototype, noindex — delete or keep).
- The waitlist/newsletter forms only store emails in the visitor's own browser
  (localStorage) — wire them to a real list (Shopify Email, Mailchimp, or a form
  service) when marketing starts.
- Keep an eye on the first Supliful orders' margins: product COGS + their shipping
  vs. your $36/$31 pricing and your flat rate.
