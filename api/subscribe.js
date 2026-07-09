/* POST /api/subscribe — waitlist / newsletter capture.
   Body: { email, source } — adds to a Resend audience if configured,
   otherwise emails the owner, otherwise 200 no-op (the page also keeps a
   localStorage copy, so nothing is lost while unconfigured). */

const { sendEmail } = require('./_email.js');

async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'POST only' })); }

  let email = '', source = '';
  try { const b = await readJson(req); email = String(b.email || '').trim(); source = String(b.source || 'site'); }
  catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'bad JSON' })); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    res.statusCode = 400; return res.end(JSON.stringify({ error: 'invalid email' }));
  }

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
  if (!stored && process.env.OWNER_EMAIL) {
    const r = await sendEmail({
      to: process.env.OWNER_EMAIL,
      subject: '✉️ HAVN signup: ' + email,
      html: `<p><b>${email}</b> joined via <i>${source}</i>. Add them to your list.</p>`,
    });
    stored = r.sent;
  }
  console.log('HAVN SIGNUP', JSON.stringify({ email, source, stored }));
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ ok: true, stored }));
};
