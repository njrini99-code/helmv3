// @vitest-environment jsdom
/**
 * The measured What row: every losing spot is a node, the rest is "Not
 * tracked by shot" (never a gray "Unexplained" box). Phones get the leak
 * ladder (one row per losing area, one stacked bar, "+N more" folding);
 * desktop keeps the ribbon with tooltips for narrow nodes. The reconcile
 * notes collapse to one line plus a disclosure; one legend lists only the
 * states the map draws.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildRootMap } from '@/lib/coachhelm/root-map/build-player-root-map';
import type { MeasuredArea } from '@/lib/coachhelm/root-map/measured-what';
import { RootMap, buildLadder, measuredSummary } from '../RootMap';

const approachMeasured: MeasuredArea = {
      area: 'approach',
      mode: 'measured',
      rounds: 12,
      stored: -2.0,
      recomputed: -1.9,
      scale: 1,
      reason: null,
      keys: [
        { key: '125_175', sg: -1.2, n: 90, rounds: 12 },
        { key: '175_plus', sg: -0.6, n: 80, rounds: 12 },
        { key: 'penalty', sg: -0.1, n: 10, rounds: 6 },
      ],
    };

const model = buildRootMap({
  areas: [
    { area: 'tee', sgPerRound: 0.2 },
    { area: 'approach', sgPerRound: -2.0 },
    { area: 'short_game', sgPerRound: null },
    { area: 'putting', sgPerRound: -0.3 },
  ],
  insights: [],
  measured: { approach: approachMeasured },
});

const many = buildRootMap({
  areas: [{ area: 'putting', sgPerRound: -2.4 }],
  insights: [],
  measured: {
    putting: {
      area: 'putting',
      mode: 'measured',
      rounds: 12,
      stored: -2.4,
      recomputed: -2.4,
      scale: 1,
      reason: null,
      keys: [
        { key: '0_3', sg: -0.2, n: 40, rounds: 12 },
        { key: '3_5', sg: -0.25, n: 40, rounds: 12 },
        { key: '5_10', sg: -0.6, n: 40, rounds: 12 },
        { key: '10_15', sg: -0.5, n: 40, rounds: 12 },
        { key: '15_25', sg: -0.45, n: 40, rounds: 12 },
        { key: '25_plus', sg: -0.4, n: 40, rounds: 12 },
      ],
    },
  },
});

describe('RootMap measured What row', () => {
  it('labels the unmeasured rest "Not tracked by shot", never "Unexplained"', () => {
    render(<RootMap model={model} selectedId={null} summary="s" />);
    const approachRest = document.querySelector('[data-kind="not-tracked"]');
    expect(approachRest).not.toBeNull();
    expect(approachRest?.getAttribute('title')).toBe('Not tracked by shot 0.10 a round');
    // putting has no measured split: its rest is still honestly unexplained
    expect(document.querySelector('[data-kind="unexplained"]')).not.toBeNull();
  });

  it('collapses the reconcile notes to one quiet line with the per-area check behind a disclosure', () => {
    render(<RootMap model={model} selectedId={null} summary="s" />);
    const note = document.querySelector('[data-slot="measured-summary"]') as HTMLElement;
    // putting is losing but not split by shot: an exception, shown inline
    expect(note.textContent).toMatch(/Measured from 12 rounds of shots; 1 of 2 losing areas match their strokes-gained total\./);
    expect(within(note).getByText(/Putting: not split by shot/)).toBeInTheDocument();
    const details = note.querySelector('[data-slot="measured-details"]') as HTMLElement;
    expect(details.tagName).toBe('DETAILS');
    expect(details.textContent).toMatch(/Approach: measured from 12 rounds of recorded shots/);
    // no long per-area paragraphs outside the disclosure
    expect(document.querySelector('[data-slot="measured-notes"]')).toBeNull();
  });

  it('says every area matches when every losing area is measured', () => {
    const only = buildRootMap({
      areas: [
        { area: 'approach', sgPerRound: -2.0 },
        { area: 'tee', sgPerRound: 0.1 },
      ],
      insights: [],
      measured: { approach: approachMeasured },
    });
    expect(measuredSummary(only)?.line).toBe('Measured from 12 rounds of shots; every area matches its strokes-gained total.');
    expect(measuredSummary(only)?.exceptions).toEqual([]);
  });

  it('draws one ladder row per losing area, largest first, with each spot a button', () => {
    const onSelect = vi.fn();
    render(<RootMap model={model} selectedId={null} onSelect={onSelect} summary="s" audience="coach" />);
    const ladder = document.querySelector('[data-slot="leak-ladder"]') as HTMLElement;
    const rows = [...ladder.querySelectorAll('[data-slot="ladder-row"]')].map((r) => r.getAttribute('data-area'));
    expect(rows).toEqual(['approach', 'putting']);
    const approach = ladder.querySelector('[data-area="approach"]') as HTMLElement;
    const segs = approach.querySelectorAll('[data-slot="ladder-segment"]');
    expect(segs).toHaveLength(3);
    // measured, no stored read yet: plain tint
    expect(segs[0]!.getAttribute('data-fill')).toBe('tint');
    fireEvent.click(within(approach).getByRole('button', { name: /125–175 yd, 1\.20 strokes a round/ }));
    expect(onSelect).toHaveBeenCalledWith('measured:approach:125_175');
    // no duplicate chip list and no empty outlined Why row
    expect(screen.queryByRole('group', { name: /Branches/ })).toBeNull();
    // one legend, only the states drawn
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(legend.textContent).toBe('Measured, no stored read yet');
  });

  it('folds spots past the top three into "+N more", which expands to 44px rows', () => {
    const [row] = buildLadder(many);
    expect(row!.segments.map((c) => c.label)).toEqual(['5–10 ft putts', '10–15 ft putts', '15–25 ft putts']);
    expect(row!.more.map((c) => c.label)).toEqual(['25+ ft putts', '3–5 ft putts', '0–3 ft putts']);
    const onSelect = vi.fn();
    render(<RootMap model={many} selectedId={null} onSelect={onSelect} summary="s" />);
    const ladder = document.querySelector('[data-slot="leak-ladder"]') as HTMLElement;
    expect(ladder.querySelector('[data-slot="ladder-more-list"]')).toBeNull();
    const more = within(ladder).getByRole('button', { name: /3 more spots, 0\.85 strokes a round together/ });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const list = ladder.querySelector('[data-slot="ladder-more-list"]') as HTMLElement;
    fireEvent.click(within(list).getByRole('button', { name: /0–3 ft putts/ }));
    expect(onSelect).toHaveBeenCalledWith('measured:putting:0_3');
  });

  it('opens "+N more" when the selected spot is folded inside it', () => {
    render(<RootMap model={many} selectedId="measured:putting:0_3" onSelect={() => {}} summary="s" />);
    const ladder = document.querySelector('[data-slot="leak-ladder"]') as HTMLElement;
    const list = ladder.querySelector('[data-slot="ladder-more-list"]') as HTMLElement;
    expect(within(list).getByRole('button', { name: /0–3 ft putts/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('desktop: names a node too narrow for its label in a tooltip, not a list under the row', () => {
    render(<RootMap model={model} selectedId={null} summary="s" />);
    expect(document.querySelector('[data-slot="what-callouts"]')).toBeNull();
    const ribbon = document.querySelector('[data-slot="ribbon-map"]') as HTMLElement;
    const tips = [...ribbon.querySelectorAll('[data-slot="what-tooltip"]')].map((t) => t.textContent);
    expect(tips).toContain('Approach penalties 0.10');
  });
});
