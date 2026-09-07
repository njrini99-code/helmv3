// =============================================================================
// scripts/serialize.mjs — the gate timing ledger.
//
// WHY THIS FILE EXISTS: serialize.mjs wraps every heavy gate (typecheck,
// test, build) with a slot queue on a machine-wide lock directory
// (~/.helm-gates by default, or HELM_GATE_DIR). This test exercises only
// `recordGateTiming`, the pure append-and-trim step that writes one row per
// gate run to memory/ledgers/gates.jsonl — against a disposable fake ledger
// path, never the machine-wide lock dir or the repo's real ledger file, so
// running this test never pollutes the report `npm run gates:report` reads.
// =============================================================================

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordGateTiming } from '../serialize.mjs';

let dir: string;
let ledgerPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'helm-gates-ledger-'));
  ledgerPath = join(dir, 'gates.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('recordGateTiming', () => {
  it('appends one JSON row per call, in order', () => {
    recordGateTiming({ ts: 1000, gate: 'typecheck', waitMs: 0, runMs: 5000, slots: 2, ledgerPath });
    recordGateTiming({ ts: 2000, gate: 'test', waitMs: 1200, runMs: 8000, slots: 2, ledgerPath });

    const rows = readFileSync(ledgerPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(rows).toEqual([
      { ts: 1000, gate: 'typecheck', waitMs: 0, runMs: 5000, slots: 2 },
      { ts: 2000, gate: 'test', waitMs: 1200, runMs: 8000, slots: 2 },
    ]);
  });

  it('creates the ledger file and its parent directory when neither exists yet', () => {
    const freshDir = join(dir, 'nested', 'ledgers');
    const freshPath = join(freshDir, 'gates.jsonl');

    recordGateTiming({ ts: 1000, gate: 'build', waitMs: 0, runMs: 1000, slots: 2, ledgerPath: freshPath });

    const rows = readFileSync(freshPath, 'utf8').split('\n').filter(Boolean);
    expect(rows).toHaveLength(1);
  });

  it('trims rows older than 30 days, keeping everything newer', () => {
    const now = Date.parse('2026-09-06T00:00:00Z');
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const stale = now - THIRTY_DAYS - 1;
    const fresh = now - 1000;

    writeFileSync(
      ledgerPath,
      [
        JSON.stringify({ ts: stale, gate: 'old-gate', waitMs: 0, runMs: 1, slots: 2 }),
        JSON.stringify({ ts: fresh, gate: 'recent-gate', waitMs: 0, runMs: 1, slots: 2 }),
      ].join('\n') + '\n',
    );

    recordGateTiming({ ts: now, gate: 'typecheck', waitMs: 0, runMs: 1, slots: 2, ledgerPath });

    const gates = readFileSync(ledgerPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).gate);

    expect(gates).toEqual(['recent-gate', 'typecheck']);
  });

  it('drops unparseable lines instead of throwing', () => {
    writeFileSync(ledgerPath, 'not json\n' + JSON.stringify({ ts: Date.now(), gate: 'ok', waitMs: 0, runMs: 1, slots: 2 }) + '\n');

    expect(() =>
      recordGateTiming({ ts: Date.now(), gate: 'typecheck', waitMs: 0, runMs: 1, slots: 2, ledgerPath }),
    ).not.toThrow();

    const rows = readFileSync(ledgerPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(rows.map((r) => r.gate)).toEqual(['ok', 'typecheck']);
  });

  it('never throws even if the ledger path cannot be written', () => {
    // A directory where a file is expected makes writeFileSync fail; the
    // function must swallow that rather than crash the wrapped gate.
    const unwritablePath = dir; // a directory, not a file path
    expect(() =>
      recordGateTiming({ ts: Date.now(), gate: 'typecheck', waitMs: 0, runMs: 1, slots: 2, ledgerPath: unwritablePath }),
    ).not.toThrow();
  });
});
