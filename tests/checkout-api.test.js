const assert = require('node:assert/strict');
const test = require('node:test');

const checkout = require('../api/checkout.js');

function request(body, origin = 'https://bohmarko567-oss.github.io') {
  return { method: 'POST', headers: { origin }, body };
}

async function invoke(body, origin) {
  const headers = {};
  let response = '';
  const res = {
    statusCode: 200,
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    end(value = '') { response = String(value); return value; },
  };
  await checkout(request(body, origin), res);
  return { status: res.statusCode, headers, body: response ? JSON.parse(response) : null };
}

function cleanProductionEnv() {
  for (const key of ['NODE_ENV','VERCEL_ENV','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','SITE_URL','RESEND_API_KEY','OWNER_EMAIL','EMAIL_FROM','LAUNCH_ENABLED','STRIPE_TAX','LABEL_COMPLIANCE_CONFIRMED','CLAIMS_COMPLIANCE_CONFIRMED','BUSINESS_IDENTITY_CONFIRMED','SAE_CONTACT_CONFIRMED','CANCELLATION_OPERATIONS_CONFIRMED','GUARANTEE_OPERATIONS_CONFIRMED','ABUSE_CONTROLS_CONFIRMED','INVENTORY_AVAILABILITY_CONFIRMED']) {
    delete process.env[key];
  }
}

test('local demo includes known shipping and returns to the GitHub project path', async () => {
  cleanProductionEnv();
  const result = await invoke({
    cart: { trio: 0, singles: { rise: 1 } }, subscribe: true, months: 1, shippingState: 'TX',
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.demo, true);
  assert.match(result.body.url, /^https:\/\/bohmarko567-oss\.github\.io\/havn-site\/success\.html\?/);
  assert.match(result.body.url, /total=3795/); // $31 product + $6.95 shipping
});

test('a multi-month delivery above $50 receives free shipping in demo math', async () => {
  cleanProductionEnv();
  const result = await invoke({
    cart: { trio: 0, singles: { rise: 1 } }, subscribe: true, months: 2, shippingState: 'TX',
  });
  assert.equal(result.status, 200);
  assert.match(result.body.url, /total=6000/);
});

test('unsupported states and quantity overflow cannot create a session', async () => {
  cleanProductionEnv();
  const blocked = await invoke({
    cart: { trio: 0, singles: { rise: 1 } }, subscribe: false, shippingState: 'AK',
  });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.error, 'contiguous_us_only');

  const louisiana = await invoke({
    cart: { trio: 0, singles: { rise: 1 } }, subscribe: false, shippingState: 'LA',
  });
  assert.equal(louisiana.status, 422);
  assert.equal(louisiana.body.error, 'louisiana_registration_review');

  const overflow = await invoke({
    cart: { trio: 11, singles: {} }, subscribe: false, shippingState: 'TX',
  });
  assert.equal(overflow.status, 400);
  assert.equal(overflow.body.error, 'cart_limit');
});

test('production cannot silently become demo checkout', async () => {
  cleanProductionEnv();
  process.env.NODE_ENV = 'production';
  const result = await invoke({
    cart: { trio: 0, singles: { rise: 1 } }, subscribe: false, shippingState: 'TX',
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'production_config_incomplete');
  cleanProductionEnv();
});
