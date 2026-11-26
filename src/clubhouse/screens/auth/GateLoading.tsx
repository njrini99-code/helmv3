'use client';

import { useRefresh } from '../../lib/use-refresh';
import { AuthNotice } from './AuthNotice';
import { GateFrame } from './GateFrame';
import { GateChecking, GateKey } from './gate-fields';

/**
 * What a route's `loading.tsx` draws while the page reads who is here (a team code resolving, a staff invitation being
 * checked, waiting for approval): the sign-in room already up with a quiet "checking" line, so the step from the last
 * page is never the dashboard's skeleton or an empty frame.
 */
export function GateLoading({ label, title, line, say }: { label: string; title: string; line: string; say?: { title: string; line: string } }) {
  return (
    <GateFrame label={label} say={say ?? { title: 'GolfHelm for college golf.', line: 'Rounds, stats, travel and qualifiers in one place' }} viewKey="loading">
      <GateChecking title={title} line={line} />
    </GateFrame>
  );
}

/**
 * A gate whose read about the account failed (GAP-S-04, CH-15290): the same room, the step's heading, the one failure
 * line and Try again, which re-runs the page's read. Never the step's blank form: a read that failed is not evidence of
 * who is here.
 */
export function GateFailed({ label, title }: { label: string; title: string }) {
  const { refresh, refreshing } = useRefresh();
  return (
    <GateFrame label={label} say={{ title: 'GolfHelm for college golf.', line: 'Rounds, stats, travel and qualifiers in one place' }} viewKey="failed">
      <div className="ch-au-form" data-ch-code="CH-15290">
        <h1>{title}</h1>
        <div className="ch-au-err">
          <AuthNotice tone="danger">We couldn’t check your account just now. Nothing you saved is lost. Try again.</AuthNotice>
        </div>
        <GateKey data-ctl="CTL-P015-015" idle="Try again" working="Checking…" busy={refreshing} type="button" onClick={refresh} />
      </div>
    </GateFrame>
  );
}
