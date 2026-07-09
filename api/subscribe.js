/* POST /api/subscribe — email capture + unique welcome codes.
   Body: { email, source, promo:true? }

   promo:true → mints a UNIQUE 15%-off code for this signup:
   single-use (max_redemptions 1), first order only, expires in 30 days,
   branded HAVN15-XXXX. Real Stripe promotion code when STRIPE_SECRET_KEY is
   set; HAVN15-DEMO in demo mode. The code is returned to the page instantly
   (shown on screen), so it works even before customer emails are possible. */

const { sendEmail } = require('./_email.js');

const COUPON_ID = 'HAVN15';           /* the shared 15% coupon behind every unique code */
const CODE_TTL_DAYS = 30;

async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function suffix(n) { /* unambiguous A-Z/2-9, no 0/O/1/I */
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

async function mintUniqueCode(stripe, email, source) {
  try { await stripe.coupons.retrieve(COUPON_ID); }
  catch {
    await stripe.coupons.create({
      id: COUPON_ID, percent_off: 15, duration: 'once', name: 'HAVN welcome 15%',
    }).catch(async (e) => {
      /* lost a create race or transient — one re-check before giving up */
      try { await stripe.coupons.retrieve(COUPON_ID); } catch { throw e; }
    });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = 'HAVN15-' + suffix(4);
    try {
      const pc = await stripe.promotionCodes.create({
        coupon: COUPON_ID,
        code,
        max_redemptions: 1,
        expires_at: Math.floor(Date.now() / 1000) + CODE_TTL_DAYS * 86400,
        restrictions: { first_time_transaction: true },
        metadata: { email, source },
      });
      return pc.code;
    } catch (e) {
      if (attempt === 2) throw e;   /* collision or transient — retry with a new suffix */
    }
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'POST only' })); }

  let email = '', source = '', promo = false;
  try {
    const b = await readJson(req);
    email = String(b.email || '').trim();
    source = String(b.source || 'site').slice(0, 40);
    promo = !!b.promo;
  } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'bad JSON' })); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    res.statusCode = 400; return res.end(JSON.stringify({ error: 'invalid email' }));
  }

  /* 1 · unique code (when asked for one) */
  let code = null, demo = false;
  if (promo) {
    if (!process.env.STRIPE_SECRET_KEY) { code = 'HAVN15-DEMO'; demo = true; }
    else {
      try { code = await mintUniqueCode(require('stripe')(process.env.STRIPE_SECRET_KEY), email, source); }
      catch (e) { console.error('promo code mint failed:', e.message || e); } /* page shows graceful copy */
    }
  }

  /* 2 · store the contact (Resend audience if configured) */
  let stored = false;
  const key = process.env.RESEND_API_KEY, aud = process.env.RESEND_AUDIENCE_ID;
  if (key && aud) {
    try {
      const r = await fetch(`https://api.resend.com/audiences/${aud}/contacts`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
      stored = r.ok;
    } catch {}
  }

  /* 3 · tell the owner */
  if (process.env.OWNER_EMAIL && process.env.RESEND_API_KEY) {
    await sendEmail({
      to: process.env.OWNER_EMAIL,
      subject: (promo ? '🎟️ HAVN promo signup: ' : '✉️ HAVN signup: ') + email,
      html: `<p><b>${email}</b> via <i>${source}</i>${code ? ` — code <b>${code}</b> (single-use, first order, ${CODE_TTL_DAYS}d)` : ''}.</p>`,
    });
  }

  console.log('HAVN SIGNUP', JSON.stringify({ email, source, promo, code, stored }));
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ ok: true, stored, code, demo }));
};
