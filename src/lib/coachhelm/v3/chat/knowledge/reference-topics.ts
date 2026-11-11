/**
 * CoachHelm chat knowledge: the on-demand golf reference, by topic.
 *
 * The text is `docs/v3-research-golf-domain.md`, split into sections by the generator (`../golf-reference.generated.ts`).
 * This file decides what of it the assistant is served and under which name, because the document was written for the
 * insight engine and not all of it is fit to hand a coach as fact:
 *
 *   TOPICS     the names the prompt gives the model (`golf.ts` lists them), each a set of sections in reading order.
 *   WITHHELD   sections that are never served, each with the reason.
 *   REDACTED   single sentences cut from a section that is otherwise served, each with the reason.
 *
 * A section that is in neither TOPICS nor WITHHELD fails `__tests__/reference-topics.test.ts`, so a new section in the
 * document has to be placed on purpose. A redaction whose sentence is no longer in the document fails the same test.
 */

export interface ReferenceTopic {
  /** What the model passes as `about`. Stable: it is named in the cached prompt. */
  id: string;
  /** A few words on what is in it, for the prompt and for a search that found nothing. */
  label: string;
  /** Section ids from the generated reference, in reading order. */
  sections: readonly string[];
}

const C1 = '1-the-strokes-gained-framework';
const C3 = '3-college-golf-baselines';
const C4 = '4-causal-chains-what-actually-moves-scoring';
const C6 = '6-shot-types-shot-decisions';
const C7 = '7-hole-context';
const C9 = '9-mental-game-pressure';
const C10 = '10-coachable-vs-uncoachable-improvement-windows';

export const REFERENCE_TOPICS: readonly ReferenceTopic[] = [
  {
    id: 'strokes_gained',
    label: 'how strokes gained works, its four areas and what the research found',
    sections: [`${C1}/origin`, `${C1}/how-it-works`, `${C1}/the-four-categories`, `${C1}/why-sg-dominates-traditional-stats`, `${C1}/variance-explained-at-pga-tour-level`, `${C1}/where-amateur-college-differs`],
  },
  {
    id: 'what_moves_score',
    label: 'how one part of the game feeds another: tee shot to approach to putt, lag putting, short putts, penalties, big numbers',
    sections: [
      `${C4}/drive-approach-distance-lie-gir`,
      `${C4}/gir-scrambling-load-inverse-coupling`,
      `${C4}/approach-proximity-putt-make-birdie-conversion`,
      `${C4}/lag-putting-25-ft-3-putt-avoidance`,
      `${C4}/short-putt-3-8-ft-performance-round-variance`,
      `${C4}/penalty-strokes-scoring`,
      `${C4}/big-number-avoidance`,
      `${C4}/bunker-play`,
      `${C4}/closing-holes-back-9-fade`,
    ],
  },
  {
    id: 'college_golf',
    label: 'college levels, recruiting scoring ranges, what is and is not published about college players',
    sections: [`${C3}/published-college-baselines-and-what-is-not-published`, `${C3}/where-college-differs-from-tour`, `${C3}/scoring-averages-recruiting-benchmarks`, `${C3}/junior-ajga-benchmarks`, `${C3}/shot-scope-make-by-handicap`],
  },
  {
    id: 'course_management',
    label: 'club choice off the tee and into greens, laying up, playing around hazards, choosing a shot around the green',
    sections: [`${C4}/course-management-conservative-vs-aggressive`, `${C6}/tee-club-selection`, `${C6}/approach-club-selection`, `${C6}/specialty-full-swing-shots`, `${C6}/around-the-green-decision-tree`, `${C7}/par-5-reachability`, `${C7}/hazard-effects`],
  },
  {
    id: 'lies_and_conditions',
    label: 'what each lie does to a shot, wind, cold and wet, green speed and firmness',
    sections: ['5-lie-types/5-lie-types', `${C4}/wind-cold`, `${C7}/green-characteristics`],
  },
  {
    id: 'holes_and_courses',
    label: 'par 3, 4 and 5 by length, and what each kind of course asks of a player',
    sections: [`${C7}/par-3-length-tiers`, `${C7}/par-4-length-tiers`, '8-course-type-skill-premium/8-course-type-skill-premium'],
  },
  {
    id: 'pressure',
    label: 'tournament against practice scoring, opening and closing holes, the hole after a bad one',
    sections: [`${C4}/pressure-gap-tournament-vs-practice`, `${C9}/tournament-vs-practice-gap`, `${C9}/recovery-after-bad-hole`, `${C9}/opening-closing-holes`],
  },
  {
    id: 'improvement',
    label: 'which skills respond to practice in weeks, months or years, and why players plateau',
    sections: [`${C10}/highly-coachable-weeks-to-months`, `${C10}/moderately-coachable-months-to-years`, `${C10}/slow-limited-years-or-innate`, `${C10}/why-plateaus-happen`],
  },
  { id: 'sources', label: 'where the reference comes from', sections: ['sources/sources'] },
];

const C2 = '2-pga-tour-baselines-2024-season';
const TOUR_TABLE = 'A table of men’s Tour figures from one past season. The Tour figure this app shows comes from its standards table, for the team’s own tour (get_reference, topic standards); a second source would give a second number, and the men’s figure is wrong for a women’s team.';

/** Sections never served, and why. */
export const WITHHELD: Readonly<Record<string, string>> = {
  [`${C2}/2-pga-tour-baselines-2024-season`]: TOUR_TABLE,
  [`${C2}/putt-make-by-distance-tour-2024-dethier-broadie-data`]: TOUR_TABLE,
  [`${C2}/sg-benchmarks-good-top-30-tour`]: `${TOUR_TABLE} It also sets "good" thresholds, which the assistant does not state from memory.`,
  [`${C2}/proximity-benchmarks-tour-avg`]: TOUR_TABLE,
  [`${C4}/wedge-play-75-125-yd-biggest-college-tour-gap`]: 'Its college range has no source, and its claim that wedge play is the biggest college-to-Tour gap is not what the one published comparison shows (section 3 cites around the green as the widest).',
  [`${C6}/wedge-gapping-standard-setup`]: 'Carry distances for men only, and the college column has no source.',
  [`${C9}/choking-mechanics`]: 'A chain from pressure to the body to the swing with no source. The assistant does not explain a result by a swing or a body.',
  [`${C10}/typical-improvement-curves`]: 'Vendor claims of strokes saved and an unsourced statement about college players. It reads as a promise of a result.',
};

/** One sentence cut from a served section. `cut` is the exact text in the document; the test fails if it is no longer there. */
export const REDACTED: ReadonlyArray<{ section: string; cut: string; why: string }> = [
  { section: `${C4}/bunker-play`, cut: ' college ~40%;', why: 'A college figure with no source.' },
  { section: `${C4}/pressure-gap-tournament-vs-practice`, cut: ' For amateurs/college, practice-to-tournament gap typically **2-5 strokes** for sub-handicap players.', why: 'A college figure with no source: the cited study is of Tour players. The team’s own gap is on the Stats page.' },
  { section: `${C9}/tournament-vs-practice-gap`, cut: '\n- College/amateur: typical 2-5 stroke practice-to-tournament gap; widens with handicap', why: 'The same unsourced figure.' },
  { section: `${C3}/where-college-differs-from-tour`, cut: '\n4. **Wedge proximity from 75-125** is the largest D1 vs Tour gap', why: 'Not what the published comparison in the next section shows.' },
  {
    section: `${C3}/published-college-baselines-and-what-is-not-published`,
    cut: ' An earlier "Typical College Stat Profile (D1)" table (fairway %, GIR %, putts per round, scrambling, 3-putt rate, driving distance) had no single published source and was removed: do not reintroduce those ranges.',
    why: 'A note to the document\'s editors about its own history, not golf knowledge.',
  },
];

const TOPIC_BY_ID = new Map(REFERENCE_TOPICS.map((t) => [t.id, t]));
const TOPIC_OF_SECTION = new Map(REFERENCE_TOPICS.flatMap((t) => t.sections.map((s) => [s, t] as const)));

export const referenceTopic = (id: string): ReferenceTopic | undefined => TOPIC_BY_ID.get(id.trim().toLowerCase().replace(/[\s-]+/g, '_'));
export const topicOfSection = (sectionId: string): ReferenceTopic | undefined => TOPIC_OF_SECTION.get(sectionId);
export const isServed = (sectionId: string): boolean => TOPIC_OF_SECTION.has(sectionId) && !(sectionId in WITHHELD);

/** A served section's text with its redactions applied. */
export function servedText(sectionId: string, text: string): string {
  let out = text;
  for (const r of REDACTED) if (r.section === sectionId) out = out.split(r.cut).join('');
  return out;
}

/** The sentence the golf block uses to name the topics. Built here so the prompt can only name topics that exist. */
export function referenceTopicsLine(): string {
  return REFERENCE_TOPICS.filter((t) => t.id !== 'sources')
    .map((t) => `${t.id} (${t.label})`)
    .join('; ');
}
