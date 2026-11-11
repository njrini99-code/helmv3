import { GOLF_REFERENCE_SECTIONS } from './golf-reference.generated';
import type { GolfReferenceSection } from './golf-reference-split';
import { isServed, referenceTopic, REFERENCE_TOPICS, servedText, topicOfSection } from './knowledge/reference-topics';
import { nowIso, type ToolEnvelope } from './provenance';

/**
 * The on-demand golf reference behind `get_reference` (topic golf): sections of the sourced golf research
 * (`docs/v3-research-golf-domain.md`, compiled 2026-05-24 from Broadie, ShotLink, Shot Scope, Arccos and college scoring
 * sources). It is general golf knowledge, never the team's data: every section is tagged `kind: 'reference'` and carries its
 * source, and the read says so in its summary.
 *
 * What is served, and under which topic name, is decided in `knowledge/reference-topics.ts`: the Tour tables are withheld
 * (the standards table is the one source of a Tour figure), and a few unsourced sentences are cut. `topic` is either one of
 * those topic names, which returns that topic in reading order, or a few words, which are searched for.
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

/** The sections the assistant may be handed, each with its cuts applied. */
export const SERVED_SECTIONS: readonly GolfReferenceSection[] = GOLF_REFERENCE_SECTIONS.filter((s) => isServed(s.id)).map((s) => ({ ...s, text: servedText(s.id, s.text) }));
const SERVED_BY_ID = new Map(SERVED_SECTIONS.map((s) => [s.id, s]));

// A section is also found by its topic's own words ("course management", "pressure"), which the prompt names.
const INDEX = SERVED_SECTIONS.map((s) => {
  const topic = topicOfSection(s.id);
  return { section: s, head: new Set(tokens(`${s.chapter} ${s.heading} ${topic ? topic.id.replace(/_/g, ' ') : ''}`)), body: tokens(s.text) };
});

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

const topicIndex = () => REFERENCE_TOPICS.map((t) => ({ topic: t.id, about: t.label, headings: t.sections.flatMap((id) => (SERVED_BY_ID.get(id) ? [SERVED_BY_ID.get(id)!.heading] : [])) }));

export function getGolfReference(input: { topic: string }): ToolEnvelope {
  // A topic name returns the topic from its start; anything else is searched for.
  const named = referenceTopic(input.topic);
  const ofTopic = named ? named.sections.flatMap((id) => (SERVED_BY_ID.get(id) ? [SERVED_BY_ID.get(id)!] : [])) : [];
  const found = named ? ofTopic.slice(0, MAX_SECTIONS) : searchGolfReference(input.topic).slice(0, MAX_SECTIONS).map((r) => r.section);
  if (found.length === 0) {
    return {
      summary: 'The golf reference has nothing on that. Its topics are listed.',
      measurements: [],
      series: [],
      detail: { kind: 'reference', reference: [], topics: topicIndex(), chapters: [...new Set(SERVED_SECTIONS.map((s) => s.chapter))] },
      coverage: 'empty',
      coverage_note: 'This is general golf knowledge, not this team’s data. Ask again with one of the topics or headings listed. Tour and level figures are on topic standards, not here.',
      as_of: nowIso(),
    };
  }
  const reference = found.map((section) => ({
    kind: 'reference' as const,
    section: section.id,
    topic: topicOfSection(section.id)?.id ?? null,
    chapter: section.chapter,
    heading: section.heading,
    source: `${REFERENCE_SOURCE}: ${section.chapter}${section.heading === section.chapter ? '' : `, ${section.heading}`}`,
    text: clip(section.text),
  }));
  const more = named ? ofTopic.slice(MAX_SECTIONS).map((s) => s.heading) : [];
  return {
    // The topic is the model's own words, so it stays out of the summary: a number in it would count as sourced.
    summary: `${reference.length === 1 ? 'One reference section' : `${reference.length} reference sections`} found. General golf knowledge, not this team’s data.`,
    measurements: [],
    series: [],
    detail: { kind: 'reference', not_team_data: true, reference, ...(more.length ? { more_in_this_topic: more } : {}) },
    coverage: 'complete',
    // The research text is written in shorthand; the answer is not (owner, 10 Nov 2026: no notation or abbreviation a coach would not say aloud).
    coverage_note: `Reference figures are published research, not this team’s results: name the source when you use one. These notes are written in shorthand (SG, GIR, FW, HCP, ft, yds): in an answer write strokes gained, greens in regulation, fairways, handicap, feet and yards in full.${more.length ? ' More headings are in this topic: ask with a heading’s words to read one.' : ''}`,
    as_of: nowIso(),
  };
}
