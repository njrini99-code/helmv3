/**
 * Stamps public/sw.js with a unique build version so that
 * deploying a new build forces the service worker to reinstall
 * and clear all old caches.
 *
 * Uses VERCEL_GIT_COMMIT_SHA (available on Vercel builds).
 *
 * GENERATED-FILE POLICY (docs/operations/GENERATED_FILE_POLICY.md):
 * this ONLY stamps on an actual Vercel build (`process.env.VERCEL` is set
 * by Vercel's build environment). A bare local `npm run build` — used to
 * sanity-check a production build on a dev machine, not to deploy — or
 * CI's `next build` gate would otherwise rewrite public/sw.js on every
 * run with a new hash/timestamp, showing up as a routine "dirty" diff
 * that isn't a real source change (this already happened once: see git
 * blame on public/sw.js for a stray locally-stamped commit). Neither of
 * those contexts needs a real cache-busting version — only a genuine
 * Vercel deploy does.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, '..', 'public', 'sw.js');

if (!process.env.VERCEL) {
  console.log('[stamp-sw] Not a Vercel build (VERCEL env var unset) — leaving public/sw.js untouched.');
  process.exit(0);
}

const buildId = (process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString()).slice(0, 8);

const content = readFileSync(swPath, 'utf8');
const updated = content.replace(
  /const CACHE_VERSION = 'golfhelm-v[^']*';/,
  `const CACHE_VERSION = 'golfhelm-v${buildId}';`
);

writeFileSync(swPath, updated);
console.log(`[stamp-sw] Set CACHE_VERSION to golfhelm-v${buildId}`);
