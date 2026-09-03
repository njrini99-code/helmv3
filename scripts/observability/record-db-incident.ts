#!/usr/bin/env tsx
/**
 * Record ONE resolved database incident into `memory/incidents/**` —
 * brief §75.
 *
 *   npx tsx scripts/observability/record-db-incident.ts <record.json>
 *   npx tsx scripts/observability/record-db-incident.ts <record.json> --dry-run
 *
 * The JSON file is a `DbIncidentRecord` (see
 * `src/lib/observability/supabase/incident-memory.ts` for the shape and for
 * why the feature id must be a `memory/registry.yml` key verbatim).
 *
 * This file is a THIN shim on purpose: every rule lives in the two modules
 * under `src/lib/observability/supabase/`, which `tsc` and `vitest` do
 * cover. `tsconfig.json` excludes `scripts/`, so nothing here is
 * type-checked by `npm run typecheck` — keep it small enough that a reader
 * can verify it by eye.
 *
 * Writes nothing when validation fails, and never overwrites an existing
 * incident: a repeat occurrence updates that file's count, last_seen and
 * evidence by hand.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DbIncidentRecord } from '../../src/lib/observability/supabase/incident-memory';
import { renderDbIncident } from '../../src/lib/observability/supabase/incident-memory';
import { readRegistryFeatureIds, writeDbIncident } from '../../src/lib/observability/supabase/incident-memory-writer';

const [, , recordPath, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');

if (!recordPath) {
  console.error('usage: record-db-incident.ts <record.json> [--dry-run]');
  process.exit(2);
}

const repoRoot = process.cwd();
const record = JSON.parse(readFileSync(resolve(repoRoot, recordPath), 'utf8')) as DbIncidentRecord;
const knownFeatureIds = readRegistryFeatureIds(repoRoot);

if (knownFeatureIds.length === 0) {
  console.error('REFUSED: memory/registry.yml could not be read, so the feature id cannot be validated.');
  process.exit(1);
}

if (dryRun) {
  const rendered = renderDbIncident(record, { knownFeatureIds });
  if (!rendered.ok) {
    for (const problem of rendered.problems) console.error(`REFUSED ${problem.kind}: ${problem.detail}`);
    process.exit(1);
  }
  console.log(`--- would write ${rendered.relativePath} ---\n${rendered.markdown}`);
  process.exit(0);
}

const result = writeDbIncident({ repoRoot, record, knownFeatureIds });
if (!result.ok) {
  for (const problem of result.problems) console.error(`REFUSED ${problem.kind}: ${problem.detail}`);
  process.exit(1);
}
console.log(`wrote ${result.relativePath}`);
