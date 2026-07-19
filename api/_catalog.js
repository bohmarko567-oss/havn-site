/* HAVN server-side catalog — the single source of truth for money.
   The client cart is NEVER trusted: every checkout re-normalizes and
   re-prices the cart here, with the same rules the on-page cart shows.
   All amounts are integer cents. */

/* subPlans = PER-MONTH cents by supply length (1/2/3-month boxes; the deeper
   ladder motivates the bigger box). sub stays = subPlans[1] for old callers. */
const CATALOG = {
  rise:   { name: "HAVN Rise — Lion's Mane Mushroom",     n: 'N°01', one: 3800, sub: 3100, subPlans: { 1: 3100, 2: 3000, 3: 2800 } },
  calm:   { name: 'HAVN Calm — Ashwagandha+ (KSM-66®)',   n: 'N°02', one: 3800, sub: 3100, subPlans: { 1: 3100, 2: 3000, 3: 2800 } },
  rest:   { name: 'HAVN Rest — Magnesium Glycinate',      n: 'N°03', one: 3800, sub: 3100, subPlans: { 1: 3100, 2: 3000, 3: 2800 } },
  steady: { name: 'HAVN Steady — Botanical Drops',         n: 'N°04', one: 1800, sub: 1500, subPlans: { 1: 1500, 2: 1400, 3: 1300 } },
};

/* The storefront keeps the original art-directed bottle mockups. Stripe item
   images stay omitted until checkout-safe media is approved: the existing Rise
   and Steady fronts carry unverified claim text, and trio_official.jpg shows
   only three pieces while the product sold here contains four. Audit reviewed
   2026-07-15; do not let decorative media become checkout product truth. */

/* THE RITUAL — a genuine FOUR-piece product: Rise + Calm + Rest + Steady.
   Every active subscription delivery contains all four. Steady is not a gift
   and the old "free gift, first delivery only" model was replaced
   2026-07-19 because give-then-remove reads as a bait-and-switch at delivery 2.

   $132 one-time is exactly what the four cost separately (38+38+38+18), so the
   $99 sub is exactly 25% off. Supply ladder $99 / $95 / $88 per month
   (−25% / −28% / −33% vs the anchor). The 10% welcome code (first subscription
   invoice only, coupon duration "once") lands that invoice at $89.10.

   The $88 tier is deliberate: buying the four loose costs $108/$104/$97 per
   month, so the Ritual saves exactly $9/month at EVERY tier — $9, $18 and $27
   per delivery. $90 would have made the 3-month saving shrink to $7/month,
   which reads as the bundle getting stingier the longer you commit.

   NOTE: this deliberately breaks the old collapse-neutral invariant (ritual =
   3× single). Four loose subscriptions are $108/mo; the ritual is $99/mo, so
   completing the set now earns a real $9/mo discount instead of nothing. */
const TRIO = {
  one: 13200,
  sub: 9900,
  /* cents PER DELIVERY: $99×1, $95×2, $88×3 */
  subPlans: { 1: 9900, 2: 19000, 3: 26400 },
  name: 'HAVN Complete Ritual — Rise + Calm + Rest + Steady',
  desc: 'The 4-piece daily ritual. Every delivery includes N°04 STEADY botanical drops.',
};

function planMonths(v) { return [1, 2, 3].includes(Math.floor(Number(v))) ? Math.floor(Number(v)) : 1; }

/* One threshold, everywhere. It is measured against the amount billed for the
   delivery in front of the customer (one-time or subscription), so a $60
   two-month box qualifies and a $31 one-month box does not. Keeping this as a
   single constant prevents storefront / Stripe drift. */
const FREE_SHIP_CENTS     = 5000;
const SHIP_CENTS          = 695;                                 /* flat U.S. shipping otherwise */
const MAX_TRIO_QTY = 10;
const MAX_SINGLE_QTY = 20;
const CONTIGUOUS_STATES = new Set([
  'AL','AZ','AR','CA','CO','CT','DE','DC','FL','GA','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
  'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]);

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/* Mirror of the on-page cart rules:
   - ALL FOUR loose formulas collapse into one Ritual (saves the customer $9/mo,
     so completing the set is rewarded). Three mains alone stay three singles —
     collapsing them would hand over a Steady nobody paid for.
   - the Ritual is a 4-piece product; there is no separate gift flag. */
function normalizeCart(raw) {
  const singles = { rise: 0, calm: 0, rest: 0, steady: 0 };
  let overflow = false;
  const rawTrio = Number(raw && raw.trio || 0);
  if (!Number.isInteger(rawTrio) || rawTrio < 0 || rawTrio > MAX_TRIO_QTY) overflow = true;
  let trio = clampInt(rawTrio, 0, MAX_TRIO_QTY);
  for (const k of Object.keys(singles)) {
    const rawQty = Number(raw && raw.singles && raw.singles[k] || 0);
    if (!Number.isInteger(rawQty) || rawQty < 0 || rawQty > MAX_SINGLE_QTY) overflow = true;
    singles[k] = clampInt(rawQty, 0, MAX_SINGLE_QTY);
  }
  while (trio < MAX_TRIO_QTY && singles.rise > 0 && singles.calm > 0 && singles.rest > 0 && singles.steady > 0) {
    singles.rise--; singles.calm--; singles.rest--; singles.steady--; trio++;
  }
  if (singles.rise > 0 && singles.calm > 0 && singles.rest > 0 && singles.steady > 0) overflow = true;
  const complete = trio > 0;
  const count = trio * 4 + Object.values(singles).reduce((s, q) => s + q, 0);
  return { trio, singles, complete, count, overflow };
}

/* Checkout collects a declaration before Stripe creates a charge. The webhook
   re-runs this against Stripe's final address before any fulfillment is sent. */
function shippingEligibility(state, cart) {
  const code = String(state || '').trim().toUpperCase();
  if (!CONTIGUOUS_STATES.has(code)) return { ok: false, reason: 'contiguous_us_only' };
  if (code === 'LA') return { ok: false, reason: 'louisiana_registration_review' };
  if (code === 'NY' && (cart.trio > 0 || cart.singles.steady > 0)) {
    return { ok: false, reason: 'steady_unavailable_in_new_york' };
  }
  if (code === 'CA') return { ok: false, reason: 'california_label_review' };
  return { ok: true, state: code };
}

function subtotalCents(cart, subscribe, months) {
  const m = subscribe ? planMonths(months) : 1;
  let total = cart.trio * (subscribe ? TRIO.subPlans[m] : TRIO.one);
  for (const [id, q] of Object.entries(cart.singles)) total += q * (subscribe ? CATALOG[id].subPlans[m] * m : CATALOG[id].one);
  return total;
}

function qualifiesForFreeShipping(subtotal) {
  return Number.isFinite(subtotal) && subtotal >= FREE_SHIP_CENTS;
}

function shippingCents(cart, subscribe, months) {
  const m = subscribe ? planMonths(months) : 1;
  const st = subtotalCents(cart, subscribe, m);
  return qualifiesForFreeShipping(st) ? 0 : SHIP_CENTS;
}

/* Stripe Checkout line items via price_data — no dashboard products required.
   The Ritual is ONE line covering all four bottles; the warehouse split lives
   in fulfillmentUnits(), not in what the customer is charged for. */
function lineItems(cart, subscribe, _imgBase, months) {
  const items = [];
  const m = subscribe ? planMonths(months) : 1;
  /* every recurring line in one Checkout Session must share the same interval,
     so the whole order bills & ships every m months */
  const recurring = subscribe ? { recurring: { interval: 'month', interval_count: m } } : {};
  const cadence = subscribe ? (m === 1 ? ' (monthly)' : ' (every ' + m + ' months)') : '';
  if (cart.trio > 0) {
    items.push({
      quantity: cart.trio,
      price_data: {
        currency: 'usd',
        unit_amount: subscribe ? TRIO.subPlans[m] : TRIO.one,
        ...recurring,
        product_data: {
          name: TRIO.name + cadence,
          description: (m > 1 ? m + '-month supply per delivery. ' : '') + TRIO.desc,
          metadata: { havn_sku: 'trio' },
        },
      },
    });
  }
  for (const [id, q] of Object.entries(cart.singles)) {
    if (q <= 0) continue;
    const p = CATALOG[id];
    items.push({
      quantity: q,
      price_data: {
        currency: 'usd',
        unit_amount: subscribe ? p.subPlans[m] * m : p.one,
        ...recurring,
        product_data: {
          name: p.name + cadence,
          description: p.n + ' · ' + m + '-month supply at the primary labeled serving',
          metadata: { havn_sku: id },
        },
      },
    });
  }
  /* customer-paid shipping when a subscription cart is under the threshold
     (Checkout shipping_options are one-time-mode only); one fee per delivery */
  if (subscribe && shippingCents(cart, true, m) > 0) {
    items.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: SHIP_CENTS,
        recurring: { interval: 'month', interval_count: m },
        product_data: {
          name: 'Eligible contiguous-U.S. standard shipping',
          description: 'Free at a $' + (FREE_SHIP_CENTS / 100) + ' pre-discount product subtotal; destination restrictions apply',
          metadata: { havn_sku: 'shipping' },
        },
      },
    });
  }
  return items;
}

/* What the warehouse must actually ship — the Ritual explodes into its four
   SKUs. Every delivery is identical: no gift logic, no first-vs-renewal split. */
function fulfillmentUnits(cart, months) {
  const m = planMonths(months);
  const units = { rise: 0, calm: 0, rest: 0, steady: 0 };
  for (const id of ['rise', 'calm', 'rest', 'steady']) units[id] += cart.trio * m;
  for (const [id, q] of Object.entries(cart.singles)) units[id] += q * m;
  return units;
}

function humanSummary(cart, subscribe, months) {
  const m = subscribe ? planMonths(months) : 1;
  const parts = [];
  if (cart.trio > 0) parts.push(cart.trio + '× Complete Ritual' + (m > 1 ? ' (' + m + '-mo supply)' : ''));
  for (const [id, q] of Object.entries(cart.singles)) if (q > 0) parts.push(q + '× ' + id);
  /* Steady is part of the Ritual line now — no separate gift line to report. */
  parts.push(subscribe ? (m > 1 ? 'SUBSCRIPTION every ' + m + ' months' : 'SUBSCRIPTION') : 'one-time');
  const ship = shippingCents(cart, subscribe, m);
  parts.push(ship === 0 ? 'ship FREE' : 'ship $' + (ship / 100).toFixed(2));
  return parts.join(' | ');
}

module.exports = {
  CATALOG, TRIO, FREE_SHIP_CENTS, SHIP_CENTS, MAX_TRIO_QTY, MAX_SINGLE_QTY, planMonths,
  qualifiesForFreeShipping,
  normalizeCart, shippingEligibility, subtotalCents, shippingCents, lineItems, fulfillmentUnits, humanSummary,
};
