// The network guard every audit browser context runs: it records (and, with `block`, refuses) any request that
// reaches production, and proves after the fact that the page called no Supabase project but staging.
//
//   import { attachStagingGuard } from './staging-guard.mjs';
//   const guard = attachStagingGuard(context);                 // observe: keeps the HTTP cache (speed measurements)
//   const guard = attachStagingGuard(context, { block: true }); // also aborts production requests (everything else)
//   ... guard.assertClean() before saving any result.
//
// One known exception: course images copied to staging can still point at production's public storage bucket. A
// plain GET of a public object carries no session and changes nothing, so it is recorded as an exception, never as
// a connection.

export const STAGING_REF = 'ybmwektreyrwjscxlogv';
export const PROD_REF = 'qmnssrrolpinvwjjnufo';
export const TEAM_NAME = 'Demo University Golf';
export const DEMO_TEAM_ID = '6ecdd1a6-63fe-4beb-b094-00118f334163';
const PROD_HOSTS = /(^|\.)helmsportslabs\.com$/i;
const REF_RE = /\b([a-z]{20})\.supabase\.(co|in)\b/g;

const isPublicProdAsset = (u, method) =>
  method === 'GET' && u.hostname === `${PROD_REF}.supabase.co` &&
  /^\/storage\/v1\/(object|render\/image)\/public\//.test(u.pathname);

export function attachStagingGuard(context, { block = false } = {}) {
  const hosts = new Set();
  const connections = new Set(); // Supabase projects the app actually called
  const mentions = new Set(); // Supabase projects named in HTML, JS or CSP (the CSP always names production)
  const violations = [];
  const exceptions = [];
  const at = () => new Date().toISOString();
  const classify = (url, method, headers = {}) => {
    let u;
    try { u = new URL(url); } catch { return 'ignore'; }
    if (!/^(https?|wss?):$/.test(u.protocol)) return 'ignore';
    hosts.add(u.host);
    if (isPublicProdAsset(u, method) && !headers.authorization && !headers.apikey) {
      if (exceptions.length < 200) exceptions.push({ url: `${u.origin}${u.pathname}`, at: at() });
      return 'exception';
    }
    for (const m of u.host.matchAll(REF_RE)) connections.add(m[1]);
    if (url.includes(PROD_REF) || PROD_HOSTS.test(u.hostname)) return 'violation';
    return 'ok';
  };
  context.on('request', (r) => {
    if (classify(r.url(), r.method(), r.headers()) === 'violation') violations.push({ url: r.url().split('?')[0], where: 'request', at: at() });
  });
  context.on('websocket', (ws) => {
    if (classify(ws.url(), 'GET') === 'violation') violations.push({ url: ws.url().split('?')[0], where: 'websocket', at: at() });
  });
  context.on('response', async (res) => {
    try {
      const csp = res.headers()['content-security-policy'];
      if (csp) for (const m of csp.matchAll(REF_RE)) mentions.add(m[1]);
      const type = res.request().resourceType();
      if (type !== 'document' && type !== 'script') return;
      for (const m of (await res.text()).matchAll(REF_RE)) mentions.add(m[1]);
    } catch { /* bodies of redirects and aborted requests are unavailable */ }
  });
  if (block) {
    // Routing turns off the HTTP cache in that context, so speed measurements use observe mode.
    context.route((url) => url.href.includes(PROD_REF) || PROD_HOSTS.test(url.hostname), (route) => {
      const r = route.request();
      let u;
      try { u = new URL(r.url()); } catch { return route.abort('blockedbyclient'); }
      if (isPublicProdAsset(u, r.method()) && !r.headers().authorization && !r.headers().apikey) return route.continue();
      violations.push({ url: r.url().split('?')[0], where: 'blocked request', at: at() });
      return route.abort('blockedbyclient');
    });
  }
  return {
    hosts, connections, mentions, violations, exceptions,
    assertClean() {
      if (violations.length) throw new Error(`STAGING GUARD: production contacted (${violations[0].url}). Stop the run and tell Nick.`);
      const other = [...connections].filter((r) => r !== STAGING_REF);
      if (other.length) throw new Error(`STAGING GUARD: another Supabase project called (${other.join(', ')}). Stop the run and tell Nick.`);
    },
  };
}
