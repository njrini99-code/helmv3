/**
 * CoachHelm reads: one honest card per player, from the analyst. Pure: rows in, payloads out.
 *
 * `buildTeamReads(rows)` runs the fact sheets for the whole team (the team figures need every teammate), finds each
 * player's priority, and writes the card: where the strokes go, one level down, the counted pattern, the team (coach
 * only), the rounds behind it, "how we found this" and "what would change this". A player without five rounds with
 * every shot logged gets a card that says what is missing.
 */
import { STROKES_GAINED_AREA_IDS } from '../measures';
import { assembleFactSheets, type TeamRows } from '../fact-sheet';
import { findNotable, type Notability } from '../notability';
import type { FactSheet } from '../types';
import { catalogueReads, type CatalogueResult } from './catalogue';
import { evidenceRounds } from './evidence';
import { partReads } from './parts';
import { teamPage, type TeamPage } from './team-page';
import { Figures } from './format';
import { CERTAINTY_WORD, PART_LABEL, freshnessText, missingText, priorityWords } from './words';
import type { PartId, PriorityCard, ReadPayload } from './types';

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Shots in the priority's scope over the season: the named band's, or every band's when spread. */
function scopeShots(n: Notability): number {
  const w = n.priority?.where;
  if (!w) return 0;
  if (w.finding === 'band' && w.band?.named) return w.band.shots;
  return w.bands.reduce((a, b) => a + b.shots, 0);
}

export function buildReadPayload(sheet: FactSheet, notability: Notability, rows: Pick<TeamRows, 'rounds' | 'shots' | 'holes'>, catalogue?: CatalogueResult): ReadPayload {
  const f = new Figures();
  const season = sheet.windows.season;
  const freshness = freshnessText(season.to, season.rounds, sheet.as_of, f);
  const p = notability.priority;
  let priority: PriorityCard | null = null;
  if (p) {
    const area = p.measure_id as PartId;
    const measured = sheet.strokes_gained_by_round_season.filter((r) => r.measured);
    const dates = measured.map((r) => r.date).sort();
    const shots = scopeShots(notability);
    const words = priorityWords(p, { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, shots }, f, 'coach');
    const lead = p.where.lead_pattern;
    priority = {
      key: `priority:${area}`,
      area,
      area_label: PART_LABEL[area],
      certainty: p.certainty,
      certainty_word: CERTAINTY_WORD[p.certainty],
      headline: words.headline,
      where_text: words.where_text,
      where: {
        finding: p.where.finding === 'band' && !p.where.band?.named ? 'spread_evenly' : p.where.finding,
        band: p.where.finding === 'band' ? (p.where.band?.band ?? null) : null,
        band_label: p.where.finding === 'band' ? (p.where.band?.label ?? null) : null,
      },
      pattern: words.pattern,
      how_we_found: words.how_we_found,
      what_would_change: words.what_would_change,
      team: words.team_text
        ? { audience: 'coach_only', value: { text: words.team_text, pattern_median: lead?.team?.median ?? null, differs: lead?.differs_from_team ?? false, direction: lead?.direction ?? null } }
        : null,
      evidence: evidenceRounds(sheet, area, p.where, rows),
      numbers: {
        rounds: p.rounds,
        shots,
        lost_per_round: p.strokes_per_round.value,
        lost_low: p.strokes_per_round.low,
        lost_high: p.strokes_per_round.high,
        against_other_parts: p.against_own_other_areas.value,
        against_other_parts_low: p.against_own_other_areas.low,
        against_other_parts_high: p.against_own_other_areas.high,
        parts: Object.fromEntries(STROKES_GAINED_AREA_IDS.map((id) => [id, r4(p.areas.find((a) => a.measure_id === id)?.strokes_gained_per_round ?? 0)])) as Record<PartId, number>,
      },
    };
  }
  return {
    version: 1,
    team_id: sheet.team_id,
    player_id: sheet.player_id,
    as_of: sheet.as_of,
    season_start: sheet.season_start,
    through_date: season.to,
    n_rounds: season.rounds,
    freshness,
    priority,
    missing: p ? null : missingText(notability.priority_missing, f),
    figures: f.all,
    parts: partReads(sheet),
    ...(catalogue ? { signals: catalogue.signals } : {}),
  };
}

export interface TeamReads {
  sheets: FactSheet[];
  notables: Notability[];
  payloads: ReadPayload[];
  /** Every player's catalogue reads (stage 2), signals or not. */
  catalogue: CatalogueResult[];
  team: TeamPage;
}

/** Every active player's read for one team, ordered by player id. */
export function buildTeamReads(rows: TeamRows): TeamReads {
  const sheets = assembleFactSheets(rows);
  const notables = sheets.map(findNotable);
  const catalogue = catalogueReads(sheets, rows);
  const payloads = sheets.map((s, i) => buildReadPayload(s, notables[i]!, rows, catalogue[i]));
  return { sheets, notables, payloads, catalogue, team: teamPage(rows.team.id, payloads, notables) };
}
