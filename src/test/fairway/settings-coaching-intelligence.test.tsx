import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

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

vi.mock('@/app/golf/actions/insights', () => ({
  getOrCreateTeamCoachHelmSettings: vi.fn(async () => ({
    success: true,
    settings: { id: 'settings-1', team_id: 'team-1', enabled: true },
  })),
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
  InlineNotice: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
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
  ThresholdSlider: () => <div />,
  WeightDistributor: () => <div />,
  AlertTypeToggles: () => <div />,
}));

describe('FairwaySettingsCoachingIntelligence', () => {
  beforeEach(() => {
    saveMock.mockResolvedValue(true);
    saveMock.mockClear();
    saveCoachingPhilosophyMock.mockResolvedValue({ success: true });
    saveCoachingPhilosophyMock.mockClear();
  });

  it('saves priority reorder through the philosophy hook without issuing a duplicate server-action write', async () => {
    const { FairwaySettingsCoachingIntelligence } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsCoachingIntelligence'
    );

    render(<FairwaySettingsCoachingIntelligence />);

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
});
