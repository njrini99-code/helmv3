// @vitest-environment jsdom
/* eslint-disable helm/no-raw-button -- deliberately minimal test doubles */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { TriageDesk } from '../TriageDesk';

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace, refresh: navigation.refresh }),
  usePathname: () => '/golf/dashboard/intelligence',
  useSearchParams: () => navigation.params,
}));

vi.mock('@/components/fairway', () => ({
  Button: ({ children, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{children}</button>
  ),
  InlineNotice: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PlayersGridView: () => <div data-testid="players-view" />,
  fairwayToast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

vi.mock('@/app/golf/actions/insights', () => ({
  refreshTeamAnalysisAsCoach: vi.fn(),
}));

vi.mock('@/app/golf/actions/signal-groups', () => ({
  reviewSignal: vi.fn(),
  dismissSignal: vi.fn(),
}));

vi.mock('../BriefBand', () => ({ BriefBand: () => <div data-testid="brief-band" /> }));
vi.mock('../ViewSwitch', () => ({ ViewSwitch: () => <div data-testid="view-switch" /> }));
vi.mock('../SignalQueue', () => ({ SignalQueue: () => <div data-testid="signal-queue" /> }));
vi.mock('../EffectivenessScoreboard', () => ({ EffectivenessScoreboard: () => <div /> }));
vi.mock('../SignalDossier', () => ({
  SignalDossier: ({ entry, onPromoted }: { entry: { signal: GroupedSignal } | null; onPromoted: (signal: GroupedSignal) => void }) => (
    <div data-testid="signal-dossier">
      {entry ? <button onClick={() => onPromoted(entry.signal)}>Test prescribe complete</button> : 'No selection'}
    </div>
  ),
}));

function signal(): GroupedSignal {
  return {
    id: 'signal-1',
    kind: 'insight',
    category: 'putting',
    severity: 'high',
    title: 'Putting leak',
    claim: 'Short putts are costing strokes.',
    ageDays: 2,
    status: 'active',
    strokeImpact: 0.8,
    playerId: 'player-1',
    supersededCount: 0,
  };
}

function group(): SignalGroup {
  return {
    playerId: 'player-1',
    playerName: 'Alex Rivera',
    attentionScore: 10,
    worstSeverity: 'high',
    signals: [signal()],
  };
}

function renderDesk() {
  return render(
    <TriageDesk
      coachId="coach-1"
      groups={[group()]}
      scannedAt={null}
      groupsError={null}
      playersDrillProps={{} as never}
      effectivenessDrillProps={{} as never}
    />,
  );
}

describe('TriageDesk URL-driven drill-ins', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
  });

  it('keeps the queue visible when a stale signal deep link no longer resolves', () => {
    navigation.params = new URLSearchParams('signal=removed-signal');
    renderDesk();

    const queueShell = screen.getByTestId('signal-queue').parentElement;
    expect(queueShell).not.toHaveClass('hidden');
  });

  it('opens a valid signal in the narrow-screen dossier state', () => {
    navigation.params = new URLSearchParams('signal=signal-1');
    renderDesk();

    expect(screen.getByTestId('signal-queue').parentElement).toHaveClass('hidden');
    expect(screen.getByTestId('signal-dossier').parentElement).not.toHaveClass('hidden');
  });

  it('preserves player context after Prescribe and avoids a competing refresh', () => {
    navigation.params = new URLSearchParams('signal=signal-1');
    renderDesk();

    fireEvent.click(screen.getByRole('button', { name: 'Test prescribe complete' }));

    expect(navigation.replace).toHaveBeenCalledWith(
      '/golf/dashboard/intelligence?view=players&player=player-1',
      { scroll: false },
    );
    expect(navigation.refresh).not.toHaveBeenCalled();
  });
});
