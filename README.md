# HAVN

The four-formula Ritual: Rise (Lion's Mane), Calm (Ashwagandha Plus), Rest
(Magnesium Glycinate), and Steady (botanical drops). All four are included in
every Ritual delivery.

## Storefront rules

- USD pricing authority: `api/_catalog.js`.
- Free standard delivery at a $50.00 pre-discount product subtotal per delivery;
  standard delivery is $6.95 below $50.00.
- Shipping is limited to the contiguous United States. California checkout is
  paused pending label review, Louisiana pending registration-responsibility
  resolution, and Steady/the Ritual are unavailable to New York.
- Product facts were reconciled against the local Supliful audit records dated
  2026-07-15. No live Supliful refresh was used for this release.

## Runtime and release state

The site is a static storefront plus serverless Stripe endpoints in `api/`.
GitHub Pages serves the static files only; it cannot execute those endpoints.
Checkout therefore requires a separately deployed Vercel runtime (or moving the
whole site to Vercel) and an end-to-end test against that public runtime.
Set the `havn-api-base` meta value in `next.html` to the absolute serverless
origin for a split deployment, or to `same-origin` when the page and API share
one deployment. An empty value deliberately disables checkout outside localhost.

Production checkout fails closed until its Stripe, webhook, tax, email, label,
claims, business-identity, adverse-event-contact, inventory-availability,
guarantee-operations, abuse-controls, and cancellation-operations release gates are explicitly
confirmed. Product media
uses the original HAVN product mockups; final label and claim release status
remains an explicit production gate. Local development uses a clearly marked
demo checkout and does not create a charge.

```sh
npm install
npm run dev   # http://localhost:8123
npm test
```

© HAVN. All rights reserved. Site code and assets are not licensed for reuse.
