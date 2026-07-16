import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard for the Stat Visuals gallery's "Import stats" empty-state
// CTA: it used to hardcode href="/baseball/dashboard/import" regardless of the
// viewer's capability, which silently bounced a can_manage_stats-only staffer
// off the Import Center's can_manage_imports middleware gate (the SAME lockout
// class Stats Center's header "Import Center" button and "Import a box score"
// empty-state CTA were already fixed to avoid). The gallery must never
// hardcode a route: the parent resolves + passes `importHref`, and omitting it
// hides the CTA entirely instead of dead-ending the viewer.
// ─────────────────────────────────────────────────────────────────────────────

import { StatVisualsSection } from '../StatVisualsSection';

describe('StatVisualsSection — capability-resolved import CTA', () => {
  it('team scope: routes the empty-state "Import stats" CTA to the parent-resolved importHref', () => {
    render(<StatVisualsSection scope="team" data={{}} importHref="/baseball/dashboard/stats/upload" />);

    const link = screen.getByRole('link', { name: /import stats/i });
    expect(link).toHaveAttribute('href', '/baseball/dashboard/stats/upload');
  });

  it('team scope: hides the CTA entirely when no importHref is supplied (no hardcoded fallback route)', () => {
    render(<StatVisualsSection scope="team" data={{}} />);

    expect(screen.queryByRole('link', { name: /import stats/i })).not.toBeInTheDocument();
  });

  it('player scope: never shows the import CTA, even when importHref is supplied', () => {
    render(<StatVisualsSection scope="player" data={{}} importHref="/baseball/dashboard/import" />);

    expect(screen.queryByRole('link', { name: /import stats/i })).not.toBeInTheDocument();
  });
});
