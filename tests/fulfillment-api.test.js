const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

const { ownerOrderEmail, sendEmail } = require('../api/_email.js');
const shopify = require('../api/_shopify.js');
const webhook = require('../api/stripe-webhook.js');

function cleanEnv() {
  for (const key of [
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'OWNER_EMAIL', 'EMAIL_FROM',
    'SHOPIFY_FULFILLMENT_ENABLED', 'SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_TOKEN',
    'SHOPIFY_VARIANT_MAP', 'SHOPIFY_API_VERSION',
  ]) delete process.env[key];
}

function order(overrides = {}) {
  return {
    kind: 'new',
    id: 'cs_test_123',
    amountTotal: 4495,
    summary: '1× Rise | one-time | ship $6.95',
    units: { rise: 1, calm: 1, rest: 1, steady: 1 },
    customerEmail: 'buyer@example.com',
    customerPhone: '+12025550123',
    customerName: 'Test Buyer',
    shipping: {
      name: 'Test Buyer',
      address: { line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' },
    },
    subscribe: false,
    ...overrides,
  };
}

function checkoutSession(metadata) {
  return {
    id: 'cs_test_123',
    object: 'checkout.session',
    mode: 'payment',
    payment_status: 'paid',
    amount_total: 4495,
    payment_intent: 'pi_test_123',
    subscription: null,
    invoice: null,
    metadata,
    customer_details: {
      email: 'buyer@example.com', phone: '+12025550123', name: 'Test Buyer',
      address: { line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' },
    },
    shipping_details: {
      name: 'Test Buyer',
      address: { line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' },
    },
  };
}

function validMetadata(subscribe = false) {
  return {
    havn_cart: JSON.stringify({
      t: 0,
      s: { rise: 1, calm: 0, rest: 0, steady: 0 },
      sub: subscribe,
      m: 1,
    }),
    havn_summary: '1× rise | one-time | ship $6.95',
    havn_declared_state: 'TX',
  };
}

function stripeDouble(session) {
  let current = structuredClone(session);
  let updates = 0;
  return {
    webhooks: { constructEvent: () => ({ type: 'checkout.session.completed', data: { object: structuredClone(session) } }) },
    checkout: {
      sessions: {
        retrieve: async () => structuredClone(current),
        update: async (id, body) => {
          assert.equal(id, current.id);
          current.metadata = { ...(current.metadata || {}), ...(body.metadata || {}) };
          updates++;
          return structuredClone(current);
        },
      },
    },
    get updates() { return updates; },
    get current() { return current; },
  };
}

function stripeInvoiceDouble(invoice) {
  let current = structuredClone(invoice);
  let updates = 0;
  return {
    webhooks: { constructEvent: () => ({ type: 'invoice.paid', data: { object: structuredClone(invoice) } }) },
    invoices: {
      retrieve: async () => structuredClone(current),
      update: async (id, body) => {
        assert.equal(id, current.id);
        current.metadata = { ...(current.metadata || {}), ...(body.metadata || {}) };
        updates++;
        return structuredClone(current);
      },
    },
    subscriptions: { retrieve: async () => ({ id: 'sub_test_123', metadata: validMetadata(true) }) },
    customers: { retrieve: async () => ({ id: 'cus_test_123', shipping: current.customer_shipping }) },
    get updates() { return updates; },
    get current() { return current; },
  };
}

async function invokeWebhook(fakeStripe) {
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'stripe') return () => fakeStripe;
    return originalLoad.call(this, request, parent, isMain);
  };
  const req = {
    method: 'POST',
    headers: { 'stripe-signature': 'test-signature' },
    body: Buffer.from('{}'),
  };
  let response = '';
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    end(value = '') { response = String(value); return value; },
  };
  try {
    await webhook(req, res);
    return { status: res.statusCode, headers, body: response };
  } finally {
    Module._load = originalLoad;
  }
}

function enableEmail() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_local';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local';
  process.env.RESEND_API_KEY = 're_test_local';
  process.env.OWNER_EMAIL = 'owner@example.com';
  process.env.EMAIL_FROM = 'HAVN Orders <orders@example.com>';
}

function enableShopify() {
  process.env.SHOPIFY_FULFILLMENT_ENABLED = '1';
  process.env.SHOPIFY_STORE_DOMAIN = 'example.myshopify.com';
  process.env.SHOPIFY_ADMIN_TOKEN = 'shpat_test';
  process.env.SHOPIFY_API_VERSION = '2026-04';
  process.env.SHOPIFY_VARIANT_MAP = [
    'rise:gid://shopify/ProductVariant/1',
    'calm:gid://shopify/ProductVariant/2',
    'rest:gid://shopify/ProductVariant/3',
    'steady:gid://shopify/ProductVariant/4',
  ].join(',');
}

test('owner picklist marks unsupported partner SKUs as UNKNOWN', () => {
  const html = ownerOrderEmail(order());
  assert.doesNotMatch(html, /RLC3LION|JTP4APLU|JTP0BLDR/);
  assert.equal((html.match(/UNKNOWN/g) || []).length, 3);
  assert.match(html, /VOX4MGNE/);
});

test('Resend receives the deterministic per-email idempotency key', async () => {
  cleanEnv();
  process.env.RESEND_API_KEY = 're_test_local';
  process.env.EMAIL_FROM = 'HAVN Orders <orders@example.com>';
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ id: 'email_123' }) };
  };
  try {
    const result = await sendEmail({
      to: 'owner@example.com', subject: 'Order', html: '<p>Order</p>',
      idempotencyKey: 'havn-owner-order/cs_test_123',
    });
    assert.equal(result.sent, true);
    assert.equal(request.options.headers['Idempotency-Key'], 'havn-owner-order/cs_test_123');
  } finally {
    global.fetch = originalFetch;
    cleanEnv();
  }
});

test('Shopify preflights sourceIdentifier and writes it on a new order', async () => {
  cleanEnv();
  enableShopify();
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) {
      return { ok: true, status: 200, json: async () => ({ data: { orders: { nodes: [] } } }) };
    }
    return {
      ok: true, status: 200,
      json: async () => ({ data: { orderCreate: { order: { id: 'gid://shopify/Order/1', name: '#1001' }, userErrors: [] } } }),
    };
  };
  try {
    const result = await shopify.pushOrder(order({ units: { rise: 0, calm: 0, rest: 1, steady: 0 } }));
    assert.equal(result.pushed, true);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].variables.query, 'source_identifier:cs_test_123');
    assert.equal(requests[1].variables.order.sourceIdentifier, 'cs_test_123');
  } finally {
    global.fetch = originalFetch;
    cleanEnv();
  }
});

test('Shopify returns the existing order instead of creating a duplicate', async () => {
  cleanEnv();
  enableShopify();
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return {
      ok: true, status: 200,
      json: async () => ({ data: { orders: { nodes: [{ id: 'gid://shopify/Order/1', name: '#1001', sourceIdentifier: 'cs_test_123' }] } } }),
    };
  };
  try {
    const result = await shopify.pushOrder(order({ units: { rise: 0, calm: 0, rest: 1, steady: 0 } }));
    assert.equal(result.pushed, true);
    assert.equal(result.deduplicated, true);
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
    cleanEnv();
  }
});

test('new paid order with missing or zero cart metadata fails loudly', async (t) => {
  cleanEnv();
  enableEmail();
  t.mock.method(console, 'error', () => {});
  const originalFetch = global.fetch;
  let emailCalls = 0;
  global.fetch = async () => { emailCalls++; return { ok: true, status: 200, json: async () => ({ id: 'email_123' }) }; };
  try {
    for (const metadata of [
      {},
      { havn_cart: JSON.stringify({ t: 0, s: { rise: 0, calm: 0, rest: 0, steady: 0 }, sub: false, m: 1 }) },
    ]) {
      const stripe = stripeDouble(checkoutSession(metadata));
      const result = await invokeWebhook(stripe);
      assert.equal(result.status, 500);
      assert.equal(stripe.updates, 0);
    }
    assert.equal(emailCalls, 0);
  } finally {
    global.fetch = originalFetch;
    cleanEnv();
  }
});

test('paid order is emailed once and durably marked handled across webhook retries', async (t) => {
  cleanEnv();
  enableEmail();
  t.mock.method(console, 'log', () => {});
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ id: 'email_123' }) };
  };
  try {
    const stripe = stripeDouble(checkoutSession(validMetadata()));
    const first = await invokeWebhook(stripe);
    const second = await invokeWebhook(stripe);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.headers['Idempotency-Key'], 'havn-owner-order/cs_test_123');
    assert.equal(stripe.updates, 1);
    assert.equal(stripe.current.metadata.havn_fulfillment_status, 'handled');
  } finally {
    global.fetch = originalFetch;
    cleanEnv();
  }
});

test('webhook retries when neither email nor Shopify accepted the order', async (t) => {
  cleanEnv();
  enableEmail();
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ message: 'unavailable' }) });
  try {
    const stripe = stripeDouble(checkoutSession(validMetadata()));
    const result = await invokeWebhook(stripe);
    assert.equal(result.status, 500);
    assert.equal(stripe.updates, 0);
  } finally {
    global.fetch = originalFetch;
    cleanEnv();
  }
});

test('subscription renewal is emailed once and durably marked across retries', async (t) => {
  cleanEnv();
  enableEmail();
  t.mock.method(console, 'log', () => {});
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ id: 'email_renewal_123' }) };
  };
  const invoice = {
    id: 'in_test_123',
    object: 'invoice',
    billing_reason: 'subscription_cycle',
    amount_paid: 3795,
    payment_intent: 'pi_test_renewal',
    charge: 'ch_test_renewal',
    subscription: 'sub_test_123',
    customer: 'cus_test_123',
    customer_email: 'buyer@example.com',
    customer_name: 'Test Buyer',
    customer_shipping: {
      name: 'Test Buyer', phone: '+12025550123',
      address: { line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' },
    },
    subscription_details: { metadata: validMetadata(true) },
    metadata: {},
  };
  try {
    const stripe = stripeInvoiceDouble(invoice);
    const first = await invokeWebhook(stripe);
    const second = await invokeWebhook(stripe);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.headers['Idempotency-Key'], 'havn-owner-order/in_test_123');
    assert.equal(stripe.updates, 1);
    assert.equal(stripe.current.metadata.havn_fulfillment_status, 'handled');
  } finally {
    global.fetch = originalFetch;
    cleanEnv();
  }
});
