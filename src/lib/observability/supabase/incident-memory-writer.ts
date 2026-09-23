/**
 * The only thing in this track that writes to disk — brief §75.
 *
 * It appends ONE resolved database incident to the store this repo already
 * has (`memory/incidents/<feature_id>/INC-*.md`) and does nothing else. No
 * database table, no second store, no index to keep in step: the file IS the
 * record, `git log` is its history, and `npm run knowledge:ledger-check` is
 * its validator.
 *
 * NO `import 'server-only'` HERE, DELIBERATELY — AND IT WAS THERE FIRST
 * ---------------------------------------------------------------------
 * This module carried that marker until a probe run of the documented CLI
 * failed with `ERR_MODULE_NOT_FOUND: Cannot find package 'server-only'`.
 * The package is NOT on disk in this repo: Next ships
 * `next/dist/compiled/server-only` and aliases the bare specifier in its own
 * webpack config, and `vitest.config.ts` aliases it to
 * `src/test/stubs/server-only.ts`. So the marker resolves inside a Next
 * build and inside vitest, and NOWHERE ELSE. A passing test suite was
 * therefore not evidence that the CLI could run — the stub was answering.
 *
 * That matters for any src module a Node process is meant to invoke
 * directly: the marker makes it unrunnable outside Next. This one is repo
 * TOOLING rather than a Next server module — it writes into the working
 * tree, is imported only by `scripts/observability/record-db-incident.ts`
 * and by its own test, and its `node:fs` import would make a client bundle
 * fail loudly at build time anyway. Keeping it in `src/` keeps it inside
 * `npm run typecheck` and `npm run lint`; dropping the marker keeps the
 * documented entry point runnable. Do not re-add it without re-running the
 * CLI.
 *
 * IT REFUSES MORE THAN IT WRITES, ON PURPOSE
 * -------------------------------------------
 *   - an unmapped feature id       (the file would fail the ledger checker)
 *   - an unreadable registry       (validating against nothing is not
 *                                   validation, so an empty key list is a
 *                                   refusal rather than a free pass)
 *   - an existing file at the path (the dedupe rule in
 *                                   memory/incidents/README.md is that a
 *                                   repeat occurrence UPDATES the existing
 *                                   incident's count/last_seen/evidence.
 *                                   That is a human edit informed by the
 *                                   file's contents; an automated overwrite
 *                                   would silently destroy it.)
 *   - any path that escapes memory/incidents/
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { renderDbIncident, type DbIncidentRecord, type IncidentProblem } from './incident-memory';

/**
 * Extracts the top-level keys of the `features:` mapping from
 * `memory/registry.yml`.
 *
 * WHY NOT js-yaml, WHICH THE LEDGER CHECKER USES
 * -----------------------------------------------
 * `js-yaml` ships no type declarations and `@types/js-yaml` is not a
 * dependency here, so importing it into `src/` fails `npm run typecheck`
 * with TS7016. Adding a dependency to make one scanner work is a worse trade
 * than scanning for the one thing this needs. `check-ledger-integrity.mjs`
 * is a `.mjs` script outside the TypeScript project, which is why it can use
 * the parser and this cannot.
 *
 * The scan is deliberately narrow, and its limits are its safety: it reads
 * ONLY keys at exactly two-space indentation inside the top-level
 * `features:` block, stops at the next zero-indent key, and ignores comments
 * and blank lines. It does not resolve anchors, merges or flow mappings —
 * none of which `memory/registry.yml` uses. A key it fails to see becomes a
 * REFUSAL to write (the id reads unmapped), never a silent pass, so the
 * failure mode of this parser is conservative in the right direction.
 * `incident-memory-writer.test.ts` cross-checks it against the real
 * committed registry.
 */
export function readRegistryFeatureIds(repoRoot: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(resolve(repoRoot, 'memory/registry.yml'), 'utf8');
  } catch {
    return [];
  }

  const ids: string[] = [];
  let inFeatures = false;
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue;

    if (/^[^\s#][^:]*:/.test(line)) {
      // A zero-indent key: either `features:` itself, or the end of it.
      inFeatures = /^features:\s*$/.test(line);
      continue;
    }
    if (!inFeatures) continue;

    const match = line.match(/^ {2}([A-Za-z0-9_]+):\s*$/);
    if (match?.[1]) ids.push(match[1]);
  }
  return ids;
}

export interface WriteDbIncidentOptions {
  repoRoot: string;
  record: DbIncidentRecord;
  /** Usually `readRegistryFeatureIds(repoRoot)`; passed explicitly so a
   *  caller can validate against a checked-out registry other than the one
   *  it is writing into. */
  knownFeatureIds: readonly string[];
}

export type WriteDbIncidentResult =
  | { ok: true; relativePath: string; absolutePath: string }
  | { ok: false; problems: readonly IncidentProblem[] };

export function writeDbIncident(options: WriteDbIncidentOptions): WriteDbIncidentResult {
  const rendered = renderDbIncident(options.record, { knownFeatureIds: options.knownFeatureIds });
  if (!rendered.ok) return { ok: false, problems: rendered.problems };

  const incidentsRoot = resolve(options.repoRoot, 'memory/incidents');
  const absolutePath = resolve(options.repoRoot, rendered.relativePath);

  if (!absolutePath.startsWith(incidentsRoot + sep)) {
    return {
      ok: false,
      problems: [{ kind: 'ESCAPES_STORE', detail: 'the rendered path escapes memory/incidents/' }],
    };
  }

  // js/file-system-race (#608): a separate `existsSync` check followed by a
  // plain `writeFileSync` (default flag 'w') is a TOCTOU race — anything
  // that creates `absolutePath` between the check and the write is silently
  // overwritten, defeating the "don't clobber a repeat occurrence" guarantee
  // this function exists to provide. `writeFileSync` with flag 'wx' makes
  // "create only if absent" a single atomic filesystem operation instead of
  // two: it opens for writing and fails with EEXIST if the path already
  // exists, closing the race window entirely.
  try {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, rendered.markdown, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      return {
        ok: false,
        problems: [
          {
            kind: 'ALREADY_EXISTS',
            detail: `${rendered.relativePath} already exists — a repeat occurrence updates that file's count, last_seen and evidence by hand rather than overwriting it`,
          },
        ],
      };
    }
    return {
      ok: false,
      problems: [{ kind: 'WRITE_FAILED', detail: `write failed: ${error instanceof Error ? error.message : 'unknown'}` }],
    };
  }

  return { ok: true, relativePath: rendered.relativePath, absolutePath };
}
