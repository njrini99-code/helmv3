import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BridgeGraph } from '../graph';
import { countDrift, resolveSignal, SILENT_AFTER_MS, silentActions, viewIdFor } from '../resolve';
import { fixtureGraph, signal } from './fixtures';

const g = fixtureGraph();

describe('resolveSignal', () => {
  it('resolves a CH code to its Bridge ID with no drift', () => {
    expect(resolveSignal(signal({ act: 'messages.send' }), g)).toEqual({ bridgeId: 70603, idPage: 'P007', category: 6, actionId: 'ACT-P007-SEND-MESSAGE', drift: [] });
  });

  it('resolves a bare Bridge ID', () => {
    expect(resolveSignal(signal({ code: '70101', kind: 'state', outcome: undefined }), g).bridgeId).toBe(70101);
  });

  it('flags an unknown code', () => {
    expect(resolveSignal(signal({ code: 'CH-7999' }), g).drift).toEqual(['unknown-code']);
    expect(resolveSignal(signal({ code: '79999' }), g).drift).toEqual(['unknown-code']);
  });

  it('flags a retired or unbuilt state that fired', () => {
    expect(resolveSignal(signal({ code: 'CH-7005', kind: 'state', outcome: undefined }), g).drift).toEqual(['deprecated-fired']);
    expect(resolveSignal(signal({ code: '70602', kind: 'state', outcome: undefined }), g).drift).toEqual(['deprecated-fired']);
    expect(resolveSignal(signal({ code: 'CH-7006', kind: 'state', outcome: undefined }), g).drift).toEqual(['reserved-fired']);
  });

  it("flags a code from another page, but not the shell's or one the page's contract borrows", () => {
    expect(resolveSignal(signal({ page: 'P013', kind: 'state', outcome: undefined }), g).drift).toEqual(['wrong-page']);
    expect(resolveSignal(signal({ code: 'CH-1903', page: 'P013', kind: 'state', outcome: undefined }), g).drift).toEqual([]);
    expect(resolveSignal(signal({ code: 'CH-13080', page: 'P017', kind: 'toast', outcome: 'failure' }), g).drift).toEqual([]);
    expect(resolveSignal(signal({ page: 'P099' }), g).drift).toEqual(['wrong-page']);
  });

  it("flags an action that ended on an outcome its row doesn't list, but not on the shell's own", () => {
    expect(resolveSignal(signal({ code: '70101', act: 'messages.send', outcome: 'success' }), g).drift).toEqual(['wrong-outcome']);
    expect(resolveSignal(signal({ code: 'CH-1903', act: 'messages.send', outcome: 'offline' }), g).drift).toEqual([]);
    expect(resolveSignal(signal({ code: '70101', act: 'messages.send', outcome: 'start' }), g).drift).toEqual([]);
    expect(resolveSignal(signal({ code: '70101', act: 'ACT-P007-SEND-MESSAGE', outcome: 'success' }), g).actionId).toBe('ACT-P007-SEND-MESSAGE');
  });

  it("counts a view under its page's ready row, and an action start or a tap under no ID", () => {
    expect(viewIdFor(g, 'P007')).toBe(70101);
    expect(viewIdFor(g, 'P013')).toBeNull();
    expect(resolveSignal(signal({ code: undefined, kind: 'view', outcome: undefined }), g)).toMatchObject({ bridgeId: 70101, idPage: 'P007', drift: [] });
    expect(resolveSignal(signal({ code: undefined, kind: 'view', outcome: undefined, page: 'P013' }), g)).toMatchObject({ bridgeId: null, drift: [] });
    expect(resolveSignal(signal({ code: undefined, kind: 'view', outcome: undefined, page: 'P099' }), g).drift).toEqual(['wrong-page']);
    expect(resolveSignal(signal({ code: undefined, kind: 'action', outcome: 'start', act: 'messages.send' }), g)).toEqual({
      bridgeId: null,
      idPage: null,
      category: null,
      actionId: 'ACT-P007-SEND-MESSAGE',
      drift: [],
    });
    expect(resolveSignal(signal({ code: undefined, kind: 'tap', outcome: undefined }), g).drift).toEqual([]);
  });

  it("names the action's own outcome row for the shell's generic saved and failed codes", () => {
    const graph = fixtureGraph();
    graph.ids[11702] = { ch: 'CH-1702', page: 'P001', category: 9, name: 'SAVED', meaning: 'Saved', status: 'implemented' };
    graph.ids[11703] = { ch: 'CH-1703', page: 'P001', category: 6, name: 'SAVE_FAILED', meaning: 'Save failed', status: 'implemented' };
    graph.chIndex['CH-1702'] = 11702;
    graph.chIndex['CH-1703'] = 11703;
    expect(resolveSignal(signal({ code: 'CH-1703', act: 'messages.send', outcome: 'failure' }), graph)).toMatchObject({ bridgeId: 70603, drift: [] });
    expect(resolveSignal(signal({ code: 'CH-1702', act: 'messages.send', outcome: 'success' }), graph)).toMatchObject({ bridgeId: 70901, drift: [] });
    // With no action named, the generic row stands.
    expect(resolveSignal(signal({ code: 'CH-1703', outcome: 'failure' }), graph).bridgeId).toBe(11703);
  });

  it('resolves against the real graph: CH-7004 lands on 70603 (plan PR 1 W-tier check)', () => {
    const real = JSON.parse(readFileSync(join(process.cwd(), 'docs/clubhouse/generated/bridge-graph.json'), 'utf8')) as BridgeGraph;
    const r = resolveSignal(signal({ act: 'ACT-P007-SEND-MESSAGE' }), real);
    expect(r.bridgeId).toBe(70603);
    expect(r.actionId).toBe('ACT-P007-SEND-MESSAGE');
    expect(r.drift).toEqual([]);
    // Every built page's view resolves to one of its own rows.
    for (const page of ['P001', 'P003', 'P007', 'P013']) expect(real.ids[viewIdFor(real, page) ?? -1]?.page).toBe(page);
    expect(viewIdFor(real, 'P002', 'coach')).toBe(20101);
    expect(viewIdFor(real, 'P002', 'player')).toBe(20102);
    expect(viewIdFor(real, 'P003')).toBe(30101);
  });
});

describe('silentActions', () => {
  const t0 = 1_763_000_000_000;
  const start = (seq: number, at: number, act = 'messages.send') => signal({ seq, at, act, outcome: 'start' });
  const end = (seq: number, at: number, act = 'messages.send') => signal({ seq, at, act, outcome: 'success', code: 'CH-7101' });

  it('pairs starts and outcomes per action, oldest first', () => {
    expect(silentActions([start(1, t0), end(2, t0 + 400), start(3, t0 + 1000), end(4, t0 + 1500)], { now: t0 + 120_000 })).toEqual([]);
  });

  it('a start with no outcome after 30 s is silent', () => {
    expect(silentActions([start(1, t0)], { now: t0 + SILENT_AFTER_MS }).map((s) => s.seq)).toEqual([1]);
    expect(silentActions([start(1, t0)], { now: t0 + SILENT_AFTER_MS - 1 })).toEqual([]);
  });

  it('an outcome that came after 30 s still counts the wait as silent', () => {
    expect(silentActions([start(1, t0), end(2, t0 + 31_000)], { now: t0 + 60_000 }).map((s) => s.seq)).toEqual([1]);
  });

  it('a page hidden inside the 30 s is not silent: they left', () => {
    expect(silentActions([start(1, t0)], { now: t0 + 60_000, pagehideAt: t0 + 5000 })).toEqual([]);
  });

  it('different actions do not close each other', () => {
    expect(silentActions([start(1, t0, 'a'), end(2, t0 + 100, 'b')], { now: t0 + 60_000 }).map((s) => s.seq)).toEqual([1]);
  });
});

describe('countDrift', () => {
  it('counts one row per kind × code × release, with first and last seen', () => {
    const rows = countDrift([
      { signal: signal({ code: 'CH-7999', at: 10 }), drift: ['unknown-code'] },
      { signal: signal({ code: 'CH-7999', at: 30 }), drift: ['unknown-code'] },
      { signal: signal({ code: 'CH-7006', at: 20 }), drift: ['reserved-fired', 'wrong-page'] },
      { signal: signal({ code: 'CH-7004', at: 5 }), drift: [] },
    ]);
    expect(rows[0]).toEqual({ kind: 'unknown-code', code: 'CH-7999', release: 'abc1234', count: 2, firstSeen: 10, lastSeen: 30 });
    expect(rows).toHaveLength(3);
  });
});
