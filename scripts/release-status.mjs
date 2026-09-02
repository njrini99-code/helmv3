#!/usr/bin/env node
/**
 * release-status.mjs — is production actually serving what we merged?
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-09-01, seven fixes sat merged on `main` and none were in production.
 * Nobody ignored it; nothing said it. deploy-prod.sh guards the MOMENT of
 * deploying — clean tree, on main, matching origin — but between deploys
 * nothing answered the question that actually matters:
 *
 *     is the thing users are running the thing we merged?
 *
 * "Merged" and "released" had quietly become the same word.
 *
 * HOW IT DETERMINES THE DEPLOYED COMMIT
 * -------------------------------------
 * Not from metadata. deploy-prod.sh stamps NEXT_PUBLIC_SENTRY_RELEASE, which
 * Next inlines into the JS chunks, so the commit is IN THE BYTES THE BROWSER
 * RUNS. We fetch the live page, pull its chunk URLs, and walk main's history
 * backwards looking for the first SHA that appears in one.
 *
 * That is deliberately stronger than reading a deployment record: a READY
 * deployment whose alias never moved serves nobody, and metadata cannot tell
 * you that. The bytes can. It is the same check deploy-prod.sh prints for a
 * human to run by hand — this just runs it.
 *
 * It never deploys. Promotes are the owner's call (AGENTS.md).
 *
 * Exit: 0 in sync (or within --allow), 1 drift, 2 undetermined.
 * UNKNOWN is never reported as fine — that is the failure mode this replaces.
 *
 * FLAGS FOR THE SESSION-START HOOK (2026-09-01). .claude/hooks/session-context.sh
 * calls this at session start so a session is told what production actually
 * serves rather than what a machine-local marker last said. A hook has a
 * hard timeout and must not hang, so:
 *   --json            one JSON object on stdout ({deployed, mainSha, behind}
 *                     on success; {error} on failure) and nothing else
 *   --no-fetch        use origin/main as already fetched; never touch the network
 *                     for git (the page and chunk fetches still happen)
 *   --timeout-ms N    abort every fetch after N ms and exit 2 — bounded, so a
 *                     slow network degrades to "unknown", never to a stuck hook
 */
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const num = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i === -1 ? dflt : Number(argv[i + 1] ?? dflt);
};
const allow = num('--allow', 0);
const depth = num('--depth', 60);
const timeoutMs = num('--timeout-ms', 0);
const json = argv.includes('--json');
const noFetch = argv.includes('--no-fetch');
const site = process.env.HELM_PROD_URL || 'https://helmsportslabs.com';

const sh = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf-8', maxBuffer: 64e6 }).trim(); } catch { return null; } };
const die = (code, msg) => {
  if (json) console.log(JSON.stringify({ error: msg.split('\n')[0] }));
  else console.error(msg);
  process.exit(code);
};
// The watchdog is what makes --timeout-ms a real bound rather than a hint: a
// fetch that never resolves would otherwise hold the process (and the hook)
// open past its own timeout, and the hook's context would arrive empty.
const fetchOpts = () => (timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {});
if (timeoutMs > 0) {
  const t = setTimeout(() => die(2, `release-status: timed out after ${timeoutMs} ms — UNKNOWN, not in sync.`), timeoutMs + 250);
  t.unref();
}

if (!noFetch) sh('git', ['fetch', '--quiet', 'origin', 'main']);
const mainSha = sh('git', ['rev-parse', 'origin/main']);
if (!mainSha) die(2, 'release-status: could not resolve origin/main.');

let html;
try {
  const res = await fetch(site, { redirect: 'follow', ...fetchOpts() });
  if (!res.ok) die(2, `release-status: ${site} returned ${res.status}. Cannot read the served bundle.`);
  html = await res.text();
} catch (err) {
  die(2, `release-status: could not reach ${site} (${err.message}).`);
}

const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+?\.js/g)].map((m) => m[0]))];
if (chunks.length === 0) die(2, 'release-status: no JS chunks found in the served page.');

const candidates = (sh('git', ['log', '--format=%H', `-${depth}`, 'origin/main']) ?? '').split('\n').filter(Boolean);
if (candidates.length === 0) die(2, 'release-status: could not list main history.');

// Fetch a bounded sample of chunks once, then test every candidate against
// that text. Measured 2026-08-16: the stamp appears in only 2 of 32 chunks,
// so sampling one is not enough.
const bodies = [];
for (const c of chunks.slice(0, 12)) {
  try {
    const r = await fetch(site + c, fetchOpts());
    if (r.ok) bodies.push(await r.text());
  } catch { /* a missing chunk is not fatal; others may carry the stamp */ }
}
if (bodies.length === 0) die(2, 'release-status: could not fetch any chunk body.');
const haystack = bodies.join('\n');

const deployed = candidates.find((sha) => haystack.includes(sha));

if (!deployed) {
  die(2, [
    `release-status: no commit from the last ${depth} on main appears in the served bundle.`,
    '  Either production is older than that window, or it was deployed without',
    '  scripts/deploy-prod.sh (which is what stamps NEXT_PUBLIC_SENTRY_RELEASE).',
    '  This is UNKNOWN, not "in sync" — do not read it as healthy.',
  ].join('\n'));
}

const behind = Number(sh('git', ['rev-list', '--count', `${deployed}..${mainSha}`]) ?? '0');
const short = (s) => s.slice(0, 9);

if (json) {
  console.log(JSON.stringify({ deployed, mainSha, behind, verified_at: new Date().toISOString(), site }));
  process.exit(behind > allow ? 1 : 0);
}

console.log(`production : ${short(deployed)}  (verified in the served bundle)`);
console.log(`origin/main: ${short(mainSha)}`);

if (behind === 0) {
  console.log('\n✅ production is serving origin/main.');
  process.exit(0);
}

console.log(`\n⚠️  ${behind} commit(s) merged to main and NOT in production:\n`);
for (const line of (sh('git', ['log', '--oneline', `${deployed}..${mainSha}`]) ?? '').split('\n').filter(Boolean)) {
  console.log(`   ${line}`);
}
console.log('\nThese are fixes users do not have yet.');
console.log('Promote with scripts/deploy-prod.sh — owner action; this script never deploys.');
process.exit(behind > allow ? 1 : 0);
