/* Owner + customer email via Resend (https://resend.com) — plain fetch, no SDK.
   Production release requires a verified sender and successful test deliveries
   to both the owner and a customer address. */

/* HTML-escape anything customer-typed before it lands in an owner email —
   name/address/email fields are attacker-controlled input like any other. */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendEmail({ to, subject, html, from, idempotencyKey }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return { sent: false, reason: !key ? 'RESEND_API_KEY not set' : 'no recipient' };
  const requestHeaders = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  if (idempotencyKey != null) {
    const value = String(idempotencyKey).trim();
    if (!value || value.length > 256) return { sent: false, reason: 'invalid Resend idempotency key' };
    requestHeaders['Idempotency-Key'] = value;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        from: from || process.env.EMAIL_FROM || 'HAVN Orders <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { sent: false, reason: 'Resend ' + res.status + ': ' + JSON.stringify(body) };
    return { sent: true, id: body.id };
  } catch (e) {
    return { sent: false, reason: String(e) };
  }
}

/* The fulfillment alert the owner acts on — everything needed to place the
   manual fulfillment order (Orders → "Order products") without opening Stripe. */
function ownerOrderEmail(order) {
  const a = order.shipping && order.shipping.address ? order.shipping.address : {};
  const shipName = (order.shipping && order.shipping.name) || order.customerName || '';
  const rows = Object.entries(order.units || {})
    .filter(([, q]) => q > 0)
    .map(([sku, q]) => {
      /* Only Rest has a source-backed fulfillment SKU in the 2026-07-15 local
         audit. Never turn unverified historical codes into a ship instruction. */
      const code = { rest: 'VOX4MGNE' }[sku] || 'UNKNOWN — verify in fulfillment dashboard';
      return `<tr><td style="padding:6px 12px;border:1px solid #ddd"><b>${q}×</b></td>
        <td style="padding:6px 12px;border:1px solid #ddd">${sku.toUpperCase()}</td>
        <td style="padding:6px 12px;border:1px solid #ddd;font-family:monospace">${code}</td></tr>`;
    })
    .join('');
  const addr = [shipName, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(', '), a.country]
    .filter(Boolean).map(esc).join('<br>');
  return `<div style="font-family:Arial,sans-serif;max-width:620px">
    <h2 style="margin:0 0 4px">${order.kind === 'renewal' ? '🔁 Subscription renewal' : '🟠 New HAVN order'} — ship it</h2>
    <p style="color:#555;margin:4px 0 14px">${esc(order.summary || '')} · paid <b>$${(order.amountTotal / 100).toFixed(2)}</b> · ${esc(order.id)}</p>
    <h3 style="margin:14px 0 6px">1 · What to ship (fulfillment dashboard → Orders → “Order products”)</h3>
    <table style="border-collapse:collapse">${rows}</table>
    <h3 style="margin:16px 0 6px">2 · Ship to</h3>
    <p style="line-height:1.5;margin:0">${addr || '⚠ no address captured — check Stripe dashboard'}</p>
    <p style="margin:6px 0 0;color:#555">📧 ${esc(order.customerEmail || '—')} · 📞 ${esc(order.customerPhone || '—')}</p>
    <h3 style="margin:16px 0 6px">3 · Done</h3>
    <p style="margin:0;color:#555">Complete fulfillment through the configured partner workflow. Send confirmed carrier and tracking details to the customer; do not mark the order shipped before the partner accepts it.</p>
    <p style="margin:14px 0 0">${process.env.FULFILL_DASH_URL ? `<a href="${process.env.FULFILL_DASH_URL}" style="background:#FF6A15;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Open fulfillment orders →</a>&nbsp;` : ''}<a href="https://dashboard.stripe.com/payments" style="color:#555">Stripe payment ↗</a></p>
  </div>`;
}

module.exports = { sendEmail, ownerOrderEmail, esc };
