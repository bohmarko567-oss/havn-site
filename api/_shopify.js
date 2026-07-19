/* OPTIONAL, UNVALIDATED phase-2 automation: push paid orders into a headless
   Shopify store that has the fulfillment partner's app installed.

   Requirements before enabling:
   - Shopify store (Basic) + partner app installed + products published from the partner dashboard
   - Settings → Checkout → "Automatically fulfill the order's line items"
   - Partner's paid plan + payment method on file
   - Custom app token with read_orders, write_orders, write_customers, read_products
   - Env vars:
       SHOPIFY_STORE_DOMAIN  = yourstore.myshopify.com
       SHOPIFY_ADMIN_TOKEN   = shpat_…
       SHOPIFY_VARIANT_MAP   = rise:gid://shopify/ProductVariant/111,calm:gid://…,rest:gid://…,steady:gid://…
       SHOPIFY_API_VERSION   = a currently supported version (required)
       SHOPIFY_FULFILLMENT_ENABLED = 1 only after the end-to-end test

   This bridge has not been exercised against a live store. Keep it disabled
   until its API version, scopes, variant map, fulfillment handoff, and tracking
   behavior pass an end-to-end test. The webhook emails the owner either way. */

function enabled() {
  return process.env.SHOPIFY_FULFILLMENT_ENABLED === '1' && !!(
    process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN &&
    process.env.SHOPIFY_VARIANT_MAP && process.env.SHOPIFY_API_VERSION
  );
}

function variantMap() {
  const map = {};
  for (const pair of (process.env.SHOPIFY_VARIANT_MAP || '').split(',')) {
    const i = pair.indexOf(':');
    if (i > 0) map[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return map;
}

async function adminGraphql(query, variables) {
  const ver = process.env.SHOPIFY_API_VERSION;
  const res = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${ver}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || (body.errors && body.errors.length) || !body.data) {
    throw new Error('Shopify ' + res.status + ': ' + JSON.stringify(body.errors || body));
  }
  return body.data;
}

/* order: { id, units, customerEmail, customerPhone, shipping:{name,address}, summary } */
async function pushOrder(order) {
  if (!enabled()) return { pushed: false, reason: 'shopify bridge not configured' };
  const sourceIdentifier = String(order.id || '').trim();
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(sourceIdentifier)) {
    throw new Error('invalid Shopify sourceIdentifier');
  }

  /* Stripe can retry webhooks. Shopify's documented source_identifier search
     lets us find an order imported by an earlier delivery before creating a
     second one. sourceIdentifier is also written on every new order below. */
  const existingData = await adminGraphql(`
    query orderBySourceIdentifier($query: String!) {
      orders(first: 1, query: $query) {
        nodes { id name sourceIdentifier }
      }
    }`, { query: 'source_identifier:' + sourceIdentifier });
  const existing = existingData.orders && existingData.orders.nodes && existingData.orders.nodes[0];
  if (existing) return { pushed: true, deduplicated: true, shopifyOrder: existing };

  const vmap = variantMap();
  const lineItems = Object.entries(order.units)
    .filter(([, q]) => q > 0)
    .map(([sku, q]) => {
      if (!vmap[sku]) throw new Error('SHOPIFY_VARIANT_MAP missing sku: ' + sku);
      return { variantId: vmap[sku], quantity: q };
    });
  const a = (order.shipping && order.shipping.address) || {};
  const nameParts = ((order.shipping && order.shipping.name) || order.customerName || 'HAVN Customer').split(' ');
  const shippingAddress = {
    firstName: nameParts[0] || 'HAVN',
    lastName: nameParts.slice(1).join(' ') || 'Customer',
    address1: a.line1 || '', address2: a.line2 || '',
    city: a.city || '', provinceCode: a.state || '', zip: a.postal_code || '',
    countryCode: a.country || 'US',
    phone: order.customerPhone || '',
  };
  const query = `
    mutation orderCreate($order: OrderCreateOrderInput!) {
      orderCreate(order: $order) {
        order { id name }
        userErrors { field message }
      }
    }`;
  const variables = {
    order: {
      lineItems,
      email: order.customerEmail,
      phone: order.customerPhone || null,
      shippingAddress,
      billingAddress: shippingAddress,
      financialStatus: 'PAID',
      sourceIdentifier,
      note: 'HAVN storefront order ' + order.id + ' — ' + (order.summary || ''),
      tags: ['havn-storefront'],
    },
  };
  const data = await adminGraphql(query, variables);
  const result = data.orderCreate;
  const errs = result && result.userErrors;
  if (!result || (errs && errs.length)) {
    return { pushed: false, reason: 'Shopify orderCreate: ' + JSON.stringify(errs || data) };
  }
  return { pushed: true, shopifyOrder: result.order };
}

module.exports = { enabled, pushOrder };
