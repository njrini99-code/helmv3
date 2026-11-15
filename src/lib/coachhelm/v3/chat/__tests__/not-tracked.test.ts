import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { NOT_RECORDED } from '../knowledge/data-map.source';
import { ALL_METRIC_SPECS } from '../metrics-catalog';
import { BAND_SECTIONS, NOT_TRACKED, findNotTracked } from '../not-tracked';
import { ToolEnvelope } from '../provenance';
import { notTracked } from '../reader-kit';

describe('"that isn’t tracked" is a result, with the nearest thing that is tracked', () => {
  it('names only figures a reader returns as the nearest', () => {
    const tracked = new Set<string>([...ALL_METRIC_SPECS.map((s) => s.label), ...BAND_SECTIONS]);
    for (const entry of NOT_TRACKED) for (const name of entry.nearest) expect(tracked.has(name), `${entry.what}: "${name}" is not a figure the readers return`).toBe(true);
  });

  it('covers what the data map says is not recorded, and nothing the data map does not say', () => {
    // Each entry stands on one of KNOWLEDGE's lines (which a test holds to the schema); the line about rounds never entered is a caution, not a question.
    const lines = NOT_RECORDED.join(' ').toLowerCase();
    for (const key of ['launch monitor', 'iron or wedge', 'weather', 'aimed at', 'swing', 'other teams', 'college division']) expect(lines).toContain(key);
    expect(NOT_TRACKED).toHaveLength(7);
  });

  it('finds what a question asks for, and claims nothing when it does not know', () => {
    expect(findNotTracked('club used off the tee')?.what).toBe('Which club was hit');
    expect(findNotTracked('Eli’s ball speed with driver')?.nearest).toEqual(['Strokes gained off the tee', 'Driving accuracy', 'Approach by distance band']);
    expect(findNotTracked('how windy was it')?.what).toMatch(/^Weather/);
    expect(findNotTracked('his injury')?.nearest).toEqual([]);
    expect(findNotTracked('strokes gained putting')).toBeNull();
    expect(findNotTracked('putts per round')).toBeNull();
  });

  it('is an envelope the thread can draw: coverage not_tracked, the note, the nearest figures, and no figure at all', () => {
    const result = notTracked(findNotTracked('which club off the tee')!);
    expect(ToolEnvelope.parse(result)).toMatchObject({ coverage: 'not_tracked', coverage_note: 'A shot records only driver, another club, or putter.', nearest: ['Driving accuracy', 'Strokes gained off the tee', 'Approach by distance band'], measurements: [], series: [] });
    expect(result.summary).toBe('Not tracked: Which club was hit.');
    expect(result.model_text).toMatch(/Closest that is tracked: Driving accuracy, Strokes gained off the tee, Approach by distance band\./);
    expect(notTracked(findNotTracked('sleep')!).model_text).toMatch(/Nothing close to it is tracked\./);
  });
});
