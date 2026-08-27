/**
 * Qualifier logic, expressed as checkable invariants rather than prose.
 *
 * `memory/features/qualifiers.md` documents roughly twenty business rules for
 * qualifiers. Prose rules have a specific failure mode in this repo: they read
 * as true forever. The rule that "scheduled dates are calendar metadata, never
 * a player-entry deadline" was documented and still shipped as a bug
 * (INC-2026-08-22-end-date-closed-qualifier-early), because nothing compared
 * the sentence to the data.
 *
 * Each invariant below turns one of those rules into a query over live rows, so
 * the Bridge can state whether production honours it *right now* instead of
 * restating the intent. A violation count of zero is a measurement, not a
 * promise — and when it stops being zero, the surface says which rule broke and
 * which rows broke it.
 *
 * Pure functions on purpose: the I/O lives in `data/qualifier-logic.ts`, so the
 * interesting part — what counts as a violation — is testable without a
 * database.
 */

export type QualifierInvariantSeverity = 'critical' | 'warning';

export interface QualifierRow {
  id: string;
  team_id: string | null;
  num_rounds: number | null;
  status: string | null;
  name: string | null;
}

export interface QualifierLinkedRound {
  id: string;
  team_id: string | null;
  player_id: string | null;
  qualifier_id: string | null;
  qualifier_round_number: number | null;
}

export interface QualifierInvariantResult {
  id: string;
  label: string;
  /** The business rule this enforces, quoted from the feature doc. */
  rule: string;
  /** Why a violation matters — what breaks for a real user. */
  consequence: string;
  severity: QualifierInvariantSeverity;
  violations: number;
  /** A bounded sample of offending round ids, for pivoting to the data. */
  sampleRoundIds: string[];
}

const SAMPLE_LIMIT = 5;

function result(
  base: Omit<QualifierInvariantResult, 'violations' | 'sampleRoundIds'>,
  offending: readonly QualifierLinkedRound[],
): QualifierInvariantResult {
  return {
    ...base,
    violations: offending.length,
    sampleRoundIds: offending.slice(0, SAMPLE_LIMIT).map((r) => r.id),
  };
}

/**
 * Evaluate every qualifier invariant against a snapshot of rows.
 *
 * Ordered worst-first so the surface leads with what matters. Every check is a
 * pure fold over the two row sets — no query in here, so a test can construct
 * the exact violating shape rather than hoping production contains one.
 */
export function evaluateQualifierInvariants(
  qualifiers: readonly QualifierRow[],
  linkedRounds: readonly QualifierLinkedRound[],
): QualifierInvariantResult[] {
  const byId = new Map(qualifiers.map((q) => [q.id, q]));

  // 1. Cross-team linkage — a round attached to another team's qualifier.
  //    This is the data-side counterpart of security finding F8:
  //    `reclassify_golf_round` verifies the caller owns the ROUND but never
  //    that the supplied qualifier belongs to the round's own team, so an
  //    authorized player can attach their score to a rival team's qualifier
  //    leaderboard. This check is what would make that visible if it happened.
  const crossTeam = linkedRounds.filter((r) => {
    const q = r.qualifier_id ? byId.get(r.qualifier_id) : undefined;
    return Boolean(q && r.team_id && q.team_id && q.team_id !== r.team_id);
  });

  // 2. Orphan link — qualifier_id pointing at a qualifier that no longer
  //    exists. The round still claims to be a qualifier round, so it can be
  //    counted in progress while being unreachable from the qualifier.
  const orphan = linkedRounds.filter(
    (r) => r.qualifier_id !== null && !byId.has(r.qualifier_id),
  );

  // 3. Duplicate slot — two rounds claiming the same (qualifier, player,
  //    round number). The doc requires progression through "the first unused
  //    configured slot"; a duplicate means two scores compete for one slot and
  //    the leaderboard silently picks one.
  const slotSeen = new Map<string, QualifierLinkedRound[]>();
  for (const r of linkedRounds) {
    if (!r.qualifier_id || r.qualifier_round_number === null || !r.player_id) continue;
    const key = `${r.qualifier_id}::${r.player_id}::${r.qualifier_round_number}`;
    const bucket = slotSeen.get(key);
    if (bucket) bucket.push(r);
    else slotSeen.set(key, [r]);
  }
  const duplicates = [...slotSeen.values()].filter((b) => b.length > 1).flat();

  // 4. Over cap — a round numbered beyond the coach-configured `num_rounds`.
  //    The cap is an entry rule, and the database is supposed to reject a
  //    reduction below an in-progress round; a violation means the cap and the
  //    data disagree about how many rounds this qualifier has.
  const overCap = linkedRounds.filter((r) => {
    const q = r.qualifier_id ? byId.get(r.qualifier_id) : undefined;
    return Boolean(
      q && q.num_rounds !== null && r.qualifier_round_number !== null &&
      r.qualifier_round_number > q.num_rounds,
    );
  });

  return [
    result({
      id: 'cross_team_link',
      label: 'Round linked to another team’s qualifier',
      rule: 'A round’s qualifier must belong to the round’s own team.',
      consequence:
        'A score appears on a rival team’s leaderboard. This is the data-side view of security finding F8 — reclassify_golf_round checks round ownership but not qualifier team.',
      severity: 'critical',
    }, crossTeam),
    result({
      id: 'orphan_link',
      label: 'Round links to a qualifier that no longer exists',
      rule: 'Round submission is the source of truth for qualifier progress.',
      consequence:
        'The round still counts itself as a qualifier round while being unreachable from any qualifier, so progress and leaderboard disagree.',
      severity: 'critical',
    }, orphan),
    result({
      id: 'duplicate_slot',
      label: 'Two rounds claiming one qualifier slot',
      rule: 'Players advance through the first unused configured slot (1 → 2 → 3).',
      consequence:
        'Two scores compete for the same slot and the leaderboard silently picks one, so a player’s recorded result depends on row order.',
      severity: 'critical',
    }, duplicates),
    result({
      id: 'over_cap',
      label: 'Round numbered beyond the configured cap',
      rule: 'The configured num_rounds cap is an entry rule, written atomically with the qualifier.',
      consequence:
        'The cap and the data disagree about how many rounds the qualifier has, so entry refusals stop matching what players can see.',
      severity: 'warning',
    }, overCap),
  ];
}

export interface QualifierLifecycleSummary {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  linkedRounds: number;
  /** Qualifiers configured for more than one round. */
  multiRound: number;
  /** Qualifiers with no num_rounds set — the cap is unenforceable for these. */
  missingCap: number;
}

export function summarizeQualifierLifecycle(
  qualifiers: readonly QualifierRow[],
  linkedRounds: readonly QualifierLinkedRound[],
): QualifierLifecycleSummary {
  const counts = new Map<string, number>();
  for (const q of qualifiers) {
    const status = q.status ?? 'unknown';
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return {
    total: qualifiers.length,
    byStatus: [...counts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    linkedRounds: linkedRounds.length,
    multiRound: qualifiers.filter((q) => (q.num_rounds ?? 1) > 1).length,
    // Not a violation on its own — legacy rows predate the cap — but it is the
    // population for which "the cap rejected your entry" can never fire.
    missingCap: qualifiers.filter((q) => q.num_rounds === null).length,
  };
}

/** Worst severity present, for the panel's headline tone. */
export function worstQualifierSeverity(
  results: readonly QualifierInvariantResult[],
): QualifierInvariantSeverity | null {
  const breached = results.filter((r) => r.violations > 0);
  if (breached.length === 0) return null;
  return breached.some((r) => r.severity === 'critical') ? 'critical' : 'warning';
}
