import { GOLF_REFERENCE_SECTIONS } from './golf-reference.generated';
import type { GolfReferenceSection } from './golf-reference-split';
import { nowIso, type ToolEnvelope } from './provenance';

/**
 * `get_golf_reference`: sections of the sourced golf reference (`docs/v3-research-golf-domain.md`, compiled 2026-05-24 from
 * Broadie, ShotLink, Shot Scope, Arccos and college scoring sources). It is general golf knowledge, never the team's data:
 * every section is tagged `kind: 'reference'` and carries its source, and the read says so in its summary. Its figures
 * ground the audit only because they are returned here, in `detail.reference`; nothing outside a returned section does.
 */

export const REFERENCE_SOURCE = 'CoachHelm golf reference (sourced research, compiled 2026-05-24)';
const MAX_SECTIONS = 3;
const MAX_CHARS = 3200;

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'is', 'are', 'what', 'how', 'why', 'does', 'do', 'with', 'my', 'our', 'about', 'vs', 'versus', 'at', 'by', 'from', 'it', 'its', 'that', 'this', 'me', 'tell', 'good', 'average']);
/** A word the question uses → words the document uses for it. */
const SYNONYMS: Record<string, string[]> = {
  sg: ['strokes', 'gained'],
  putting: ['putt', 'putts'],
  putter: ['putt'],
  lag: ['lag', 'putt'],
  tour: ['tour', 'pga'],
  pro: ['tour', 'pga'],
  college: ['college', 'd1', 'ncaa'],
  ncaa: ['college', 'd1'],
  chipping: ['around', 'green', 'short'],
  short: ['around', 'green'],
  scrambling: ['scrambling', 'up-and-down'],
  nerves: ['pressure', 'choking'],
  clutch: ['pressure', 'choking'],
  pressure: ['pressure', 'choking', 'tournament'],
  tournament: ['tournament', 'pressure'],
  driving: ['drive', 'tee', 'driver'],
  irons: ['approach', 'iron'],
  iron: ['approach', 'iron'],
  wedges: ['wedge'],
  bunker: ['bunker', 'sand'],
  sand: ['bunker', 'sand'],
  penalties: ['penalty'],
  doubles: ['big', 'number', 'double'],
  improve: ['coachable', 'improvement'],
  improvement: ['coachable', 'improvement'],
  practice: ['coachable', 'improvement', 'practice'],
  weather: ['wind', 'cold'],
  wind: ['wind'],
  rough: ['rough', 'lie'],
  lie: ['lie'],
};

const stem = (w: string): string => w.replace(/(ing|es|s)$/, '');

function tokens(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];
  const out = new Set<string>();
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    out.add(stem(w));
    for (const s of SYNONYMS[w] ?? []) out.add(stem(s));
  }
  return [...out].filter((t) => t.length > 1);
}

const INDEX = GOLF_REFERENCE_SECTIONS.map((s) => ({ section: s, head: new Set(tokens(`${s.chapter} ${s.heading}`)), body: tokens(s.text) }));

export function searchGolfReference(topic: string): Array<{ section: GolfReferenceSection; score: number }> {
  const want = tokens(topic);
  if (want.length === 0) return [];
  return INDEX.map(({ section, head, body }) => {
    let score = 0;
    for (const t of want) {
      if (head.has(t)) score += 6;
      const hits = body.filter((b) => b === t || (t.length > 3 && b.startsWith(t))).length;
      if (hits > 0) score += Math.min(4, hits);
    }
    return { section, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.section.id.localeCompare(b.section.id));
}

const clip = (text: string): string => (text.length <= MAX_CHARS ? text : `${text.slice(0, MAX_CHARS).replace(/\s+\S*$/, '')} …`);

export function getGolfReference(input: { topic: string }): ToolEnvelope {
  const found = searchGolfReference(input.topic).slice(0, MAX_SECTIONS);
  if (found.length === 0) {
    return {
      summary: 'The golf reference has nothing on that topic.',
      measurements: [],
      series: [],
      detail: { kind: 'reference', reference: [], chapters: [...new Set(GOLF_REFERENCE_SECTIONS.map((s) => s.chapter))] },
      coverage: 'empty',
      coverage_note: 'This is general golf knowledge, not this team’s data. Try one of the chapters listed.',
      as_of: nowIso(),
    };
  }
  const reference = found.map(({ section }) => ({
    kind: 'reference' as const,
    section: section.id,
    chapter: section.chapter,
    heading: section.heading,
    source: `${REFERENCE_SOURCE}: ${section.chapter}${section.heading === section.chapter ? '' : `, ${section.heading}`}`,
    text: clip(section.text),
  }));
  return {
    // The topic is the model's own words, so it stays out of the summary: a number in it would count as sourced.
    summary: `${reference.length === 1 ? 'One reference section' : `${reference.length} reference sections`} found. General golf knowledge, not this team’s data.`,
    measurements: [],
    series: [],
    detail: { kind: 'reference', not_team_data: true, reference },
    coverage: 'complete',
    coverage_note: 'Reference figures are published research, not this team’s results: name the source when you use one.',
    as_of: nowIso(),
  };
}
