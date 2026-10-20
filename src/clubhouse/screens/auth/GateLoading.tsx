'use client';

import { GateFrame } from './GateFrame';
import { GateChecking } from './gate-fields';

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
