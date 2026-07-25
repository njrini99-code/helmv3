import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { GolfUserProvider } from '@/contexts/golf-user-context';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';

const saveMock = vi.fn();
const saveCoachingPhilosophyMock = vi.fn();

const philosophy: CoachPhilosophy = {
  id: 'philosophy-1',
  coachId: 'coach-1',
  priorityBallStriking: 1,
  priorityShortGame: 2,
  priorityPutting: 3,
  priorityCourseManagement: 4,
  priorityMentalGame: 5,
  alertSensitivity: 'balanced',
  declineThreshold: 1.5,
  pressureGapThreshold: 2,
  bubbleZoneRange: 3,
  weightHistorical: 20,
  weightRecentForm: 30,
  weightTournament: 25,
  weightQualifying: 15,
  weightSubjective: 10,
  alertScoringDecline: true,
  alertStatRegression: true,
  alertTournamentPressure: true,
  alertPlateau: true,
  alertBubblePlayer: true,
  alertSurgePlayer: true,
  alertStreaks: true,
  alertRecurringWeakness: true,
  alertClosingHoles: true,
  alertPar3Issues: true,
  showStrokesGained: true,
  showAdvancedStats: false,
  insightVerbosity: 'brief',
  createdAt: '2026-05-31T00:00:00.000Z',
  minInsightConfidence: 0.3,
  minRoundsForSignal: 3,
  alertDigest: 'immediate' as const,
  updatedAt: '2026-05-31T00:00:00.000Z',
};

// next/link renders a real <a> in jsdom but its prefetch IntersectionObserver
// isn't a constructor here — mock to a plain anchor so the back link (P083)
// renders without the observer crash.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: { id: 'coach-1', organization_id: 'org-1' },
        error: null,
      })),
    })),
  }),
}));

const { useCoachPhilosophyMock } = vi.hoisted(() => ({
  useCoachPhilosophyMock: vi.fn(),
}));

vi.mock('@/hooks/coachhelm/useCoachPhilosophy', () => ({
  useCoachPhilosophy: (...args: unknown[]) => useCoachPhilosophyMock(...args),
}));

vi.mock('@/app/golf/actions/coaching-philosophy', () => ({
  saveCoachingPhilosophy: saveCoachingPhilosophyMock,
}));

const { getTeamCoachHelmAccessMock, weightDistributorMock } = vi.hoisted(() => ({
  getTeamCoachHelmAccessMock: vi.fn(async () => ({
    success: true,
    isHeadCoach: true,
  })),
  // P079 — spy that fails the test if the suppressed Comparison Weighting
  // distributor is ever rendered by the Fairway page.
  weightDistributorMock: vi.fn(() => null),
}));

vi.mock('@/app/golf/actions/insights', () => ({
  getOrCreateTeamCoachHelmSettings: vi.fn(async () => ({
    success: true,
    settings: { id: 'settings-1', team_id: 'team-1', enabled: true },
  })),
  getTeamCoachHelmAccess: getTeamCoachHelmAccessMock,
  updateTeamCoachHelmSettings: vi.fn(async () => ({
    success: true,
    settings: { id: 'settings-1', team_id: 'team-1', enabled: false },
  })),
}));

vi.mock('@/lib/golf/resolve-team', () => ({
  resolveCoachTeamId: vi.fn(async () => 'team-1'),
}));

vi.mock('@/components/fairway', () => ({
  ViewHeader: ({ title, meta }: { title: string; meta?: React.ReactNode }) => (
    <header>
      {title}
      {meta}
    </header>
  ),
  Surface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  // Test double for the Segmented primitive (Alert delivery cadence).
  Segmented: ({
    value,
    onValueChange,
    options,
    'aria-label': ariaLabel,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    options: { value: string; label: string }[];
    'aria-label'?: string;
  }) => (
    <div role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        // eslint-disable-next-line helm/no-raw-button
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onValueChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  ),
  // Test double for the Fairway Slider primitive, which replaced the
  // hand-rolled ThresholdSlider (2026-07-25). Renders the label so the
  // "all 3 thresholds are present" assertion below still has something to
  // query, and a real range input so a value change can be driven.
  Slider: ({
    label,
    value,
    onValueChange,
    unit,
  }: {
    label?: React.ReactNode;
    value: number;
    onValueChange: (v: number) => void;
    unit?: string;
  }) => (
    <div>
      <label htmlFor={`slider-${String(label)}`}>{label}</label>
      <input
        id={`slider-${String(label)}`}
        type="range"
        value={value}
        onChange={(e) => onValueChange(parseFloat(e.currentTarget.value))}
      />
      {unit}
    </div>
  ),
  // Minimal Button test double — renders children so `asChild` back-link /
  // EmptyState CTA content is queryable (the real primitive merges onto a slot).
  Button: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  InlineNotice: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
  EmptyState: ({
    title,
    action,
  }: {
    title?: React.ReactNode;
    action?: React.ReactNode;
  }) => (
    <div>
      {title}
      {action}
    </div>
  ),
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
    'aria-label': string;
  }) => (
    // Test double for the Fairway Switch primitive.
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));

vi.mock('@/components/golf/coachhelm/settings', () => ({
  PriorityRanker: ({ onChange }: { onChange: (values: Partial<CoachPhilosophy>) => void }) => (
    // Test double for the legacy sortable editor.
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      onClick={() =>
        onChange({
          priorityBallStriking: 2,
          priorityShortGame: 1,
          priorityPutting: 3,
          priorityCourseManagement: 4,
          priorityMentalGame: 5,
        })
      }
    >
      Reorder priorities
    </button>
  ),
  SensitivitySlider: () => <div />,
  WeightDistributor: weightDistributorMock,
}));

describe('FairwaySettingsCoachingIntelligence', () => {
  beforeEach(() => {
    saveMock.mockResolvedValue(true);
    saveMock.mockClear();
    saveCoachingPhilosophyMock.mockResolvedValue({ success: true });
    saveCoachingPhilosophyMock.mockClear();
    weightDistributorMock.mockClear();
    getTeamCoachHelmAccessMock.mockClear();
    getTeamCoachHelmAccessMock.mockResolvedValue({ success: true, isHeadCoach: true });
    useCoachPhilosophyMock.mockReset();
    useCoachPhilosophyMock.mockReturnValue({
      philosophy,
      loading: false,
      saving: false,
      error: null,
      save: saveMock,
    });
  });

  function renderPage() {
    return import(
      '@/components/fairway/pages/settings/FairwaySettingsCoachingIntelligence'
    ).then(({ FairwaySettingsCoachingIntelligence }) =>
      render(
        <GolfUserProvider
          userData={{
            role: 'coach',
            userId: 'user-1',
            name: 'Coach',
            coachId: 'coach-1',
            teamId: 'team-1',
            organizationId: 'org-1',
          }}
        >
          <FairwaySettingsCoachingIntelligence />
        </GolfUserProvider>,
      ),
    );
  }

  it('saves priority reorder through the philosophy hook without issuing a duplicate server-action write', async () => {
    const { FairwaySettingsCoachingIntelligence } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsCoachingIntelligence'
    );

    // The component reads the ACTIVE team from GolfUserContext (cookie-aware,
    // resolved by the dashboard layout) — provide it like the layout does.
    render(
      <GolfUserProvider
        userData={{
          role: 'coach',
          userId: 'user-1',
          name: 'Coach',
          coachId: 'coach-1',
          teamId: 'team-1',
          organizationId: 'org-1',
        }}
      >
        <FairwaySettingsCoachingIntelligence />
      </GolfUserProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reorder priorities' }));

    const expectedPatch = {
      priorityBallStriking: 2,
      priorityShortGame: 1,
      priorityPutting: 3,
      priorityCourseManagement: 4,
      priorityMentalGame: 5,
    };

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith(expectedPatch, { revalidate: true });
    });
    expect(saveCoachingPhilosophyMock).not.toHaveBeenCalled();
  });

  // ── B17 — all 3 documented "Fine-tune Thresholds" sliders must render ─────
  it('renders all 3 documented Fine-tune Thresholds sliders, including Bubble Zone', async () => {
    await renderPage();

    await screen.findByText('Decline threshold');
    expect(screen.getByText('Decline threshold')).toBeInTheDocument();
    expect(screen.getByText('Pressure gap')).toBeInTheDocument();
    expect(screen.getByText('Bubble zone')).toBeInTheDocument();
  });

  // ── P079 — the Comparison Weighting section + stub distributor must be gone ─
  it('does not render the Comparison Weighting section or its stub distributor (P079)', async () => {
    await renderPage();

    await screen.findByText('Decline threshold');
    expect(screen.queryByText(/comparison weighting/i)).not.toBeInTheDocument();
    expect(weightDistributorMock).not.toHaveBeenCalled();
  });

  // ── B16 — Active Alerts cards must expose an accessible switch, not a bare
  //    checkbox-role card (the Fairway Switch test double renders a real
  //    <button> with aria-pressed, standing in for the Base UI switch role) ──
  it('renders every Active Alerts toggle as an accessible switch control', async () => {
    await renderPage();

    // Let the coachId resolution (which remounts CoachingIntelligenceBody via
    // its `key`) settle FIRST — clicking a control before that remount fires
    // clicks a node React is about to detach, and the click is lost.
    await screen.findByText('Decline threshold');

    // One of each group's alerts, by its documented label (@/lib/coachhelm/types).
    const scoringDecline = screen.getByRole('button', { name: 'Scoring decline' });
    expect(scoringDecline).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(scoringDecline);
    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith({ alertScoringDecline: false }, { revalidate: true });
    });
  });

  // ── P083 — explicit back affordance to the settings index ─────────────────
  it('renders a back link to the settings index (P083)', async () => {
    await renderPage();

    const back = await screen.findByRole('link', { name: 'Settings' });
    expect(back).toHaveAttribute('href', '/golf/dashboard/settings');
  });

  // ── P084 — head coach: master switch is interactive ───────────────────────
  it('enables the Team CoachHelm switch for the head coach (P084)', async () => {
    getTeamCoachHelmAccessMock.mockResolvedValue({ success: true, isHeadCoach: true });
    await renderPage();

    const sw = await screen.findByLabelText('Team CoachHelm enabled');
    await waitFor(() => expect(sw).not.toBeDisabled());
    expect(screen.queryByText('Only the head coach can change this.')).not.toBeInTheDocument();
  });

  // ── P084 — assistant coach: switch disabled + helper text, no failed flip ──
  it('disables the Team CoachHelm switch with helper text for an assistant coach (P084)', async () => {
    getTeamCoachHelmAccessMock.mockResolvedValue({ success: true, isHeadCoach: false });
    await renderPage();

    const sw = await screen.findByLabelText('Team CoachHelm enabled');
    await waitFor(() => expect(sw).toBeDisabled());
    expect(screen.getByText('Only the head coach can change this.')).toBeInTheDocument();
  });

  // ── A save failure AFTER the initial load must surface, not silently
  //    snap the control back with zero explanation ──────────────────────────
  it('surfaces a post-load save failure via the meta chip and an InlineNotice', async () => {
    useCoachPhilosophyMock.mockReturnValue({
      philosophy,
      loading: false,
      saving: false,
      error: 'permission denied for table golf_coach_philosophy',
      save: saveMock,
    });

    await renderPage();

    await screen.findByText('Decline threshold');
    // The meta chip (next to where "Saving…"/"Saved" render) reflects failure.
    expect(screen.getByText('Couldn’t save')).toBeInTheDocument();
    // The InlineNotice banner carries the actual server error for context.
    expect(
      screen.getByText(/permission denied for table golf_coach_philosophy/),
    ).toBeInTheDocument();
    // A failed save must never ALSO claim "Saved" — that would contradict it.
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});
