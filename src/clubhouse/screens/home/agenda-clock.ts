import type { ChClock } from '../../lib/clock-cookie';
import type { ChAgendaRow } from '../../data/home';

/**
 * An agenda row's time and detail for this device's clock. The server drops the AM or PM from these ("3:30", "First tee
 * 8:42"), which 24 hours cannot be rebuilt from, so a row carries its start as `hm` ("15:30") and 24 hours reads that.
 * 12 hours returns the row's own text, as it always was.
 */
export function agendaTime(r: Pick<ChAgendaRow, 'timeLabel' | 'hm' | 'when'>, clock: ChClock): string {
  return clock === '24' && r.when === 'today' && r.hm ? r.hm : r.timeLabel;
}

export function agendaDetail(r: Pick<ChAgendaRow, 'detail' | 'hm' | 'when'>, clock: ChClock): string | null {
  if (clock !== '24' || !r.detail || !r.hm || r.when !== 'later') return r.detail;
  return r.detail.replace(/^First tee \d{1,2}:\d{2}/, `First tee ${r.hm}`);
}
