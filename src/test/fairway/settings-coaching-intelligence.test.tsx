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

vi.mock('@/hooks/coachhelm/useCoachPhilosophy', () => ({
  useCoachPhilosophy: () => ({
    philosophy,
    loading: false,
    saving: false,
    save: saveMock,
  }),
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
  ViewHeader: ({ title }: { title: string }) => <header>{title}</header>,
  Surface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
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
  ThresholdSlider: ({ label }: { label?: string }) => <div>{label}</div>,
  WeightDistributor: weightDistributorMock,
  AlertTypeToggles: () => <div />,
  SgBaselineSelector: () => <div />,
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

  // ── P078 — the dead "Bubble Zone" threshold slider must NOT render ────────
  it('does not render the Bubble Zone threshold slider (P078: zero engine consumers)', async () => {
    await renderPage();

    await screen.findByText('Decline Threshold');
    expect(screen.getByText('Decline Threshold')).toBeInTheDocument();
    expect(screen.getByText('Pressure Gap')).toBeInTheDocument();
    expect(screen.queryByText('Bubble Zone')).not.toBeInTheDocument();
  });

  // ── P079 — the Comparison Weighting section + stub distributor must be gone ─
  it('does not render the Comparison Weighting section or its stub distributor (P079)', async () => {
    await renderPage();

    await screen.findByText('Decline Threshold');
    expect(screen.queryByText('Comparison Weighting')).not.toBeInTheDocument();
    expect(weightDistributorMock).not.toHaveBeenCalled();
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
});
