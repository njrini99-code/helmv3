/**
 * The checker: code reads every word the model wrote and turns the draft down for any claim the counted facts cannot
 * carry. Deterministic, no model, no clock. The rules are the README's table, in this order:
 *
 *   1. numbers      every number is a fact (at the precision written), declared arithmetic of facts that code redoes,
 *                   or, in the advice only, a declared prescription (a distance inside an allowed band)
 *   2. dates        every date written is a date in the facts
 *   3. causes       nothing the shots cannot show (UNSUPPORTED_CAUSES), unless a counted fact names it or the sentence
 *                   says the data cannot tell
 *   4. teammates    none, in the player's view
 *   5. change       "improved", "worse lately" only where rule (a) found a change in that direction
 *   6. certainty    no "clearly" or "definitely" on a leaning read
 *   7. advice area  the advice is about the priority's or a candidate's part of the game, and has a number in it
 *   8. style        no em dash, no jargon, short
 *   9. template     not the same paragraph as another player's
 */
import { changeSupported, datePool, distanceAllowed, factLabels, numberPool, type WriterPayload } from './payload';
import { evaluate, extractDates, extractNumbers, inPool, matchesAtPrecision, type FoundNumber } from './numbers';
import { DRAFT_FIELDS, TEMPLATE_SIMILARITY_MAX, type AdviceArea, type Draft, type DraftField, type Rejection } from './types';

// ── The lists ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Causes the data cannot support. Shots record where the ball started and finished, the lie, the miss side and the
 * club: never the swing, the intent, the conditions or the player's head (plan, section 4, "How far why can honestly
 * go"). Each group:
 *   terms       word-boundary patterns
 *   recordable  true when a coach could note it next time, so `watch` may ask to record it ("note the wind")
 * A term passes when a counted fact's label names it (e.g. "driver" on a tee-club pattern), or when its sentence says
 * the data cannot tell ("the shots do not show whether it is contact or club choice").
 */
export const UNSUPPORTED_CAUSES = [
  {
    id: 'swing_mechanics',
    recordable: false,
    terms: [
      /\bswing(?:s|ing)?\b/i, /\bback ?swing\b/i, /\bdown ?swing\b/i, /\btakeaway\b/i, /\bfollow[- ]through\b/i, /\bclub ?face\b/i,
      /\bface angle\b/i, /\bswing path\b/i, /\bat impact\b/i, /\bimpact position\b/i, /\bcontact\b/i, /\bstrike\b/i, /\bstriking\b/i, /\b(?:hit(?:s|ting)?|caught|catch(?:es|ing)?) (?:it |them )?(?:fat|thin)\b/i, /\b(?:fat|thin) (?:shots?|contact|strikes?)\b/i,
      /\bposture\b/i, /\balignment\b/i, /\b(?:address|setup) position\b/i, /\bstance\b/i, /\bball position\b/i, /\bweight shift\b/i, /\bhips?\b/i,
      /\bshoulders?\b/i, /\bwrists?\b/i, /\b(?:putting|her|his|their) stroke\b/i, /\bstroke (?:mechanics|path)\b/i, /\btechnique\b/i, /\bmechanics\b/i,
    ],
  },
  { id: 'grip', recordable: false, terms: [/\bgrip(?:s|ping)?\b/i] },
  { id: 'tempo', recordable: false, terms: [/\btempo\b/i, /\brhythm\b/i, /\btiming\b/i, /\btransition\b/i] },
  {
    id: 'intent',
    recordable: true,
    terms: [
      /\bintent(?:ion)?s?\b/i, /\bintended\b/i, /\bmeant to\b/i, /\btried to\b/i, /\btarget line\b/i, /\baimed (?:at|left|right)\b/i, /\bdecision(?:s)?\b/i,
      /\bchose\b/i, /\bchoosing\b/i, /\bclub (?:selection|choice)\b/i, /\bwrong club\b/i, /\bbetween clubs\b/i, /\bconservative\b/i, /\baggressive\b/i,
      /\bgreen[- ]?light\b/i,
    ],
  },
  {
    id: 'head',
    recordable: false,
    terms: [
      /\bnerv(?:es|ous)\b/i, /\bpressure\b/i, /\bchok(?:e|es|ed|ing)\b/i, /\banxi(?:ety|ous)\b/i, /\btense\b/i, /\btight\b/i, /\bconfiden(?:ce|t)\b/i,
      /\b(?:lost|loses|lose|losing|lack of|lacks) (?:focus|concentration)\b/i, /\b(?:focus|concentration) (?:drifts|slips|wanders|lapses)\b/i, /\bfrustrat\w*/i, /\bmental(?:ly)?\b/i, /\bmindset\b/i, /\bpsycholog\w*/i, /\bcomposure\b/i,
      /\bin (?:her|his|their) head\b/i, /\bmomentum\b/i, /\bclutch\b/i,
    ],
  },
  {
    id: 'conditions',
    recordable: true,
    terms: [
      /\bwind(?:y|s)?\b/i, /\bweather\b/i, /\brain(?:y|ing)?\b/i, /\bcold\b/i, /\bheat\b/i, /\bconditions\b/i, /\bgreen speed\b/i, /\b(?:fast|slow|firm|soft) greens\b/i,
      /\bpin (?:position|placement|location)s?\b/i, /\bhole locations?\b/i, /\baltitude\b/i, /\belevation\b/i,
    ],
  },
  {
    id: 'equipment',
    recordable: true,
    terms: [/\bequipment\b/i, /\bshafts?\b/i, /\bloft\b/i, /\blie angle\b/i, /\bfitt(?:ing|ed)\b/i, /\bnew (?:putter|driver|clubs|irons|wedges|ball)\b/i, /\b(?:golf )?ball model\b/i],
  },
  { id: 'fitness', recordable: false, terms: [/\btired\b/i, /\bfatigue\w*/i, /\bfitness\b/i, /\benergy\b/i] },
] as const;

/** A sentence that says the data cannot tell may name a cause in order to rule it out of what is known. */
export const LIMITATION_MARKERS: readonly RegExp[] = [
  /\bcan(?:not|'t|not yet) (?:tell|say|show|see)\b/i,
  /\b(?:do|does|did)(?: not|n't) (?:show|tell|say|record|capture)\b/i,
  /\bnot (?:recorded|logged|tracked|captured|in the data|something (?:we|the data))\b/i,
  /\bno (?:data|record) (?:on|of|for)\b/i,
  /\bwe (?:do not|don't) know\b/i,
  /\bunknown\b/i,
  /\bwhether\b/i,
];

/** A `watch` sentence that asks for something to be noted next time. */
const RECORDING = /\b(?:note|record|log|write down|mark|track|keep a note)\b/i;

/** Teammate references the player's own card may never carry. */
export const TEAMMATE_TERMS: readonly RegExp[] = [
  /\bteam(?:mate)?s?\b/i, /\bsquad\b/i, /\broster\b/i, /\bother players\b/i, /\bthe others\b/i, /\bmedian\b/i, /\bthe rest of the\b/i, /\bclassmates?\b/i,
];

/** Claims of change, by direction. Each needs rule (a) to have found a change that way. */
export const CHANGE_TERMS: Record<'better' | 'worse', readonly RegExp[]> = {
  better: [/\bimprov(?:ed|ing|ement)\b/i, /\bgetting better\b/i, /\bbetter than (?:before|earlier|last)\b/i, /\b(?:has )?(?:made|making) progress\b/i, /\bprogressed\b/i, /\bon the rise\b/i, /\bturned (?:it|things) around\b/i],
  worse: [/\bdeclin\w*/i, /\bgetting worse\b/i, /\bworse than (?:before|earlier|last)\b/i, /\bslipp\w*/i, /\bslump\w*/i, /\bdropped off\b/i, /\bregress\w*/i],
};
/** Change words with no direction of their own: allowed when rule (a) fired either way. */
export const CHANGE_NEUTRAL: readonly RegExp[] = [/\blately\b/i, /\brecently\b/i, /\btrend\w*/i, /\b(?:up|down) from \d/i, /\bthan (?:it was|before)\b/i, /\bchanged\b/i];

/** Certainty a leaning read cannot carry. */
export const OVERSTATED_CERTAINTY: readonly RegExp[] = [/\bclear(?:ly)?\b/i, /\bdefinite(?:ly)?\b/i, /\bcertain(?:ly)?\b/i, /\bwithout (?:a )?doubt\b/i, /\bno doubt\b/i, /\bfor sure\b/i, /\bobvious(?:ly)?\b/i, /\bundoubtedly\b/i];

/** Analyst's words, not a coach's. */
export const JARGON: readonly RegExp[] = [
  /\bSG\b/, /\bGIR\b/, /\bft\b/i, /\byds?\b/i, /\bp-?values?\b/i, /\bq-?values?\b/i, /\bconfidence interval\b/i, /\bstandard deviation\b/i, /\bstatistically\b/i,
  /\bsignifican(?:t|ce)\b/i, /\bWilson\b/, /\bWelch\b/, /\bBenjamini\b/i, /\bregression\b/i, /\bvariance\b/i, /\bmedian absolute\b/i, /\bMAD\b/, /\bt-test\b/i,
  /\bbaseline\b/i, /\bproximity\b/i, /\bdelta\b/i,
];

/** Words that place advice in a part of the game. "green" and "fairway" appear in every part, so they decide nothing. */
export const AREA_TERMS: Record<Exclude<AdviceArea, 'scoring'>, readonly RegExp[]> = {
  putting: [/\bputt(?:s|ing|er)?\b/i, /\blag\b/i, /\bgreen[- ]reading\b/i],
  around_the_green: [/\bchip(?:s|ping|ped)?\b/i, /\bpitch(?:es|ing)?\b/i, /\bbunkers?\b/i, /\bsand\b/i, /\bup[- ]and[- ]downs?\b/i, /\bshort game\b/i, /\bgreenside\b/i],
  approach: [/\bapproach(?:es)?\b/i, /\birons?\b/i, /\binto the green\b/i, /\bfrom (?:[5-9]\d|[1-3]\d\d) (?:to \d+ )?yards\b/i],
  off_the_tee: [/\btee shots?\b/i, /\boff the tee\b/i, /\bdrives?\b/i, /\bdriver\b/i, /\bdriving\b/i],
};

/** Words per field. Short: a card, not a report. */
export const MAX_WORDS: Record<DraftField, number> = { what: 70, rules_in_out: 70, this_week: 55, watch: 45 };

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
const words = (text: string): string[] => text.toLowerCase().match(/[a-z0-9']+/g) ?? [];

function trigrams(text: string): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}

/** Jaccard overlap of word trigrams: 1 for the same text, 0 for nothing in common. */
export function similarity(a: string, b: string): number {
  const x = trigrams(a);
  const y = trigrams(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const t of x) if (y.has(t)) both += 1;
  return both / (x.size + y.size - both);
}

const draftText = (d: Pick<Draft, DraftField>): string => DRAFT_FIELDS.map((f) => d[f]).join(' ');

// ── The check ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CheckOptions {
  /** Other players' written texts in this run (the template rule). */
  others?: readonly string[];
}

/** Every reason the draft cannot go on a card. Empty: it passes. */
export function checkDraft(draft: Draft, payload: WriterPayload, opts: CheckOptions = {}): Rejection[] {
  const out: Rejection[] = [];
  const pool = numberPool(payload);
  const labels = factLabels(payload).join(' \n ');

  // 1. Numbers. First the declarations themselves.
  const arithmetic: number[] = [];
  const prescriptions: Array<{ value: number; unit?: string }> = [];
  for (const d of draft.declared) {
    if (d.kind === 'arithmetic') {
      const r = d.expression ? evaluate(d.expression) : null;
      if (!r) {
        out.push({ rule: 'arithmetic_wrong', field: 'declared', detail: `the arithmetic for ${d.value} ("${d.expression ?? ''}") is not plain arithmetic of numbers` });
        continue;
      }
      const stray = r.operands.filter((o) => !inPool({ value: o, decimals: decimalsOf(o), raw: String(o) }, pool));
      if (stray.length > 0) {
        out.push({ rule: 'arithmetic_wrong', field: 'declared', detail: `the arithmetic for ${d.value} uses ${stray.join(', ')}, which ${stray.length === 1 ? 'is' : 'are'} not in the facts` });
        continue;
      }
      if (!matchesAtPrecision(d.value, decimalsOf(d.value), r.value)) {
        out.push({ rule: 'arithmetic_wrong', field: 'declared', detail: `${d.expression} is ${round4(r.value)}, not ${d.value}` });
        continue;
      }
      arithmetic.push(r.value);
    } else {
      if ((d.unit === 'feet' || d.unit === 'yards') && !distanceAllowed(payload, Math.abs(d.value), d.unit)) {
        out.push({ rule: 'prescription_out_of_range', field: 'declared', detail: `${d.value} ${d.unit} is outside the distances where this player's strokes go (${payload.priority.where.named_band?.label ?? payload.advice_areas.join(', ')})` });
        continue;
      }
      if (d.unit === 'percent' && (d.value < 0 || d.value > 100)) {
        out.push({ rule: 'prescription_out_of_range', field: 'declared', detail: `${d.value} is not a percentage` });
        continue;
      }
      if ((d.unit === 'reps' || d.unit === 'count' || d.unit === 'sessions' || d.unit === 'minutes' || d.unit === undefined) && (d.value <= 0 || d.value > 200)) {
        out.push({ rule: 'prescription_out_of_range', field: 'declared', detail: `${d.value} is not a sensible number of reps, sessions or minutes for one week` });
        continue;
      }
      prescriptions.push({ value: d.value, unit: d.unit });
    }
  }

  // Then every number written, field by field.
  const dates = datePool(payload);
  for (const field of DRAFT_FIELDS) {
    const text = draft[field];
    for (const n of extractNumbers(text)) {
      if (inPool(n, pool)) continue;
      if (arithmetic.some((a) => matchesAtPrecision(n.value, n.decimals, a))) continue;
      const prescribed = prescriptions.some((p) => matchesAtPrecision(n.value, n.decimals, p.value));
      if (prescribed && (field === 'this_week' || field === 'watch')) continue;
      out.push(
        prescribed
          ? { rule: 'prescription_outside_advice', field, detail: `${n.raw} is a prescribed number; it may appear only in the advice (this week, watch), not as a fact` }
          : { rule: 'number_not_in_facts', field, detail: `${n.raw} is not a number in the facts, and no arithmetic or prescription declares it` },
      );
    }
    // 2. Dates.
    for (const d of extractDates(text).dates) {
      const ok = dates.some((iso) => {
        const [y, m, day] = iso.split('-').map(Number);
        return m === d.month && day === d.day && (d.year === null || d.year === y);
      });
      if (!ok) out.push({ rule: 'date_not_in_facts', field, detail: `"${d.raw}" is not a date of any round or window in the facts` });
    }
  }

  // 3. Causes the data cannot show.
  for (const field of DRAFT_FIELDS) {
    for (const s of sentences(draft[field])) {
      const limited = LIMITATION_MARKERS.some((m) => m.test(s));
      for (const group of UNSUPPORTED_CAUSES) {
        for (const term of group.terms) {
          const hit = s.match(term);
          if (!hit) continue;
          if (labels.toLowerCase().includes(hit[0].toLowerCase())) continue;
          if (limited) continue;
          if (field === 'watch' && group.recordable && RECORDING.test(s)) continue;
          out.push({ rule: 'unsupported_cause', field, detail: `"${hit[0]}" (${group.id.replace('_', ' ')}) is a cause the shots cannot show; say what happened, where and how often, or say the data cannot tell` });
        }
      }
    }
  }

  const all = draftText(draft);

  // 4. Teammates, in the player's view.
  if (payload.view === 'player') {
    for (const field of DRAFT_FIELDS) {
      for (const term of TEAMMATE_TERMS) {
        const hit = draft[field].match(term);
        if (hit) out.push({ rule: 'teammate_reference', field, detail: `"${hit[0]}" refers to teammates; the player's own card never mentions them` });
      }
    }
  }

  // 5. Change.
  for (const field of DRAFT_FIELDS) {
    for (const verdict of ['better', 'worse'] as const) {
      if (changeSupported(payload, verdict)) continue;
      for (const term of CHANGE_TERMS[verdict]) {
        const hit = draft[field].match(term);
        if (hit) out.push({ rule: 'change_claim_unsupported', field, detail: `"${hit[0]}" claims the player got ${verdict}, but no change ${verdict === 'better' ? 'for the better' : 'for the worse'} was found against the 10 rounds before` });
      }
    }
    if (!changeSupported(payload, 'better') && !changeSupported(payload, 'worse')) {
      for (const term of CHANGE_NEUTRAL) {
        const hit = draft[field].match(term);
        if (hit) out.push({ rule: 'change_claim_unsupported', field, detail: `"${hit[0]}" claims a change over time, but no change was found against the 10 rounds before` });
      }
    }
  }

  // 6. Certainty.
  if (payload.priority.certainty === 'leaning') {
    for (const field of DRAFT_FIELDS) {
      for (const term of OVERSTATED_CERTAINTY) {
        const hit = draft[field].match(term);
        if (hit) out.push({ rule: 'overstated_certainty', field, detail: `"${hit[0]}" overstates a read that is only leaning: the rounds cannot yet tell it apart` });
      }
    }
  }

  // 7. The advice.
  if (!payload.advice_areas.includes(draft.this_week_area)) {
    out.push({ rule: 'advice_outside_areas', field: 'this_week', detail: `the advice is about ${draft.this_week_area.replace(/_/g, ' ')}, which is neither the priority nor a candidate (${payload.advice_areas.join(', ').replace(/_/g, ' ')})` });
  }
  for (const [area, terms] of Object.entries(AREA_TERMS) as Array<[Exclude<AdviceArea, 'scoring'>, readonly RegExp[]]>) {
    if (payload.advice_areas.includes(area)) continue;
    const hit = terms.map((t) => draft.this_week.match(t)).find((m) => m);
    if (hit) out.push({ rule: 'advice_outside_areas', field: 'this_week', detail: `"${hit[0]}" puts the advice in ${area.replace(/_/g, ' ')}, which is neither the priority nor a candidate` });
  }
  if (extractNumbers(draft.this_week).length === 0) {
    out.push({ rule: 'advice_not_measurable', field: 'this_week', detail: 'the advice has no number: give reps, a distance to work from, or a target the player can count' });
  }

  // 8. Style.
  for (const field of DRAFT_FIELDS) {
    const text = draft[field];
    if (/[—–]/.test(text)) out.push({ rule: 'em_dash', field, detail: 'no em or en dashes: use a full stop or a comma' });
    for (const term of JARGON) {
      const hit = text.match(term);
      if (hit) out.push({ rule: 'jargon', field, detail: `"${hit[0]}" is analyst's language; use the plain words` });
    }
    const n = words(text).length;
    if (n > MAX_WORDS[field]) out.push({ rule: 'too_long', field, detail: `${n} words; keep it under ${MAX_WORDS[field]}` });
    if (n === 0) out.push({ rule: 'malformed', field, detail: 'empty' });
  }

  // 9. Template.
  for (const other of opts.others ?? []) {
    const s = similarity(all, other);
    if (s > TEMPLATE_SIMILARITY_MAX) {
      out.push({ rule: 'template_like', field: 'draft', detail: `reads like another player's paragraph (${Math.round(s * 100)}% of its three-word runs shared); write from this player's own facts` });
      break;
    }
  }

  return out;
}

function decimalsOf(n: number): number {
  const s = String(n);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The words fed back to the model on the repair attempt. One line per reason, numbered, plain. */
export function repairFeedback(reasons: readonly Rejection[]): string {
  return [
    'CHECK FAILED. Code read your draft against the facts and turned it down for these reasons:',
    ...reasons.map((r, i) => `${i + 1}. [${r.field}] ${r.detail}`),
    'Call submit_read once more with every reason fixed. Use only numbers from the facts, declared arithmetic of them, or declared prescriptions in the advice. Do not add anything else.',
  ].join('\n');
}

export type { FoundNumber };
