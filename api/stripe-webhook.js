/* POST /api/stripe-webhook — Stripe calls this after money moves.
   Every paid order becomes a fulfillment record that is:
     1. logged (Vercel → Deployments → Functions logs; Stripe dashboard is the
        permanent source of truth either way),
     2. emailed to OWNER_EMAIL as a ready-to-ship picklist (Resend),
     3. optionally pushed straight into a headless Shopify store for hands-free
        fulfillment (see api/_shopify.js) — best-effort, never blocks.

   Events handled:
     checkout.session.completed          → first order (one-time or sub month 1)
     invoice.paid (subscription_cycle)   → each renewal = a new shipment

   Signature verification needs the RAW body — bodyParser stays off. */

const { normalizeCart, shippingEligibility, fulfillmentUnits, humanSummary } = require('./_catalog.js');
const { sendEmail, ownerOrderEmail, esc } = require('./_email.js');
const shopify = require('./_shopify.js');

module.exports.config = { api: { bodyParser: false } };

const TERMINAL_FULFILLMENT_STATES = new Set(['handled', 'refunded']);

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
    const cart = normalizeCart({ trio: c.t, singles: c.s });
    if (cart.overflow || cart.count <= 0) return null;
    return { cart, subscribe: !!c.sub, months: [1,2,3].includes(c.m) ? c.m : 1 };
  } catch { return null; }
}

function fulfillmentState(object) {
  return object && object.metadata && object.metadata.havn_fulfillment_status;
}

async function currentStripeObject(stripe, type, object) {
  if (type === 'session') return stripe.checkout.sessions.retrieve(object.id);
  return stripe.invoices.retrieve(object.id);
}

async function markStripeObject(stripe, type, id, status) {
  const metadata = {
    havn_fulfillment_status: status,
    havn_fulfillment_at: new Date().toISOString(),
  };
  if (type === 'session') return stripe.checkout.sessions.update(id, { metadata });
  return stripe.invoices.update(id, { metadata });
}

async function handleOrder(order) {
  console.log('HAVN ORDER', JSON.stringify(order));
  const emailRes = await sendEmail({
    to: process.env.OWNER_EMAIL,
    subject: (order.kind === 'renewal' ? '🔁 HAVN renewal — ship it: ' : '🟠 NEW HAVN ORDER — ship it: ') + (order.summary || order.id),
    html: ownerOrderEmail(order),
    idempotencyKey: 'havn-owner-order/' + order.id,
  });
  if (!emailRes.sent) console.warn('owner email not sent:', emailRes.reason);
  let shopifyRes = { pushed: false, reason: 'shopify bridge disabled' };
  if (shopify.enabled()) {
    try {
      shopifyRes = await shopify.pushOrder(order);
      console.log('shopify bridge:', JSON.stringify(shopifyRes));
      if (!shopifyRes.pushed) console.warn('shopify bridge did not accept order:', shopifyRes.reason);
    } catch (e) {
      console.error('shopify bridge failed (order still emailed/logged):', e.message || e);
    }
  }
  if (!emailRes.sent && !shopifyRes.pushed) {
    throw new Error('no operational fulfillment path accepted order ' + order.id);
  }
  return { email: emailRes, shopify: shopifyRes };
}

/* Hosted Checkout still lets a customer change the address after the on-site
   state pre-check. Revalidate Stripe's final address before fulfillment. If it
   no longer qualifies, stop the subscription and refund the captured payment
   with an idempotency key so webhook retries cannot double-refund. */
async function stopIneligibleOrder(stripe, payment) {
  if (payment.subscription) {
    try { await stripe.subscriptions.cancel(payment.subscription, { prorate: false }); }
    catch (e) { if (e.statusCode !== 404) throw e; }
  }
  let paymentIntent = payment.paymentIntent || null;
  let charge = payment.charge || null;
  if (!paymentIntent && !charge && payment.invoice) {
    const invoice = await stripe.invoices.retrieve(payment.invoice);
    paymentIntent = invoice.payment_intent || null;
    charge = invoice.charge || null;
  }
  const refundArgs = paymentIntent
    ? { payment_intent: typeof paymentIntent === 'string' ? paymentIntent : paymentIntent.id }
    : charge ? { charge: typeof charge === 'string' ? charge : charge.id } : null;
  if (!refundArgs) throw new Error('ineligible order has no refundable payment reference');
  const refund = await stripe.refunds.create(
    { ...refundArgs, reason: 'requested_by_customer', metadata: { havn_reason: payment.reason, havn_order: payment.id } },
    { idempotencyKey: 'havn-ineligible-' + payment.id }
  );
  console.error('HAVN INELIGIBLE REFUNDED', JSON.stringify({ id: payment.id, reason: payment.reason, refund: refund.id }));
  const notice = `<p>Order <b>${esc(payment.id)}</b> was stopped and refunded before fulfillment.</p><p>Reason: <b>${esc(payment.reason)}</b>.</p>`;
  await sendEmail({
    to: process.env.OWNER_EMAIL,
    subject: 'HAVN order stopped and refunded',
    html: notice,
    idempotencyKey: 'havn-owner-refund/' + payment.id,
  });
  if (payment.customerEmail) {
    await sendEmail({
      to: payment.customerEmail,
      subject: 'Your HAVN order was refunded',
      html: `<p>Your HAVN order could not be shipped to the final delivery address. It was stopped before fulfillment and refunded through Stripe.</p><p>Reference: ${esc(payment.id)}</p>`,
      idempotencyKey: 'havn-customer-refund/' + payment.id,
    });
  }
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
      let session = event.data.object;
      session = await currentStripeObject(stripe, 'session', session);
      if (TERMINAL_FULFILLMENT_STATES.has(fulfillmentState(session))) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ received: true, skipped: 'already handled' }));
      }
      if (session.payment_status && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        res.statusCode = 200; return res.end(JSON.stringify({ received: true, skipped: 'not paid yet' }));
      }
      const parsed = cartFromMetadata(session.metadata);
      if (!parsed) throw new Error(`checkout ${session.id}: cart metadata missing, invalid, or empty — do not fulfill blind`);
      if ((session.mode === 'subscription') !== parsed.subscribe) {
        throw new Error(`checkout ${session.id}: cart subscription metadata does not match session mode`);
      }
      const cd = session.customer_details || {};
      const ship = session.shipping_details
        || (session.collected_information && session.collected_information.shipping_details)
        || { name: cd.name, address: cd.address };
      const eligibility = shippingEligibility(ship && ship.address && ship.address.state, parsed.cart);
      if (!eligibility.ok) {
        await stopIneligibleOrder(stripe, {
          id: session.id, reason: eligibility.reason, customerEmail: cd.email,
          paymentIntent: session.payment_intent, invoice: session.invoice, subscription: session.subscription,
        });
        await markStripeObject(stripe, 'session', session.id, 'refunded');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ received: true, refunded: eligibility.reason }));
      }
      await handleOrder({
        kind: 'new',
        id: session.id,
        amountTotal: session.amount_total || 0,
        summary: (session.metadata && session.metadata.havn_summary) || humanSummary(parsed.cart, parsed.subscribe, parsed.months),
        units: fulfillmentUnits(parsed.cart, parsed.months),
        customerEmail: cd.email, customerPhone: cd.phone, customerName: cd.name,
        shipping: ship,
        subscribe: parsed.subscribe,
      });
      await markStripeObject(stripe, 'session', session.id, 'handled');
    } else if (event.type === 'invoice.paid') {
      let invoice = event.data.object;
      invoice = await currentStripeObject(stripe, 'invoice', invoice);
      if (TERMINAL_FULFILLMENT_STATES.has(fulfillmentState(invoice))) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ received: true, skipped: 'already handled' }));
      }
      if (invoice.billing_reason === 'subscription_cycle') {   /* month 2+ — month 1 is covered above */
        let md = (invoice.subscription_details && invoice.subscription_details.metadata) || null;
        if (!md && invoice.subscription) {
          try { md = (await stripe.subscriptions.retrieve(invoice.subscription)).metadata; } catch {}
        }
        /* Never invent a cart for an order that has already been charged. normalizeCart({})
           yields zero of everything, so fulfillmentUnits() returns an all-zero picklist and
           ownerOrderEmail (which filters to q>0) sends a ship-it alert with an EMPTY table —
           the customer pays and receives nothing. Throw instead: the catch below returns 500,
           Stripe retries (transient retrieve() blips resolve on their own), and a persistent
           failure stays loudly visible in the Stripe dashboard instead of shipping an empty box. */
        const parsed = cartFromMetadata(md);
        if (!parsed) throw new Error(`renewal ${invoice.id}: cart metadata unrecoverable — do not ship blind, look this subscription up in Stripe`);
        if (!parsed.subscribe) throw new Error(`renewal ${invoice.id}: cart metadata is not a subscription — do not ship blind`);
        let ship = invoice.customer_shipping || null;
        if (!ship && invoice.customer) {
          try { const cust = await stripe.customers.retrieve(invoice.customer); ship = cust.shipping || null; } catch {}
        }
        const eligibility = shippingEligibility(ship && ship.address && ship.address.state, parsed.cart);
        if (!eligibility.ok) {
          await stopIneligibleOrder(stripe, {
            id: invoice.id, reason: eligibility.reason, customerEmail: invoice.customer_email,
            paymentIntent: invoice.payment_intent, charge: invoice.charge, invoice: invoice.id, subscription: invoice.subscription,
          });
          await markStripeObject(stripe, 'invoice', invoice.id, 'refunded');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ received: true, refunded: eligibility.reason }));
        }
        await handleOrder({
          kind: 'renewal',
          id: invoice.id,
          amountTotal: invoice.amount_paid || 0,
          summary: (md && md.havn_summary) || humanSummary(parsed.cart, true, parsed.months),
          units: fulfillmentUnits(parsed.cart, parsed.months), /* every delivery is the full four */
          customerEmail: invoice.customer_email, customerPhone: (ship && ship.phone) || null, customerName: invoice.customer_name,
          shipping: ship,
          subscribe: true,
        });
        await markStripeObject(stripe, 'invoice', invoice.id, 'handled');
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
