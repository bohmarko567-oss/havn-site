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

/* server-side conversion event → Plausible (set PLAUSIBLE_DOMAIN to enable).
   This is the reliable purchase signal for the funnel — it fires even when
   the customer never returns to the success page. */
async function trackPurchase(order) {
  const domain = process.env.PLAUSIBLE_DOMAIN;
  if (!domain) return;
  try {
    await fetch('https://plausible.io/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'havn-server/1.0' },
      body: JSON.stringify({
        name: 'purchase',
        url: 'https://' + domain + '/success.html',
        domain,
        props: { kind: order.kind, summary: (order.summary || '').slice(0, 100), subscription: !!order.subscribe },
        revenue: { currency: 'USD', amount: (order.amountTotal / 100).toFixed(2) },
      }),
    });
  } catch (e) { console.warn('plausible event failed:', e.message || e); }
}

async function handleOrder(order) {
  console.log('HAVN ORDER', JSON.stringify(order));
  await trackPurchase(order);
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
    } else if (event.type === 'checkout.session.expired') {
      /* abandoned checkout — if they typed an email before leaving, the owner
         gets the recovery link (deciding whether/how to follow up is a human
         call — see GO_LIVE.md; don't auto-email customers without consent) */
      const session = event.data.object;
      const email = session.customer_details && session.customer_details.email;
      const rec = session.after_expiration && session.after_expiration.recovery && session.after_expiration.recovery.url;
      console.log('HAVN ABANDONED', JSON.stringify({ id: session.id, email: email || null, recovery: rec || null, summary: session.metadata && session.metadata.havn_summary }));
      if (email && rec) {
        await sendEmail({
          to: process.env.OWNER_EMAIL,
          subject: '🛒 Abandoned HAVN checkout — ' + email,
          html: `<p><b>${email}</b> got to checkout but didn’t finish.</p>
                 <p>Cart: ${(session.metadata && session.metadata.havn_summary) || '—'} · $${((session.amount_total || 0) / 100).toFixed(2)}</p>
                 <p>Their checkout can be resumed for 30 days: <a href="${rec}">${rec}</a></p>
                 <p style="color:#777">Manual follow-up only — no marketing consent was collected.</p>`,
        });
      }
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
