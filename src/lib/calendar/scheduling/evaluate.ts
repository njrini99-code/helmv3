import type { ScheduleEvaluation, ScheduleProposal, ScheduleSnapshot } from '../scheduling-contracts';

export function evaluateSchedule(snapshot: ScheduleSnapshot, proposal: ScheduleProposal): ScheduleEvaluation {
  const start = Date.parse(proposal.start), end = Date.parse(proposal.end);
  const valid = Number.isFinite(start) && Number.isFinite(end) && end > start
    && start >= Date.parse(snapshot.window.start) && end <= Date.parse(snapshot.window.end);
  const result: ScheduleEvaluation = { requiredFree: 0, requiredTotal: 0, optionalFree: 0, optionalTotal: 0, unknown: 0, allAvailable: false, overlaps: [] };
  for (const person of snapshot.participants) {
    if (person.required) result.requiredTotal++; else result.optionalTotal++;
    const invalidIntervals = person.intervals.some((period) => !Number.isFinite(Date.parse(period.start)) || !Number.isFinite(Date.parse(period.end)) || Date.parse(period.end) <= Date.parse(period.start));
    const overlaps = person.intervals.filter((period) => start < Date.parse(period.end) && end > Date.parse(period.start));
    result.overlaps.push(...overlaps.map((interval) => ({ participantId: person.id, interval })));
    if (!valid || invalidIntervals || person.verification !== 'complete') result.unknown++;
    else if (!overlaps.length) { if (person.required) result.requiredFree++; else result.optionalFree++; }
  }
  result.allAvailable = valid && snapshot.participants.length > 0 && result.unknown === 0 && result.overlaps.length === 0;
  return result;
}

export function suggestScheduleTimes(snapshot: ScheduleSnapshot, durationMinutes: number, after?: string): ScheduleProposal[] {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 1440) return [];
  const start = Math.max(Date.parse(snapshot.window.start), after ? Date.parse(after) : 0);
  const end = Date.parse(snapshot.window.end), duration = durationMinutes * 60_000;
  const result: ScheduleProposal[] = [];
  for (let time = Math.ceil(start / 900_000) * 900_000; time + duration <= end; time += 900_000) {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: snapshot.timeZone, hour: 'numeric', hourCycle: 'h23' }).format(time));
    const endHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: snapshot.timeZone, hour: 'numeric', hourCycle: 'h23' }).format(time + duration - 1));
    if (hour < 7 || endHour >= 20) continue;
    const proposal = { start: new Date(time).toISOString(), end: new Date(time + duration).toISOString() };
    if (evaluateSchedule(snapshot, proposal).allAvailable) result.push(proposal);
    if (result.length === 5) break;
  }
  return result;
}

export type ScheduleAcceptance =
  | { ok: true; reason: 'accepted' }
  | { ok: false; reason: 'nobody' | 'unverified' | 'required_busy' };

/**
 * The ONE acceptance rule for a proposed time. The workspace's status line,
 * its confirm action and the dialog's final recheck all call this, so an
 * enabled action can never be rejected by the same, unchanged selection.
 *
 * Rule: every schedule verified, every REQUIRED person free. Optional
 * participants may be busy (the contract supports them; `allAvailable`
 * stays the stricter "nobody has an overlap" signal used for wording and
 * for suggestions). An invalid or out-of-window proposal counts every
 * person as unknown in `evaluateSchedule`, so it lands on `unverified`.
 */
export type ScheduleAcceptanceInput = Pick<ScheduleEvaluation, 'requiredFree' | 'requiredTotal' | 'optionalTotal' | 'unknown'>;

export function acceptProposal(evaluation: ScheduleAcceptanceInput): ScheduleAcceptance {
  if (evaluation.requiredTotal + evaluation.optionalTotal === 0) return { ok: false, reason: 'nobody' };
  if (evaluation.unknown > 0) return { ok: false, reason: 'unverified' };
  if (evaluation.requiredFree < evaluation.requiredTotal) return { ok: false, reason: 'required_busy' };
  return { ok: true, reason: 'accepted' };
}
