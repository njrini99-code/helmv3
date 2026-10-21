'use client';

import { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { COACHHELM_ENGINE_RATE_LIMITED } from '@/lib/auth/action-rate-limit-messages';
import { haptic } from '../../lib/haptics';
import { friendlyReason } from '../../lib/friendly-reason';
import { chReport, chTrail } from '../../lib/track';
import { isOffline } from '../../lib/use-action';
import { useRefresh } from '../../lib/use-refresh';
import { Button } from '../../ui/Button';
import { LIVE_RECHECK_WRITES, type ChRecheckResult, type ChRecheckWrites } from './writes';

type RecheckState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; line: string }
  | { kind: 'limited' }
  | { kind: 'failed'; line: string };

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Re-checked 7 players · 3 new reads", with who was skipped or did not finish when there were any (CH-13945). */
export function recheckDoneLine(r: ChRecheckResult): string {
  const created = r.insightsCreated ?? 0;
  const parts = [`Re-checked ${count(r.playersAnalyzed ?? 0, 'player', 'players')}`, created === 0 ? 'no new reads' : count(created, 'new read', 'new reads')];
  if ((r.playersSkipped ?? 0) > 0) parts.push(`${r.playersSkipped} skipped`);
  if ((r.playersFailed ?? 0) > 0) parts.push(`${r.playersFailed} didn’t finish`);
  return parts.join(' · ');
}

/** "Re-checking 7 players…", or "Re-checking your players…" when the roster count did not load. */
export function recheckRunningLabel(players: number | null): string {
  return players && players > 0 ? `Re-checking ${count(players, 'player', 'players')}…` : 'Re-checking your players…';
}

/**
 * Re-check reads (CH-13944): the coach's one way, on the Clubhouse board, to run CoachHelm again for the whole team, as
 * Fairway's Triage desk "Scan team" does. A quiet secondary action under the board, never its primary. It calls the same
 * server action (`refreshTeamAnalysisAsCoach` through `writes.recheck`), which resolves the coach and the team from the
 * session and spends the engine's rate limit once: nothing here sends a team or a player id.
 *
 * States, one line under the button: running (the button's spinner, and the line "Re-checking 7 players…", CH-13406), done ("Re-checked 7
 * players · 3 new reads", then the board's data is read again, CH-13945), rate-limited (the action's own words, CH-13007) and
 * failed (CH-13006). The tap is silent, as a secondary button's is; the outcome gives the success or the error haptic
 * (CH-13705). Not `useAction`: its "Still saving…" toast at five seconds would misread a team re-check, which runs longer
 * than that as a rule, and the outcome here is the line, not a toast.
 */
export function RecheckReads({ players, writes = LIVE_RECHECK_WRITES }: { players: number | null; writes?: ChRecheckWrites }) {
  const [state, setState] = useState<RecheckState>({ kind: 'idle' });
  const inFlight = useRef(false);
  const { refresh } = useRefresh();

  const run = async () => {
    if (inFlight.current) return;
    chTrail('action coachhelm.recheck');
    if (isOffline()) {
      haptic('error');
      setState({ kind: 'failed', line: 'Couldn’t re-check the reads: you’re offline. Reconnect, then try again. Nothing was changed.' });
      return;
    }
    inFlight.current = true;
    setState({ kind: 'running' });
    let res: ChRecheckResult | null = null;
    try {
      res = await writes.recheck();
    } catch (err) {
      chReport(err, { surface: 'coachhelm', action: 'coachhelm.recheck' });
    } finally {
      inFlight.current = false;
    }
    if (res?.success) {
      haptic('success');
      setState({ kind: 'done', line: recheckDoneLine(res) });
      // The board shows what the re-check wrote: the page's own reads, again.
      refresh();
      return;
    }
    haptic('error');
    if (res?.error === COACHHELM_ENGINE_RATE_LIMITED) {
      setState({ kind: 'limited' });
      return;
    }
    if (res) chReport(new Error(res.error || 'recheck failed'), { surface: 'coachhelm', action: 'coachhelm.recheck', severity: 'low' });
    setState({ kind: 'failed', line: `Couldn’t re-check the reads. ${friendlyReason(res?.error) ?? 'The board is as it was. Try again in a moment.'}` });
  };

  const running = state.kind === 'running';
  return (
    <div className="ch-hl-rck" data-ch-code="CH-13944">
      <Button variant="secondary" leftIcon={RefreshCw} busy={running} onClick={() => void run()}>
        {running ? recheckRunningLabel(players) : 'Re-check reads'}
      </Button>
      <p className={'ch-hl-rck__s' + (state.kind === 'failed' || state.kind === 'limited' ? ' is-failed' : '')} role="status">
        {state.kind === 'running' && (
          <>
            <span data-ch-code="CH-13406" className="ch-num">
              {recheckRunningLabel(players)}
            </span>{' '}
            This can take a minute; the board stays as it is until it’s done.
          </>
        )}
        {state.kind === 'done' && <span data-ch-code="CH-13945" className="ch-num">{state.line}</span>}
        {state.kind === 'limited' && <span data-ch-code="CH-13007">{COACHHELM_ENGINE_RATE_LIMITED}</span>}
        {state.kind === 'failed' && <span data-ch-code="CH-13006">{state.line}</span>}
      </p>
    </div>
  );
}
