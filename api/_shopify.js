/* OPTIONAL phase-2 automation: push paid orders into a headless Shopify store
   that has the Supliful app installed — Supliful then auto-fulfills and pushes
   tracking back to Shopify. This is Supliful's officially supported path for
   custom storefronts ("Connect your custom app to Supliful using Shopify Admin
   API", help.supliful.com article 12459926).

   Requirements before enabling (see GO_LIVE.md → "Full automation"):
   - Shopify store (Basic) + Supliful app installed + products published FROM Supliful
   - Settings → Checkout → "Automatically fulfill the order's line items"
   - Supliful Pro plan + payment method on file
   - Custom app token with write_orders, write_customers, read_products
   - Env vars:
       SHOPIFY_STORE_DOMAIN  = yourstore.myshopify.com
       SHOPIFY_ADMIN_TOKEN   = shpat_…
       SHOPIFY_VARIANT_MAP   = rise:gid://shopify/ProductVariant/111,calm:gid://…,rest:gid://…,steady:gid://…
       SHOPIFY_API_VERSION   = 2025-01 (optional)

   ⚠ Pre-built but NOT yet exercised against a live store — run one $ test
   order end-to-end before trusting it (the webhook emails you either way). */

function enabled() {
  return !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_TOKEN && process.env.SHOPIFY_VARIANT_MAP);
}

function variantMap() {
  const map = {};
  for (const pair of (process.env.SHOPIFY_VARIANT_MAP || '').split(',')) {
    const i = pair.indexOf(':');
    if (i > 0) map[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return map;
}

/* order: { id, units, customerEmail, customerPhone, shipping:{name,address}, summary } */
async function pushOrder(order) {
  if (!enabled()) return { pushed: false, reason: 'shopify bridge not configured' };
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
      note: 'HAVN storefront order ' + order.id + ' — ' + (order.summary || ''),
      tags: ['havn-storefront'],
    },
  };
  const ver = process.env.SHOPIFY_API_VERSION || '2025-01';
  const res = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${ver}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  const errs = body.errors || (body.data && body.data.orderCreate && body.data.orderCreate.userErrors);
  if (!res.ok || (errs && errs.length)) {
    return { pushed: false, reason: 'Shopify ' + res.status + ': ' + JSON.stringify(errs || body) };
  }
  return { pushed: true, shopifyOrder: body.data.orderCreate.order };
}

module.exports = { enabled, pushOrder };
