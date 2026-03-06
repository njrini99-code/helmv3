/**
 * Stamps public/sw.js with a unique build version so that
 * deploying a new build forces the service worker to reinstall
 * and clear all old caches.
 *
 * Uses VERCEL_GIT_COMMIT_SHA (available on Vercel builds) or
 * falls back to a timestamp.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, '..', 'public', 'sw.js');

const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || Date.now().toString();

const content = readFileSync(swPath, 'utf8');
const updated = content.replace(
  /const CACHE_VERSION = 'golfhelm-v[^']*';/,
  `const CACHE_VERSION = 'golfhelm-v${buildId}';`
);

writeFileSync(swPath, updated);
console.log(`[stamp-sw] Set CACHE_VERSION to golfhelm-v${buildId}`);
