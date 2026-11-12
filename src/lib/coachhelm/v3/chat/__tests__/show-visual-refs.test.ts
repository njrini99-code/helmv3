import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { ToolContext } from '../engine/tool';
import type { ToolEnvelope } from '../provenance';
import { showVisual, withBareRefs } from '../readers-direct';

/**
 * Staging, 12 Nov: the model names a read the way it was cited to it, `read:e1`, and show_visual's reads are keyed `e1`. Two
 * of four chart questions came back "no usable read named read:e1" and the coach got the answer in words.
 */
const putts: ToolEnvelope = {
  summary: 'Putts by distance',
  measurements: [],
  series: [],
  detail: { kind: 'putt_profile', profile: { buckets: [{ id: '0-3', label: '0–3 ft', attempts: 10, made: 9, rate: 0.9 }, { id: '3-5', label: '3–5 ft', attempts: 15, made: 14, rate: 0.93 }] } },
  coverage: 'complete',
  coverage_note: null,
  as_of: '2026-11-12T00:00:00.000Z',
};
const ctx = { reads: new Map([['e1', putts]]) } as unknown as ToolContext;
const parts = (r: unknown) => ((r as { parts?: Array<{ type: string }> }).parts ?? []).map((p) => p.type);

describe('show_visual takes a read by either name', () => {
  it('draws a block whose ref is the cited source, read:e1', async () => {
    const r = await showVisual.run(ctx, { kind: 'compose', title: 'Putts by distance', blocks: [{ type: 'putt_profile', ref: 'read:e1' }] });
    expect(parts(r)).toEqual(['data-visual-composition']);
  });

  it('draws the same block named e1', async () => {
    const r = await showVisual.run(ctx, { kind: 'compose', title: 'Putts by distance', blocks: [{ type: 'putt_profile', ref: 'e1' }] });
    expect(parts(r)).toEqual(['data-visual-composition']);
  });

  it('strips the prefix from ref, refs and evidenceRefs, and leaves other names alone', () => {
    const out = withBareRefs({ kind: 'compose', title: 't', evidenceRefs: ['read:e2'], blocks: [{ type: 'compare', refs: ['read:e1', 'e3'] }, { type: 'trend', ref: 'xread:e4' }] });
    expect(out.evidenceRefs).toEqual(['e2']);
    expect(out.blocks?.[0]?.refs).toEqual(['e1', 'e3']);
    expect(out.blocks?.[1]?.ref).toBe('xread:e4');
  });
});
