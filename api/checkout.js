/* POST /api/checkout — turn the on-page cart into a Stripe Checkout Session.
   Body: { cart: {trio, singles:{rise,calm,rest,steady}}, subscribe: bool }
   Returns: { url } to redirect the browser to.

   DEMO MODE: with no STRIPE_SECRET_KEY set, returns a simulated success URL so
   the whole A→Z flow stays clickable before the Stripe account exists. */

const {
  normalizeCart, subtotalCents, shippingCents, lineItems, humanSummary, planMonths, FREE_SHIP_CENTS, SHIP_CENTS,
} = require('./_catalog.js');

function cors(res, origin) {
  /* only the site itself may call this from a browser */
  const allowed = [
    process.env.SITE_URL && process.env.SITE_URL.replace(/\/$/, ''),
    'https://bohmarko567-oss.github.io',
  ].filter(Boolean);
  const ok = origin && (allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin));
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : (allowed[0] || 'null'));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

/* Where to send the customer back to. Prefer the calling page's origin so a
   GitHub-Pages front + Vercel API split still lands the customer back home. */
function siteOrigin(req) {
  const o = req.headers.origin;
  if (o && /^https?:\/\/[\w.-]+(:\d+)?$/.test(o)) return o;
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return proto + '://' + host;
}

module.exports = async (req, res) => {
  cors(res, req.headers.origin);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'POST only' })); }

  let payload;
  try { payload = await readJson(req); }
  catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'bad JSON' })); }

  const subscribe = !!payload.subscribe;
  const months = subscribe ? planMonths(payload.months) : 1;
  const cart = normalizeCart(payload.cart);
  if (cart.count === 0) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'cart is empty' })); }

  const origin = siteOrigin(req);
  const subtotal = subtotalCents(cart, subscribe, months);
  const summary = humanSummary(cart, subscribe, months);

  /* ---------- demo mode (no Stripe account yet) ---------- */
  if (!process.env.STRIPE_SECRET_KEY) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      demo: true,
      url: origin + '/success.html?demo=1&total=' + subtotal + '&sub=' + (subscribe ? 1 : 0)
           + '&m=' + months + '&sum=' + encodeURIComponent(summary),
    }));
  }

  /* ---------- live mode ---------- */
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const imgBase = origin.startsWith('https://') ? origin : (process.env.SITE_URL || '');
    const metadata = {
      havn_cart: JSON.stringify({ t: cart.trio, s: cart.singles, sub: subscribe, m: months }),
      havn_summary: summary,
    };

    const params = {
      mode: subscribe ? 'subscription' : 'payment',
      line_items: lineItems(cart, subscribe, imgBase || null, months),
      success_url: origin + '/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/#products',
      shipping_address_collection: { allowed_countries: ['US'] },
      phone_number_collection: { enabled: true },   /* the fulfillment partner declines orders without a phone */
      allow_promotion_codes: true,
      metadata,
    };
    /* welcome code from the on-page circle — applied server-side so the Stripe
       total matches the cart. Subscription orders only; the coupon behind it is
       duration:"once", so Stripe discounts the FIRST invoice and renews full. */
    const rawPromo = typeof payload.promo === 'string' ? payload.promo.trim().toUpperCase() : '';
    const promoCode = /^[A-Z0-9-]{2,24}$/.test(rawPromo) ? rawPromo : '';
    if (promoCode && subscribe) {
      try {
        const found = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
        if (found.data[0]) {
          params.discounts = [{ promotion_code: found.data[0].id }];
          delete params.allow_promotion_codes; /* Stripe: mutually exclusive */
        }
      } catch (e) { console.error('promo lookup failed:', e.message || e); }
    }
    if (subscribe) {
      params.subscription_data = { metadata };      /* renewals carry the cart too */
    } else {
      params.customer_creation = 'always';
      /* abandoned-cart seed: expired sessions keep a 30-day recovery URL that
         the webhook mails to the owner (payment mode only — Stripe limit) */
      params.after_expiration = { recovery: { enabled: true } };
      const ship = shippingCents(cart, false);
      params.shipping_options = [{
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: ship === 0 ? 'Free U.S. shipping' : 'U.S. shipping',
          fixed_amount: { amount: ship, currency: 'usd' },
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 3 },
            maximum: { unit: 'business_day', value: 7 },
          },
        },
      }];
    }
    if (process.env.STRIPE_TAX === '1') params.automatic_tax = { enabled: true };

    const session = await stripe.checkout.sessions.create(params);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ url: session.url }));
  } catch (e) {
    console.error('checkout error:', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'checkout failed: ' + (e.message || 'unknown') }));
  }
};
