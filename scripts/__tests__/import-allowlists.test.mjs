// The import-restriction allowlists (eslint-rules/import-allowlists.mjs) are a
// ratchet: they may only shrink. This test fails on a stale entry, so a file
// that stopped importing the restricted module must be taken off the list in
// the same change, and the list cannot quietly outlive the code.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLUBHOUSE_IMPORT_ALLOWLIST,
  ERROR_LOGGING_ALLOWLIST,
  ADMIN_LOGGER_ALLOWLIST,
  STRUCTURED_LOG_ALLOWLIST,
} from '../../eslint-rules/import-allowlists.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROUTE_FILE = /^src\/app\/.*\/(page|layout|loading|error|not-found|route|template|default|global-error)\.(ts|tsx)$/;

const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/** True when `source` (the text of `file`) imports `target`, by alias or relative path. */
function imports(file, source, target) {
  const alias = `@/${target.replace(/^src\//, '')}`;
  const specs = [...source.matchAll(/(?:from|import|mock|require)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  return specs.some((spec) => {
    if (spec === alias || spec.startsWith(`${alias}/`)) return true;
    if (!spec.startsWith('.')) return false;
    const resolved = normalize(join(dirname(file), spec));
    return resolved === target || resolved.startsWith(`${target}/`);
  });
}

function checkList(name, list, target, extra = () => []) {
  describe(name, () => {
    it('has no duplicates and is sorted', () => {
      expect(new Set(list).size).toBe(list.length);
      expect([...list]).toEqual([...list].sort());
    });
    it.each(list)('%s still exists and still imports the restricted module', (file) => {
      expect(existsSync(join(ROOT, file)), `${file} is gone: remove it from the allowlist`).toBe(true);
      expect(
        imports(file, read(file), target),
        `${file} no longer imports ${target}: remove it from the allowlist`,
      ).toBe(true);
      for (const problem of extra(file)) throw new Error(problem);
    });
  });
}

checkList('CLUBHOUSE_IMPORT_ALLOWLIST', CLUBHOUSE_IMPORT_ALLOWLIST, 'src/clubhouse', (file) =>
  ROUTE_FILE.test(file) ? [`${file} is a route file, which may import Clubhouse without an allowlist entry`] : [],
);
checkList('ERROR_LOGGING_ALLOWLIST', ERROR_LOGGING_ALLOWLIST, 'src/lib/error-logging');
checkList('ADMIN_LOGGER_ALLOWLIST', ADMIN_LOGGER_ALLOWLIST, 'src/lib/admin-logger');
checkList('STRUCTURED_LOG_ALLOWLIST', STRUCTURED_LOG_ALLOWLIST, 'src/lib/observability/structured-log');
