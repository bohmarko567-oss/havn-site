/* Local dev server — mirrors the Vercel setup: static files from this folder
   + the /api functions. No dependencies. Run:  node server.local.js
   (or `npm run dev`), then open http://localhost:8123
   Loads .env if present so you can test with real Stripe TEST keys. */

const http = require('http');
const fs = require('fs');
const path = require('path');

/* tiny .env loader (no dotenv dep) */
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  console.log('loaded .env');
} catch {}

const API = {
  '/api/checkout': require('./api/checkout.js'),
  '/api/stripe-webhook': require('./api/stripe-webhook.js'),
  '/api/subscribe': require('./api/subscribe.js'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname.replace(/\/$/, '') || '/';

  if (API[route]) {
    try { return await API[route](req, res); }
    catch (e) {
      console.error(e);
      res.statusCode = 500; return res.end('api error: ' + e.message);
    }
  }

  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (!path.extname(p)) p += '.html';                 /* cleanUrls, like Vercel */
  const file = path.join(__dirname, p);
  if (!file.startsWith(__dirname)) { res.statusCode = 403; return res.end('nope'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('404'); }
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  });
});

const PORT = process.env.PORT || 8123;
server.listen(PORT, () => {
  console.log(`HAVN local → http://localhost:${PORT}`);
  console.log(`checkout mode: ${process.env.STRIPE_SECRET_KEY ? 'LIVE (key set)' : 'DEMO (no STRIPE_SECRET_KEY)'}`);
});
