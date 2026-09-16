// @vitest-environment jsdom
/**
 * StandingBars.tsx — the labeled-bar-row replacement for every dot-on-a-rail
 * standing visual (owner: "get rid of these slider things... replace it with
 * an actual component"). Covers:
 *   - unsigned (rail) rendering for a percent metric
 *   - signed (diverging) rendering for an sg_* metric, including the
 *     numeric "+X.XX vs team" summary and the equal-values tie
 *   - cold-start (team_n < 5): Team row dropped, honest caption shown
 *   - pga_omitted: reference row dropped entirely
 *   - loading / error / empty honest states
 *   - a11y: figure aria-label + the visually-hidden data table
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StandingBars, type StandingBarsProps } from './StandingBars';

const UNSIGNED_BASE: StandingBarsProps = {
  metric_id: 'gir_pct',
  metric_label: 'GIR %',
  player_value: 64.6,
  team_avg: 65.3,
  team_n: 8,
  team_pct: 40,
  pga_value: 68,
  direction: 'higher_better',
  unit: 'percent',
  scale: { min: 30, max: 80 },
  size: 'md',
};

const SIGNED_BASE: StandingBarsProps = {
  metric_id: 'sg_ott',
  metric_label: 'SG: Off the Tee',
  player_value: 0.81,
  team_avg: 0.65,
  team_n: 8,
  team_pct: 40,
  pga_value: 0,
  direction: 'higher_better',
  unit: 'strokes',
  scale: { min: -1.5, max: 1.5 },
  size: 'md',
};

/** The visible bar rows only — excludes the header pill and the
 *  visually-hidden a11y table, both of which can repeat row label/value
 *  text ("Team", "68%", ...) and would otherwise make `getByText` ambiguous. */
function visibleRows(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-slot="standing-bars-rows"]') as HTMLElement;
}

function summaryText(container: HTMLElement): string | null {
  return container.querySelector('[data-slot="standing-bars-summary"]')?.textContent ?? null;
}

describe('StandingBars — unsigned (rail) rendering', () => {
  it('renders You/Team/Ref rows with formatted values and the vs-team pill', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} />);
    expect(screen.getByText('GIR %')).toBeTruthy();
    const rows = visibleRows(container);
    expect(within(rows).getByText('You')).toBeTruthy();
    expect(within(rows).getByText('Team')).toBeTruthy();
    expect(within(rows).getByText('PGA')).toBeTruthy();
    // 64.6 and 65.3 both format to "65%" — a display tie, so both rows show it.
    expect(within(rows).getAllByText('65%').length).toBe(2);
    expect(within(rows).getByText('68%')).toBeTruthy();
    expect(summaryText(container)).toBe('Matches team average');
    expect(container.querySelector('[data-slot="standing-bars-delta-pill"]')?.textContent).toBe('· vs team');
  });

  it('renders a genuinely different pair with the categorical caption, not a raw delta', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} player_value={50} />);
    expect(summaryText(container)).toBe('Below team average');
  });

  it('never renders a diverging center line for a non-SG metric', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} player_value={50} />);
    expect(container.querySelector('.bg-warm-400')).toBeNull();
  });
});

describe('StandingBars — signed (diverging) rendering for sg_* metrics', () => {
  it('shows the numeric "+X.XX vs team" summary for a genuine gap', () => {
    const { container } = render(<StandingBars {...SIGNED_BASE} />);
    expect(summaryText(container)).toBe('+0.16 vs team');
  });

  it('shows "Matches team average" instead of a delta when values display-tie', () => {
    const { container } = render(<StandingBars {...SIGNED_BASE} player_value={0.65} />);
    expect(summaryText(container)).toBe('Matches team average');
  });

  it('draws a zero-centered diverging bar with a visible center line', () => {
    const { container } = render(<StandingBars {...SIGNED_BASE} />);
    expect(container.querySelector('[data-slot="standing-bars"] .bg-warm-400')).toBeTruthy();
  });

  it('the reference ("Field Avg") row for an SG metric always reads 0.00', () => {
    const { container } = render(<StandingBars {...SIGNED_BASE} />);
    const rows = visibleRows(container);
    expect(within(rows).getByText('Field Avg')).toBeTruthy();
    expect(within(rows).getByText('0.00')).toBeTruthy();
  });
});

describe('StandingBars — cold start (team_n < 5)', () => {
  it('drops the Team row entirely and explains why instead of narrating a comparison', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} team_n={2} />);
    expect(within(visibleRows(container)).queryByText('Team')).toBeNull();
    expect(container.querySelector('[data-slot="standing-bars-delta-pill"]')).toBeNull();
    expect(summaryText(container)).toBeNull();
    expect(screen.getByText('Team marker appears once 5+ teammates have 5+ rounds each.')).toBeTruthy();
  });

  it('cold start with team_avg null also drops the row', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} team_avg={null} team_n={undefined} />);
    expect(within(visibleRows(container)).queryByText('Team')).toBeNull();
  });
});

describe('StandingBars — pga_omitted', () => {
  it('drops the reference row entirely (no "—" placeholder)', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} pga_omitted />);
    const rows = visibleRows(container);
    expect(within(rows).queryByText('PGA')).toBeNull();
    expect(within(rows).queryByText('68%')).toBeNull();
  });
});

describe('StandingBars — layout="compact" suppresses the summary line', () => {
  it('renders no cohort caption in compact layout even with a real gap', () => {
    const { container } = render(
      <StandingBars {...UNSIGNED_BASE} player_value={50} layout="compact" />,
    );
    expect(summaryText(container)).toBeNull();
  });
});

describe('StandingBars — honest matte states', () => {
  it('loading renders a status region, not the metric content', () => {
    render(<StandingBars {...UNSIGNED_BASE} state="loading" />);
    expect(screen.getByRole('status', { name: 'Loading standing' })).toBeTruthy();
    expect(screen.queryByText('GIR %')).toBeNull();
  });

  it('error renders an alert with the honest copy', () => {
    render(<StandingBars {...UNSIGNED_BASE} state="error" errorMessage="network blip" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Couldn.t load standing\./)).toBeTruthy();
    expect(screen.getByText('network blip')).toBeTruthy();
  });

  it('empty renders the "log 5 rounds" prompt with the metric label', () => {
    render(<StandingBars {...UNSIGNED_BASE} state="empty" />);
    expect(screen.getByText('GIR %')).toBeTruthy();
    expect(screen.getByText('Log 5 rounds to see how you stack up.')).toBeTruthy();
  });
});

describe('StandingBars — accessibility', () => {
  it('the figure carries the full derived aria-label (not role="img", so children stay in the tree)', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} />);
    const figure = container.querySelector('figure[data-slot="standing-bars"]');
    expect(figure).toBeTruthy();
    expect(figure).not.toHaveAttribute('role', 'img');
    expect(figure!.getAttribute('aria-label')).toContain('GIR %');
    expect(figure!.getAttribute('aria-label')).toContain('You: 65%');
  });

  it('renders a visually-hidden table with a row per visible value', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} />);
    const table = container.querySelector('table.sr-only');
    expect(table).toBeTruthy();
    const rows = within(table as HTMLElement).getAllByRole('row');
    // You + Team + PGA = 3 data rows (no header row in this table).
    expect(rows.length).toBe(3);
    expect(within(table as HTMLElement).getByText('68%')).toBeTruthy();
  });

  it('the hidden table drops the Team row too when cold-start omits it', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} team_n={2} />);
    const table = container.querySelector('table.sr-only') as HTMLElement;
    expect(within(table).queryByText('Team')).toBeNull();
  });
});

describe('StandingBars — frame ("card" vs "bare")', () => {
  it('defaults to "card": border + background + padding + shadow classes present', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} />);
    const figure = container.querySelector('[data-slot="standing-bars"]') as HTMLElement;
    expect(figure.getAttribute('data-frame')).toBe('card');
    expect(figure.className).toMatch(/border-border-subtle/);
    expect(figure.className).toMatch(/bg-surface/);
    expect(figure.className).toMatch(/shadow-soft/);
  });

  it('"bare" renders the same rows with no border/background/padding/shadow classes', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} frame="bare" />);
    const figure = container.querySelector('[data-slot="standing-bars"]') as HTMLElement;
    expect(figure.getAttribute('data-frame')).toBe('bare');
    // No chrome — but the base ink color survives, since that's content
    // (every row/label/value inherits it via `text-current`), not chrome.
    expect(figure.className).toBe('text-text-primary');
    expect(figure.className).not.toMatch(/border-border-subtle|bg-surface\b|shadow-soft|rounded-card/);
    // Content is untouched — same rows, same header pill, same hidden table.
    expect(visibleRows(container).querySelectorAll('[class*="grid-cols"]').length).toBe(3);
    expect(screen.getByText('GIR %')).toBeTruthy();
  });

  it('"bare" stays chrome-free in the loading/error/empty states too', () => {
    const { container: loading } = render(<StandingBars {...UNSIGNED_BASE} state="loading" frame="bare" />);
    const loadingEl = loading.querySelector('[role="status"]') as HTMLElement;
    expect(loadingEl.className).toBe('text-text-primary');

    const { container: error } = render(
      <StandingBars {...UNSIGNED_BASE} state="error" frame="bare" errorMessage="oops" />,
    );
    const errorEl = error.querySelector('[role="alert"]') as HTMLElement;
    expect(errorEl.className).toBe('text-text-primary');

    const { container: empty } = render(<StandingBars {...UNSIGNED_BASE} state="empty" frame="bare" />);
    const emptyEl = empty.querySelector('[data-state="empty"]') as HTMLElement;
    expect(emptyEl.className).toBe('text-text-primary');
  });
});

describe('StandingBars — className (on-dark cascade)', () => {
  it('a caller className overrides the default ink color on the figure (twMerge, not append)', () => {
    const { container } = render(
      <StandingBars {...UNSIGNED_BASE} frame="bare" className="text-text-on-accent" />,
    );
    const figure = container.querySelector('[data-slot="standing-bars"]') as HTMLElement;
    expect(figure.className).toContain('text-text-on-accent');
    expect(figure.className).not.toContain('text-text-primary');
  });

  it('row labels/values use text-current (not a hardcoded ink class) so the override cascades', () => {
    const { container } = render(<StandingBars {...UNSIGNED_BASE} className="text-text-on-accent" />);
    const rowSpans = Array.from(visibleRows(container).querySelectorAll('span')) as HTMLElement[];
    const currentColorSpans = rowSpans.filter((el) => /text-current/.test(el.className));
    expect(currentColorSpans.length).toBeGreaterThan(0);
    for (const el of rowSpans) {
      expect(el.className).not.toMatch(/\btext-text-primary\b|\btext-text-tertiary\b/);
    }
  });

  it('propagates to the loading/error/empty states too, so a bare on-dark instrument never flashes dark-on-dark text', () => {
    const { container: loading } = render(
      <StandingBars {...UNSIGNED_BASE} state="loading" frame="bare" className="text-text-on-accent" />,
    );
    expect((loading.querySelector('[role="status"]') as HTMLElement).className).toContain('text-text-on-accent');

    const { container: empty } = render(
      <StandingBars {...UNSIGNED_BASE} state="empty" frame="bare" className="text-text-on-accent" />,
    );
    expect((empty.querySelector('[data-state="empty"]') as HTMLElement).className).toContain('text-text-on-accent');
  });

  it('an on-dark className swaps the rail TRACK background from the light token to the dark inline oklch value (unsigned/rail geometry)', () => {
    const light = render(<StandingBars {...UNSIGNED_BASE} />).container;
    const lightRail = visibleRows(light).querySelector('[class*="rounded-full"]') as HTMLElement;
    expect(lightRail.className).toMatch(/bg-surface-sunken/);
    expect(lightRail.style.background).toBe('');

    const dark = render(<StandingBars {...UNSIGNED_BASE} className="text-text-on-accent" />).container;
    const darkRail = visibleRows(dark).querySelector('[class*="rounded-full"]') as HTMLElement;
    expect(darkRail.className).not.toMatch(/bg-surface-sunken/);
    expect(darkRail.style.background).toMatch(/oklch\(1 0 0 \/ 0\.14\)/);
  });

  it('an on-dark className swaps the rail TRACK background for the diverging (sg_*) geometry too', () => {
    const dark = render(<StandingBars {...SIGNED_BASE} className="text-text-on-accent" />).container;
    const darkRail = visibleRows(dark).querySelector('[class*="rounded-full"]') as HTMLElement;
    expect(darkRail.className).not.toMatch(/bg-surface-sunken/);
    expect(darkRail.style.background).toMatch(/oklch\(1 0 0 \/ 0\.14\)/);
  });
});
