/* POST /api/stripe-webhook — Stripe calls this after money moves.
   Every paid order becomes a fulfillment record that is:
     1. logged (Vercel → Deployments → Functions logs; Stripe dashboard is the
        permanent source of truth either way),
     2. emailed to OWNER_EMAIL as a ready-to-ship Supliful picklist (Resend),
     3. optionally pushed straight into a headless Shopify store for hands-free
        Supliful fulfillment (see api/_shopify.js) — best-effort, never blocks.

   Events handled:
     checkout.session.completed          → first order (one-time or sub month 1)
     invoice.paid (subscription_cycle)   → each renewal = a new shipment

   Signature verification needs the RAW body — bodyParser stays off. */

const { normalizeCart, fulfillmentUnits, humanSummary } = require('./_catalog.js');
const { sendEmail, ownerOrderEmail } = require('./_email.js');
const shopify = require('./_shopify.js');

module.exports.config = { api: { bodyParser: false } };

async function readRaw(req) {
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

function cartFromMetadata(md) {
  try {
    const c = JSON.parse((md && md.havn_cart) || '');
    return { cart: normalizeCart({ trio: c.t, singles: c.s }), subscribe: !!c.sub };
  } catch { return null; }
}

async function handleOrder(order) {
  console.log('HAVN ORDER', JSON.stringify(order));
  const emailRes = await sendEmail({
    to: process.env.OWNER_EMAIL,
    subject: (order.kind === 'renewal' ? '🔁 HAVN renewal — ship it: ' : '🟠 NEW HAVN ORDER — ship it: ') + (order.summary || order.id),
    html: ownerOrderEmail(order),
  });
  if (!emailRes.sent) console.warn('owner email not sent:', emailRes.reason);
  if (shopify.enabled()) {
    try {
      const pushed = await shopify.pushOrder(order);
      console.log('shopify bridge:', JSON.stringify(pushed));
    } catch (e) {
      console.error('shopify bridge failed (order still emailed/logged):', e.message || e);
    }
  }
  return emailRes;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only'); }
  const key = process.env.STRIPE_SECRET_KEY;
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !whsec) {
    console.error('webhook hit but STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET not configured');
    res.statusCode = 500; return res.end('not configured');
  }
  const stripe = require('stripe')(key);

  let event;
  try {
    const raw = await readRaw(req);
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], whsec);
  } catch (e) {
    console.error('webhook signature verification failed:', e.message);
    res.statusCode = 400; return res.end('bad signature');
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.payment_status && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        res.statusCode = 200; return res.end(JSON.stringify({ received: true, skipped: 'not paid yet' }));
      }
      const parsed = cartFromMetadata(session.metadata) || { cart: normalizeCart({}), subscribe: session.mode === 'subscription' };
      const cd = session.customer_details || {};
      const ship = session.shipping_details
        || (session.collected_information && session.collected_information.shipping_details)
        || { name: cd.name, address: cd.address };
      await handleOrder({
        kind: 'new',
        id: session.id,
        amountTotal: session.amount_total || 0,
        summary: (session.metadata && session.metadata.havn_summary) || humanSummary(parsed.cart, parsed.subscribe),
        units: fulfillmentUnits(parsed.cart),
        customerEmail: cd.email, customerPhone: cd.phone, customerName: cd.name,
        shipping: ship,
        subscribe: parsed.subscribe,
      });
    } else if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      if (invoice.billing_reason === 'subscription_cycle') {   /* month 2+ — month 1 is covered above */
        let md = (invoice.subscription_details && invoice.subscription_details.metadata) || null;
        if (!md && invoice.subscription) {
          try { md = (await stripe.subscriptions.retrieve(invoice.subscription)).metadata; } catch {}
        }
        const parsed = cartFromMetadata(md) || { cart: normalizeCart({}), subscribe: true };
        let ship = invoice.customer_shipping || null;
        if (!ship && invoice.customer) {
          try { const cust = await stripe.customers.retrieve(invoice.customer); ship = cust.shipping || null; } catch {}
        }
        await handleOrder({
          kind: 'renewal',
          id: invoice.id,
          amountTotal: invoice.amount_paid || 0,
          summary: (md && md.havn_summary) || humanSummary(parsed.cart, true),
          units: fulfillmentUnits(parsed.cart),
          customerEmail: invoice.customer_email, customerPhone: (ship && ship.phone) || null, customerName: invoice.customer_name,
          shipping: ship,
          subscribe: true,
        });
      }
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ received: true }));
  } catch (e) {
    /* Log + 500 so Stripe retries — orders must never be silently lost. */
    console.error('webhook handler error:', e);
    res.statusCode = 500; return res.end('handler error');
  }
};
