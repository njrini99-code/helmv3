'use client';

import { Icon } from '../../ui/Icon';
import { BookOpen, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { refetchTeamClassDay, useTeamClassDay } from '../../lib/use-class-day';
import { loadScheduleCoverage, loadTeamTerms, type ChScheduleCoverage } from '../../data/class-day';
import type { ChClassTerm } from '../../data/class-day-shape';
import { useChClock } from '../../lib/use-clock';
import { useClassAwareness } from '../../shell/context';
import { Swap } from '../../ui/Swap';
import { InClassSheet } from '../classes/InClassSheet';
import { TeamBreakSheet } from '../classes/TeamBreakSheet';
import { TermSheet } from '../classes/TermSheet';
import type { OtherTerm } from '../classes/term-form';
import { homeLineFor } from './home-line';
import '../../styles/class-awareness.css';

/**
 * P-10 class awareness: Coach Home's class line and the sheets behind it. A line, not a card: no border, no fill.
 * Phone: the first row of the page body, under the hero's Day card. Desktop: the head's subline row beside the
 * actions. It mounts its own hook (Home's first paint never waits for the class day), shows nothing while the flag is
 * off, while loading, on an error, or when `homeLineFor` has nothing true and useful to say.
 *
 * A tap opens the In class now sheet; with no term covering today and schedules in, it opens the Term sheet.
 */
export function ClassHomeLine({ teamId, today, variant, teamTimeZone }: { teamId: string; today: string; variant: 'phone' | 'desktop'; teamTimeZone: string }) {
  const enabled = useClassAwareness();
  const { day, status, now, refetch } = useTeamClassDay(teamId, { enabled });
  const clock = useChClock();
  const opts = useMemo(() => (day ? { clock, teamTz: day.teamTimeZone, classTz: day.classTimeZone } : null), [clock, day]);
  const [coverage, setCoverage] = useState<ChScheduleCoverage | null>(null);
  const noTerm = !!day && !day.term;
  const ids = useMemo(() => (day ? day.players.map((p) => p.playerId) : []), [day]);
  const idsKey = ids.join(',');
  // Schedules exist but no term covers today: the line asks for the term, so it needs to know whether schedules exist.
  useEffect(() => {
    if (!noTerm || ids.length === 0) {
      setCoverage(null);
      return;
    }
    let live = true;
    void loadScheduleCoverage(createClient(), ids, today).then((c) => live && setCoverage(c));
    return () => {
      live = false;
    };
    // `ids` is derived from `idsKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noTerm, idsKey, today]);

  const line = homeLineFor({ day, now, opts, coverage });
  const [sheet, setSheet] = useState<'none' | 'class' | 'term' | 'breaks'>('none');
  const [terms, setTerms] = useState<ChClassTerm[]>([]);
  const trigger = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (sheet !== 'term' || !enabled) return;
    let live = true;
    void loadTeamTerms(createClient(), teamId).then((t) => live && setTerms(t));
    return () => {
      live = false;
    };
  }, [sheet, teamId, enabled]);

  if (!enabled) return null;
  const editing = day?.term ?? null;
  const others: OtherTerm[] = terms.filter((t) => t.id !== editing?.id).map((t) => ({ id: t.id, label: t.label, classesStart: t.classesStart, examsEnd: t.examsEnd }));
  const sheets = (
    <>
      <InClassSheet
        open={sheet === 'class'}
        onClose={() => setSheet('none')}
        day={day}
        status={status}
        now={now}
        opts={opts}
        onRetry={() => void refetch()}
        onEditTerm={() => setSheet('term')}
        onBreaks={() => setSheet('breaks')}
        triggerRef={trigger}
      />
      <TermSheet
        open={sheet === 'term'}
        onClose={() => setSheet('none')}
        teamId={teamId}
        editing={editing}
        others={others}
        label={coverage?.label ?? editing?.label ?? null}
        teamTimeZone={teamTimeZone}
        classTimeZone={day?.classTimeZone ?? teamTimeZone}
        today={day?.on ?? today}
      />
      <TeamBreakSheet open={sheet === 'breaks'} onClose={() => setSheet('none')} teamId={teamId} today={day?.on ?? today} />
    </>
  );
  // The sheets stay mounted while the line is hidden: closing a sheet by saving a break hides the line for the day.
  if (!line) return <>{sheet !== 'none' ? sheets : null}</>;
  const open = () => setSheet(line.opens === 'term' ? 'term' : 'class');
  return (
    <span ref={trigger} className={`ch-ca-home ch-ca-home--${variant}`}>
      <button type="button" className="ch-ca-home__btn" aria-label={line.label} aria-haspopup="dialog" data-ch-code="CH-2870" onClick={open}>
        <Icon icon={BookOpen} size={14} />
        <Swap swapKey={`${line.line1}|${line.line2 ?? ''}`} inline>
          <span className="ch-ca-home__text" data-ch-code="CH-2670">
            <span className="ch-ca-home__l1">{line.line1}</span>
            {line.line2 && (
              <>
                <span className="ch-ca-home__sep" aria-hidden="true">
                  {variant === 'desktop' ? ' · ' : ''}
                </span>
                <span className="ch-ca-home__l2">{line.line2}</span>
              </>
            )}
          </span>
        </Swap>
        {variant === 'phone' && <Icon icon={ChevronRight} size={14} />}
      </button>
      {sheets}
    </span>
  );
}

export { refetchTeamClassDay };
