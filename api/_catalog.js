/* HAVN server-side catalog — the single source of truth for money.
   The client cart is NEVER trusted: every checkout re-normalizes and
   re-prices the cart here, with the same rules the on-page cart shows.
   All amounts are integer cents. */

const CATALOG = {
  rise:   { name: "HAVN Rise — Lion's Mane 1000mg",       n: 'N°01', img: 'rise_front.jpg',   one: 3600, sub: 3100 },
  calm:   { name: 'HAVN Calm — Ashwagandha+ (KSM-66®)',   n: 'N°02', img: 'calm_front.jpg',   one: 3600, sub: 3100 },
  rest:   { name: 'HAVN Rest — Magnesium Glycinate',      n: 'N°03', img: 'rest_front.jpg',   one: 3600, sub: 3100 },
  steady: { name: 'HAVN Steady — Blood Sugar Drops',      n: 'N°04', img: 'steady_front.jpg', one: 1800, sub: 1500 },
};

/* Trio bundle: Rise+Calm+Rest. Sub price is $92 (NOT 3×$31=$93) — locked offer. */
const TRIO = {
  one: 10800,
  sub: 9200,
  name: 'HAVN Complete Ritual — Rise + Calm + Rest',
  desc: 'The 4-piece daily ritual. Includes N°04 STEADY (Blood Sugar Drops, $18 value) FREE in every shipment.',
};

const FREE_SHIP_CENTS = intEnv('FREE_SHIP_CENTS', 7500);  /* free U.S. shipping threshold */
const SHIP_CENTS      = intEnv('SHIP_CENTS', 695);        /* flat U.S. shipping below it  */

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

function subtotalCents(cart, subscribe) {
  const mode = subscribe ? 'sub' : 'one';
  let total = cart.trio * TRIO[mode];
  for (const [id, q] of Object.entries(cart.singles)) total += q * CATALOG[id][mode];
  return total;
}

function shippingCents(cart, subscribe) {
  return subtotalCents(cart, subscribe) >= FREE_SHIP_CENTS ? 0 : SHIP_CENTS;
}

/* Stripe Checkout line items via price_data — no dashboard products required.
   The free STEADY is described inside the Trio item (a separate $0 line is
   avoided on purpose: it must never be able to fail a live checkout). */
function lineItems(cart, subscribe, imgBase) {
  const items = [];
  const recurring = subscribe ? { recurring: { interval: 'month' } } : {};
  const img = (file) => (imgBase ? { images: [imgBase + '/assets/products/' + file] } : {});

  if (cart.trio > 0) {
    items.push({
      quantity: cart.trio,
      price_data: {
        currency: 'usd',
        unit_amount: subscribe ? TRIO.sub : TRIO.one,
        ...recurring,
        product_data: {
          name: TRIO.name + (subscribe ? ' (monthly)' : ''),
          description: TRIO.desc,
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
        unit_amount: subscribe ? p.sub : p.one,
        ...recurring,
        product_data: {
          name: p.name + (subscribe ? ' (monthly)' : ''),
          description: p.n + ' · 30-day supply',
          metadata: { havn_sku: id },
          ...img(p.img),
        },
      },
    });
  }
  /* customer-paid monthly shipping when a subscription cart is under the threshold
     (Checkout shipping_options are one-time-mode only) */
  if (subscribe && shippingCents(cart, true) > 0) {
    items.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: SHIP_CENTS,
        recurring: { interval: 'month' },
        product_data: {
          name: 'U.S. shipping (monthly)',
          description: 'Free on ritual orders over $' + (FREE_SHIP_CENTS / 100),
          metadata: { havn_sku: 'shipping' },
        },
      },
    });
  }
  return items;
}

/* What the warehouse must actually ship — trio explodes into SKUs,
   ritual-complete orders always include one free STEADY. */
function fulfillmentUnits(cart) {
  const units = { rise: 0, calm: 0, rest: 0, steady: 0 };
  units.rise += cart.trio; units.calm += cart.trio; units.rest += cart.trio;
  for (const [id, q] of Object.entries(cart.singles)) units[id] += q;
  if (cart.complete) units.steady += 1; /* the gift */
  return units;
}

function humanSummary(cart, subscribe) {
  const parts = [];
  if (cart.trio > 0) parts.push(cart.trio + '× Trio');
  for (const [id, q] of Object.entries(cart.singles)) if (q > 0) parts.push(q + '× ' + id);
  if (cart.complete) parts.push('+1 STEADY FREE');
  parts.push(subscribe ? 'SUBSCRIPTION' : 'one-time');
  const ship = shippingCents(cart, subscribe);
  parts.push(ship === 0 ? 'ship FREE' : 'ship $' + (ship / 100).toFixed(2));
  return parts.join(' | ');
}

module.exports = {
  CATALOG, TRIO, FREE_SHIP_CENTS, SHIP_CENTS,
  normalizeCart, subtotalCents, shippingCents, lineItems, fulfillmentUnits, humanSummary,
};
