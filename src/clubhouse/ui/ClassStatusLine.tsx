'use client';

import { BookOpen } from 'lucide-react';
import { useCallback } from 'react';
import { classStatusText, type ChClassStatus } from '../data/class-status';
import { useChClock } from '../lib/use-clock';
import { Icon } from './Icon';
import '../styles/class-awareness.css';

/**
 * P-10 class awareness: the one status line every surface draws ("In class until 11:50 AM"), from the text
 * `classStatusFor` and `classStatusText` produce, so the thread header, Roster, Home's sheet and the player's own
 * "Coaches see" row can't word the same moment two ways. A book glyph leads a class, an exam and a block that starts
 * soon; a trip has no glyph (it is Roster's own wording, not a class). The glyph is decoration: the text is the name.
 */
export function ClassStatusLine({ kind, text, className }: { kind: ChClassStatus['kind']; text: string; className?: string }) {
  const glyph = kind === 'in_class' || kind === 'exam' || kind === 'soon';
  return (
    <span className={'ch-ca-line' + (className ? ` ${className}` : '')} data-kind={kind}>
      {glyph && <Icon icon={BookOpen} size={12} />}
      <span>{text}</span>
    </span>
  );
}

/**
 * The status text for this device's clock and the payload's zones, as a function: `text(status)` is the line, or null
 * when there is nothing to say. The same function every render for the same clock and zones, so it is safe in a
 * dependency list.
 */
export function useClassText(zones: { teamTimeZone: string; classTimeZone: string | null } | null): (status: ChClassStatus) => string | null {
  const clock = useChClock();
  const team = zones?.teamTimeZone ?? null;
  const klass = zones?.classTimeZone ?? null;
  return useCallback(
    (status: ChClassStatus) => (team ? classStatusText(status, { clock, teamTz: team, classTz: klass }) : null),
    [clock, team, klass],
  );
}
