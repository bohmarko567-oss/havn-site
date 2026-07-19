/* POST /api/checkout — turn the on-page cart into a Stripe Checkout Session.
   Body: { cart: {trio, singles:{rise,calm,rest,steady}}, subscribe: bool }
   Returns: { url } to redirect the browser to.

   DEMO MODE: with no STRIPE_SECRET_KEY set, returns a simulated success URL so
   the whole A→Z flow stays clickable before the Stripe account exists. */

const {
  normalizeCart, shippingEligibility, subtotalCents, shippingCents, lineItems, humanSummary, planMonths,
} = require('./_catalog.js');

function configuredOrigin() {
  try { return process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : null; }
  catch { return null; }
}

function cors(res, origin) {
  /* only the site itself may call this from a browser */
  const allowed = [
    configuredOrigin(),
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
  if (o === 'https://bohmarko567-oss.github.io') return o + '/havn-site';
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
  if (cart.overflow) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'cart_limit' })); }
  const eligibility = shippingEligibility(payload.shippingState, cart);
  if (!eligibility.ok) {
    res.statusCode = 422;
    return res.end(JSON.stringify({ error: eligibility.reason }));
  }

  const origin = siteOrigin(req);
  const subtotal = subtotalCents(cart, subscribe, months);
  const summary = humanSummary(cart, subscribe, months);
  const production = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

  /* Explicit release gates: a deploy with credentials missing must fail closed,
     never turn into a public demo checkout. */
  const requiredProductionConfig = ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','SITE_URL','RESEND_API_KEY','OWNER_EMAIL','EMAIL_FROM'];
  const missingProductionConfig = requiredProductionConfig.filter((key) => !process.env[key]);
  if (production && missingProductionConfig.length) {
    console.error('checkout blocked; missing production config:', missingProductionConfig.join(', '));
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'production_config_incomplete' }));
  }
  if (production && process.env.LAUNCH_ENABLED !== '1') {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'launch_not_enabled' }));
  }
  if (production && process.env.STRIPE_TAX !== '1') {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'tax_not_configured' }));
  }
  const operationalGates = [
    'LABEL_COMPLIANCE_CONFIRMED',
    'CLAIMS_COMPLIANCE_CONFIRMED',
    'BUSINESS_IDENTITY_CONFIRMED',
    'SAE_CONTACT_CONFIRMED',
    'CANCELLATION_OPERATIONS_CONFIRMED',
    'GUARANTEE_OPERATIONS_CONFIRMED',
    'ABUSE_CONTROLS_CONFIRMED',
    'INVENTORY_AVAILABILITY_CONFIRMED',
  ];
  if (production && operationalGates.some((key) => process.env[key] !== '1')) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'compliance_gate_open' }));
  }

  /* ---------- demo mode (local development only) ---------- */
  if (!process.env.STRIPE_SECRET_KEY) {
    if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'checkout_unavailable' }));
    }
    const demoGross = subtotal + shippingCents(cart, subscribe, months);
    const demoDiscount = subscribe && payload.promo === 'HAVN10-DEMO' ? Math.round(demoGross * 0.10) : 0;
    const demoTotal = demoGross - demoDiscount;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      demo: true,
      url: origin + '/success.html?demo=1&total=' + demoTotal + '&sub=' + (subscribe ? 1 : 0)
           + '&m=' + months + '&sum=' + encodeURIComponent(summary),
    }));
  }

  /* ---------- live mode ---------- */
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const metadata = {
      havn_cart: JSON.stringify({ t: cart.trio, s: cart.singles, sub: subscribe, m: months }),
      havn_summary: summary,
      havn_declared_state: eligibility.state,
    };

    const params = {
      mode: subscribe ? 'subscription' : 'payment',
      line_items: lineItems(cart, subscribe, null, months),
      /* Never put a client-editable production amount in the return URL. Stripe
         remains the payment receipt and source of the charged total. */
      success_url: origin + '/success.html?session_id={CHECKOUT_SESSION_ID}&sub=' + (subscribe ? 1 : 0) + '&m=' + months,
      cancel_url: origin + '/next.html#whats',
      shipping_address_collection: { allowed_countries: ['US'] },
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },   /* the fulfillment partner declines orders without a phone */
      consent_collection: { terms_of_service: 'required' },
      metadata,
    };
    if (subscribe) {
      const renewal = subtotal + shippingCents(cart, true, months);
      params.custom_text = { submit: { message:
        'Renews at $' + (renewal / 100).toFixed(2) + ' every ' + (months === 1 ? 'month' : months + ' months') +
        ' until canceled. Email hello@havn.co at least 48 hours before renewal to cancel or change. Tax, if applicable, is added at checkout.'
      } };
    }
    /* welcome code from the on-page circle — applied server-side so the Stripe
       total matches the cart. Subscription orders only; the coupon behind it is
       duration:"once", so Stripe discounts the FIRST invoice and renews full. */
    const rawPromo = typeof payload.promo === 'string' ? payload.promo.trim().toUpperCase() : '';
    const promoCode = /^[A-Z0-9-]{2,24}$/.test(rawPromo) ? rawPromo : '';
    if (promoCode && subscribe) {
      try {
        const found = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
        if (!found.data[0]) {
          res.statusCode = 409;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'promo_invalid' }));
        }
        const promotion = found.data[0];
        let coupon = promotion.coupon || (promotion.promotion && promotion.promotion.coupon) || null;
        if (typeof coupon === 'string') coupon = await stripe.coupons.retrieve(coupon);
        if (!coupon || coupon.percent_off !== 10 || coupon.duration !== 'once' || coupon.valid === false || promotion.max_redemptions !== 1) {
          res.statusCode = 409;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'promo_invalid' }));
        }
        params.discounts = [{ promotion_code: promotion.id }];
      } catch (e) {
        console.error('promo lookup failed:', e.message || e);
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'promo_check_unavailable' }));
      }
    }
    if (subscribe) {
      params.subscription_data = { metadata };      /* renewals carry the cart too */
    } else {
      params.customer_creation = 'always';
      const ship = shippingCents(cart, false);
      params.shipping_options = [{
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: ship === 0 ? 'Free standard shipping' : 'Standard shipping',
          fixed_amount: { amount: ship, currency: 'usd' },
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
