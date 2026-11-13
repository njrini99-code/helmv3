#!/usr/bin/env node
// Hands-off sign-in for the audit's demo coach and demo players, on staging only. No password is typed, read or
// printed, and no email is sent.
//
//   node scripts/clubhouse/audit/session.mjs --help
//   node scripts/clubhouse/audit/session.mjs --check                 # key found and proved staging; lists the demo users
//   node scripts/clubhouse/audit/session.mjs --role coach|player --base <url> [--email <demo email>] [--out .auth/x.json]
//                                            [--verify chromium|webkit|both|none]
//   node scripts/clubhouse/audit/session.mjs --sign-out-all          # clean-up: ends every demo session, forgets the key
//
// In scripts (preferred: one fresh session per browser context, never a shared file):
//   import { signedInContext } from './session.mjs';
//   const { context, guard, user } = await signedInContext(browser, { role: 'player', base, contextOptions: { viewport } });
//
// How it works: staging's admin key (from the signed-in Supabase CLI) asks staging's Auth for a one-time sign-in token
// for one demo user, exchanges it for a session with the app's own @supabase/ssr (so the cookie format is exactly the
// app's), and hands the cookies to the browser. The key lives only in memory and in .auth/.staging-admin.json
// (owner-only, deleted by --sign-out-all) and is never printed.
//
// Who can be signed in: a demo address (on demo.helmsportslabs.com or golfhelmdemo.com, or a helmsportslabs.com address
// with "demo" in it; exact extra addresses only through HELM_AUDIT_DEMO_EMAILS, comma-separated, set locally) that is
// the coach or an active player of Demo University Golf and of no other team. Every other account is refused.
//
// Exit 0 ok. 1 refused or failed (the message says why). 2 no usable staging key: ask Nick to run `npx supabase login`.

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachStagingGuard, DEMO_TEAM_ID, PROD_REF, STAGING_REF, TEAM_NAME } from './staging-guard.mjs';

export const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const AUTH = path.join(ROOT, '.auth');
const KEYFILE = path.join(AUTH, '.staging-admin.json');
const SHAREFILE = path.join(AUTH, 'preview-share.json');

const HELP = `Hands-off staging sign-in for the Clubhouse audit (demo accounts on ${TEAM_NAME} only).

  --check                         prove the staging key and list the demo users
  --role coach|player --base URL  mint a session and save it to .auth/staging-<role>.json
      --email <demo email>        a particular demo user (default: the coach, or the player with most rounds)
      --out .auth/<file>.json     where to save it (always under .auth/)
      --verify chromium|webkit|both|none   open the dashboard with it first (default chromium)
  --sign-out-all                  end every demo session and delete the key file

The base must be a Vercel preview (https://…vercel.app) or local dev (http://localhost or 127.0.0.1). Production is
refused. The staging key comes from the signed-in Supabase CLI and is never printed.`;

class Refused extends Error {}
const refuse = (why) => { throw new Refused(why); };

// ---------- guards ----------
function checkBase(base) {
  let u;
  try { u = new URL(base); } catch { refuse(`not a URL: ${base}`); }
  if (base.includes(PROD_REF) || /(^|\.)helmsportslabs\.com$/i.test(u.hostname)) refuse('that base is production');
  const local = u.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(u.hostname);
  const preview = u.protocol === 'https:' && /\.vercel\.app$/i.test(u.hostname);
  if (!local && !preview) refuse(`base must be the Vercel preview (https://…vercel.app) or local dev (http://127.0.0.1:<port>), got ${u.origin}`);
  return u;
}

/** A demo address by its domain, or one listed exactly in HELM_AUDIT_DEMO_EMAILS. */
export function isDemoEmail(email, listed = process.env.HELM_AUDIT_DEMO_EMAILS) {
  const e = String(email || '').toLowerCase().trim();
  const extra = String(listed || '').split(',').map((x) => x.toLowerCase().trim()).filter(Boolean);
  if (extra.includes(e)) return true;
  const [local, domain] = e.split('@');
  if (!local || !domain) return false;
  return domain === 'demo.helmsportslabs.com' || domain === 'golfhelmdemo.com' || (domain === 'helmsportslabs.com' && local.includes('demo'));
}

const jwtPayload = (k) => {
  try { return JSON.parse(Buffer.from(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return null; }
};
const isJwt = (k) => /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(k || '');
const looksSecret = (k) => /^sb_secret_[A-Za-z0-9_-]{16,}$/.test(k || '') || (isJwt(k) && jwtPayload(k)?.role === 'service_role');
const looksPublic = (k) => /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(k || '') || (isJwt(k) && jwtPayload(k)?.role === 'anon');

// ---------- the app's own Supabase libraries ----------
function libs() {
  const req = createRequire(path.join(ROOT, 'package.json'));
  return { ssr: req('@supabase/ssr'), sb: req('@supabase/supabase-js') };
}

// ---------- staging keys ----------
function keysFromCli() {
  const bins = [process.env.SUPABASE_BIN, path.join(ROOT, 'node_modules', '.bin', 'supabase'), 'supabase'].filter(Boolean);
  const base = ['projects', 'api-keys', '--project-ref', STAGING_REF, '-o', 'json'];
  for (const bin of bins) {
    for (const args of [[...base, '--reveal'], base]) {
      const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' } });
      if (r.error || r.status !== 0) continue;
      let list;
      try { list = JSON.parse(r.stdout); } catch { continue; }
      if (!Array.isArray(list)) continue;
      const pick = (want, ok) => list.find((k) => want(k) && ok(k.api_key))?.api_key;
      const secret = pick((k) => k.type === 'secret' || k.name === 'service_role', looksSecret);
      const pub = pick((k) => k.type === 'publishable' || k.name === 'anon', looksPublic);
      if (secret && pub) return { secret, pub, source: 'Supabase CLI' };
    }
  }
  return null;
}

async function provedStaging({ secret, pub }) {
  for (const k of [secret, pub]) {
    if (k.includes(PROD_REF)) return false;
    if (isJwt(k)) { const p = jwtPayload(k); if (p?.ref && p.ref !== STAGING_REF) return false; }
  }
  // A key from any other project is rejected by staging's own Auth, so a 200 here proves the key is staging's.
  const admin = await fetch(`${STAGING_URL}/auth/v1/admin/users?page=1&per_page=1`, { headers: { apikey: secret, ...(isJwt(secret) ? { authorization: `Bearer ${secret}` } : {}) } }).catch(() => null);
  const anon = await fetch(`${STAGING_URL}/auth/v1/settings`, { headers: { apikey: pub } }).catch(() => null);
  return !!admin?.ok && !!anon?.ok;
}

let cachedKeys = null;
export async function stagingKeys() {
  if (cachedKeys) return cachedKeys;
  if (existsSync(KEYFILE)) {
    try {
      chmodSync(KEYFILE, 0o600);
      const k = JSON.parse(readFileSync(KEYFILE, 'utf8'));
      if (await provedStaging(k)) return (cachedKeys = k);
    } catch { /* a stale or unreadable key file is replaced below */ }
    rmSync(KEYFILE, { force: true });
  }
  const k = keysFromCli();
  if (k && (await provedStaging(k))) {
    mkdirSync(AUTH, { recursive: true, mode: 0o700 });
    writeFileSync(KEYFILE, JSON.stringify({ ...k, at: new Date().toISOString() }), { mode: 0o600 });
    chmodSync(KEYFILE, 0o600);
    return (cachedKeys = k);
  }
  const e = new Refused('no usable staging key: the Supabase CLI gave none for the staging project. Ask Nick to run `npx supabase login` once in Terminal.');
  e.code = 2;
  throw e;
}

function adminClient() {
  const { sb } = libs();
  return sb.createClient(STAGING_URL, cachedKeys.secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

// ---------- the demo users ----------
let cachedUsers = null;
export async function demoUsers() {
  if (cachedUsers) return cachedUsers;
  await stagingKeys();
  const admin = adminClient();
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) refuse(`staging Auth: ${error.message}`);
  const byId = new Map(list.users.map((u) => [u.id, u]));
  const q = async (p) => { const { data, error: e } = await p; if (e) refuse(`staging read: ${e.message}`); return data || []; };

  const staff = await q(admin.from('golf_team_coach_staff').select('coach_id, team_id'));
  const coachIds = [...new Set(staff.filter((s) => s.team_id === DEMO_TEAM_ID).map((s) => s.coach_id))];
  const coaches = coachIds.length ? await q(admin.from('golf_coaches').select('id, user_id, full_name').in('id', coachIds)) : [];
  const members = await q(admin.from('golf_team_members').select('player_id, team_id, status'));
  const playerIds = [...new Set(members.filter((m) => m.team_id === DEMO_TEAM_ID && m.status === 'active').map((m) => m.player_id))];
  const players = playerIds.length ? await q(admin.from('golf_players').select('id, user_id, first_name, last_name').in('id', playerIds)) : [];

  const out = [];
  const onlyDemoTeam = (rows, key, id) => rows.filter((r) => r[key] === id).every((r) => r.team_id === DEMO_TEAM_ID);
  for (const c of coaches) {
    const u = byId.get(c.user_id);
    if (u && isDemoEmail(u.email) && onlyDemoTeam(staff, 'coach_id', c.id)) out.push({ role: 'coach', email: u.email, userId: u.id, name: c.full_name || '', rounds: null });
  }
  for (const p of players) {
    const u = byId.get(p.user_id);
    if (!u || !isDemoEmail(u.email) || !onlyDemoTeam(members, 'player_id', p.id)) continue;
    const { count } = await admin.from('golf_rounds').select('id', { count: 'exact', head: true }).eq('player_id', p.id);
    out.push({ role: 'player', email: u.email, userId: u.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), rounds: count ?? 0 });
  }
  out.sort((a, b) => (a.role === b.role ? (b.rounds ?? 0) - (a.rounds ?? 0) : a.role === 'coach' ? -1 : 1));
  return (cachedUsers = out);
}

async function pickUser({ role, email }) {
  const users = await demoUsers();
  if (email) {
    if (!isDemoEmail(email)) refuse(`${email} isn't a demo address; only demo accounts can be signed in`);
    const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u) refuse(`${email} isn't a demo coach or active demo player on ${TEAM_NAME}`);
    if (role && u.role !== role) refuse(`${email} is the demo ${u.role}, not a ${role}`);
    return u;
  }
  const u = users.find((x) => x.role === role); // players are sorted most rounds first
  if (!u) refuse(`no demo ${role} found on ${TEAM_NAME} in staging`);
  return u;
}

// ---------- sessions ----------
/** Vercel's share cookie for a protected preview, when .auth/preview-share.json holds a share secret for this host. */
async function shareCookie(u) {
  if (u.protocol !== 'https:' || !existsSync(SHAREFILE)) return [];
  let share;
  try { share = JSON.parse(readFileSync(SHAREFILE, 'utf8')); } catch { return []; }
  if (!share.secret || new URL(share.base).hostname !== u.hostname) return [];
  // Follow Vercel's redirects on this host, carrying cookies, and keep every _vercel* cookie it sets.
  const jar = new Map();
  let url = `${u.origin}/golf/login?_vercel_share=${encodeURIComponent(share.secret)}`;
  for (let hop = 0; hop < 5; hop++) {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(url, { redirect: 'manual', headers: cookie ? { cookie } : {} }).catch(() => null);
    if (!res) break;
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
    for (const c of set) { const m = c.match(/^([^=;\s]+)=([^;]*)/); if (m) jar.set(m[1], m[2]); }
    const loc = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !loc) break;
    const next = new URL(loc, url);
    if (next.hostname !== u.hostname) break;
    url = next.href;
  }
  return [...jar].filter(([name]) => name.startsWith('_vercel')).map(([name, value]) => ({ name, value, domain: u.hostname, path: '/', expires: Math.floor(Date.now() / 1000) + 3600 * 23, httpOnly: true, secure: true, sameSite: 'Lax' }));
}

async function sessionCookies(user, u) {
  const { ssr } = libs();
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: user.email });
  if (error || !data?.properties?.hashed_token) refuse(`staging couldn't make a sign-in token for ${user.email}: ${error?.message || 'no token'}`);
  const jar = new Map();
  const client = ssr.createServerClient(STAGING_URL, cachedKeys.pub, {
    cookies: {
      getAll: () => [...jar].map(([name, c]) => ({ name, value: c.value })),
      setAll: (list) => { for (const c of list) { if (!c.value || c.options?.maxAge === 0) jar.delete(c.name); else jar.set(c.name, c); } },
    },
  });
  let res = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  if (res.error) res = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'email' });
  if (res.error || !res.data?.session) refuse(`staging didn't accept the sign-in token for ${user.email}: ${res.error?.message || 'no session'}`);
  if (res.data.user?.id !== user.userId) refuse('signed in as a different user than asked; stopping');
  await new Promise((r) => setTimeout(r, 50));
  if (![...jar.keys()].some((n) => n.startsWith(`sb-${STAGING_REF}-auth-token`))) refuse('the app library set no session cookie');
  const secure = u.protocol === 'https:';
  return [...jar.values()].map((c) => ({
    name: c.name, value: c.value, domain: u.hostname, path: c.options?.path || '/',
    expires: Math.floor(Date.now() / 1000) + (c.options?.maxAge ?? 400 * 24 * 3600),
    httpOnly: !!c.options?.httpOnly, secure, sameSite: 'Lax',
  }));
}

/** A fresh, never-shared session for one demo user, as a Playwright storageState object. */
export async function mintState({ role, email, base }) {
  const u = checkBase(base);
  await stagingKeys();
  const user = await pickUser({ role, email });
  const cookies = [...(await shareCookie(u)), ...(await sessionCookies(user, u))];
  return { state: { cookies, origins: [] }, user };
}

/** New browser context signed in as a demo user, with the staging guard on. */
export async function signedInContext(browser, { role, email, base, contextOptions = {}, block = true }) {
  const { state, user } = await mintState({ role, email, base });
  const context = await browser.newContext({ ...contextOptions, storageState: state });
  const guard = attachStagingGuard(context, { block });
  return { context, guard, user };
}

async function verify(state, base, engineName) {
  const pw = await import('playwright');
  const browser = await pw[engineName].launch();
  try {
    const context = await browser.newContext({ storageState: state });
    const guard = attachStagingGuard(context, { block: true });
    const page = await context.newPage();
    await page.goto(`${base}/golf/dashboard`, { waitUntil: 'networkidle', timeout: 90_000 }).catch(() => {});
    const p = new URL(page.url());
    if (/(^|\.)vercel\.com$/.test(p.hostname)) return { ok: false, why: 'the preview is behind Vercel protection' };
    if (/\/(login|signin)/.test(p.pathname)) return { ok: false, why: 'landed on the login page' };
    const text = await page.locator('body').innerText().catch(() => '');
    guard.assertClean();
    return { ok: true, path: p.pathname, team: text.includes(TEAM_NAME) };
  } catch (e) {
    return { ok: false, why: e.message };
  } finally {
    await browser.close();
  }
}

async function signOutAll() {
  let keys;
  try { keys = await stagingKeys(); } catch { rmSync(KEYFILE, { force: true }); return 'no key on hand; nothing to sign out'; }
  const users = await demoUsers();
  let n = 0;
  for (const user of users) {
    const { ssr } = libs();
    const { data } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email: user.email });
    const client = ssr.createServerClient(STAGING_URL, keys.pub, { cookies: { getAll: () => [], setAll: () => {} } });
    const { data: v } = await client.auth.verifyOtp({ token_hash: data?.properties?.hashed_token, type: 'magiclink' });
    if (!v?.session) continue;
    const r = await fetch(`${STAGING_URL}/auth/v1/logout?scope=global`, { method: 'POST', headers: { apikey: keys.pub, authorization: `Bearer ${v.session.access_token}` } });
    if (r.ok || r.status === 204) n++;
  }
  rmSync(KEYFILE, { force: true });
  return `ended every session for ${n} of ${users.length} demo users; the staging key file is deleted`;
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { console.log(HELP); return; }
  if (argv.join(' ').includes(PROD_REF)) refuse('production appears in the arguments');

  if (argv.includes('--sign-out-all')) { console.log(await signOutAll()); return; }

  if (argv.includes('--check')) {
    const k = await stagingKeys();
    const users = await demoUsers();
    console.log(`staging key OK (${STAGING_REF}), from ${k.source}; never printed`);
    for (const u of users) console.log(`  ${u.role.padEnd(6)} ${u.email}${u.name ? `  (${u.name})` : ''}${u.rounds != null ? `  rounds=${u.rounds}` : ''}`);
    if (!users.some((u) => u.role === 'coach') || !users.some((u) => u.role === 'player')) refuse(`need at least one demo coach and one demo player on ${TEAM_NAME}`);
    return;
  }

  const role = get('role');
  const email = get('email');
  const base = String(get('base') || '').replace(/\/$/, '');
  if (!['coach', 'player'].includes(role) && !email) refuse('pass --role coach|player (or --email) and --base; --help lists the rest');
  const { state, user } = await mintState({ role, email, base });
  const engines = { none: [], chromium: ['chromium'], webkit: ['webkit'], both: ['chromium', 'webkit'] }[get('verify') || 'chromium'] || ['chromium'];
  for (const eng of engines) {
    const v = await verify(state, base, eng);
    if (!v.ok) refuse(`${eng}: not signed in (${v.why})`);
    console.log(`${eng}: signed in as the demo ${user.role} ${user.email} at ${v.path}${v.team ? `, ${TEAM_NAME} on screen` : ''}`);
  }
  // Verifying used this session in a browser; mint a fresh one for the file so its refresh token is unused.
  const fresh = engines.length ? (await mintState({ email: user.email, base })).state : state;
  const out = get('out') || `.auth/staging-${user.role}.json`;
  const abs = path.resolve(ROOT, out);
  if (!abs.startsWith(AUTH + path.sep)) refuse('session files go in .auth/ only');
  mkdirSync(AUTH, { recursive: true, mode: 0o700 });
  writeFileSync(abs, JSON.stringify(fresh), { mode: 0o600 });
  chmodSync(abs, 0o600);
  console.log(`saved ${out} (not printed). Use it once: a session file goes stale after a browser refreshes it.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error(e instanceof Refused ? `REFUSED: ${e.message}` : `FAILED: ${e.message}`); process.exit(e.code === 2 ? 2 : 1); });
}
