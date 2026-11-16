/**
 * A readable account of what the generator would write: counts per table and
 * per player, the date ranges, the tournaments and qualifiers. The dry run
 * prints it and the PR quotes it, so a reviewer can see the demo team without
 * a database.
 */
import { DEMO_TABLES, type DemoDataset, type DemoRow } from './generate';

const day = (r: DemoRow, k: string) => String(r[k] ?? '').slice(0, 10);

function range(rows: DemoRow[], k: string): string {
  if (!rows.length) return 'none';
  const ds = rows.map((r) => day(r, k)).sort();
  return `${ds[0]} to ${ds[ds.length - 1]}`;
}

const signed = (n: number | null) => (n === null ? '-' : n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export function summarizeDataset(d: DemoDataset): string {
  const t = d.tables;
  const out: string[] = [];
  out.push(`Demo team as of ${d.today} (season ${d.year.label}, seed ${d.seed}, generator v${d.version})`, '');

  out.push('| Player | Story | Rounds | Season qualifier and tournament rounds | With shots | First | Last | To par | Putts | Penalties |');
  out.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const p of d.players) {
    out.push(
      `| ${p.name} | ${p.story} | ${p.rounds} | ${p.seasonScoringRounds} | ${p.withShots} | ${p.first ?? '-'} | ${p.last ?? '-'} | ${signed(p.seasonToPar)} | ${p.puttsPerRound?.toFixed(1) ?? '-'} | ${p.penaltiesPerRound?.toFixed(2) ?? '-'} |`,
    );
  }
  out.push('');

  out.push(`Rounds: ${t.golf_rounds.length} (${range(t.golf_rounds, 'round_date')}), ${t.golf_holes.length} holes, ${t.golf_shots.length} shots.`);
  out.push(`Events: ${t.golf_events.length} (${range(t.golf_events, 'start_time')}), ${t.golf_event_attendance.length} attendance rows.`);
  out.push(`Practice plans: ${t.golf_practice_plans.length} (${t.golf_practice_plans.filter((p) => p.status === 'published').length} published).`);
  out.push(`Messages: ${t.golf_messages.length}. Announcements: ${t.golf_announcements.length}. Tasks: ${t.golf_tasks.length}.`, '');

  out.push('Tournaments:');
  for (const x of [...t.golf_tournaments].sort((a, b) => (day(a, 'start_date') < day(b, 'start_date') ? -1 : 1))) {
    const us = t.golf_tournament_field_teams.find((f) => f.tournament_id === x.id && f.is_us === true);
    const entries = t.golf_tournament_entries.filter((e) => e.tournament_id === x.id);
    const state = x.official_at ? `final, ${us?.final_place ?? '-'} of ${x.field_size}` : x.lineup_locked_at ? 'in play' : 'upcoming';
    out.push(`- ${x.name}, ${day(x, 'start_date')} to ${day(x, 'end_date')}: ${state}; ${entries.filter((e) => e.role === 'lineup').length} in the lineup, ${entries.filter((e) => e.role !== 'lineup').length} others`);
  }
  out.push('', 'Qualifiers:');
  for (const q of [...t.golf_qualifiers].sort((a, b) => (day(a, 'start_date') < day(b, 'start_date') ? -1 : 1))) {
    const scored = t.golf_qualifier_entries.filter((e) => e.qualifier_id === q.id && e.position !== null && e.position !== undefined).length;
    out.push(`- ${q.name}, ${day(q, 'start_date')} to ${day(q, 'end_date')}: ${q.status}, ${scored} on the board`);
  }
  if (d.highlights.length) out.push('', ...d.highlights);

  out.push('', '| Table | Rows |', '|---|---|');
  for (const k of DEMO_TABLES) out.push(`| ${k} | ${t[k].length} |`);
  return out.join('\n');
}
