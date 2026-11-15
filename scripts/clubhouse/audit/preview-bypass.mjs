#!/usr/bin/env node
// Gets the audit's browsers past Vercel's login wall on a staging preview with the project's existing
// "Protection Bypass for Automation" secret. It changes nothing in Vercel and never prints the secret.
//
//   node scripts/clubhouse/audit/preview-bypass.mjs --fetch                # copy the secret from Vercel into .auth/
//   node scripts/clubhouse/audit/preview-bypass.mjs --check --base <url>   # does the preview open with it?
//   node scripts/clubhouse/audit/preview-bypass.mjs --forget               # clean-up: delete the local copy
//
// session.mjs uses it on its own: when .auth/preview-bypass.json exists and no share link fits the preview, the minted
// session also carries the cookie Vercel sets for the bypass, so Playwright passes the wall.
// Owner's yes, 13 Nov 2026: use the project's automation secret rather than a share link.
//
// Exit 0 ok. 1 refused or failed (the message says why). 2 the Vercel CLI isn't signed in (`npx vercel login`).

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROD_REF } from './staging-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const AUTH = path.join(ROOT, '.auth');
export const BYPASSFILE = path.join(AUTH, 'preview-bypass.json');
const PROD_ALIASES = /^helmv3(-nick-rinis-projects)?\.vercel\.app$/i;

const HELP = `Vercel's login wall on a staging preview, for the audit browsers.

  --fetch               copy the project's "Protection Bypass for Automation" secret into .auth/preview-bypass.json
  --check --base URL    show whether the preview opens with it (status and cookie names only)
  --forget              delete the local copy

The secret is never printed. Production and the production aliases are refused. Nothing in Vercel changes.`;

class Refused extends Error {}
const refuse = (why) => { throw new Refused(why); };

/** The automation-bypass secret in a project's protectionBypass map (keys are the secrets), or null. */
export function automationSecret(protectionBypass) {
  if (!protectionBypass || typeof protectionBypass !== 'object') return null;
  const hit = Object.entries(protectionBypass).find(([, v]) => v?.scope === 'automation-bypass');
  return hit ? hit[0] : null;
}

export function checkPreview(base) {
  let u;
  try { u = new URL(base); } catch { refuse(`not a URL: ${base}`); }
  if (base.includes(PROD_REF) || /(^|\.)helmsportslabs\.com$/i.test(u.hostname) || PROD_ALIASES.test(u.hostname)) refuse('that is production');
  if (u.protocol !== 'https:' || !/\.vercel\.app$/i.test(u.hostname)) refuse(`not a Vercel preview: ${u.origin}`);
  return u;
}

const loadSecret = () => { try { return JSON.parse(readFileSync(BYPASSFILE, 'utf8')).secret || null; } catch { return null; } };
const walled = (res) => {
  const loc = res.headers.get('location') || '';
  return res.status === 401 || /vercel\.com\/(sso|login)|_vercel_sso/.test(loc);
};

/**
 * Visits the preview with the bypass headers, following redirects on this host only, and returns the cookies Vercel
 * set (as Playwright storage-state cookies) and whether the last answer was past the wall. Empty when no secret is kept.
 */
export async function bypassCookies(u) {
  const secret = u.protocol === 'https:' ? loadSecret() : null;
  if (!secret) return { ok: false, cookies: [] };
  const headers = { 'x-vercel-protection-bypass': secret, 'x-vercel-set-bypass-cookie': 'true' };
  const jar = new Map();
  let url = `${u.origin}/golf/login`;
  let res = null;
  for (let hop = 0; hop < 5; hop++) {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    res = await fetch(url, { redirect: 'manual', headers: cookie ? { ...headers, cookie } : headers }).catch(() => null);
    if (!res) break;
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
    for (const c of set) { const m = c.match(/^([^=;\s]+)=([^;]*)/); if (m) jar.set(m[1], m[2]); }
    const loc = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !loc) break;
    const next = new URL(loc, url);
    if (next.hostname !== u.hostname) break;
    url = next.href;
  }
  const cookies = [...jar].filter(([name]) => /vercel/i.test(name)).map(([name, value]) => ({
    name, value, domain: u.hostname, path: '/', expires: Math.floor(Date.now() / 1000) + 3600 * 23, httpOnly: true, secure: true, sameSite: 'Lax',
  }));
  return { ok: !!res && !walled(res) && res.status < 400, status: res?.status ?? null, cookies };
}

function fetchSecret() {
  const linked = JSON.parse(readFileSync(path.join(ROOT, '.vercel', 'project.json'), 'utf8'));
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vercel');
  const vercel = (args) => spawnSync(existsSync(bin) ? bin : 'vercel', args, { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  if (vercel(['whoami']).status !== 0) return { exit: 2, msg: 'Vercel CLI is not signed in. Ask Nick to run `npx vercel login` in this checkout.' };
  const r = vercel(['api', `/v9/projects/${linked.projectId}`, '--raw', '--scope', linked.orgId]);
  let project = null;
  try { project = JSON.parse(r.stdout); } catch { /* reported below */ }
  const secret = automationSecret(project?.protectionBypass);
  if (!secret) return { exit: 1, msg: `project ${project?.name ?? linked.projectId} has no Protection Bypass for Automation secret (exit ${r.status})` };
  mkdirSync(AUTH, { recursive: true, mode: 0o700 });
  writeFileSync(BYPASSFILE, JSON.stringify({ secret, projectId: linked.projectId, at: new Date().toISOString() }), { mode: 0o600 });
  chmodSync(BYPASSFILE, 0o600);
  return { exit: 0, msg: `bypass secret for ${project.name} kept in .auth/preview-bypass.json (owner-only, never printed)` };
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--help') || !argv.length) { console.log(HELP); return 0; }
  if (argv.includes('--forget')) { rmSync(BYPASSFILE, { force: true }); console.log('local bypass copy deleted'); return 0; }
  if (argv.includes('--check')) {
    const u = checkPreview(String(get('base') || ''));
    const bare = await fetch(`${u.origin}/golf/login`, { redirect: 'manual' }).catch(() => null);
    const by = await bypassCookies(u);
    console.log(`without: ${bare ? (walled(bare) ? 'behind the wall' : `open (${bare.status})`) : 'unreachable'}`);
    console.log(`with bypass: ${by.ok ? `open (${by.status})` : `not open (${by.status ?? 'no secret kept; run --fetch'})`}; cookies: ${by.cookies.map((c) => c.name).join(', ') || 'none'}`);
    return by.ok ? 0 : 1;
  }
  if (argv.includes('--fetch')) { const r = fetchSecret(); (r.exit ? console.error : console.log)(r.msg); return r.exit; }
  console.error(HELP);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then((code) => process.exit(code), (e) => {
    console.error(e instanceof Refused ? `REFUSED: ${e.message}` : `FAILED: ${e.message}`);
    process.exit(1);
  });
}
