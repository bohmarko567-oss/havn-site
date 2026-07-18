/* HAVN server-side catalog — the single source of truth for money.
   The client cart is NEVER trusted: every checkout re-normalizes and
   re-prices the cart here, with the same rules the on-page cart shows.
   All amounts are integer cents. */

/* subPlans = PER-MONTH cents by supply length (1/2/3-month boxes; the deeper
   ladder motivates the bigger box). sub stays = subPlans[1] for old callers. */
const CATALOG = {
  rise:   { name: "HAVN Rise — Lion's Mane 1000mg",       n: 'N°01', img: 'rise_front.jpg',   one: 3800, sub: 3100, subPlans: { 1: 3100, 2: 3000, 3: 2800 } },
  calm:   { name: 'HAVN Calm — Ashwagandha+ (KSM-66®)',   n: 'N°02', img: 'calm_front.jpg',   one: 3800, sub: 3100, subPlans: { 1: 3100, 2: 3000, 3: 2800 } },
  rest:   { name: 'HAVN Rest — Magnesium Glycinate',      n: 'N°03', img: 'rest_front.jpg',   one: 3800, sub: 3100, subPlans: { 1: 3100, 2: 3000, 3: 2800 } },
  steady: { name: 'HAVN Steady — Blood Sugar Drops',      n: 'N°04', img: 'steady_front.jpg', one: 1800, sub: 1500, subPlans: { 1: 1500, 2: 1400, 3: 1300 } },
};

/* Trio bundle: Rise+Calm+Rest. Sub $93 = exactly 3×$31 (collapse-neutral),
   ~18% off the $114 one-time anchor; the 15% welcome code (first order only —
   coupon duration "once") lands the first month at $79.05. Repriced 2026-07-10
   on verified wholesale + per-unit fulfillment + weight-based shipping. */
const TRIO = {
  one: 11400,
  sub: 9300,
  /* multi-month supply per delivery: $93/mo (−18%) → $90/mo (−20%) → $84/mo
     (−25% vs the $114 one-time anchor). Collapse-neutral on every tier: the
     trio per-month price is exactly 3× the single per-month price. Keys are
     months, values are cents PER DELIVERY. */
  subPlans: { 1: 9300, 2: 18000, 3: 25200 },
  name: 'HAVN Complete Ritual — Rise + Calm + Rest',
  desc: 'The 4-piece daily ritual. Includes N°04 STEADY (Blood Sugar Drops, $18 value) FREE in every shipment.',
};

function planMonths(v) { return [1, 2, 3].includes(Math.floor(Number(v))) ? Math.floor(Number(v)) : 1; }

const FREE_SHIP_CENTS     = intEnv('FREE_SHIP_CENTS', 7900);     /* one-time orders: free U.S. shipping threshold */
const FREE_SUB_SHIP_CENTS = intEnv('FREE_SUB_SHIP_CENTS', 3000); /* subscriptions ship free from $30/mo (any formula qualifies) */
const SHIP_CENTS          = intEnv('SHIP_CENTS', 695);           /* flat U.S. shipping otherwise */

function intEnv(k, d) {
  const v = parseInt(process.env[k] || '', 10);
  return Number.isFinite(v) && v >= 0 ? v : d;
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/* Mirror of the on-page cart rules:
   - three loose mains always collapse into one Trio
   - ritual complete (trio ≥ 1) ⇒ one STEADY ships free with every order */
function normalizeCart(raw) {
  const singles = { rise: 0, calm: 0, rest: 0, steady: 0 };
  let trio = clampInt(raw && raw.trio, 0, 10);
  for (const k of Object.keys(singles)) {
    singles[k] = clampInt(raw && raw.singles && raw.singles[k], 0, 20);
  }
  while (singles.rise > 0 && singles.calm > 0 && singles.rest > 0) {
    singles.rise--; singles.calm--; singles.rest--; trio++;
  }
  trio = Math.min(trio, 10);
  const complete = trio > 0;
  const count = trio * 3 + Object.values(singles).reduce((s, q) => s + q, 0);
  return { trio, singles, complete, count };
}

function subtotalCents(cart, subscribe, months) {
  const m = subscribe ? planMonths(months) : 1;
  let total = cart.trio * (subscribe ? TRIO.subPlans[m] : TRIO.one);
  for (const [id, q] of Object.entries(cart.singles)) total += q * (subscribe ? CATALOG[id].subPlans[m] * m : CATALOG[id].one);
  return total;
}

function shippingCents(cart, subscribe, months) {
  const m = subscribe ? planMonths(months) : 1;
  const st = subtotalCents(cart, subscribe, m);
  /* threshold is per-month-equivalent so a 2-month box doesn't unlock free
     shipping a 1-month box wouldn't; the fee itself is per delivery */
  if (subscribe) return st >= FREE_SUB_SHIP_CENTS * m ? 0 : SHIP_CENTS;
  return st >= FREE_SHIP_CENTS ? 0 : SHIP_CENTS;
}

/* Stripe Checkout line items via price_data — no dashboard products required.
   The free STEADY is described inside the Trio item (a separate $0 line is
   avoided on purpose: it must never be able to fail a live checkout). */
function lineItems(cart, subscribe, imgBase, months) {
  const items = [];
  const m = subscribe ? planMonths(months) : 1;
  /* every recurring line in one Checkout Session must share the same interval,
     so the whole order bills & ships every m months */
  const recurring = subscribe ? { recurring: { interval: 'month', interval_count: m } } : {};
  const cadence = subscribe ? (m === 1 ? ' (monthly)' : ' (every ' + m + ' months)') : '';
  const img = (file) => (imgBase ? { images: [imgBase + '/assets/products/' + file] } : {});

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
          ...img('trio_official.jpg'),
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
          description: p.n + ' · ' + (30 * m) + '-day supply',
          metadata: { havn_sku: id },
          ...img(p.img),
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
          name: 'U.S. shipping',
          description: 'Free on subscriptions from $' + (FREE_SUB_SHIP_CENTS / 100) + '/mo',
          metadata: { havn_sku: 'shipping' },
        },
      },
    });
  }
  return items;
}

/* What the warehouse must actually ship — trio explodes into SKUs,
   ritual-complete orders always include one free STEADY. */
function fulfillmentUnits(cart, months) {
  const m = planMonths(months);
  const units = { rise: 0, calm: 0, rest: 0, steady: 0 };
  units.rise += cart.trio * m; units.calm += cart.trio * m; units.rest += cart.trio * m;
  for (const [id, q] of Object.entries(cart.singles)) units[id] += q * m;
  if (cart.complete) units.steady += m; /* the gift — one per month of supply */
  return units;
}

function humanSummary(cart, subscribe, months) {
  const m = subscribe ? planMonths(months) : 1;
  const parts = [];
  if (cart.trio > 0) parts.push(cart.trio + '× Trio' + (m > 1 ? ' (' + m + '-mo supply)' : ''));
  for (const [id, q] of Object.entries(cart.singles)) if (q > 0) parts.push(q + '× ' + id);
  if (cart.complete) parts.push('+' + m + '× STEADY FREE');
  parts.push(subscribe ? (m > 1 ? 'SUBSCRIPTION every ' + m + ' months' : 'SUBSCRIPTION') : 'one-time');
  const ship = shippingCents(cart, subscribe, m);
  parts.push(ship === 0 ? 'ship FREE' : 'ship $' + (ship / 100).toFixed(2));
  return parts.join(' | ');
}

module.exports = {
  CATALOG, TRIO, FREE_SHIP_CENTS, FREE_SUB_SHIP_CENTS, SHIP_CENTS, planMonths,
  normalizeCart, subtotalCents, shippingCents, lineItems, fulfillmentUnits, humanSummary,
};
