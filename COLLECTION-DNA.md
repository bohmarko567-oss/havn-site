# HAVN COLLECTION DNA — the one-prompt generator

Fill the [SLOTS], paste the whole prompt into a fresh Claude Code session started from
`C:\Users\bohma\code ux rep`. Everything else is law, not suggestion.

---

## THE PROMPT

Build a new HAVN collection landing page: **[COLLECTION NAME]** — [one-line concept,
e.g. "the training stack: fuel, output, repair"].

### Products (4 pieces — the structure is fixed)

| Slot | Name | Supliful product | Role in the arc | Field color | Time glyph |
|---|---|---|---|---|---|
| N°01 | [NAME] | [supliful-slug] | [arc start] | [#hex] | [glyph] |
| N°02 | [NAME] | [supliful-slug] | [arc middle] | [#hex] | [glyph] |
| N°03 | [NAME] | [supliful-slug] | [arc end] | [#hex] | [glyph] |
| N°04 | [NAME] | [supliful-slug] | fourth member — ships every delivery, never removed | [#hex] | [glyph] |

N°01–N°03 must read as a NARRATIVE ARC the film can tell (HAVN v1 = morning→night,
warm→cool); N°04 anchors it as the fourth full member, not an afterthought. Pick an
arc, then colors that travel it. Derive deep + tint per SKU (deep ≈ field darkened
~35%, tint ≈ field at ~12% over cream).

### Identity layer (swap) vs engine (keep)

**KEEP — clone `havn-site/next.html` as the skeleton.** The scroll-film engine is paid
for: sticky stage `height:100lvh` in a vh runway (1050 mobile / 1600 desktop, input-gated
`(hover:hover) and (pointer:fine)`), kf() keyframes + frame-rate-independent lerp
(`1-Math.exp(-dt/150)` desktop, `*0.16` mobile), WARP pacing table, `?p=0.X` pin tool,
two-stage finale, per-breakpoint geometry fns (STACK/SLOTS/ROW/APEX with m/t/d branches),
plan-picker state machine, cart drawer, checkout API. Do not rebuild any of it.

**SWAP — the identity layer only:** field colors + tints + glyphs + numerals, product
cutouts (rembg isnet-general-use + interior-fill; matte from single-bottle renders, NEVER
duo-spill; repair cutouts, never re-cut), copy (each solo scene sells the SKU's dose +
moment), scene arc order/field-color stops, ribbon words, FAQ items, catalog entries.

### SPECTRUM base tokens (locked — never change)

Cream `#F6EFE1` (film site) base, ink `#1E1913`. Display: Archivo wght 900 wdth 118–125.
Body: Hanken Grotesk. Spec/labels: Space Mono. Signature elements per SKU: huge expanded
wordmark, ghost outlined N° numeral, Space Mono spec lines, time glyph, ritual band
marquee. NO Poppins/Montserrat, no AI-default looks.

### Pricing invariant (the founder's law — verified to the cent before ship)

Per-month prices are INTEGERS. The complete ritual is priced BELOW the four bought
loose ON EVERY TIER — HAVN v1: $99/mo vs $108/mo loose — so completing the set earns
a real discount ($9/mo at every tier). Cart collapse is FOUR singles → ritual and is
deliberately a DISCOUNT, not price-neutral; the old "ritual = 3× single" collapse-
neutral invariant is retired. Tier discounts monotone, motivating toward long supply,
and the per-month saving vs loose must never shrink as supply lengthens. Badges
UNDERSTATE (never round a discount up). Anchor = one-time price = exactly what the
pieces cost separately; sub tiers strike it. Fourth SKU: purchasable solo at a lower
price point, and a full-price member of the complete ritual — never auto-free, never
removed after delivery 1. Server `_catalog.js` and client tables must
match to the cent — verify with node before push. Free-ship thresholds must never make
a bigger order pay more shipping than a smaller one (check every tier arithmetic).

### Founder taste laws (each cost a review cycle — obey up front)

1. One smooth movement per element; exits continue the same rotation; no
   overshoot-and-return, no direction flips.
2. Transitions hand off — no hard scene cuts; field color floods DURING moves,
   zero blank frames; product visible from first pixel.
3. Solos hold at ±5–8°, never fully straight. Finales HOLD; endings get closure,
   not fade-outs. Nothing arrives from nowhere — the closing shot only shows what
   was on stage all along.
4. Sticker component language: 2px ink border, hard offset shadow (`0 4px 0`),
   uppercase CTAs, `:active` press-down. Carets are DRAWN CSS chevrons (7px border
   box, rotate 180° on open) — never glyphs.
5. No control takes its own line — marry it in (split-pill add buttons). No green
   success states — in-cart stays ink. No redundant X when outside-tap closes.
   Discount badge on every plan row incl. base.
6. NEVER hide copy on phones — shrink/air the type instead (≤560px scale).
7. Popups: passive invitation only, zero interruption, never autofocus an input on
   mobile modal-open.
8. One global plan state; every surface (hero bar, finale menu, drawer, per-SKU
   cards) re-renders from a single update() — prices can never disagree on screen.

### Hard-won engineering laws (violate = repeat a debugging day)

- iOS scrollytelling: stage `100lvh`, choreography in vh, ONE height basis. Never dvh.
- Context-restyled components must OUT-SPECIFY, never rely on rule order (cascade
  bit three times).
- Zero layout reads inside frame loops — cache on resize.
- Every film scene needs per-breakpoint geometry (m/t/d); px text WILL collide with
  vh mockups on some viewport unless staged apart in time or given per-BP numbers.
- Later DOM siblings paint over dropdowns — z-index the menus.
- Pointer-events gate hero/finale layers by visibility windows.

### Economics gate (before any ad spend)

Run `havn-site/economics/havn_margins.py` pattern on the new SKUs: audit COGS from
`catalog-base/products/*/record.md` (verify live vs Supliful Sanity API), Supliful fees
(1.99/1.29-same-product fulfillment, 2.99% on merchant charge, weight-tiered shipping),
Stripe DK 5.25% + $0.28 one-time / +0.7% Billing subs. Ship only if the complete
ritual sub contribution ≥ $35/month — priced with all four pieces in EVERY delivery,
never with a piece dropped after delivery 1. Singles are anchors, not acquisition
products.

### Process contract

1. Founder supplies 1–3 visual references for the collection's mood (global rule) —
   adapt them INTO Spectrum, never clone.
2. Build in `havn-site/[collection].html`, noindex, own canonical. index.html untouched.
3. Commit every founder pass. Verify every pass on the live Pages URL with playwright
   MCP (true viewport, cache-bust `?v=N`) — headless CLI screenshots lie on 150% DPI.
   Film scenes verified via `?p` pins at 393×852, 500×660, 1280×800.
4. Deliver public URL, never localhost/screenshots (founder tests on iPhone 14 Pro).
5. Iterate in small founder passes; expect ~4–10; log taste rulings to memory.

---

## Why this prompt exists

HAVN v1 took v3→v5.3 (≈15 commits of film builds) + 4 founder passes on next.html to
converge. Every law above is a distilled founder ruling or a root-caused bug. The next
collection starts at the finale, not at zero.
