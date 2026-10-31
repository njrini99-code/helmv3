'use client';

import { m } from 'motion/react';
import { Trophy } from 'lucide-react';
import { forwardRef } from 'react';
import { Icon } from '../../ui/Icon';
import { Button } from '../../ui/Button';
import { haptic } from '../../lib/haptics';
import { chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import type { ChQWrites } from '../qualifiers/writes';
import { TournamentFields } from '../tournaments/fields/TournamentFields';
import type { ChTourErrors, ChTourState } from '../tournaments/fields/rounds-model';

/** Why Track can't be turned on for the event being edited (F8, F9). */
export type TrackBlock = 'series' | 'cancelled' | null;

export const TRACK_HINT = {
  on: 'Creates the tournament, with one calendar entry per round.',
  legacy: 'This event isn’t in Tournaments yet. Turn on to set it up there.',
  off: 'Saves as a calendar entry only. Turn on to follow lineups, scores and results in Tournaments.',
  series: 'A repeating event can’t become a tournament. Make a new event for it.',
  cancelled: 'A cancelled event can’t become a tournament. Restore it first.',
} as const;

/**
 * The calendar editor's tournament section (P-5 4.1): the header with the Track switch, its hint, and, while Track is
 * on, the shared TournamentFields. The editor hides its own date, time, all-day, repeat, place and find-a-time fields
 * while Track is on, and its receipt becomes the tournament's sentence.
 *
 * Opening and closing animate opacity only: the body appears in place (no height motion), and nothing moves when the
 * editor opens on a tournament already chosen.
 */
export const TournamentSection = forwardRef<HTMLElement, {
  track: boolean;
  onTrack: (on: boolean) => void;
  /** The event being edited was made before P-5 (or with Track off): Track starts off, with its own hint. */
  legacy: boolean;
  block: TrackBlock;
  state: ChTourState;
  onChange: (next: ChTourState) => void;
  errors: ChTourErrors;
  showErrors: boolean;
  timezone: string;
  courseWrites: Pick<ChQWrites, 'courses' | 'tees'>;
  announce: (line: string) => void;
  /** Turned on for an event that was a round of a tournament that was removed (CH-6144). */
  orphan?: { round: number } | null;
  disabled?: boolean;
}>(function TournamentSection({ track, onTrack, legacy, block, state, onChange, errors, showErrors, timezone, courseWrites, announce, orphan, disabled }, ref) {
  const reduced = useChReducedMotion();
  const hint = block === 'series' ? TRACK_HINT.series : block === 'cancelled' ? TRACK_HINT.cancelled : track ? TRACK_HINT.on : legacy ? TRACK_HINT.legacy : TRACK_HINT.off;
  const hintCode = block === 'series' ? 'CH-6148' : block === 'cancelled' ? 'CH-6149' : undefined;
  return (
    <section ref={ref} className="ch-tfx" role="group" aria-labelledby="ch-tfx-title" data-ch-code="CH-6640" inert={disabled || undefined}>
      <div className="ch-tfx__head">
        <h3 id="ch-tfx-title" className="ch-tfx__title">
          <Icon icon={Trophy} size={18} />
          Tournament details
        </h3>
        <label className="ch-switch ch-tfx__track">
          <input
            type="checkbox"
            role="switch"
            checked={track}
            disabled={!!block}
            aria-describedby="ch-tfx-hint"
            onChange={(e) => {
              haptic('select');
              onTrack(e.target.checked);
            }}
          />
          <span className="ch-switch__t" aria-hidden="true" />
          Track in Tournaments
        </label>
      </div>
      <p id="ch-tfx-hint" className={'ch-tfx__hint' + (hintCode ? ' is-error' : '')} data-ch-code={hintCode}>
        {hint}
      </p>
      {track && orphan && (
        <div className="ch-tfx-note ch-tfx-note--info" data-ch-code="CH-6144">
          <span>{`This was R${orphan.round} of a tournament that was removed. Set it up again from the season home to keep all its days together.`}</span>
          <Button variant="secondary" size="sm" className="ch-tfx-note__act" href="/golf/dashboard/tournaments">
            Open Set up from calendar
          </Button>
        </div>
      )}
      {track && (
        <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...chTween('quick', reduced), delay: reduced ? 0 : 0.05 }}>
          <TournamentFields state={state} onChange={onChange} errors={errors} showErrors={showErrors} timezone={timezone} courseWrites={courseWrites} announce={announce} />
        </m.div>
      )}
    </section>
  );
});

/**
 * CH-6040: the toast after a tournament is set up. No Undo (4.34.5): players may already have seen it, so deleting or
 * stopping tracking from the desk is the undo. Open goes to the desk.
 */
export function tournamentSavedToast(name: string, tournamentId: string) {
  return { code: 'CH-6040', title: `${name} is set up in Tournaments`, action: 'Open', href: `/golf/dashboard/tournaments/${tournamentId}` } as const;
}

/** A save the RPC refused (CH-60xx, CH-614x, CH-6241): shown at the top of the section, focused, the editor kept open. */
export function TournamentSaveNotice({ code, text, onOpen, onReload }: { code: string; text: string; onOpen?: () => void; onReload?: () => void }) {
  return (
    <div className="ch-tfx-note ch-tfx-note--error" role="alert" tabIndex={-1} data-ch-code={code} id="ch-tfx-save-error">
      <b>{code === 'CH-6241' ? text : 'Couldn’t set up the tournament. Nothing was saved.'}</b>
      {code !== 'CH-6241' && code !== 'CH-6056' && <span>{text}</span>}
      {onOpen && (
        <Button variant="secondary" size="sm" className="ch-tfx-note__act" onClick={onOpen}>
          Open
        </Button>
      )}
      {onReload && (
        <Button variant="secondary" size="sm" className="ch-tfx-note__act" onClick={onReload}>
          Reload
        </Button>
      )}
    </div>
  );
}
