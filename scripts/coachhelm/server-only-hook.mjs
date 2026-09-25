/**
 * Preload for running CoachHelm TypeScript scripts outside Next.js:
 *
 *   node --import tsx/esm --import ./scripts/coachhelm/server-only-hook.mjs \
 *     -r dotenv/config scripts/coachhelm/<script>.ts
 *
 * `server-only` is resolved by Next's bundler (next/dist/compiled/server-only)
 * and is not an installed package, so a plain tsx run of any lib module that
 * imports it fails with ERR_MODULE_NOT_FOUND. This aliases it (and
 * `client-only`) to the repo's empty test stub — the same approach
 * `scripts/db-observability-certify.mjs` uses.
 */
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only' || specifier === 'client-only') {
      return {
        url: pathToFileURL(join(REPO_ROOT, 'src/test/stubs/server-only.ts')).href,
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});
