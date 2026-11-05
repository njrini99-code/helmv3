'use client';

import { ArrowUpRight, CircleX, Pencil, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateGolfEvent } from '@/app/golf/actions/calendar-events';
import { updateTournamentRound, type TournamentRoundPatch } from '@/app/golf/actions/tournaments-calendar';
import { offsetMinutesFor } from '@/lib/golf/timezone';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { DateField } from '../../ui/DateField';
import { TimeField } from '../../ui/TimeField';
import { Modal } from '../../ui/Modal';
import { Segmented } from '../../ui/Segmented';
import { useToast } from '../../ui/Toast';
import { chReport, chTrail } from '../../lib/track';
import { haptic } from '../../lib/haptics';
import { useChClock } from '../../lib/use-clock';
import { fmtHour, type ChCalEvent, type ChCalPerson } from './model';
import { roundLabel } from './round-label';
import { TournamentSaveNotice } from './editor-tournament';
import { roundStartAt, shortDay, teeMinutes, type ChTourStartType } from '../tournaments/fields/rounds-model';
import { START_TYPE_LABEL } from '../tournaments/fields/RoundRow';
import { refusalNotice, type TournamentRefusal } from '../tournaments/fields/refusals';

const toHHMM = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const shiftHHMM = (t: string, minutes: number) => {
  const m = Math.min(24 * 60 - 5, Math.max(0, teeMinutes(t) + minutes));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

interface Draft {
  date: string;
  tee: string | null;
  end: string | null;
  startType: ChTourStartType;
  notes: string;
  invited: string[];
  rsvp: boolean;
}

const draftOf = (e: ChCalEvent): Draft => ({
  date: e.date,
  tee: e.allDay || e.start == null ? null : toHHMM(e.start),
  end: e.allDay || e.end == null ? null : toHHMM(e.end),
  startType: e.round?.startType ?? 'tee_times',
  notes: e.notes ?? '',
  invited: [...e.people].sort(),
  rsvp: e.rsvpRequired,
});
const sig = (d: Draft) => JSON.stringify([d.date, d.tee, d.end, d.startType, d.notes.trim(), [...d.invited].sort(), d.rsvp]);

/**
 * CH-6041: what a round's save says. A day or time change names where it went ("R2 moved to Fri 6 Nov, 8:30 AM", with
 * "Tee times moved with it." when the tee sheet shifted); made all-day, "R2 has no tee time now". Anything else is the
 * calendar's own "Saved" (CH-6001).
 */
export function roundSavedToast(p: { label: string; date: string; tee: string | null; moved: boolean; teeTimesShifted: number; clock?: '12' | '24' }): { code: string; title: string } {
  if (!p.moved) return { code: 'CH-6001', title: `Saved · ${p.label}` };
  if (!p.tee) return { code: 'CH-6041', title: `${p.label} has no tee time now` };
  const at = fmtHour(teeMinutes(p.tee) / 60, true, p.clock ?? '12');
  return { code: 'CH-6041', title: `${p.label} moved to ${shortDay(p.date)}, ${at}${p.teeTimesShifted > 0 ? '. Tee times moved with it.' : ''}` };
}

/**
 * P-5 4.3: round mode. A tracked round opened from the calendar edits only what is the calendar's: its day, first tee,
 * end, how it starts, notes, who is invited and RSVP. The name, course, format and lineup belong to Tournaments, which
 * the banner links to. A round that is under way or final, or whose tournament is cancelled, opens read-only. When the
 * round ref didn't load (CH-6240) only its day and times can change, through the plain calendar save.
 */
export function RoundEditor({
  event,
  onClose,
  onSaved,
  people,
  peopleError = false,
  timezone,
  onCancelRound,
  onRestoreRound,
}: {
  event: ChCalEvent | null;
  onClose: () => void;
  onSaved: (date: string) => void;
  people: ChCalPerson[];
  peopleError?: boolean;
  timezone: string;
  /** Cancel round and Restore round, wired by the calendar (P-5 4.10). */
  onCancelRound?: (e: ChCalEvent) => void;
  onRestoreRound?: (e: ChCalEvent) => void;
}) {
  const open = event != null;
  const router = useRouter();
  const toast = useToast();
  const clock = useChClock();
  const [d, setD] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState('');
  const [shift, setShift] = useState(true);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<{ code: string; text: string; refusal: TournamentRefusal } | null>(null);
  const [discard, setDiscard] = useState<null | (() => void)>(null);
  const [said, setSaid] = useState('');

  // Seeds once per opening, as the event editor does: a re-read while open must not wipe what the coach changed.
  useEffect(() => {
    if (!event) return;
    const next = draftOf(event);
    setD(next);
    setBaseline(sig(next));
    setShift(true);
    setNote(null);
    setDiscard(null);
    setSaid('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  const round = event?.round ?? null;
  const refFailed = !!event && !round;
  const readOnly = !!round && (round.status !== 'upcoming' || round.tournamentCancelled);
  const rl = event ? roundLabel(event, event.title) : null;
  const n = round?.roundNo ?? null;
  const rn = n ? `R${n}` : 'This round';
  const desk = round ? `/golf/dashboard/tournaments/${round.tournamentId}` : null;
  const dirty = !!d && sig(d) !== baseline;
  const moved = !!event && !!d && (d.date !== event.date || d.tee !== draftOf(event).tee || d.end !== draftOf(event).end);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  if (!event || !d) return null;

  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const closeNow = () => {
    setDiscard(null);
    onClose();
  };
  const requestClose = () => {
    if (pending) {
      // A save in flight finishes first; Escape says so instead of closing under it.
      setSaid('Still saving the round.');
      return;
    }
    if (dirty && !readOnly) {
      haptic('warning');
      setDiscard(() => closeNow);
      return;
    }
    onClose();
  };
  const toDesk = () => {
    if (!desk) return;
    const go = () => {
      setDiscard(null);
      onClose();
      router.push(desk);
    };
    if (dirty && !readOnly) setDiscard(() => go);
    else go();
  };

  const banner2 = readOnly
    ? round!.tournamentCancelled
      ? `${rn} is part of a cancelled tournament. Choose Restore tournament in the event’s More actions menu.`
      : round!.status === 'final'
        ? `${rn} is final.`
        : `${rn} is under way, so it can’t be edited.`
    : 'Day, times, notes and who’s invited are edited here. Course, format and lineup can’t be changed yet.';

  const save = async () => {
    if (!dirty) {
      onClose();
      return;
    }
    setPending(true);
    setNote(null);
    chTrail(`calendar round save ${refFailed ? 'plain' : 'tournament'}`);
    try {
      if (refFailed) {
        // CH-6240: no ref, so no version: only the day and times change, through the calendar's own save. The round
        // guard lets a time through; the sync trigger carries it to the tournament.
        const res = await updateGolfEvent(event.id, {
          startDate: d.date,
          allDay: !d.tee,
          ...(d.tee ? { startTime: d.tee, ...(d.end ? { endTime: d.end } : {}) } : {}),
          timezoneOffset: offsetMinutesFor(d.date, d.tee ?? '12:00', timezone) ?? undefined,
        } as never);
        if (!res.success) {
          haptic('error');
          setNote({ ...refusalNotice('failed', { save: 'round', round: n }), refusal: 'failed' });
          requestAnimationFrame(() => document.getElementById('ch-tfx-save-error')?.focus());
          return;
        }
        haptic('success');
        toast(roundSavedToast({ label: event.title, date: d.date, tee: d.tee, moved, teeTimesShifted: 0, clock }));
        onSaved(d.date);
        return;
      }
      const base = draftOf(event);
      const patch: TournamentRoundPatch = {};
      if (moved) {
        patch.startAt = roundStartAt({ date: d.date, tee: d.tee }, timezone);
        patch.endAt = d.tee && d.end ? roundStartAt({ date: d.date, tee: d.end }, timezone) : null;
        patch.allDay = !d.tee;
        if (round!.teeSheet) patch.shiftTeeSheet = shift;
      }
      if (d.startType !== base.startType) patch.startType = d.startType;
      if (d.notes.trim() !== base.notes.trim()) patch.description = d.notes.trim() || null;
      if (d.rsvp !== base.rsvp) patch.requiresRsvp = d.rsvp;
      if (JSON.stringify([...d.invited].sort()) !== JSON.stringify(base.invited)) patch.attendeeIds = d.invited;
      const res = await updateTournamentRound(event.id, patch, round!.version);
      if (!res.success) {
        const refusal = (res.code ?? 'failed') as TournamentRefusal;
        haptic('error');
        setNote({ ...refusalNotice(refusal, { save: 'round', round: n, before: n && n > 1 ? n - 1 : null, name: round!.name }), refusal });
        requestAnimationFrame(() => document.getElementById('ch-tfx-save-error')?.focus());
        return;
      }
      haptic('success');
      toast(roundSavedToast({ label: rn, date: d.date, tee: d.tee, moved, teeTimesShifted: res.data.teeTimesShifted, clock }));
      onSaved(d.date);
    } catch (err) {
      chReport(err, { surface: 'calendar.round', severity: 'medium' });
      haptic('error');
      setNote({ ...refusalNotice('failed', { save: 'round', round: n }), refusal: 'failed' });
    } finally {
      setPending(false);
    }
  };

  const canCancel = !!round && !readOnly && !event.cancelled && !!onCancelRound;
  const canRestore = !!round && event.cancelled && !round.tournamentCancelled && !!onRestoreRound;
  const allOn = people.length > 0 && people.every((p) => d.invited.includes(p.id));

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        width={720}
        icon={Pencil}
        title={readOnly ? 'Round' : 'Edit round'}
        description={readOnly ? undefined : d.rsvp ? 'Changes notify everyone invited.' : 'Invited players see it on their calendar.'}
        footer={
          readOnly ? (
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              {canCancel && (
                <Button variant="ghost" className="ch-red__danger" leftIcon={CircleX} onClick={() => onCancelRound!(event)} disabled={pending}>
                  Cancel round
                </Button>
              )}
              {canRestore && (
                <Button variant="ghost" leftIcon={RotateCcw} onClick={() => onRestoreRound!(event)} disabled={pending}>
                  Restore round
                </Button>
              )}
              <span style={{ marginRight: 'auto' }} />
              <Button variant="ghost" onClick={requestClose}>
                Cancel
              </Button>
              <Button variant="primary" busy={pending} onClick={() => void save()}>
                {pending ? 'Saving…' : 'Save changes'}
              </Button>
            </>
          )
        }
      >
        <form
          className="ch-ed ch-red"
          onSubmit={(ev) => {
            ev.preventDefault();
            void save();
          }}
        >
          <div className="ch-ed__col">
            {refFailed ? (
              <div className="ch-tfx-note ch-tfx-note--warning" data-ch-code="CH-6240" role="note">
                <span>Couldn’t load the tournament for this round. You can still change its time.</span>
              </div>
            ) : (
              <div className="ch-red__banner" role="note" aria-labelledby="ch-red-banner-1">
                <span className="ch-red__plate ch-num" aria-hidden="true">
                  {rn}
                </span>
                <div>
                  <p id="ch-red-banner-1" className="ch-red__l1">{`Part of ${rl!.name} · ${rl!.caption}`}</p>
                  <p className="ch-red__l2">{banner2}</p>
                </div>
                <Button size="sm" rightIcon={ArrowUpRight} onClick={toDesk} aria={{ label: 'Edit tournament, opens Tournaments' }}>
                  Edit tournament
                </Button>
              </div>
            )}
            {note && <TournamentSaveNotice code={note.code} text={note.text} onReload={note.refusal === 'stale' ? () => (onClose(), router.refresh()) : undefined} />}
            <fieldset className="ch-red__fields" disabled={readOnly || pending}>
              <div>
                <span className="ch-ed__lbl">Day</span>
                <DateField label="Day" row value={d.date} onChange={(v) => v && set({ date: v })} />
              </div>
              <div>
                <span className="ch-ed__lbl">First tee</span>
                <div className="ch-ed__row">
                  {d.tee ? (
                    <>
                      <TimeField label="First tee" stepMinutes={1} value={d.tee} onChange={(v) => v && set({ tee: v, end: d.end && d.tee ? shiftHHMM(d.end, teeMinutes(v) - teeMinutes(d.tee)) : d.end })} />
                      <TimeField label="Ends" stepMinutes={5} value={d.end ?? shiftHHMM(d.tee, 300)} min={shiftHHMM(d.tee, 15)} onChange={(v) => v && set({ end: v })} />
                      <Button size="sm" variant="ghost" onClick={() => set({ tee: null, end: null })}>
                        Clear time
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => set({ tee: '08:00', end: '13:00' })}>
                      Add time
                    </Button>
                  )}
                </div>
                {!d.tee && <p className="ch-field__help">No tee time: it shows as all day.</p>}
              </div>
              {moved && round?.teeSheet && (
                <label className="ch-switch">
                  <input type="checkbox" checked={shift} onChange={(ev) => (haptic('select'), setShift(ev.target.checked))} />
                  <span className="ch-switch__t" aria-hidden="true" />
                  Move each player’s tee time by the same amount
                </label>
              )}
              {!refFailed && (
                <>
                  <div>
                    <span className="ch-ed__lbl">Start</span>
                    <Segmented<ChTourStartType>
                      size="sm"
                      label="Start"
                      value={d.startType}
                      onChange={(startType) => set({ startType })}
                      options={(['tee_times', 'shotgun', 'two_tees'] as const).map((t) => ({ value: t, label: START_TYPE_LABEL[t] }))}
                    />
                  </div>
                  <label className="ch-field">
                    <span className="ch-field__label">Notes · optional</span>
                    <textarea className="ch-textarea" rows={3} value={d.notes} onChange={(ev) => set({ notes: ev.target.value })} maxLength={5000} />
                  </label>
                </>
              )}
            </fieldset>
          </div>
          {!refFailed && (
            <fieldset className="ch-ed__col ch-red__fields" disabled={readOnly || pending}>
              <div>
                <div className="ch-in__sechead">
                  <span className="ch-ed__lbl">{peopleError && !people.length ? 'Invite' : `Invite · ${d.invited.length} of ${people.length}`}</span>
                  <Button size="sm" variant="ghost" onClick={() => set({ invited: allOn ? [] : people.map((p) => p.id).sort() })}>
                    {allOn ? 'Clear' : 'Select all'}
                  </Button>
                </div>
                {people.length ? (
                  <div className="ch-ed__inv">
                    {people.map((p) => (
                      <label key={p.id}>
                        <input
                          type="checkbox"
                          checked={d.invited.includes(p.id)}
                          onChange={() => {
                            haptic('select');
                            set({ invited: d.invited.includes(p.id) ? d.invited.filter((x) => x !== p.id) : [...d.invited, p.id].sort() });
                          }}
                        />
                        <Avatar id={p.id} name={byId.get(p.id)?.name ?? p.name} size="xs" />
                        <span>{p.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="ch-in__quiet">{peopleError ? 'The roster didn’t load, so the invite list can’t change right now.' : 'No active players on the roster yet.'}</p>
                )}
              </div>
              <label className="ch-switch">
                <input type="checkbox" checked={d.rsvp} onChange={(ev) => (haptic('select'), set({ rsvp: ev.target.checked }))} />
                <span className="ch-switch__t" aria-hidden="true" />
                Ask players to RSVP
              </label>
            </fieldset>
          )}
          <button type="submit" hidden />
          <span className="ch-sr-only" role="status" aria-live="polite">
            {said}
          </span>
        </form>
      </Modal>
      <Modal
        code="CH-6503"
        open={open && !!discard}
        onClose={() => setDiscard(null)}
        width={420}
        icon={CircleX}
        title="Discard your changes?"
        description="Your edits to this round are lost. The round stays as it was."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDiscard(null)}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={() => discard?.()}>
              Discard
            </Button>
          </>
        }
      />
    </>
  );
}
