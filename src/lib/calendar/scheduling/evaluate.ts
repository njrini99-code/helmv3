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
