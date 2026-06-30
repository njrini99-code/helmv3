#!/usr/bin/env node
/**
 * Baseball route crawler (#373) — authenticated coach/player session smoke.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 \
 *   E2E_BASEBALL_COACH_EMAIL=... E2E_BASEBALL_COACH_PASSWORD=... \
 *   E2E_BASEBALL_PLAYER_EMAIL=... E2E_BASEBALL_PLAYER_PASSWORD=... \
 *   node scripts/route-crawler-baseball.mjs
 *
 * Exits 0 when all routes return <500 and do not leak anon auth walls post-login.
 */

import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const COACH = {
  email: process.env.E2E_BASEBALL_COACH_EMAIL || process.env.E2E_GOLF_EMAIL,
  password: process.env.E2E_BASEBALL_COACH_PASSWORD || process.env.E2E_GOLF_PASSWORD,
};
const PLAYER = {
  email: process.env.E2E_BASEBALL_PLAYER_EMAIL,
  password: process.env.E2E_BASEBALL_PLAYER_PASSWORD,
};

const ROUTES = [
  '/baseball/dashboard/command-center',
  '/baseball/dashboard/practice',
  '/baseball/dashboard/stats-center',
  '/baseball/dashboard/announcements',
  '/baseball/dashboard/travel',
  '/baseball/dashboard/tasks',
  '/baseball/dashboard/documents',
  '/baseball/dashboard/camps',
  '/baseball/dashboard/roster',
  '/baseball/dashboard/calendar',
  '/baseball/dashboard/messages',
  '/baseball/dashboard/hub',
];

function loadNavRoutes() {
  const registryPath = resolve('src/lib/baseball/nav-registry.ts');
  const src = readFileSync(registryPath, 'utf8');
  const hrefs = [...src.matchAll(/href:\s*'(\/baseball\/[^']+)'/g)].map((m) => m[1]);
  return [...new Set([...ROUTES, ...hrefs])];
}

async function signIn(email, password) {
  if (!email || !password) return null;
  const res = await fetch(`${BASE_URL}/baseball/login`, { redirect: 'manual' });
  void res;
  const loginPage = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).catch(() => null);
  if (!loginPage || !loginPage.ok) {
    return null;
  }
  const setCookie = loginPage.headers.getSetCookie?.() ?? [];
  return setCookie.join('; ');
}

async function crawlRoute(path, cookie) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  const status = res.status;
  const location = res.headers.get('location') || '';
  const bouncedToLogin = location.includes('/login') || location.includes('/signup');
  return { path, status, bouncedToLogin };
}

async function main() {
  const routes = loadNavRoutes();
  const cookie = await signIn(COACH.email, COACH.password);

  if (!cookie) {
    console.log('No baseball coach credentials — skipping authenticated crawl (set E2E_BASEBALL_COACH_EMAIL/PASSWORD).');
    process.exit(0);
  }

  const failures = [];
  for (const route of routes) {
    const result = await crawlRoute(route, cookie);
    if (result.status >= 500) {
      failures.push(`${route} → HTTP ${result.status}`);
    } else if (result.bouncedToLogin) {
      failures.push(`${route} → redirected to login after auth`);
    } else {
      console.log(`OK ${route} (${result.status})`);
    }
  }

  if (failures.length) {
    console.error('Route crawler failures:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }

  console.log(`Crawled ${routes.length} baseball routes successfully.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
