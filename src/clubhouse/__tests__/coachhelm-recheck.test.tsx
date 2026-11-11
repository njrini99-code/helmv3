import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Re-check reads on the coach's CoachHelm Team page (CH-13944): the team re-run Fairway's Triage desk "Scan team" offers, through
 * the same action. States: running (CH-13406), done with the board read again (CH-13945), rate-limited in the action's own
 * words (CH-13007), failed (CH-13006), and the outcome haptics (CH-13705). Coach only. Rendered on its own here: the Team page
 * (`team/TeamBoard.tsx`) draws it only with CoachHelm on and players on the roster.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const track = vi.hoisted(() => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/track', () => track);
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
const refreshTeam = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({ refreshTeamAnalysisAsCoach: refreshTeam }));

import { COACHHELM_ENGINE_RATE_LIMITED } from '@/lib/auth/action-rate-limit-messages';
import { PREVIEW_HELM_PLAYER } from '../preview/fixtures-coachhelm';
import { RECHECK_DONE, RECHECK_FAILED, RECHECK_QUIET, RECHECK_RATE_LIMITED } from '../preview/fixtures-coachhelm-recheck';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { RecheckReads, recheckDoneLine, recheckRunningLabel } from '../screens/coachhelm/Recheck';
import { LIVE_RECHECK_WRITES, type ChRecheckResult, type ChRecheckWrites } from '../screens/coachhelm/writes';
import { ToastProvider } from '../ui/Toast';

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const PLAYERS = 5;
const show = (recheck: ChRecheckWrites, players: number | null = PLAYERS) => render(wrap(<RecheckReads players={players} writes={recheck} />));
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const answering = (r: ChRecheckResult) => ({ recheck: vi.fn(() => Promise.resolve(r)) });
const tap = () => fireEvent.click(screen.getByRole('button', { name: /re-check reads/i }));

describe('Re-check reads (CH-13944)', () => {
  it('CH-13944: one quiet secondary Re-check reads, not the primary', () => {
    show(answering(RECHECK_DONE));
    const btn = screen.getByRole('button', { name: 'Re-check reads' });
    expect(btn.className).toContain('ch-btn--secondary');
    expect(btn.className).not.toContain('ch-btn--primary');
    expect(code('CH-13944')).not.toBeNull();
  });

  it('CH-13944: a player never sees it', () => {
    render(wrap(<PlayerBoard data={PREVIEW_HELM_PLAYER} />));
    expect(screen.queryByRole('button', { name: /re-check/i })).toBeNull();
    expect(code('CH-13944')).toBeNull();
  });

  it('CH-13406: running says how many players it is re-checking, and a second tap sends nothing', async () => {
    let land: (r: ChRecheckResult) => void = () => {};
    const w = { recheck: vi.fn(() => new Promise<ChRecheckResult>((r) => (land = r))) };
    show(w);
    tap();
    await waitFor(() => expect(code('CH-13406')?.textContent).toBe(`Re-checking ${PLAYERS} players…`));
    const btn = screen.getByRole('button', { name: /re-checking 5 players/i });
    expect(btn.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(btn);
    expect(w.recheck).toHaveBeenCalledTimes(1);
    // The tap itself is silent (a secondary button); only the outcome is felt.
    expect(hapticSpy).not.toHaveBeenCalled();
    await act(async () => land(RECHECK_DONE));
  });

  it('CH-13945, CH-13705: done says what it read and wrote, reads the board again, and gives the success haptic', async () => {
    const w = answering(RECHECK_DONE);
    show(w);
    tap();
    await waitFor(() => expect(code('CH-13945')?.textContent).toBe('Re-checked 5 players · 3 new reads'));
    expect(w.recheck).toHaveBeenCalledWith();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(hapticSpy).toHaveBeenCalledWith('success');
    // The button is back for another run.
    expect(screen.getByRole('button', { name: 'Re-check reads' })).not.toBeNull();
  });

  it('CH-13007: rate-limited is the action’s own words, with the error haptic, and the board is not read again', async () => {
    show(answering(RECHECK_RATE_LIMITED));
    tap();
    await waitFor(() => expect(code('CH-13007')?.textContent).toBe(COACHHELM_ENGINE_RATE_LIMITED));
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(router.refresh).not.toHaveBeenCalled();
    expect(track.chReport).not.toHaveBeenCalled();
  });

  it('CH-13006: failed says so with the server’s plain reason, reports it, and leaves the board as it was', async () => {
    show(answering(RECHECK_FAILED));
    tap();
    await waitFor(() => expect(code('CH-13006')?.textContent).toBe('Couldn’t re-check the reads. Could not load the active roster.'));
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(router.refresh).not.toHaveBeenCalled();
    expect(track.chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'coachhelm.recheck', severity: 'low' }));
  });

  it('CH-13006: a thrown action is a failure with the default line, never a silent spinner', async () => {
    show({ recheck: vi.fn(() => Promise.reject(new Error('Load failed'))) });
    tap();
    await waitFor(() => expect(code('CH-13006')?.textContent).toBe('Couldn’t re-check the reads. The board is as it was. Try again in a moment.'));
    expect(screen.getByRole('button', { name: 'Re-check reads' }).getAttribute('aria-busy')).toBeNull();
  });

  it('CH-13006: offline sends nothing and says so', async () => {
    const w = answering(RECHECK_DONE);
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      show(w);
      tap();
      await waitFor(() => expect(code('CH-13006')?.textContent).toMatch(/you’re offline/));
      expect(w.recheck).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('Re-check copy', () => {
  it('counts players and reads in words, with who was skipped or did not finish', () => {
    expect(recheckDoneLine(RECHECK_DONE)).toBe('Re-checked 5 players · 3 new reads');
    expect(recheckDoneLine(RECHECK_QUIET)).toBe('Re-checked 4 players · no new reads · 1 skipped · 1 didn’t finish');
    expect(recheckDoneLine({ success: true, playersAnalyzed: 1, insightsCreated: 1 })).toBe('Re-checked 1 player · 1 new read');
    expect(recheckRunningLabel(7)).toBe('Re-checking 7 players…');
    expect(recheckRunningLabel(null)).toBe('Re-checking your players…');
  });
});

describe('the bridge', () => {
  it('calls refreshTeamAnalysisAsCoach with no team or player id', async () => {
    refreshTeam.mockResolvedValue(RECHECK_DONE);
    await expect(LIVE_RECHECK_WRITES.recheck()).resolves.toEqual(RECHECK_DONE);
    expect(refreshTeam).toHaveBeenCalledWith();
  });
});
