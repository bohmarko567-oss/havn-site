/* Owner + customer email via Resend (https://resend.com) — plain fetch, no SDK.
   Free tier (100/day) is plenty at launch. Without a verified domain, Resend
   only delivers from onboarding@resend.dev TO the account owner's address —
   which is exactly what the new-order alerts need. Verify a domain later to
   email customers (see GO_LIVE.md). */

async function sendEmail({ to, subject, html, from }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return { sent: false, reason: !key ? 'RESEND_API_KEY not set' : 'no recipient' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
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
      const code = { rise: 'RLC3LION', calm: 'JTP4APLU', rest: 'VOX4MGNE', steady: 'JTP0BLDR' }[sku] || '';
      return `<tr><td style="padding:6px 12px;border:1px solid #ddd"><b>${q}×</b></td>
        <td style="padding:6px 12px;border:1px solid #ddd">${sku.toUpperCase()}</td>
        <td style="padding:6px 12px;border:1px solid #ddd;font-family:monospace">${code}</td></tr>`;
    })
    .join('');
  const addr = [shipName, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(', '), a.country]
    .filter(Boolean).join('<br>');
  const akHi = ['AK', 'HI'].includes(String(a.state || '').toUpperCase())
    ? `<p style="background:#FDE8E8;border:1px solid #E03131;border-radius:8px;padding:10px 12px;color:#8A0E0E">
       ⚠ <b>Alaska/Hawaii address — the fulfillment partner can't ship there.</b> Refund this order in Stripe and email the customer an apology (the AK/HI exclusion is already in the shipping policy).</p>`
    : '';
  return `${akHi}
  <div style="font-family:Arial,sans-serif;max-width:620px">
    <h2 style="margin:0 0 4px">${order.kind === 'renewal' ? '🔁 Subscription renewal' : '🟠 New HAVN order'} — ship it</h2>
    <p style="color:#555;margin:4px 0 14px">${order.summary || ''} · paid <b>$${(order.amountTotal / 100).toFixed(2)}</b> · ${order.id}</p>
    <h3 style="margin:14px 0 6px">1 · What to ship (fulfillment dashboard → Orders → “Order products”)</h3>
    <table style="border-collapse:collapse">${rows}</table>
    <h3 style="margin:16px 0 6px">2 · Ship to</h3>
    <p style="line-height:1.5;margin:0">${addr || '⚠ no address captured — check Stripe dashboard'}</p>
    <p style="margin:6px 0 0;color:#555">📧 ${order.customerEmail || '—'} · 📞 ${order.customerPhone || '—'}</p>
    <h3 style="margin:16px 0 6px">3 · Done</h3>
    <p style="margin:0;color:#555">Place the manual order, pay wholesale, and when the tracking email arrives, forward it to the customer. Full runbook: GO_LIVE.md → “Per-order fulfillment”.</p>
    <p style="margin:14px 0 0">${process.env.FULFILL_DASH_URL ? `<a href="${process.env.FULFILL_DASH_URL}" style="background:#FF6A15;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Open fulfillment orders →</a>&nbsp;` : ''}<a href="https://dashboard.stripe.com/payments" style="color:#555">Stripe payment ↗</a></p>
  </div>`;
}

module.exports = { sendEmail, ownerOrderEmail };
