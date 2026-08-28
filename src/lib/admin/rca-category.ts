/**
 * The repair vocabulary — code, not prompt text.
 *
 * SEPARATE FROM `rca.ts` FOR ONE REASON: that module is `server-only` (it
 * calls the AI SDK), and this vocabulary has to be readable from a client
 * component — the Bridge derives an analysis's category at render time. A
 * value imported from a `server-only` module poisons the client bundle, and
 * neither `tsc` nor the 11,555-test suite can see it: type-only imports are
 * erased, so `RcaPanel` importing `type RcaAnalysis` was fine and importing
 * `deriveRcaCategory()` was not. Only `next build` failed, and it failed with
 * "you are using it in the Pages Router" — a message that names neither file.
 *
 * Everything here is pure: no I/O, no environment, no imports. Keep it that
 * way, and keep this module free of `server-only`.
 */

/**
 * The self-healing loop has two halves that never share a process: a cloud
 * routine that DIAGNOSES (reads production, writes `rca_analysis` rows, may
 * resolve what it proves is already done) and a local routine that REPAIRS
 * (reads those analyses, opens verified PRs). The only thing joining them is
 * the category of a finding — "is this something to fix, or something to
 * close?" — and that category is what routes an analysis to a repair or to
 * the archive.
 *
 * IT USED TO LIVE ONLY IN THE TWO ROUTINE PROMPTS, which are configuration
 * outside this repository: nothing diffed them, no gate checked them, and
 * neither half could see the other's copy. Measured 2026-08-27, one day after
 * the loop was wired: of the 15 analyses in production, **10 opened with
 * free prose** ("No fix needed…", "Already fixed. Commit 3b4204e…", "Add
 * `code: \"qualifier_closed\"` to the return at golf.ts:1770…") rather than
 * one of the four agreed strings. The repair half filtered
 * `suggestedFix ilike 'FIX HERE%'` in SQL, so two thirds of everything the
 * diagnosis half produced — including the single most actionable finding on
 * the board — was invisible to it. Neither side errored. The board simply
 * looked like there was nothing to repair.
 *
 * So the vocabulary is here, in code, and both halves derive it from this
 * function instead of each re-deciding what the strings are. That also makes
 * the drift visible rather than silent: text that matches nothing lands in
 * `'uncategorized'` and is RENDERED as uncategorized, instead of being
 * silently dropped by a `LIKE` that matched no rows.
 */
export const RCA_CATEGORIES = [
  'fix-here',
  'already-fixed',
  'not-a-defect',
  'needs-more-evidence',
  'uncategorized',
] as const;

export type RcaCategory = (typeof RCA_CATEGORIES)[number];

/**
 * The four strings an analysis is asked to open `suggestedFix` with. Exported
 * so the routine contracts under `docs/ai-system/selfheal/` and this module
 * cannot disagree about the spelling — a test asserts each one derives to its
 * own category.
 */
export const RCA_CANONICAL_PREFIX: Readonly<Record<Exclude<RcaCategory, 'uncategorized'>, string>> =
  {
    'fix-here': 'FIX HERE',
    'already-fixed': 'ALREADY FIXED',
    'not-a-defect': 'NOT A DEFECT',
    'needs-more-evidence': 'NEEDS MORE EVIDENCE',
  };

/** Short human label for the Bridge chip. */
export const RCA_CATEGORY_LABEL: Readonly<Record<RcaCategory, string>> = {
  'fix-here': 'Fix here',
  'already-fixed': 'Already fixed',
  'not-a-defect': 'Not a defect',
  'needs-more-evidence': 'Needs evidence',
  uncategorized: 'Uncategorized',
};

/**
 * Legacy openings that are unambiguous ON THEIR OWN WORDS, from the analyses
 * that already exist in production. Deliberately short: each is an explicit
 * English claim that the fault is already fixed, not a coincidence of
 * phrasing, so recognising it is reading the sentence rather than guessing at
 * it.
 *
 * What is NOT here matters more. Five production rows open "No fix needed…",
 * "No code change needed…", "No urgent fix needed…" — and every one of those
 * is genuinely ambiguous between ALREADY FIXED and NOT A DEFECT. The
 * distinction is load-bearing, because the two categories carry different
 * resolve evidence (a commit SHA versus a named control flow), so collapsing
 * them into whichever is convenient would be exactly the `unknown → healthy`
 * move `memory/system/golfhelm-engineering-os.md` forbids. They derive to
 * `'uncategorized'`, which the Bridge shows and no automatic path acts on.
 */
const LEGACY_ALREADY_FIXED = /^already\s+(fixed|applied|shipped|resolved|landed|merged)\b/;

/**
 * Route one analysis to a category from the text it actually carries.
 *
 * Case-insensitive, and tolerant of the two decorations a model reaches for
 * unprompted — leading whitespace and markdown emphasis (`**FIX HERE** — …`)
 * — because neither changes the claim being made and refusing them would
 * strand a correctly-categorised finding on formatting alone.
 *
 * Never throws and never guesses: anything unrecognised is `'uncategorized'`.
 */
export function deriveRcaCategory(suggestedFix: string | null | undefined): RcaCategory {
  const normalized = (suggestedFix ?? '')
    .replace(/^[\s*_`#>-]+/, '')
    .trim()
    .toLowerCase();

  if (!normalized) return 'uncategorized';

  for (const category of ['fix-here', 'already-fixed', 'not-a-defect', 'needs-more-evidence'] as const) {
    if (normalized.startsWith(RCA_CANONICAL_PREFIX[category].toLowerCase())) return category;
  }

  if (LEGACY_ALREADY_FIXED.test(normalized)) return 'already-fixed';

  return 'uncategorized';
}

/**
 * Whether a category names work a repair routine should pick up.
 *
 * `'uncategorized'` is INCLUDED, and that is the point. The repair half is a
 * session with judgement, not a regex: an analysis whose category could not
 * be derived still has a `probableCause` and `suspectFiles` a reader can
 * evaluate, and silently skipping it is how ten findings sat unread. What the
 * category changes is the ORDER and the confidence it is approached with, not
 * whether it is seen at all.
 */
export function isRepairCandidate(category: RcaCategory): boolean {
  return category === 'fix-here' || category === 'uncategorized';
}

/**
 * Whether a category is allowed to close an incident automatically.
 *
 * Only the two that carry provable evidence — a commit SHA that predates the
 * last occurrence, or a named control flow. `'uncategorized'` is excluded on
 * purpose: an automatic path acting on text it could not classify is the
 * same failure as resolving on silence.
 */
export function isAutoResolvable(category: RcaCategory): boolean {
  return category === 'already-fixed' || category === 'not-a-defect';
}
