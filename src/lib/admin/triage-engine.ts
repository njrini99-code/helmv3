/**
 * Triage — the deterministic half.
 *
 * "Triage" is three sources. `admin_events` only ever contains what this
 * application chose to log ABOUT ITSELF, so a cron dying on a table grant, a
 * Vercel build failing, or a Supabase advisor firing writes nothing there. A
 * triage pass that reads only `admin_events` and reports a clean board is a
 * monitor reporting health from the half it can see. Measured 2026-08-27: that
 * pass reported ZERO unanalysed while `/admin/reliability` showed eight
 * errors, the largest a cron failing 23 times on a `baseball_players` grant.
 *
 * This module takes candidates from ALL of them — the `admin_events` feed plus
 * the correlated Sentry/Supabase/Vercel signals the reliability collector
 * already writes to `background_job_logs.reliability-snapshot` — and returns a
 * plan: what collapses into one cause, what can be decided here and now from a
 * row's own content, and what genuinely needs a reader.
 *
 * PURE ON PURPOSE. No Supabase client, no `server-only`, no clock of its own —
 * `now` is a parameter. Everything here is a function of its inputs, which is
 * what makes the plan testable against fixtures AND runnable against a
 * production dump without a service-role key in the process. The I/O lives in
 * `scripts/run-triage.ts`.
 *
 * WHAT IT WILL NOT DO. It never decides that a defect is "already fixed" —
 * that claim needs a commit SHA checked against the serving deployment, and
 * inventing it is exactly the failure this whole subsystem exists to remove.
 * Those land in `needs-analysis`, which is the queue a reader (human or model)
 * works. An engine that guessed there would be worse than no engine, because
 * its guesses would close incidents.
 */
import {
  classifyIncident,
  type IncidentClassification,
} from '@/lib/admin/incident-classification';
import {
  buildIncidentSignature,
  normalizeIncidentRoute,
  type IncidentSeverity,
} from '@/lib/admin/incident-grouping';
import { deriveRcaCategory, type RcaCategory } from '@/lib/admin/rca-category';

/** Where a candidate came from. Kept per-candidate rather than per-run because
 *  a single cause routinely appears in more than one — and two sources
 *  agreeing is the strongest signal available that it is not instrumentation
 *  noise. */
export type TriageOrigin = 'admin_events' | 'sentry' | 'supabase' | 'vercel';

export interface TriageCandidate {
  /** Stable identity. `admin_events` rows use their fingerprint; reliability
   *  signals use `rel:<signature>` — NOT the bare signature. The two are
   *  different hashes of different inputs (`correlationSignature` folds
   *  severity out of the key on purpose so Sentry's `error` and this app's
   *  `warning` correlate as one), so an unprefixed collision would silently
   *  attach one cause's analysis to another's. */
  key: string;
  origin: TriageOrigin;
  title: string;
  message: string | null;
  route: string | null;
  severity: IncidentSeverity;
  errorCode: string | null;
  feature: string | null;
  action: string | null;
  /** `admin_events.source`, used by the classifier to spot the RLS tripwire. */
  source: string | null;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  /** For reliability signals: which arms saw it. Length > 1 is corroboration. */
  seenBy: readonly string[];
  /** A Sentry permalink when one exists — the stack trace the database lacks. */
  evidenceUrl: string | null;
  /** The `suggestedFix` of an already-stored analysis, if any. */
  existingAnalysisFix: string | null;
}

/** One arm of the reliability collector. `blind` means the source could not be
 *  READ — never that it found nothing. */
export interface SourceHealth {
  source: string;
  status: 'ok' | 'degraded' | 'blind';
  reason: string | null;
}

export type TriageVerdict =
  /** An analysis already exists. `category` carries what it decided. */
  | 'analysed'
  /** The classifier says nobody needs to act on this, from the row's own
   *  content — routine telemetry, an expected denial, a passed integrity
   *  check. Closeable here. */
  | 'not-a-defect'
  /** Actionable, unexplained. This is the queue. */
  | 'needs-analysis'
  /**
   * Non-actionable ONLY because it was logged quietly and nothing recognised
   * it. Reported, never auto-closed — see `decide()`.
   */
  | 'quiet-unrecognised';

export interface TriageGroup {
  /** Deterministic id for the cause, from `buildIncidentSignature`. */
  causeKey: string;
  title: string;
  severity: IncidentSeverity;
  route: string | null;
  errorCode: string | null;
  verdict: TriageVerdict;
  /** Why the verdict, in the classifier's own words. Never a bare label. */
  reason: string;
  /** Only set when `verdict === 'analysed'`. */
  category: RcaCategory | null;
  members: TriageCandidate[];
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  origins: TriageOrigin[];
  /** True when more than one independent source saw this cause. */
  corroborated: boolean;
  evidenceUrls: string[];
}

export interface TriagePlan {
  windowHours: number;
  generatedAt: string;
  groups: TriageGroup[];
  /** Groups that need a reader, worst first. The only list anyone acts on. */
  queue: TriageGroup[];
  /** Groups the engine can close now, with the classifier's reason as the
   *  evidence. Never includes anything it merely failed to understand — that
   *  is what `quiet` is for. */
  closeable: TriageGroup[];
  /** Non-actionable only by severity, recognised by nothing. Reported so it is
   *  visible, excluded from every write path so it cannot be archived unread. */
  quiet: TriageGroup[];
  sourceHealth: SourceHealth[];
  /** Sources that could not be read. Non-empty means this plan is INCOMPLETE
   *  and must be reported as such — a source that failed to read is unknown,
   *  not clean. */
  blindSources: string[];
  counts: {
    candidates: number;
    groups: number;
    analysed: number;
    notADefect: number;
    needsAnalysis: number;
    corroborated: number;
    collapsed: number;
    quietUnrecognised: number;
  };
}

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

function worseSeverity(a: IncidentSeverity, b: IncidentSeverity): IncidentSeverity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

/**
 * The cause key.
 *
 * Reuses `buildIncidentSignature` rather than inventing a second notion of
 * "the same failure" — this codebase already has one, it is covered, and a
 * second would drift. Severity is FIXED to `error` on the way in, exactly as
 * `correlationSignature` does in `src/lib/reliability/normalize.ts`, and for
 * the same reason: Sentry rates as `error` plenty of conditions this app logs
 * as `warning`, so leaving severity in the key splits one cause in two and the
 * corroboration this engine ranks on never fires.
 */
export function triageCauseKey(candidate: TriageCandidate): string {
  return buildIncidentSignature({
    severity: 'error',
    errorCode: candidate.errorCode,
    route: candidate.route,
    message: candidate.message ?? candidate.title,
  });
}

/**
 * Decide one group from its members, without asking anyone.
 *
 * Order is load-bearing. An EXISTING analysis wins outright — re-deciding a
 * group a reader already ruled on would let this engine silently overwrite
 * judgement with pattern-matching. Only then does the classifier get a say,
 * and only in the one direction it is entitled to: `actionable: false` means
 * "nobody needs to act on this", which the triage UI already honours by
 * default. It is never allowed to promote something TO actionable-and-fixed.
 */
function decide(members: readonly TriageCandidate[]): {
  verdict: TriageVerdict;
  reason: string;
  category: RcaCategory | null;
} {
  const analysed = members.find((m) => m.existingAnalysisFix !== null);
  if (analysed) {
    const category = deriveRcaCategory(analysed.existingAnalysisFix);
    return {
      verdict: 'analysed',
      reason:
        category === 'uncategorized'
          ? 'An analysis exists but opens off-contract — a reader has to classify it'
          : `Already analysed as ${category}`,
      category,
    };
  }

  // Worst member decides. A group where ONE member is a real error and the
  // rest are routine telemetry is a real error — taking the majority verdict
  // would let volume bury the one row that matters.
  const classifications: IncidentClassification[] = members.map((m) =>
    classifyIncident({
      title: m.title,
      message: m.message,
      severity: m.severity,
      source: m.source,
      errorCode: m.errorCode,
    }),
  );

  const actionable = classifications.find((c) => c.actionable);
  if (actionable) {
    return {
      verdict: 'needs-analysis',
      reason: actionable.reason,
      category: null,
    };
  }

  // Non-actionable, but HOW it got there decides whether anything may close
  // it. A content rule recognising the row ("expected access control", "empty
  // state", "routine telemetry") is a verdict. Falling through every rule and
  // landing on the severity ladder is not — it means nothing recognised this,
  // and it happened to be logged at info. Closing on that is closing on
  // silence, with the added twist that the "silence" is a severity whoever
  // wrote the log line chose.
  //
  // Measured 2026-08-27: 4 of the 13 rows this engine offered to close were
  // severity-fallback only — `[v3.llm.budget.platform_default] server trace`,
  // an admin-digest send confirmation, and two others that no rule matched.
  const first = classifications[0];
  if (first && !first.matched) {
    return {
      verdict: 'quiet-unrecognised',
      reason: `${first.reason} — no rule recognised this, so it is reported but never auto-closed`,
      category: null,
    };
  }

  return {
    verdict: 'not-a-defect',
    reason: first?.reason ?? 'Classified non-actionable from row content',
    category: null,
  };
}

/**
 * Build the plan.
 *
 * `now` is injected rather than read, so a fixture-driven test asserts the same
 * code path production runs — a plan that quietly used `Date.now()` would be
 * untestable at exactly the boundary (the window edge) where it matters.
 */
export function buildTriagePlan(input: {
  candidates: readonly TriageCandidate[];
  sourceHealth: readonly SourceHealth[];
  windowHours: number;
  now: Date;
}): TriagePlan {
  const { candidates, sourceHealth, windowHours, now } = input;

  const buckets = new Map<string, TriageCandidate[]>();
  for (const candidate of candidates) {
    const key = triageCauseKey(candidate);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(candidate);
    else buckets.set(key, [candidate]);
  }

  const groups: TriageGroup[] = [];
  for (const [causeKey, members] of buckets) {
    const { verdict, reason, category } = decide(members);
    const severity = members
      .map((m) => m.severity)
      .reduce((a, b) => worseSeverity(a, b), 'info' as IncidentSeverity);
    const origins = [...new Set(members.map((m) => m.origin))];
    const seenBy = new Set<string>(origins);
    for (const m of members) for (const s of m.seenBy) seenBy.add(s);

    // The most informative member names the group. Route + code beats a
    // truncated sentence, and a group of twelve "Load failed" rows across
    // eleven call sites needs a name that says which cause it is, not which
    // call site happened to sort first.
    const named = [...members].sort((a, b) => b.occurrences - a.occurrences)[0]!;

    groups.push({
      causeKey,
      title: named.title,
      severity,
      route: named.route ? normalizeIncidentRoute(named.route) : null,
      errorCode: members.map((m) => m.errorCode).find((c) => c !== null) ?? null,
      verdict,
      reason,
      category,
      members,
      occurrences: members.reduce((sum, m) => sum + m.occurrences, 0),
      firstSeen: members.map((m) => m.firstSeen).sort()[0]!,
      lastSeen: members.map((m) => m.lastSeen).sort().at(-1)!,
      origins,
      corroborated: seenBy.size > 1,
      evidenceUrls: members
        .map((m) => m.evidenceUrl)
        .filter((u): u is string => u !== null),
    });
  }

  // Ranked for a reader, not for a database: corroboration first (two
  // independent systems agreeing is the least likely thing to be noise), then
  // severity, then volume, then recency.
  const rank = (a: TriageGroup, b: TriageGroup): number => {
    if (a.corroborated !== b.corroborated) return a.corroborated ? -1 : 1;
    if (a.severity !== b.severity) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (a.occurrences !== b.occurrences) return b.occurrences - a.occurrences;
    return b.lastSeen.localeCompare(a.lastSeen);
  };

  groups.sort(rank);

  const blindSources = sourceHealth
    .filter((s) => s.status === 'blind')
    .map((s) => s.source);

  return {
    windowHours,
    generatedAt: now.toISOString(),
    groups,
    queue: groups.filter((g) => g.verdict === 'needs-analysis'),
    closeable: groups.filter((g) => g.verdict === 'not-a-defect'),
    quiet: groups.filter((g) => g.verdict === 'quiet-unrecognised'),
    sourceHealth: [...sourceHealth],
    blindSources,
    counts: {
      candidates: candidates.length,
      groups: groups.length,
      analysed: groups.filter((g) => g.verdict === 'analysed').length,
      notADefect: groups.filter((g) => g.verdict === 'not-a-defect').length,
      needsAnalysis: groups.filter((g) => g.verdict === 'needs-analysis').length,
      corroborated: groups.filter((g) => g.corroborated).length,
      // How much fragmentation the grouping actually removed. When this is
      // large the board was showing one fault as many, which is the specific
      // thing that made it unreadable.
      collapsed: candidates.length - groups.length,
      quietUnrecognised: groups.filter((g) => g.verdict === 'quiet-unrecognised').length,
    },
  };
}
