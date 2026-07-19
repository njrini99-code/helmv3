// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayMyGameProfile.tsx — genome-radar header dedup regression (#20/#124)
 * ----------------------------------------------------------------------------
 * The page masthead already reads "{firstName}'s genome" and the enclosing
 * InstrumentPanel header already reads "Genome" — but the GenomeRadar chart's
 * OWN ChartFrame header was ALSO passed `title={`${firstName}'s shape`}`, a
 * near-duplicate of both. Combined with ChartFrame's `truncate` header class,
 * a narrow chart column rendered that duplicate cut off mid-word — reading
 * as a broken repeat of the page H1.
 *
 * This locks: the chart's own title is never a re-statement of the page H1 /
 * panel header (same firstName + "genome"/"shape" wording).
 * ========================================================================== */
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FairwayMyGameProfile } from './FairwayMyGameProfile';

// The component's ONLY next/dynamic usage is the lazy GenomeRadar — stub it
// so we can assert the `title` prop it's actually given without loading the
// real recharts tree (which needs a stubbed getBoundingClientRect in jsdom).
vi.mock('next/dynamic', () => ({
  default: () => {
    function GenomeRadarStub(props: Record<string, unknown>) {
      return (
        <div data-testid="genome-radar-stub" data-title={String(props.title ?? '')} />
      );
    }
    return GenomeRadarStub;
  },
}));

const AXES = [
  { label: 'Driver usage', value: 62 },
  { label: 'Par-3 performance', value: 48 },
  { label: 'Back-9 stamina', value: 71 },
];

describe('FairwayMyGameProfile — the genome radar header is not a truncated duplicate of the page H1', () => {
  it("passes the GenomeRadar a title that is NOT the page's own \"{firstName}'s genome\" masthead restated", () => {
    render(
      <FairwayMyGameProfile
        firstName="Nick"
        axes={AXES}
        dimensions={[]}
        strengths={[]}
        watchouts={[]}
        courseProfile={null}
        roundsBasis={12}
      />,
    );

    // The page masthead (rendered via CoachHelmShell -> ViewHeader).
    expect(screen.getByText("Nick's genome")).toBeInTheDocument();

    const radarStub = screen.getByTestId('genome-radar-stub');
    const chartTitle = radarStub.getAttribute('data-title') ?? '';
    expect(chartTitle).not.toBe('');
    // Neither a verbatim repeat of the page H1 nor of the firstName-derived
    // "shape" variant that used to duplicate it.
    expect(chartTitle).not.toBe("Nick's genome");
    expect(chartTitle).not.toBe("Nick's shape");
    expect(chartTitle.includes('Nick')).toBe(false);
  });
});
