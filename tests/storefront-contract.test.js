const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const catalog = require('../api/_catalog.js');
const html = fs.readFileSync(path.join(root, 'next.html'), 'utf8');

function cart(singles = {}, trio = 0) {
  return catalog.normalizeCart({ trio, singles });
}

test('one universal $50 pre-discount delivery threshold', () => {
  assert.equal(catalog.FREE_SHIP_CENTS, 5000);
  assert.equal(catalog.qualifiesForFreeShipping(4999), false);
  assert.equal(catalog.qualifiesForFreeShipping(5000), true);
  assert.equal(catalog.shippingCents(cart({ rise: 1 }), true, 1), 695); // $31
  assert.equal(catalog.shippingCents(cart({ rise: 1 }), true, 2), 0);   // $60 delivery
  assert.equal(catalog.shippingCents(cart({ steady: 3 }), true, 1), 695); // $45
  assert.equal(catalog.shippingCents(cart({ steady: 4 }), true, 1), 0);   // $60
  assert.equal(catalog.shippingCents(cart({ steady: 2 }), true, 2), 0);   // $56
  assert.equal(catalog.shippingCents(cart({ steady: 2 }), true, 3), 0);   // $78
  assert.equal(catalog.shippingCents(cart({ steady: 2 }), false, 1), 695); // $36
  assert.equal(catalog.shippingCents(cart({ steady: 3 }), false, 1), 0);   // $54
});

test('state and quantity release gates fail closed', () => {
  assert.deepEqual(catalog.shippingEligibility('AK', cart({ rise: 1 })), { ok: false, reason: 'contiguous_us_only' });
  assert.deepEqual(catalog.shippingEligibility('CA', cart({ rise: 1 })), { ok: false, reason: 'california_label_review' });
  assert.deepEqual(catalog.shippingEligibility('LA', cart({ rise: 1 })), { ok: false, reason: 'louisiana_registration_review' });
  assert.deepEqual(catalog.shippingEligibility('NY', cart({}, 1)), { ok: false, reason: 'steady_unavailable_in_new_york' });
  assert.deepEqual(catalog.shippingEligibility('NY', cart({ rise: 1 })), { ok: true, state: 'NY' });
  assert.equal(catalog.normalizeCart({ trio: 11, singles: {} }).overflow, true);
});

test('server prices and fulfillment preserve the four-piece ritual', () => {
  assert.deepEqual(catalog.TRIO.subPlans, { 1: 9900, 2: 19000, 3: 26400 });
  assert.equal(catalog.subtotalCents(cart({}, 1), true, 3), 26400);
  assert.deepEqual(catalog.fulfillmentUnits(cart({}, 1), 3), {
    rise: 3, calm: 3, rest: 3, steady: 3,
  });
});

test('subscription shipping is recurring and uses the selected cadence', () => {
  const items = catalog.lineItems(cart({ rise: 1 }), true, null, 1);
  const shipping = items.find((item) => item.price_data.product_data.metadata.havn_sku === 'shipping');
  assert.equal(shipping.price_data.unit_amount, 695);
  assert.deepEqual(shipping.price_data.recurring, { interval: 'month', interval_count: 1 });
  assert.equal(catalog.lineItems(cart({ rise: 1 }), true, null, 2).some(
    (item) => item.price_data.product_data.metadata.havn_sku === 'shipping'
  ), false);
});

test('customer-facing source contains requested controls and no retired promises', () => {
  for (const id of ['film-mc-rise', 'film-mc-calm', 'film-mc-rest', 'shippingAmt']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /const FREE_SHIP = 50, SHIPPING = 6\.95/);
  assert.doesNotMatch(html, /\$79|\$28\/mo|1000\s*mg|RITUAL10|third-party tested|FDA-registered|supports memory|blood sugar drops|natural sleep aid/i);
  assert.match(html, /cut_rise\.webp/);
  assert.match(html, /cut_steady\.webp/);
  assert.doesNotMatch(html, /preview_(?:rise|calm|rest|steady|ritual)/i);
  assert.doesNotMatch(html, /<s>[\s\S]*?\$|Free U\.S\. shipping/i);
  assert.match(html, /const API_READY = API_HINT === 'same-origin' \|\| Boolean\(API_BASE\) \|\| LOCAL_API/);
});

test('static HTML ids are unique and inline JavaScript parses', () => {
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual([...new Set(duplicates)], []);

  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/application\/ld\+json/i.test(match[1])) continue;
    const code = /type=["']module["']/i.test(match[1])
      ? match[2].replace(/^\s*import\s+[^;]+;\s*$/gm, '')
      : match[2];
    new vm.Script(code, { filename: 'next.html:inline-script' });
  }
});

test('referenced local assets exist', () => {
  const missing = [];
  for (const match of html.matchAll(/<(?:img|link|script)\b[^>]*(?:src|href)=["']([^"'#?]+)["'][^>]*>/gi)) {
    const ref = match[1];
    if (/^(?:https?:|mailto:|data:)/i.test(ref) || ref === 'policies.html') continue;
    if (!fs.existsSync(path.join(root, ref))) missing.push(ref);
  }
  assert.deepEqual([...new Set(missing)], []);
});
