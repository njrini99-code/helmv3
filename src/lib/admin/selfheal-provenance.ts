/**
 * What a self-healing stage's heartbeat row actually PROVES about that stage.
 *
 * `background_job_logs` is an open table: the stages write to it, and so does
 * a human at a psql prompt. Both produce a row with `status = 'completed'`,
 * and on a board that reads only the status column they are the same fact.
 * They are not. Measured 2026-09-01, the three newest `selfheal-*` rows in
 * production include one autonomous run, one where a human substituted the
 * whole collector by hand because the routine had no service-role key, and
 * one row whose own metadata says `MANUAL INSTRUMENT PROBE, not a stage run`.
 *
 * Rendering the second and third as stage output is the same error class the
 * rest of this board exists to refuse — presenting weaker evidence in a
 * stronger register — so provenance is derived here, from the strings the
 * runs themselves recorded, and carried to the UI rather than flattened.
 *
 * Everything in this module is PURE and total: `metadata` arrives as
 * `unknown` (it is `jsonb`), every read is guarded, and an unrecognised
 * shape degrades to `autonomous` with a null basis rather than throwing. A
 * classifier that can crash the board it annotates is worse than no
 * classifier.
 */

/**
 * How much of this run a machine actually did.
 *
 * Deliberately NOT a quality ranking. An `operator-assisted` run can produce
 * perfectly good output — the 2026-08-31 triage run did — and the point is
 * only that it does not demonstrate the stage can run WITHOUT a human, which
 * is the thing the self-healing loop claims about itself.
 */
export type RunProvenanceKind =
  /** No recorded evidence of human substitution. The stage ran itself. */
  | 'autonomous'
  /** A human stood in for part of the stage's own work this run. */
  | 'operator-assisted'
  /** Not a stage run at all — a row written by hand to exercise the board. */
  | 'instrument-probe';

export interface StageRunProvenance {
  kind: RunProvenanceKind;
  /**
   * The exact recorded string this classification rests on, so the board can
   * show its work instead of asserting a verdict. Null for `autonomous`,
   * which is the absence of evidence rather than evidence of absence — and is
   * labelled that way in the UI.
   */
  basis: string | null;
}

export const RUN_PROVENANCE_LABEL: Readonly<Record<RunProvenanceKind, string>> = {
  autonomous: 'autonomous',
  'operator-assisted': 'operator-assisted',
  'instrument-probe': 'instrument probe',
};

/** One recorded fact about what a run did — already display-ready. */
export interface StageRunFact {
  label: string;
  value: string;
}

export interface StageRunOutcome {
  provenance: StageRunProvenance;
  /** Counts and ids the run recorded about its own work, in a fixed order. */
  facts: StageRunFact[];
  /** Why the run could not do its work, when it recorded a reason. */
  blockedReason: string | null;
  /** The free-text note the run left, when it left one. */
  note: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Metadata keys that describe WORK DONE, in the order a reader wants them.
 *
 * An allowlist rather than "render every key": metadata also carries
 * `run_id`, `method`, `note` and `degraded`, which are provenance or plumbing
 * and are surfaced through their own fields. A blanket key dump would put a
 * uuid next to a count and let a future writer add a key that silently
 * becomes board copy.
 */
const FACT_KEYS: readonly { key: string; label: string }[] = [
  { key: 'groups', label: 'groups' },
  { key: 'analysed', label: 'analysed' },
  { key: 'analyzed', label: 'analysed' },
  { key: 'resolved', label: 'resolved' },
  { key: 'skipped', label: 'skipped' },
  { key: 'confirmed', label: 'confirmed' },
  { key: 'corrected', label: 'corrected' },
  { key: 'prs', label: 'PRs' },
  { key: 'capped', label: 'capped' },
] as const;

function formatFactValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'none';
    return value.map((v) => (typeof v === 'number' ? `#${v}` : String(v))).join(', ');
  }
  return null;
}

/**
 * Classify one heartbeat row's provenance from its metadata.
 *
 * The three patterns below are the ones production has actually produced —
 * matched case-insensitively on substrings the writers chose deliberately.
 * A row that matches none of them is `autonomous`, which is the honest
 * default: this function can detect a run that ANNOUNCED human involvement,
 * and cannot detect one that did not.
 */
export function classifyRunProvenance(metadata: unknown): StageRunProvenance {
  const meta = asRecord(metadata);
  if (!meta) return { kind: 'autonomous', basis: null };

  const note = asString(meta.note);
  const method = asString(meta.method);

  // Checked FIRST: a probe row can also carry a `method`, and "this is not a
  // stage run at all" outranks "a human helped with this stage run".
  if (note && /manual instrument probe|not a stage run/i.test(note)) {
    return { kind: 'instrument-probe', basis: note };
  }
  if (method && /^manual[-_]/i.test(method)) {
    return { kind: 'operator-assisted', basis: `method: ${method}` };
  }
  if (note && /operator[-\s]supervised|substituted|by hand|hand-rolled/i.test(note)) {
    return { kind: 'operator-assisted', basis: note };
  }
  return { kind: 'autonomous', basis: null };
}

/**
 * Everything the board shows about what one run DID, derived from the row's
 * metadata. Total: any shape at all yields a valid outcome, with empty facts
 * and null reasons when nothing is recorded.
 */
export function deriveRunOutcome(metadata: unknown): StageRunOutcome {
  const meta = asRecord(metadata);
  const provenance = classifyRunProvenance(metadata);

  if (!meta) {
    return { provenance, facts: [], blockedReason: null, note: null };
  }

  const seen = new Set<string>();
  const facts: StageRunFact[] = [];
  for (const { key, label } of FACT_KEYS) {
    if (!(key in meta) || seen.has(label)) continue;
    const value = formatFactValue(meta[key]);
    if (value === null) continue;
    seen.add(label);
    facts.push({ label, value });
  }

  return {
    provenance,
    facts,
    blockedReason: asString(meta.blocked_reason),
    note: asString(meta.note),
  };
}
