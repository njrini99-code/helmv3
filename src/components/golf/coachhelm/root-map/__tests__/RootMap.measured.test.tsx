// @vitest-environment jsdom
/**
 * The measured What row: every losing spot is a labelled node, the rest is
 * "Not tracked by shot" (never a gray "Unexplained" box), and a node too
 * narrow for its label is named just under the row on the player map.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildRootMap } from '@/lib/coachhelm/root-map/build-player-root-map';
import { RootMap } from '../RootMap';

const model = buildRootMap({
  areas: [
    { area: 'tee', sgPerRound: 0.2 },
    { area: 'approach', sgPerRound: -2.0 },
    { area: 'short_game', sgPerRound: null },
    { area: 'putting', sgPerRound: -0.3 },
  ],
  insights: [],
  measured: {
    approach: {
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
    expect(screen.getByText(/Approach: measured from 12 rounds of recorded shots/)).toBeInTheDocument();
  });

  it('names nodes too narrow for their own label under the row, on the player map too', () => {
    render(<RootMap model={model} selectedId={null} summary="s" />);
    const callouts = document.querySelector('[data-slot="what-callouts"]');
    expect(callouts?.textContent).toMatch(/Approach penalties/);
  });
});
