// =============================================================================
// Unit tests for the import VALIDATE pass (csv-utils.validateImportRows).
//
// Locks the v2 09_import_system / data_validation_v2.md severity model at the
// runtime boundary the gap called out as missing:
//   - Blocking: cannot safely commit (unmatched row, unparseable cell, negative
//     count, impossible metric band, AB < H integrity) -> hasBlockers gate;
//   - Warning : commit WITH review (unusual-but-possible metric, duplicate-likely,
//     implausible ER) -> hasWarnings -> explicit ack required;
//   - Info    : no action (ignored column, all-zero row);
//   - skipped rows are NOT validated (no point gating a row we won't write);
//   - the report is PURE so server (commit gate) and client (wizard) agree.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { validateImportRows, type CSVRow } from '@/lib/baseball/csv-utils';

type M = { rowIndex: number; playerId: string | null; action: 'create' | 'update' | 'skip'; sourceName: string };

function run(rows: CSVRow[], mapping: Record<string, string | null>, matches: M[], headers?: string[]) {
  return validateImportRows({
    rows,
    mapping,
    matches,
    headers: headers ?? Object.keys(rows[0] ?? {}),
  });
}

describe('validateImportRows — severity model', () => {
  it('flags a missing player-name column as a FILE-LEVEL blocker', () => {
    const r = run([{ ab: '4', h: '2' }], { at_bats: 'ab', hits: 'h', player_name: null }, [
      { rowIndex: 0, playerId: 'p1', action: 'create', sourceName: '' },
    ]);
    expect(r.hasBlockers).toBe(true);
    expect(r.issues.some((i) => i.code === 'no_player_name_column' && i.rowIndex === null)).toBe(true);
  });

  it('blocks an unmatched row that is not skipped', () => {
    const r = run([{ player: 'Ghost', ab: '3', h: '1' }], { player_name: 'player', at_bats: 'ab', hits: 'h' }, [
      { rowIndex: 0, playerId: null, action: 'create', sourceName: 'Ghost' },
    ]);
    expect(r.blockingRowIndices).toContain(0);
    expect(r.issues.some((i) => i.code === 'unmatched_row')).toBe(true);
  });

  it('does NOT validate a skipped row', () => {
    const r = run([{ player: 'Ghost', ab: '-5', h: '99' }], { player_name: 'player', at_bats: 'ab', hits: 'h' }, [
      { rowIndex: 0, playerId: null, action: 'skip', sourceName: 'Ghost' },
    ]);
    expect(r.hasBlockers).toBe(false);
    expect(r.issues.filter((i) => i.rowIndex === 0)).toHaveLength(0);
  });

  it('blocks an unparseable numeric cell (garbage would commit as 0)', () => {
    const r = run([{ player: 'A', ab: '4x' }], { player_name: 'player', at_bats: 'ab' }, [
      { rowIndex: 0, playerId: 'p1', action: 'create', sourceName: 'A' },
    ]);
    expect(r.hasBlockers).toBe(true);
    expect(r.issues.some((i) => i.code === 'unparseable_value' && i.field === 'at_bats')).toBe(true);
  });

  it('blocks a negative count', () => {
    const r = run([{ player: 'A', ab: '-2', h: '0' }], { player_name: 'player', at_bats: 'ab', hits: 'h' }, [
      { rowIndex: 0, playerId: 'p1', action: 'create', sourceName: 'A' },
    ]);
    expect(r.issues.some((i) => i.code === 'negative_value')).toBe(true);
  });

  it('blocks hits > at_bats (AB < H integrity)', () => {
    const r = run([{ player: 'A', ab: '2', h: '3' }], { player_name: 'player', at_bats: 'ab', hits: 'h' }, [
      { rowIndex: 0, playerId: 'p1', action: 'create', sourceName: 'A' },
    ]);
    expect(r.issues.some((i) => i.code === 'integrity_ab_lt_h')).toBe(true);
    expect(r.hasBlockers).toBe(true);
  });

  it('blocks an impossible metric (exit velo 250) but warns on an unusual one (132 is hardMax-bounded -> block; 35 -> warn)', () => {
    const impossible = run([{ player: 'A', ev: '250' }], { player_name: 'player', exit_velocity: 'ev' }, [
      { rowIndex: 0, playerId: 'p1', action: 'create', sourceName: 'A' },
    ]);
    expect(impossible.issues.some((i) => i.code === 'out_of_range')).toBe(true);

    const unusual = run([{ player: 'A', ev: '35' }], { player_name: 'player', exit_velocity: 'ev' }, [
      { rowIndex: 0, playerId: 'p1', action: 'create', sourceName: 'A' },
    ]);
    expect(unusual.hasBlockers).toBe(false);
    expect(unusual.issues.some((i) => i.code === 'unusual_value' && i.severity === 'warning')).toBe(true);
  });

  it('warns (not blocks) on a duplicate player+action within one file', () => {
    const r = run(
      [
        { player: 'A', ab: '4', h: '2' },
        { player: 'A', ab: '3', h: '1' },
      ],
      { player_name: 'player', at_bats: 'ab', hits: 'h' },
      [
        { rowIndex: 0, playerId: 'p1', action: 'create', sourceName: 'A' },
        { rowIndex: 1, playerId: 'p1', action: 'create', sourceName: 'A' },
      ],
    );
    expect(r.hasBlockers).toBe(false);
    expect(r.issues.some((i) => i.code === 'duplicate_likely' && i.severity === 'warning')).toBe(true);
  });

  it('reports ignored columns + all-zero rows as INFO (never blocks)', () => {
    const r = run([{ player: 'A', ab: '0', h: '0', jersey: '12' }], { player_name: 'player', at_bats: 'ab', hits: 'h' }, [
      { rowIndex: 0, playerId: 'p1', action: 'create', sourceName: 'A' },
    ]);
    expect(r.hasBlockers).toBe(false);
    expect(r.issues.some((i) => i.code === 'ignored_column' && i.severity === 'info')).toBe(true);
    expect(r.issues.some((i) => i.code === 'all_zero_row' && i.severity === 'info')).toBe(true);
  });

  it('passes a clean, fully-matched row with no issues of any severity', () => {
    const r = run([{ player: 'A', ab: '4', h: '2', hr: '1' }], { player_name: 'player', at_bats: 'ab', hits: 'h', home_runs: 'hr' }, [
      { rowIndex: 0, playerId: 'p1', action: 'create', sourceName: 'A' },
    ]);
    expect(r.hasBlockers).toBe(false);
    expect(r.hasWarnings).toBe(false);
    expect(r.issues.filter((i) => i.severity !== 'info')).toHaveLength(0);
  });

  it('counts are consistent with the grouped issues', () => {
    const r = run(
      [
        { player: 'A', ab: '2', h: '3' }, // blocking: AB<H
        { player: 'B', ev: '35' }, // warning: unusual EV
      ],
      { player_name: 'player', at_bats: 'ab', hits: 'h', exit_velocity: 'ev' },
      [
        { rowIndex: 0, playerId: 'p1', action: 'create', sourceName: 'A' },
        { rowIndex: 1, playerId: 'p2', action: 'create', sourceName: 'B' },
      ],
    );
    expect(r.blockingCount).toBe(r.issues.filter((i) => i.severity === 'blocking').length);
    expect(r.warningCount).toBe(r.issues.filter((i) => i.severity === 'warning').length);
    expect(r.infoCount).toBe(r.issues.filter((i) => i.severity === 'info').length);
    expect(r.hasBlockers).toBe(true);
    expect(r.hasWarnings).toBe(true);
  });
});
