const assert = require('node:assert/strict');
const test = require('node:test');

const subscribe = require('../api/subscribe.js');

async function invoke(body, ip = '127.0.0.1') {
  const headers = {};
  let response = '';
  const req = {
    method: 'POST',
    headers: { origin: 'http://localhost:8123', 'x-forwarded-for': ip },
    socket: { remoteAddress: ip },
    body,
  };
  const res = {
    statusCode: 200,
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    end(value = '') { response = String(value); return value; },
  };
  await subscribe(req, res);
  return { status: res.statusCode, headers, body: response ? JSON.parse(response) : null };
}

function cleanEnv() {
  for (const key of ['NODE_ENV', 'VERCEL_ENV', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY',
    'RESEND_AUDIENCE_ID', 'OWNER_EMAIL', 'SITE_URL']) delete process.env[key];
}

test('requesting a demo promo does not imply marketing consent', async () => {
  cleanEnv();
  process.env.RESEND_API_KEY = 'test-key';
  process.env.RESEND_AUDIENCE_ID = 'test-audience';
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => ({}) }; };
  try {
    const result = await invoke({ email: 'buyer@example.com', source: 'promo', promo: true }, '127.0.0.2');
    assert.equal(result.status, 200);
    assert.equal(result.body.code, 'HAVN10-DEMO');
    assert.equal(result.body.stored, false);
    assert.equal(calls, 0);
  } finally {
    global.fetch = originalFetch;
    cleanEnv();
  }
});

test('separate affirmative consent stores the contact', async () => {
  cleanEnv();
  process.env.RESEND_API_KEY = 'test-key';
  process.env.RESEND_AUDIENCE_ID = 'test-audience';
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({}) };
  };
  try {
    const result = await invoke({
      email: 'opted-in@example.com', source: 'footer', promo: false, marketingConsent: true,
    }, '127.0.0.3');
    assert.equal(result.status, 200);
    assert.equal(result.body.stored, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/audiences\/test-audience\/contacts$/);
  } finally {
    global.fetch = originalFetch;
    cleanEnv();
  }
});
