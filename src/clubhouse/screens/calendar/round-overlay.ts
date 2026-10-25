import type { ChTournamentSaved } from './editor';
import type { ChCalEvent } from './model';
import { roundTitle, sortRounds, teeMinutes } from '../tournaments/fields/rounds-model';

/**
 * P-5 4.2: the calendar blocks a tournament just made from the editor, built from the returned event ids and what was
 * typed, so R1 to Rn are on the calendar the moment the save lands. The page's re-read replaces them with the stored
 * rows (same ids). A timed round runs five hours (2:30 for nine holes), as the RPC stores it.
 */
export function roundsOverlay(t: ChTournamentSaved): ChCalEvent[] {
  const rounds = sortRounds(t.state.rounds);
  const length = t.state.holes === 9 ? 2.5 : 5;
  return t.rounds.map(({ roundNumber, eventId }) => {
    const r = rounds[roundNumber - 1];
    const date = r?.date ?? t.state.firstDay;
    const start = r?.tee ? teeMinutes(r.tee) / 60 : null;
    return {
      id: eventId,
      type: 'tournament',
      title: roundTitle(t.name, roundNumber),
      date,
      start,
      end: start == null ? null : Math.min(24, start + length),
      allDay: start == null,
      location: r?.courseLabel ?? t.state.course?.label ?? null,
      notes: t.notes,
      recurring: null,
      people: t.invited,
      rsvp: {},
      rsvpRequired: t.rsvp,
      owner: null,
      busyOnly: false,
      instructor: null,
      pattern: null,
      canEdit: true,
      cancelled: false,
      seriesId: null,
      startIso: start == null ? `${date}T00:00:00+00:00` : `${date}T${r!.tee}:00`,
      span: null,
      version: null,
      courseId: r?.courseId ?? t.state.course?.id ?? null,
      round: {
        tournamentId: t.tournamentId,
        name: t.name,
        roundNo: roundNumber,
        roundsCount: t.rounds.length,
        version: t.version,
        status: 'upcoming',
        startType: r?.startType ?? 'tee_times',
        lockedAt: null,
        lineup: 'none',
        tournamentCancelled: false,
        courseLabel: t.state.course?.id ? null : (t.state.course?.label ?? null),
        teeSheet: false,
      },
    };
  });
}
