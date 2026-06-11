/**
 * Pre-campaign CDN edge warm-up + go/no-go check.
 *
 * WHY: a production deploy that lands during a send leaves the Vercel CDN edge
 * briefly cold. Under a sudden spike (e.g. 300 coaches opening the demo at once)
 * the large JS chunks time out before the edge caches them → ChunkLoadError →
 * "stuck loading". This script pre-fetches the EXACT chunks the demo dashboard
 * needs so they're warm in the edge cache before the blast, and reports whether
 * they're fast yet — so you can gate the send on a clean result.
 *
 * It is NOT a substitute for the real rule: never deploy while a campaign is
 * sending. It warms only the edge POP(s) this runner can reach; geo-distributed
 * coaches hit other POPs. Use it as: deploy → wait → warm-edge → if PASS, blast.
 *
 * Run:  npx tsx scripts/warm-edge.ts
 *       BASE=https://www.helmsportslabs.com ROUNDS=4 SLOW_MS=1500 npx tsx scripts/warm-edge.ts
 * Exit: 0 = warm (all chunks fast on the final round → safe to send)
 *       1 = still cold/slow (don't blast yet) or a hard failure
 */

const BASE = (process.env.BASE ?? 'https://helmsportslabs.com').replace(/\/$/, '');
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const SLOW_MS = Number(process.env.SLOW_MS ?? 1500);
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

/** Parse Set-Cookie headers into a single Cookie request string. */
function collectCookies(res: Response, jar: Map<string, string>): void {
  // Node's fetch exposes multiple Set-Cookie via getSetCookie().
  const setCookies: string[] =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie') as string]
        : [];
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

const cookieHeader = (jar: Map<string, string>) =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function timedFetch(url: string, init?: RequestInit): Promise<{ status: number; ms: number; res: Response; body: string }> {
  const t0 = performance.now();
  const res = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init?.headers ?? {}) } });
  const body = await res.text();
  return { status: res.status, ms: Math.round(performance.now() - t0), res, body };
}

async function main(): Promise<void> {
  console.log(`Edge warm-up against ${BASE}  (rounds=${ROUNDS}, slow>${SLOW_MS}ms)\n`);

  // 0) which deployment is live right now
  try {
    const h = await timedFetch(`${BASE}/api/health`, { redirect: 'follow' });
    const dep = (() => { try { return JSON.parse(h.body).deploymentId; } catch { return '?'; } })();
    console.log(`  deployment: ${dep}  (health ${h.status}, ${h.ms}ms)\n`);
  } catch {
    console.log('  deployment: (health check failed)\n');
  }

  // 1) demo auto-login → follow the redirect chain (www→apex→dashboard),
  //    collecting Set-Cookie at every hop so we capture the demo session cookie
  //    regardless of host-canonicalization redirects.
  const jar = new Map<string, string>();
  let next: string | null = `${BASE}/golf/demo?ref=edge-warmup`;
  for (let hop = 0; hop < 6 && next; hop++) {
    const r: { status: number; ms: number; res: Response; body: string } = await timedFetch(next, {
      redirect: 'manual',
      headers: { cookie: cookieHeader(jar) },
    });
    collectCookies(r.res, jar);
    if (r.status >= 300 && r.status < 400) {
      const loc = r.res.headers.get('location');
      next = loc ? new URL(loc, next).toString() : null;
    } else {
      next = null;
    }
  }
  if (!cookieHeader(jar)) {
    console.error('  ✗ demo login set no cookies — cannot reach the dashboard. Aborting.');
    process.exit(1);
  }

  // 2) dashboard HTML → extract the chunk URLs it pulls
  const dash = await timedFetch(`${BASE}/golf/dashboard`, { headers: { cookie: cookieHeader(jar) }, redirect: 'follow' });
  if (dash.status !== 200) {
    console.error(`  ✗ dashboard returned ${dash.status} — not a clean load. Aborting.`);
    process.exit(1);
  }
  const chunkSet = new Set<string>();
  for (const m of dash.body.matchAll(/\/_next\/static\/[^"'\s]+?\.js(?:\?[^"'\s]*)?/g)) {
    chunkSet.add(m[0].startsWith('http') ? m[0] : `${BASE}${m[0]}`);
  }
  const chunks = [...chunkSet];
  console.log(`  dashboard HTML: ${dash.status} (${dash.ms}ms), ${chunks.length} chunks referenced\n`);
  if (chunks.length === 0) {
    console.error('  ✗ no chunks found in dashboard HTML — markup may have changed. Aborting.');
    process.exit(1);
  }

  // 3) warm the chunks over several rounds; watch the slowest fall as the edge warms
  let lastRoundSlow: { url: string; ms: number }[] = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const results = await Promise.all(
      chunks.map(async (u) => {
        try {
          const c = await timedFetch(u, { headers: { cookie: cookieHeader(jar) }, redirect: 'follow' });
          return { url: u, ms: c.ms, status: c.status };
        } catch {
          return { url: u, ms: Infinity, status: 0 };
        }
      }),
    );
    const ok = results.filter((x) => x.status === 200);
    const bad = results.filter((x) => x.status !== 200);
    const max = Math.max(...ok.map((x) => x.ms), 0);
    const avg = ok.length ? Math.round(ok.reduce((a, x) => a + x.ms, 0) / ok.length) : 0;
    lastRoundSlow = results.filter((x) => x.ms > SLOW_MS || x.status !== 200).map((x) => ({ url: x.url, ms: x.ms }));
    console.log(
      `  round ${r}: ${ok.length}/${results.length} ok  avg ${avg}ms  max ${max}ms` +
        (bad.length ? `  ✗ ${bad.length} non-200` : '') +
        (lastRoundSlow.length ? `  ⚠ ${lastRoundSlow.length} slow/failed` : ''),
    );
  }

  console.log('');
  if (lastRoundSlow.length === 0) {
    console.log('  ✅ PASS — all dashboard chunks are warm and fast. Safe to send.');
    process.exit(0);
  }
  console.log('  ⛔ NOT WARM YET — these were slow/failed on the final round:');
  for (const s of lastRoundSlow.slice(0, 12)) {
    console.log(`     ${s.ms === Infinity ? 'FAILED' : s.ms + 'ms'}  ${s.url.replace(BASE, '').replace(/\?.*$/, '')}`);
  }
  console.log('\n  Wait ~1 min and re-run, or check the deploy settled. Do NOT blast yet.');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
