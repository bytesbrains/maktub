#!/usr/bin/env node
/**
 * test-infrastructure.js
 * Comprehensive HTTP/TLS/content checks against all three production URLs
 * for Maktub Protocol.
 *
 *   - HTTP 200 on root + SPA routes
 *   - TLS version + certificate
 *   - HTML/asset hash parity across mirrors
 *   - Meta tags (title, description, og, twitter)
 *   - Static asset availability (JS/CSS/logo/manifest/favicon)
 *   - Security headers
 *   - Contract addresses embedded in JS bundle
 *   - 404 / random URL handling (SPA fallback)
 *   - Response-time probe
 *
 * Run:   node test/production/test-infrastructure.js
 */

const https = require('node:https');
const crypto = require('node:crypto');
const tls = require('node:tls');

// One agent per run — Cloudflare keep-alive reuse was triggering
// MaxListenersExceededWarning under repeated requests.
const agent = new https.Agent({ keepAlive: true, maxSockets: 4 });
agent.setMaxListeners(100);

const URLS = [
  'https://maktub.it',
  'https://www.maktub.it',
  'https://maktub.pages.dev',
];

const SPA_ROUTES = ['/', '/dashboard', '/new', '/register', '/inbox', '/executor', '/about'];

const EXPECTED_CONTRACTS = {
  MaktubCore: '0x46f491eD5A82dA53Eb077aE35C4C5ed328864331',
  RecipientRegistry: '0xfF66eEbFCf0C27f682B84500731752AaCAc7BBc9',
  MktbToken: '0x068d9176514C868d8fB43CE84A775b63cf223C5D',
  ExecutorRewards: '0x468B52a4EEDD17E4304Db2bbD8bEF740A11013Ba',
  MktbGovernance: '0xc60EAF688ADf6Cf9b0512De5d06f7341F1993Ddc',
  TimelockController: '0x268602317bF433A88a2cB93e06E458DC4fFC46b9',
};

const results = [];
function record(name, status, detail = '', severity = '') {
  results.push({ name, status, detail, severity });
  const icon = status === 'PASS' ? '[PASS]' : status === 'FAIL' ? '[FAIL]' : '[WARN]';
  const sev = severity ? ` (${severity})` : '';
  console.log(`${icon} ${name}${sev}${detail ? ' — ' + detail : ''}`);
}

function fetch(urlStr, { method = 'GET', captureBody = true } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const start = Date.now();
    let tlsProtocol = null;
    let tlsCipher = null;
    let peerCert = null;
    const req = https.request(
      {
        method,
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        headers: {
          'User-Agent': 'Maktub-QA/1.0 (production test)',
          Accept: '*/*',
        },
        minVersion: 'TLSv1.2',
        servername: u.hostname,
        agent,
      },
      (res) => {
        // Socket is alive here — capture TLS info before it may close.
        const socket = res.socket;
        if (socket && typeof socket.getProtocol === 'function') {
          tlsProtocol = socket.getProtocol();
          tlsCipher = socket.getCipher();
          peerCert = socket.getPeerCertificate();
        }
        const chunks = [];
        res.on('data', (c) => captureBody && chunks.push(c));
        res.on('end', () => {
          const body = captureBody ? Buffer.concat(chunks) : Buffer.alloc(0);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
            ms: Date.now() - start,
            tlsProtocol,
            tlsCipher,
            peerCert,
          });
        });
      }
    );
    req.once('socket', (sock) => {
      // Reused keep-alive socket: TLS already established, grab immediately.
      if (sock.getProtocol && sock.getProtocol()) {
        tlsProtocol = sock.getProtocol();
        tlsCipher = sock.getCipher();
        peerCert = sock.getPeerCertificate();
      } else {
        sock.once('secureConnect', () => {
          tlsProtocol = sock.getProtocol();
          tlsCipher = sock.getCipher();
          peerCert = sock.getPeerCertificate();
        });
      }
    });
    req.on('error', reject);
    req.setTimeout(20_000, () => {
      req.destroy(new Error('timeout'));
    });
    req.end();
  });
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseMeta(html) {
  const out = {};
  const title = html.match(/<title>([^<]*)<\/title>/i);
  if (title) out.title = title[1];
  const getMeta = (name) => {
    const re = new RegExp(`<meta[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
    const m = html.match(re);
    return m ? m[1] : null;
  };
  out.description = getMeta('description');
  out.ogTitle = getMeta('og:title');
  out.ogDescription = getMeta('og:description');
  out.ogImage = getMeta('og:image');
  out.ogType = getMeta('og:type');
  out.twitterCard = getMeta('twitter:card');
  out.twitterImage = getMeta('twitter:image');
  // asset refs
  const scripts = [...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1]);
  const styles = [...html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const icons = [...html.matchAll(/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const manifest = html.match(/<link[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["']/i);
  out.scripts = scripts;
  out.styles = styles;
  out.icons = icons;
  out.manifest = manifest ? manifest[1] : null;
  return out;
}

async function main() {
  console.log('\n=== Maktub Production Infrastructure Tests ===\n');
  console.log(`Date: ${new Date().toISOString()}\n`);

  const perUrl = {};

  // ---------- 1. Root fetch + TLS + headers ----------
  console.log('--- 1. Root fetch / TLS / headers ---');
  for (const url of URLS) {
    try {
      const res = await fetch(url);
      perUrl[url] = res;
      if (res.status === 200) {
        record(`${url} root returns 200`, 'PASS', `${res.ms}ms`);
      } else {
        record(`${url} root returns 200`, 'FAIL', `status=${res.status}`, 'CRITICAL');
      }

      // TLS
      if (res.tlsProtocol === 'TLSv1.3') {
        record(`${url} using TLS 1.3`, 'PASS', `cipher=${res.tlsCipher && res.tlsCipher.name}`);
      } else {
        record(`${url} using TLS 1.3`, 'WARN', `negotiated=${res.tlsProtocol}`, 'LOW');
      }

      // Cert validity
      if (res.peerCert && res.peerCert.valid_to) {
        const exp = new Date(res.peerCert.valid_to);
        const daysLeft = Math.round((exp - Date.now()) / 86_400_000);
        if (daysLeft > 7) {
          record(`${url} TLS cert valid`, 'PASS', `expires ${exp.toISOString().slice(0, 10)} (${daysLeft}d)`);
        } else {
          record(`${url} TLS cert valid`, 'WARN', `expires in ${daysLeft}d`, 'HIGH');
        }
      }

      // Security headers
      const sec = {
        'strict-transport-security': res.headers['strict-transport-security'],
        'x-content-type-options': res.headers['x-content-type-options'],
        'x-frame-options': res.headers['x-frame-options'],
        'content-security-policy': res.headers['content-security-policy'],
        'referrer-policy': res.headers['referrer-policy'],
        'permissions-policy': res.headers['permissions-policy'],
      };
      const present = Object.entries(sec).filter(([, v]) => !!v).map(([k]) => k);
      const missing = Object.entries(sec).filter(([, v]) => !v).map(([k]) => k);
      record(`${url} security headers present`, 'PASS', `[${present.join(', ')}]`);
      if (missing.length > 0) {
        record(
          `${url} security headers missing`,
          'WARN',
          `missing: ${missing.join(', ')}`,
          missing.includes('strict-transport-security') ? 'MEDIUM' : 'LOW'
        );
      }
      record(`${url} served by`, 'PASS', `server=${res.headers['server']}, cf-ray=${res.headers['cf-ray'] || 'n/a'}`);
    } catch (err) {
      record(`${url} root fetch`, 'FAIL', err.message, 'CRITICAL');
    }
  }

  // ---------- 2. HTML parity ----------
  console.log('\n--- 2. Content / HTML parity ---');
  const hashes = {};
  for (const url of URLS) {
    const res = perUrl[url];
    if (!res || res.status !== 200) continue;
    hashes[url] = sha256(res.body);
  }
  const uniqueHashes = new Set(Object.values(hashes));
  if (uniqueHashes.size === 1) {
    record('All three mirrors serve identical HTML', 'PASS', `sha256=${[...uniqueHashes][0].slice(0, 12)}…`);
  } else {
    record('HTML parity across mirrors', 'FAIL', `distinct hashes=${uniqueHashes.size}; ${JSON.stringify(hashes, null, 2)}`, 'HIGH');
  }

  // Meta parsing (use first 200 response)
  const okUrl = URLS.find((u) => perUrl[u] && perUrl[u].status === 200);
  if (!okUrl) {
    record('Meta tag parsing', 'FAIL', 'no 200 response to parse', 'CRITICAL');
  } else {
    const html = perUrl[okUrl].body.toString('utf8');
    const meta = parseMeta(html);

    const metaChecks = [
      ['<title> present', meta.title && meta.title.toLowerCase().includes('maktub'), `title="${meta.title}"`],
      ['meta description', meta.description && meta.description.length > 10, `description="${meta.description}"`],
      ['og:type', meta.ogType === 'website', `og:type=${meta.ogType}`],
      ['og:title', !!meta.ogTitle, `og:title="${meta.ogTitle}"`],
      ['og:description', !!meta.ogDescription, `og:description="${meta.ogDescription}"`],
      ['og:image', meta.ogImage && meta.ogImage.includes('logo.png'), `og:image=${meta.ogImage}`],
      ['twitter:card', meta.twitterCard === 'summary_large_image', `twitter:card=${meta.twitterCard}`],
      ['twitter:image', !!meta.twitterImage, `twitter:image=${meta.twitterImage}`],
      ['manifest link', meta.manifest === '/manifest.json', `manifest=${meta.manifest}`],
      ['favicon link', meta.icons.some((i) => i.includes('logo.png')), `icons=${meta.icons.join(',')}`],
      ['>=1 JS bundle', meta.scripts.length > 0, `scripts=${meta.scripts.join(',')}`],
      ['>=1 CSS bundle', meta.styles.length > 0, `styles=${meta.styles.join(',')}`],
    ];
    for (const [name, ok, detail] of metaChecks) {
      record(name, ok ? 'PASS' : 'FAIL', detail, ok ? '' : 'MEDIUM');
    }

    // ---------- 3. Asset fetch + parity ----------
    console.log('\n--- 3. Static asset checks ---');
    const assetPaths = [
      ...meta.scripts,
      ...meta.styles,
      '/logo.png',
      '/manifest.json',
      ...(meta.ogImage ? [meta.ogImage] : []),
    ];
    const uniqueAssets = [...new Set(assetPaths.filter((p) => p && p.startsWith('/')))];

    for (const path of uniqueAssets) {
      const assetHashes = {};
      for (const url of URLS) {
        try {
          const r = await fetch(url + path);
          if (r.status === 200) {
            assetHashes[url] = sha256(r.body);
            record(`${path} on ${new URL(url).hostname}`, 'PASS', `${r.body.length}B ${r.ms}ms`);
          } else {
            record(`${path} on ${new URL(url).hostname}`, 'FAIL', `status=${r.status}`, 'HIGH');
          }
        } catch (err) {
          record(`${path} on ${new URL(url).hostname}`, 'FAIL', err.message, 'HIGH');
        }
      }
      const uniq = new Set(Object.values(assetHashes));
      if (Object.keys(assetHashes).length > 1) {
        record(
          `${path} byte-identical across mirrors`,
          uniq.size === 1 ? 'PASS' : 'FAIL',
          uniq.size === 1 ? `sha256=${[...uniq][0].slice(0, 12)}…` : JSON.stringify(assetHashes),
          uniq.size === 1 ? '' : 'HIGH'
        );
      }
    }

    // ---------- 4. Contract addresses embedded in JS ----------
    console.log('\n--- 4. Contract addresses in JS bundle ---');
    const jsPath = meta.scripts.find((s) => s.endsWith('.js'));
    if (!jsPath) {
      record('Find JS bundle', 'FAIL', 'no .js script tag found', 'HIGH');
    } else {
      const jsRes = await fetch(okUrl + jsPath);
      if (jsRes.status !== 200) {
        record('Fetch JS bundle', 'FAIL', `status=${jsRes.status}`, 'HIGH');
      } else {
        const js = jsRes.body.toString('utf8');
        record('JS bundle size', 'PASS', `${(js.length / 1024).toFixed(1)} KB`);
        for (const [name, addr] of Object.entries(EXPECTED_CONTRACTS)) {
          const ok = js.toLowerCase().includes(addr.toLowerCase());
          record(
            `JS embeds ${name} (${addr})`,
            ok ? 'PASS' : 'FAIL',
            '',
            ok ? '' : 'CRITICAL'
          );
        }
        const chainIdOk = js.includes('84532') || js.includes('0x14a34');
        record('JS embeds Base Sepolia chain id', chainIdOk ? 'PASS' : 'FAIL', '', chainIdOk ? '' : 'HIGH');
        const feeOk = js.includes('124000000000000');
        record('JS embeds creation fee (0.000124 ETH)', feeOk ? 'PASS' : 'WARN', '', feeOk ? '' : 'LOW');
      }
    }
  }

  // ---------- 5. SPA routing ----------
  console.log('\n--- 5. SPA direct-route fallback ---');
  for (const url of URLS) {
    for (const route of SPA_ROUTES) {
      try {
        const r = await fetch(url + route);
        const ok = r.status === 200;
        const html = r.body.toString('utf8');
        const isApp = html.includes('<div id="root"') && html.toLowerCase().includes('maktub');
        if (ok && isApp) {
          record(`SPA route ${route} on ${new URL(url).hostname}`, 'PASS', `${r.ms}ms`);
        } else if (ok && !isApp) {
          record(`SPA route ${route} on ${new URL(url).hostname}`, 'FAIL', 'served HTML but not app shell', 'HIGH');
        } else {
          record(`SPA route ${route} on ${new URL(url).hostname}`, 'FAIL', `status=${r.status}`, 'HIGH');
        }
      } catch (err) {
        record(`SPA route ${route} on ${new URL(url).hostname}`, 'FAIL', err.message, 'HIGH');
      }
    }
  }

  // ---------- 6. 404 / random URL behavior ----------
  console.log('\n--- 6. Random-URL / 404 behavior ---');
  for (const url of URLS) {
    try {
      const r = await fetch(url + '/foo/bar/does-not-exist-' + Date.now());
      const html = r.body.toString('utf8');
      const servesApp = html.includes('<div id="root"') && html.toLowerCase().includes('maktub');
      if (r.status === 200 && servesApp) {
        record(`Random URL SPA-fallback on ${new URL(url).hostname}`, 'PASS', 'serves app shell, React handles 404');
      } else if (r.status === 404 && servesApp) {
        record(`Random URL SPA-fallback on ${new URL(url).hostname}`, 'PASS', '404 + app shell (Cloudflare Pages style)');
      } else if (r.status === 404) {
        record(`Random URL SPA-fallback on ${new URL(url).hostname}`, 'WARN', 'hard 404, no app shell — direct links to SPA routes may break', 'MEDIUM');
      } else {
        record(`Random URL SPA-fallback on ${new URL(url).hostname}`, 'WARN', `status=${r.status}`, 'LOW');
      }
    } catch (err) {
      record(`Random URL on ${new URL(url).hostname}`, 'FAIL', err.message, 'MEDIUM');
    }
  }

  // ---------- 7. Response time probe ----------
  console.log('\n--- 7. Response time probe ---');
  for (const url of URLS) {
    const samples = [];
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url + '/manifest.json');
        samples.push(r.ms);
      } catch (err) {
        samples.push(-1);
      }
    }
    const good = samples.filter((s) => s > 0);
    if (good.length === 0) {
      record(`${url} response time`, 'FAIL', 'all samples failed', 'HIGH');
    } else {
      const avg = Math.round(good.reduce((a, b) => a + b, 0) / good.length);
      record(`${url} response time (manifest, x3)`, avg < 1500 ? 'PASS' : 'WARN', `samples=${samples.join(',')}ms avg=${avg}ms`, avg < 1500 ? '' : 'LOW');
    }
  }

  // ---------- Summary ----------
  console.log('\n=== Summary ===');
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  console.log(`PASS: ${pass}   FAIL: ${fail}   WARN: ${warn}   TOTAL: ${results.length}`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      console.log(`  [${r.severity || '?'}] ${r.name} — ${r.detail}`);
    }
  }
  if (warn > 0) {
    console.log('\nWarnings:');
    for (const r of results.filter((x) => x.status === 'WARN')) {
      console.log(`  [${r.severity || '?'}] ${r.name} — ${r.detail}`);
    }
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(2);
});
