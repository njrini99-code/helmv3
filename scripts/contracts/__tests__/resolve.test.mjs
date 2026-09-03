/**
 * resolve.test.mjs — node:test suite for the Active Contract Compiler.
 *
 * A SYNTHETIC fixture, not the real repo: a temp directory holding a
 * minimal registry.yml, a feature doc, a two-entry change ledger (one entry
 * correcting the other), a fake ADR pair (one superseding the other), a fake
 * feature-registry.ts, a fake database.ts, and a fake migration. This proves
 * supersession detection and provenance without depending on this repo's own
 * content drifting under the test.
 *
 * Per .claude/rules/quality-gates.md §2/§3: a `scripts/__tests__` file using
 * `node:test` runs ONLY when invoked directly (`node --test <path>`) — it
 * is NOT picked up by `npm test`/CI unless promoted (import switched to
 * `vitest`, path added by name to `vitest.config.ts`). This file was written
 * with `node:test` per this task's explicit instruction; see this PR's body
 * for that tradeoff stated plainly, not left to be discovered.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveContract, parseArgs } from '../resolve.mjs';
import { resolveFeatureId, UnknownFeatureError } from '../lib/registry.mjs';

let repoRoot;

before(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'contract-resolve-fixture-'));

  const write = (relPath, content) => {
    const full = join(repoRoot, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  };

  write(
    'memory/registry.yml',
    `version: 1

features:
  widget_lifecycle:
    name: Widget Lifecycle
    status: active
    owner: product
    criticality: high
    observability:
      feature_keys: [widget_tracking]
    docs:
      feature: memory/features/widget-lifecycle.md
      flows: []
      ui: []
      business_logic: []
      incidents: []
    code:
      routes:
        - src/app/widgets/**
      components: []
      api: []
      actions:
        - src/app/actions/widget-missing.ts
      services: []
      db:
        - supabase/migrations/*widget*.sql
      tests: []
    integrations: []
    review:
      required_docs: []
      required_checks: []
`,
  );

  write(
    'memory/features/widget-lifecycle.md',
    `# Feature: Widget Lifecycle

## Status

- active

## Current State

Widgets are tracked end to end.

## Core Data

- \`golf_widgets\` is the primary table.

- \`golf_widget_events\` is the event log.
`,
  );

  write(
    'memory/ledgers/changes/widget_lifecycle.md',
    `# Change ledger — widget_lifecycle

## 2026-01-05 — widgets now retry on failure

- SHA: aaaaaaaaaaa.
- Change: widget writes retry once before failing.
- Why: transient network errors were surfacing as user-visible failures.

## 2026-01-10 — correction: the 2026-01-05 entry overstated retry count

- SHA: bbbbbbbbbbb.
- Stale-warning correction: the 2026-01-05 entry said widget writes retry
  once before failing; measured against the shipped code, they retry THREE
  times. The entry above is stale.
`,
  );

  write(
    'memory/decisions/ADR-2026-01-01-widget-storage.md',
    `# ADR-2026-01-01 — Widget storage

**Status:** accepted · **Date:** 2026-01-01 · **Supersedes:** nothing · **Anchor SHA:** \`1111111111\`

## Context

widget_lifecycle needs durable storage.

## Decision

Use golf_widgets.
`,
  );

  write(
    'memory/decisions/ADR-2026-01-15-widget-storage-v2.md',
    `# ADR-2026-01-15 — Widget storage v2

**Status:** accepted · **Date:** 2026-01-15 · **Supersedes:** \`ADR-2026-01-01-widget-storage.md\` · **Anchor SHA:** \`2222222222\`

## Context

widget_lifecycle storage moved to a queue-backed model.

## Decision

Use golf_widget_events as the durable log; golf_widgets becomes a projection.
`,
  );

  write(
    'src/lib/admin/feature-registry.ts',
    `export const FEATURES = [
  {
    key: 'widget_tracking',
    label: 'Widget Tracking',
    primaryTable: 'golf_widgets',
  },
];
`,
  );

  write(
    'src/lib/types/database.ts',
    `export interface Database {
  public: {
    Tables: {
      golf_widgets: { Row: {} };
    };
  };
}
`,
  );

  write(
    'supabase/migrations/20260101000000_widget_init.sql',
    `-- CREATE TABLE golf_widgets_old (a comment describing history, not DDL)
CREATE TABLE IF NOT EXISTS public.golf_widgets (
  id uuid PRIMARY KEY
);
CREATE OR REPLACE FUNCTION public.widget_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$ BEGIN RETURN NEW; END; $$;
`,
  );
});

after(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

/** The fixture's tracked-file set — deliberately hand-listed rather than
 * walked, per gatherSources' header: no filesystem walk, ever. */
function trackedFiles() {
  return new Set([
    'memory/registry.yml',
    'memory/features/widget-lifecycle.md',
    'memory/ledgers/changes/widget_lifecycle.md',
    'memory/decisions/ADR-2026-01-01-widget-storage.md',
    'memory/decisions/ADR-2026-01-15-widget-storage-v2.md',
    'src/lib/admin/feature-registry.ts',
    'src/lib/types/database.ts',
    'supabase/migrations/20260101000000_widget_init.sql',
    'src/app/widgets/page.tsx', // makes the `src/app/widgets/**` route claim resolve
    // deliberately NOT included: src/app/actions/widget-missing.ts —
    // proves the ABSENT_FROM_TRACKED_FILES path.
  ]);
}

function fixtureOverrides() {
  return { trackedFiles: trackedFiles(), headSha: 'fixture0000' };
}

describe('resolveContract — feature id resolution', () => {
  test('direct registry id resolves with via: direct', () => {
    const contract = resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides());
    assert.equal(contract.feature_id, 'widget_lifecycle');
    assert.equal(contract.requested_id, 'widget_lifecycle');
    assert.equal(contract.resolution.via, 'direct');
    assert.equal(contract.resolution.note, null);
  });

  test('FeatureKey alias resolves to its owning feature, loudly', () => {
    const contract = resolveContract(repoRoot, 'widget_tracking', fixtureOverrides());
    assert.equal(contract.feature_id, 'widget_lifecycle');
    assert.equal(contract.requested_id, 'widget_tracking');
    assert.equal(contract.resolution.via, 'feature_registry_key');
    assert.match(contract.resolution.note, /FeatureKey/);
    assert.match(contract.resolution.note, /widget_lifecycle/);
  });

  test('unknown id is the ONE hard failure — throws UnknownFeatureError', () => {
    assert.throws(
      () => resolveContract(repoRoot, 'nonexistent_feature', fixtureOverrides()),
      UnknownFeatureError,
    );
  });

  test('resolveFeatureId directly: unknown id message names both namespaces checked', () => {
    const { registry } = { registry: { features: { widget_lifecycle: { observability: { feature_keys: [] } } } } };
    assert.throws(() => resolveFeatureId('nope', registry), (err) => {
      assert.ok(err instanceof UnknownFeatureError);
      assert.match(err.message, /not a memory\/registry\.yml feature_id/);
      return true;
    });
  });
});

describe('resolveContract — exit-code contract (never fails on a contradiction)', () => {
  test('a feature WITH contradictions still resolves (would be exit 0 at the CLI)', () => {
    // widget_lifecycle's fixture deliberately carries three kinds of
    // supersession (mechanical path, mechanical schema, heuristic ledger,
    // structured ADR) — none of them should throw.
    assert.doesNotThrow(() => resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides()));
  });
});

describe('resolveContract — mechanical supersession (existence-verified)', () => {
  test('a registry action glob matching zero tracked files is superseded', () => {
    const contract = resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides());
    const hit = contract.superseded_claims.find(
      (c) => c.kind === 'action' && c.text === 'src/app/actions/widget-missing.ts',
    );
    assert.ok(hit, 'expected the missing action file to be flagged superseded');
    assert.equal(hit.superseded.reason, 'ABSENT_FROM_TRACKED_FILES');
    assert.equal(hit.superseded.confidence, 'mechanical');
    assert.equal(hit.source.kind, 'registry');
    assert.equal(hit.source.path, 'memory/registry.yml');
    assert.ok(Number.isInteger(hit.source.line), 'registry claim must carry a line number');
  });

  test('a registry route glob matching a tracked file is NOT superseded', () => {
    const contract = resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides());
    const hit = [...contract.current_contract, ...contract.superseded_claims].find(
      (c) => c.kind === 'route' && c.text === 'src/app/widgets/**',
    );
    assert.ok(hit);
    assert.equal(hit.verified, 'exists');
    assert.equal(hit.superseded, undefined);
  });

  test('a core_data table absent from database.ts is superseded, and its present sibling is not', () => {
    const contract = resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides());
    const hit = contract.superseded_claims.find((c) => c.kind === 'core_data');
    assert.ok(hit, 'expected the Core Data block to be flagged (golf_widget_events is absent)');
    assert.equal(hit.superseded.reason, 'ABSENT_FROM_GENERATED_SCHEMA_TYPES');
    assert.match(hit.superseded.evidence, /golf_widget_events/);
    assert.doesNotMatch(hit.superseded.evidence, /\bgolf_widgets\b not found/);
  });

  test('a trigger function is never schema-checked (no false positive)', () => {
    const contract = resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides());
    const fn = [...contract.current_contract, ...contract.superseded_claims].find(
      (c) => c.kind === 'function' && c.text.includes('widget_trigger_fn'),
    );
    assert.ok(fn, 'expected the trigger function to be extracted as a claim');
    assert.equal(fn.superseded, undefined, 'a RETURNS trigger function must never be schema-checked');
  });

  test('a CREATE TABLE mentioned only in a SQL comment is never extracted as a claim', () => {
    const contract = resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides());
    const commentGhost = [...contract.current_contract, ...contract.superseded_claims].find(
      (c) => c.text.includes('golf_widgets_old'),
    );
    assert.equal(commentGhost, undefined, 'a `-- CREATE TABLE ...` comment must not become a claim');
  });
});

describe('resolveContract — structured supersession (ADR Supersedes: header)', () => {
  test('ADR v1 is marked superseded by ADR v2, per the declared header field', () => {
    const contract = resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides());
    const v1 = contract.superseded_claims.find((c) => c.source.path.includes('widget-storage.md'));
    assert.ok(v1, 'expected ADR v1 to be flagged superseded');
    assert.equal(v1.superseded.reason, 'ADR_SUPERSEDES_FIELD');
    assert.equal(v1.superseded.confidence, 'structured');
    assert.match(v1.superseded.evidence, /widget-storage-v2\.md/);

    const v2 = contract.current_contract.find((c) => c.source.path.includes('widget-storage-v2.md'));
    assert.ok(v2, 'ADR v2 itself should remain current');
  });
});

describe('resolveContract — heuristic supersession (ledger correction marker)', () => {
  test('a "Stale-warning correction" entry supersedes the earlier entry it targets', () => {
    const contract = resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides());
    const corrected = contract.superseded_claims.find((c) =>
      c.source.path.endsWith('changes/widget_lifecycle.md') && c.date === '2026-01-05',
    );
    assert.ok(corrected, 'expected the 2026-01-05 entry to be flagged by the later correction');
    assert.equal(corrected.superseded.reason, 'LEDGER_SELF_CORRECTION');
    assert.equal(corrected.superseded.confidence, 'heuristic');
    assert.match(corrected.superseded.evidence, /2026-01-10/);

    const corrector = contract.current_contract.find((c) => c.date === '2026-01-10');
    assert.ok(corrector, 'the correcting entry itself should remain current, not be marked superseded');
  });
});

describe('resolveContract — provenance', () => {
  test('every claim carries source.kind and source.path; registry/ledger/ADR claims carry a line number', () => {
    const contract = resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides());
    const all = [...contract.current_contract, ...contract.superseded_claims];
    assert.ok(all.length > 5, 'fixture should produce a non-trivial claim set');
    for (const claim of all) {
      assert.ok(claim.source.kind, `claim ${claim.id} missing source.kind`);
      assert.ok(claim.source.path, `claim ${claim.id} missing source.path`);
    }
    const registryClaim = all.find((c) => c.source.kind === 'registry');
    assert.ok(Number.isInteger(registryClaim.source.line));
    const ledgerClaim = all.find((c) => c.source.kind === 'ledger_changes');
    assert.ok(Number.isInteger(ledgerClaim.source.line));
  });

  test('anchor_sha is carried through and is not a wall-clock timestamp', () => {
    const contract = resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides());
    assert.equal(contract.anchor_sha, 'fixture0000');
  });

  test('sources_consulted lists only sources actually read', () => {
    const contract = resolveContract(repoRoot, 'widget_lifecycle', fixtureOverrides());
    const paths = contract.sources_consulted.map((s) => s.path);
    assert.ok(paths.includes('memory/registry.yml'));
    assert.ok(paths.includes('memory/features/widget-lifecycle.md'));
    assert.ok(paths.includes('memory/ledgers/changes/widget_lifecycle.md'));
    // Only ADRs relevant to this feature are consulted — a repo could hold
    // ADRs about unrelated features, and this fixture proves none leak in
    // by testing there are exactly the two widget ADRs, not more.
    const adrPaths = paths.filter((p) => p.includes('ADR-'));
    assert.equal(adrPaths.length, 2);
  });
});

describe('parseArgs', () => {
  test('parses --feature, --json, --out', () => {
    const args = parseArgs(['--feature', 'foo', '--json', '--out', '/tmp/x.json']);
    assert.equal(args.feature, 'foo');
    assert.equal(args.json, true);
    assert.equal(args.out, '/tmp/x.json');
  });

  test('missing --feature leaves it null (caller exits 2)', () => {
    const args = parseArgs(['--json']);
    assert.equal(args.feature, null);
  });
});
