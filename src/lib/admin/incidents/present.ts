/**
 * IncidentPresentation — the deterministic, plain-English projection of a
 * `UnifiedIncident` (brief §6 "IncidentPresentation", §7 "Error names that
 * mean nothing").
 *
 * WHY THIS MODULE EXISTS. `UnifiedIncident.title` today is whatever the
 * originating source called the fault — a Sentry issue title, an
 * `admin_events` message, a reliability signature. None of those are written
 * for an operator: "42501", "TypeError: fetch failed" and
 * "[object Object]" all show up verbatim. The owner's brief names this a
 * first-class product problem and asks for a RESOLVER, not a rewrite of the
 * incident model: every incident should carry a deterministic human title,
 * an operation context ("Golf > Round Tracking > Autosave") and the
 * technical signature demoted to muted-mono detail.
 *
 * RESOLVER ORDER (brief §7, exact): known SQLSTATE/PostgREST/Auth/Storage/
 * provider code -> known operation/RPC/action -> known feature -> normalized
 * stack/fingerprint -> fallback generic category. AI may add a secondary
 * explanation elsewhere; it is never consulted here and never the canonical
 * fingerprint or sole title source.
 *
 * TABLE-DRIVEN AND PURE. No I/O, no clock, no `server-only` import anywhere
 * in this file's graph — `feature-registry.ts`, `error-code-hint.ts` and
 * `transient-network-error.ts` are all plain data/pure-function modules, the
 * same discipline `rca-category.ts`'s header explains at length (a
 * `server-only` import poisons the whole graph for any client caller and
 * `tsc`/vitest cannot see it — only `next build` fails, opaquely).
 *
 * SAME CODE, DIFFERENT TITLE. `42501` alone means nothing operator-useful;
 * paired with `round_review_ai`'s persist step it means "CoachHelm recap
 * could not be saved", and paired with round tracking's autosave RPC it
 * means "Round autosave blocked by database permissions". So the code tier
 * is not a flat code->title map — it is scored by how much of
 * (code, action, feature) a rule pins down, and the most specific match
 * wins. A rule that only names a code is the tier's floor, not its only
 * shape.
 *
 * SAFE BY CONSTRUCTION, NOT BY CONVENTION. Every string this module can
 * possibly emit — for every rule and for the generic fallback — is a
 * literal written in this file or a short, closed vocabulary derived from
 * one (a feature label, an error-code hint). The raw incident message is
 * accepted as `PresentationSubject.message` for PATTERN MATCHING ONLY
 * (`RegExp.test`, never `RegExp.exec`/capture-group interpolation) and is
 * never copied into a title or a technical signature. That is what makes
 * "never a UUID, an email or raw message" a property of the code, not a
 * promise about the data it happens to see.
 */

import type { FeatureKey } from '@/lib/admin/feature-registry';
import { FEATURE_REGISTRY } from '@/lib/admin/feature-registry';
import { describeErrorCode } from '@/lib/admin/error-code-hint';
import type { IncidentClass } from '@/lib/admin/incident-classification';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

/**
 * Everything the resolver may look at. A subset of `UnifiedIncident` plus
 * `message`, which exists ONLY for pattern matching — see the module header.
 */
export interface PresentationSubject {
  errorCode: string | null;
  actionName: string | null;
  featureId: string | null;
  route: string | null;
  sport: 'golf' | 'baseball' | 'shared' | null;
  /** Free text (title + description), used for RegExp.test matching only. */
  message: string;
  /** Used only to word the tier-5 fallback; never required. */
  klass?: IncidentClass | null;
}

export type PresentationTier = 'code' | 'operation' | 'feature' | 'fingerprint' | 'generic';

export interface IncidentPresentation {
  /** Plain-English, operator-safe. Never a code, a UUID, an email or raw text. */
  title: string;
  /** "Golf > Round Tracking > Autosave", or null when nothing narrower than the tier itself is known. */
  operationContext: string | null;
  /** Muted-mono detail line — the ONLY field carrying anything code-shaped. */
  technicalSignature: string;
  /** Which resolver tier produced this presentation. */
  resolvedBy: PresentationTier;
  /** Which table entry fired, for tests and an operator "why am I seeing this" disclosure. */
  matchedRule: string;
}

// ---------------------------------------------------------------------------
// Feature label lookup (reuses the canonical registry — brief: "reuse ...
// the feature registry names instead of inventing new ones")
// ---------------------------------------------------------------------------

const FEATURE_LABEL_BY_KEY: ReadonlyMap<FeatureKey, string> = new Map(
  FEATURE_REGISTRY.map((def) => [def.key, def.label] as const),
);

function featureLabel(key: FeatureKey): string {
  return FEATURE_LABEL_BY_KEY.get(key) ?? key;
}

const SPORT_LABEL: Readonly<Record<NonNullable<PresentationSubject['sport']>, string>> = {
  golf: 'Golf',
  baseball: 'Baseball',
  shared: 'Platform',
};

// ---------------------------------------------------------------------------
// Tier 1 — known SQLSTATE / PostgREST / Auth / Storage / provider code
// ---------------------------------------------------------------------------

interface CodeRule {
  id: string;
  /** Matched case-insensitively against `subject.errorCode`. */
  code: string;
  /** Exact match against `subject.actionName`, when present. */
  actionName?: string;
  /** Exact match against `subject.featureId`, when present. */
  featureId?: FeatureKey;
  title: string;
  operationContext: string;
}

/**
 * 23 rules. Each is real: either a documented production incident
 * (`memory/incidents/**`), a code path read directly in this checkout, or a
 * code/title pairing taken verbatim from the owner's own brief (§7, §9,
 * §47). Ordered by nothing — matching is scored, not positional, so table
 * order carries no meaning; entries are grouped by code only for a human
 * reader.
 */
const CODE_RULES: readonly CodeRule[] = [
  // 42501 — permission denied. Two real production incidents shared this
  // code and needed two different titles — memory/incidents/golf_round_
  // lifecycle/INC-2026-08-25-recap-persist-schema-permission.md (feature
  // round_review_ai, action generateRoundRecap.persist) and the brief's own
  // §7 worked example (round tracking autosave).
  {
    id: 'pg-42501-round-review-persist',
    code: '42501',
    actionName: 'generateRoundRecap.persist',
    title: 'CoachHelm recap could not be saved',
    operationContext: 'Golf > CoachHelm > Round Recap > Persist response',
  },
  {
    id: 'pg-42501-round-tracking',
    code: '42501',
    featureId: 'round_tracking',
    title: 'Round autosave blocked by database permissions',
    operationContext: 'Golf > Round Tracking > Autosave',
  },
  {
    id: 'pg-42501-generic',
    code: '42501',
    title: 'Blocked by a database permission check',
    operationContext: 'Platform > Database > Permission check',
  },
  // 42703 — column does not exist. memory production incident 2026-09-02
  // (JAVASCRIPT-NEXTJS-QP): src/app/golf/actions/command-palette.ts read
  // `status:roster_status` off `golf_players`, a column it does not carry.
  {
    id: 'pg-42703-command-palette',
    code: '42703',
    actionName: 'getCommandPaletteData',
    title: 'Coach command palette could not load the roster',
    operationContext: 'Golf > Coach Dashboard > Command Palette',
  },
  {
    id: 'pg-42703-generic',
    code: '42703',
    title: 'Database query referenced a missing column',
    operationContext: 'Platform > Database > Query',
  },
  {
    id: 'pg-23505',
    code: '23505',
    title: 'Duplicate entry rejected by the database',
    operationContext: 'Platform > Database > Write',
  },
  {
    id: 'pg-23503',
    code: '23503',
    title: 'Related record missing — write rejected',
    operationContext: 'Platform > Database > Write',
  },
  {
    id: 'pg-23502',
    code: '23502',
    title: 'Required field was empty — write rejected',
    operationContext: 'Platform > Database > Write',
  },
  {
    id: 'pg-23514',
    code: '23514',
    title: 'A database check constraint rejected the write',
    operationContext: 'Platform > Database > Write',
  },
  {
    id: 'pg-57014',
    code: '57014',
    title: 'Database query timed out',
    operationContext: 'Platform > Database > Query',
  },
  {
    id: 'pg-40001',
    code: '40001',
    title: 'Database write conflicted with a concurrent transaction',
    operationContext: 'Platform > Database > Write',
  },
  {
    id: 'pg-40p01',
    code: '40P01',
    title: 'Database detected a deadlock',
    operationContext: 'Platform > Database > Write',
  },
  {
    id: 'pg-42p01',
    code: '42P01',
    title: 'Database is missing an expected table or view',
    operationContext: 'Platform > Database > Query',
  },
  {
    id: 'pg-42883',
    code: '42883',
    title: 'Database function call did not match a known signature',
    operationContext: 'Platform > Database > RPC call',
  },
  {
    id: 'pg-22p02',
    code: '22P02',
    title: 'Database rejected a malformed id or value',
    operationContext: 'Platform > Database > Write',
  },
  {
    id: 'pg-53300',
    code: '53300',
    title: 'Database connection pool is exhausted',
    operationContext: 'Platform > Database > Connections',
  },
  {
    id: 'pg-08006',
    code: '08006',
    title: 'Database connection failed',
    operationContext: 'Platform > Database > Connections',
  },
  {
    id: 'pgrst-116',
    code: 'PGRST116',
    title: 'Database expected exactly one row and found none or several',
    operationContext: 'Platform > Database > Query',
  },
  {
    id: 'pgrst-301',
    code: 'PGRST301',
    title: 'Session token was rejected by the database',
    operationContext: 'Platform > Auth > Session',
  },
  {
    id: 'pgrst-204',
    code: 'PGRST204',
    title: 'Database schema cache is out of date',
    operationContext: 'Platform > Database > Schema cache',
  },
  // BadDeviceToken — src/lib/notifications/push.ts, Apple's own "this token
  // is dead" signal. Brief §7 uses this exact title verbatim.
  {
    id: 'apns-bad-device-token',
    code: 'BadDeviceToken',
    title: 'Push notifications rejected stale Apple device tokens',
    operationContext: 'Platform > Notifications > Push delivery',
  },
  {
    id: 'http-401',
    code: '401',
    title: 'Request was not authenticated',
    operationContext: 'Platform > Auth > Session',
  },
  {
    id: 'http-403',
    code: '403',
    title: 'Request was forbidden by an authorization check',
    operationContext: 'Platform > Auth > Authorization',
  },
  {
    id: 'http-429',
    code: '429',
    title: 'Upstream provider rate-limited the request',
    operationContext: 'Platform > Integrations > Provider call',
  },
  {
    id: 'http-502',
    code: '502',
    title: 'An upstream service returned a bad gateway',
    operationContext: 'Platform > Integrations > Provider call',
  },
  {
    id: 'http-504',
    code: '504',
    title: 'An upstream service timed out',
    operationContext: 'Platform > Integrations > Provider call',
  },
];

const PROVIDER_CODE_PREFIX = 'provider_';

function matchesConstraint(ruleValue: string | undefined, subjectValue: string | null): boolean {
  return ruleValue === undefined || ruleValue === subjectValue;
}

/** Higher = more of (action, feature) pinned down and matched. */
function codeRuleScore(rule: CodeRule, subject: PresentationSubject): number | null {
  if (!matchesConstraint(rule.actionName, subject.actionName)) return null;
  if (!matchesConstraint(rule.featureId, subject.featureId)) return null;
  let score = 0;
  if (rule.actionName !== undefined) score += 2;
  if (rule.featureId !== undefined) score += 1;
  return score;
}

function bestCodeMatch(subject: PresentationSubject): CodeRule | null {
  const code = subject.errorCode;
  if (!code) return null;
  const lower = code.toLowerCase();

  let best: CodeRule | null = null;
  let bestScore = -1;
  for (const rule of CODE_RULES) {
    if (rule.code.toLowerCase() !== lower) continue;
    const score = codeRuleScore(rule, subject);
    if (score === null) continue;
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  if (best) return best;

  // provider_* is a closed prefix family (see error-code-hint.ts), not a
  // literal table entry — a credential/quota/plan gate, one title for all of
  // them because they share one fix: a human, not a deploy.
  if (lower.startsWith(PROVIDER_CODE_PREFIX)) {
    return {
      id: 'provider-fault',
      code,
      title: 'An upstream provider rejected the request',
      operationContext: 'Platform > Integrations > Provider call',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tier 2 — known operation / RPC / action (no code, or code unmatched above)
// ---------------------------------------------------------------------------

interface OperationRule {
  id: string;
  actionName: string;
  title: string;
  operationContext: string;
}

const OPERATION_RULES: readonly OperationRule[] = [
  {
    id: 'op-submit-round',
    actionName: 'submitGolfRoundComprehensive',
    title: 'Round submit failed',
    operationContext: 'Golf > Round Tracking > Submit',
  },
  {
    id: 'op-autosave-round',
    actionName: 'savePartialRound',
    title: 'Round autosave failed',
    operationContext: 'Golf > Round Tracking > Autosave',
  },
  {
    id: 'op-recap-generate',
    actionName: 'generateRoundRecap',
    title: 'CoachHelm recap generation failed',
    operationContext: 'Golf > CoachHelm > Round Recap > Generate',
  },
  {
    id: 'op-recap-player-name',
    actionName: 'generateRoundRecap.playerName',
    title: 'CoachHelm recap could not resolve the player',
    operationContext: 'Golf > CoachHelm > Round Recap > Player lookup',
  },
  {
    id: 'op-command-palette',
    actionName: 'getCommandPaletteData',
    title: 'Coach command palette failed to load',
    operationContext: 'Golf > Coach Dashboard > Command Palette',
  },
];

function findOperationMatch(subject: PresentationSubject): OperationRule | null {
  if (!subject.actionName) return null;
  return OPERATION_RULES.find((rule) => rule.actionName === subject.actionName) ?? null;
}

// ---------------------------------------------------------------------------
// Tier 3 — known feature
// ---------------------------------------------------------------------------

interface FeatureRule {
  id: string;
  featureId: FeatureKey;
  title: string;
  /** Prefixed with the feature's sport/app label at build time. */
  operationSuffix: string;
}

const FEATURE_RULES: readonly FeatureRule[] = [
  { id: 'feat-auth', featureId: 'auth_onboarding', title: 'Auth session refresh failed', operationSuffix: 'Auth > Session' },
  { id: 'feat-qualifiers', featureId: 'qualifiers', title: 'Qualifier lifecycle action failed', operationSuffix: 'Qualifiers > Lifecycle' },
  { id: 'feat-notifications', featureId: 'notifications', title: 'Push notification delivery failed', operationSuffix: 'Notifications > Push delivery' },
  { id: 'feat-coachhelm-ai', featureId: 'coachhelm_ai_engine', title: 'CoachHelm AI request failed', operationSuffix: 'CoachHelm > AI engine' },
  { id: 'feat-round-review-ai', featureId: 'round_review_ai', title: 'CoachHelm round review failed', operationSuffix: 'CoachHelm > Round Review' },
  { id: 'feat-roster', featureId: 'roster_management', title: 'Roster action failed', operationSuffix: 'Roster > Management' },
  { id: 'feat-messaging', featureId: 'messaging', title: 'Team messaging action failed', operationSuffix: 'Messaging' },
  { id: 'feat-baseball-roster', featureId: 'baseball_roster', title: 'Baseball roster action failed', operationSuffix: 'Roster' },
  { id: 'feat-baseball-lifting', featureId: 'baseball_lifting', title: 'Lift Lab action failed', operationSuffix: 'Lift Lab' },
];

function findFeatureMatch(subject: PresentationSubject): FeatureRule | null {
  if (!subject.featureId) return null;
  return FEATURE_RULES.find((rule) => rule.featureId === subject.featureId) ?? null;
}

function featureAppLabel(key: FeatureKey): string {
  const def = FEATURE_REGISTRY.find((d) => d.key === key);
  if (!def) return 'Platform';
  // CoachHelm is a Golf-surfaced AI layer, not a fourth app — brief §15 groups
  // it under "GOLF: ... CoachHelm" rather than a separate top-level lens.
  if (def.app === 'golfhelm' || def.app === 'coachhelm') return 'Golf';
  if (def.app === 'baseballhelm') return 'Baseball';
  return 'Platform';
}

// ---------------------------------------------------------------------------
// Tier 4 — normalized stack / fingerprint (message pattern, never verbatim)
// ---------------------------------------------------------------------------

interface FingerprintRule {
  id: string;
  pattern: RegExp;
  /** Extra scope, when the same message shape means different things per action. */
  actionName?: string;
  title: string;
  operationContext: string;
  /** Short, closed-vocabulary technical label — never the matched text itself. */
  normalizedSignature: string;
}

/** Mirrors `isTransientNetworkErrorMessage` (`@/lib/transient-network-error`)
 *  without importing it, so a message-shape change there cannot silently
 *  retarget a title this table intentionally pins. */
const TRANSIENT_NETWORK_PATTERN =
  /load failed|failed to fetch|fetch failed|networkerror when attempting to fetch|a network error occurred|network connection was lost|internet connection appears to be offline|net::err_/i;

const INNGEST_SIGNATURE_PATTERN = /x-inngest-signature|invalid signature|signature (has expired|validation failed)/i;

const FINGERPRINT_RULES: readonly FingerprintRule[] = [
  {
    id: 'fp-round-submit-timeout',
    pattern: /timed?\s*out/i,
    actionName: 'submitGolfRoundComprehensive',
    title: 'Round submit timed out waiting for Supabase',
    operationContext: 'Golf > Round Tracking > Submit',
    normalizedSignature: 'TimeoutError: submit timed out',
  },
  {
    id: 'fp-inngest-signature',
    pattern: INNGEST_SIGNATURE_PATTERN,
    title: 'Inngest production signing key is missing or invalid',
    operationContext: 'Platform > Background Jobs > Inngest',
    normalizedSignature: 'Inngest: invalid signature',
  },
  {
    id: 'fp-transient-network',
    pattern: TRANSIENT_NETWORK_PATTERN,
    title: 'Server could not reach an external dependency',
    operationContext: 'Platform > Network > Outbound request',
    normalizedSignature: 'TypeError: fetch failed',
  },
  {
    id: 'fp-player-profile-not-found',
    pattern: /player profile not found/i,
    title: 'Player profile could not be resolved for this request',
    operationContext: 'Golf > Round Tracking > Player lookup',
    normalizedSignature: 'player profile not found',
  },
  {
    id: 'fp-react-310',
    pattern: /minified react error #?310|rendered (more|fewer) hooks/i,
    title: 'Client rendered an inconsistent number of hooks',
    operationContext: 'Platform > Client > React render',
    normalizedSignature: 'React error #310',
  },
  {
    id: 'fp-react-418',
    pattern: /minified react error #?418|hydration (failed|mismatch|text mismatch)/i,
    title: "Client HTML did not match the server-rendered page",
    operationContext: 'Platform > Client > React hydration',
    normalizedSignature: 'React error #418',
  },
];

/**
 * Fingerprint rules that also pin an action ("this message, in this
 * operation, means X") are strictly more specific than the bare operation
 * rule for the same action, so they must be checked BEFORE tier 2 — not
 * folded into the general fingerprint scan, which only runs once tiers 2 and
 * 3 have already failed to match. Without this split, `op-submit-round`
 * (bare action, no message check) always wins first and
 * `fp-round-submit-timeout` — the brief's own worked example — is dead code.
 */
function findScopedFingerprintMatch(subject: PresentationSubject): FingerprintRule | null {
  if (!subject.actionName) return null;
  return (
    FINGERPRINT_RULES.find(
      (rule) => rule.actionName === subject.actionName && rule.pattern.test(subject.message),
    ) ?? null
  );
}

function findUnscopedFingerprintMatch(subject: PresentationSubject): FingerprintRule | null {
  return (
    FINGERPRINT_RULES.find((rule) => rule.actionName === undefined && rule.pattern.test(subject.message)) ?? null
  );
}

// ---------------------------------------------------------------------------
// Tier 5 — fallback generic category
// ---------------------------------------------------------------------------

const GENERIC_TITLE_BY_KLASS: Readonly<Record<IncidentClass, string>> = {
  defect: 'An unexpected error occurred',
  degradation: 'A dependency degraded and the system fell back',
  integration: 'An upstream provider returned an error',
  access: 'Access was denied by an authorization check',
  empty_state: 'No data was available yet for this request',
  telemetry: 'A routine telemetry signal crossed its threshold',
  integrity_ok: 'An integrity check completed successfully',
};

function genericPresentation(subject: PresentationSubject): IncidentPresentation {
  const title = subject.klass ? GENERIC_TITLE_BY_KLASS[subject.klass] : 'An unclassified error occurred';
  const operationContext = subject.featureId
    ? buildFeatureOperationContext(subject.featureId as FeatureKey, null)
    : subject.sport
      ? SPORT_LABEL[subject.sport]
      : null;
  return {
    title,
    operationContext,
    technicalSignature: buildTechnicalSignature(subject, null),
    resolvedBy: 'generic',
    matchedRule: 'generic-fallback',
  };
}

// ---------------------------------------------------------------------------
// Technical signature — the ONLY field allowed to look code-shaped
// ---------------------------------------------------------------------------

function buildTechnicalSignature(
  subject: PresentationSubject,
  fpMatch: FingerprintRule | null,
): string {
  if (subject.errorCode) {
    const hint = describeErrorCode(subject.errorCode);
    return hint ? `${subject.errorCode} · ${hint}` : subject.errorCode;
  }
  if (fpMatch) return fpMatch.normalizedSignature;
  return 'signature unavailable';
}

function buildFeatureOperationContext(key: FeatureKey, suffix: string | null): string {
  const app = featureAppLabel(key);
  const label = featureLabel(key);
  return suffix ? `${app} > ${label} > ${suffix}` : `${app} > ${label}`;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve one incident's presentation. Deterministic: identical input always
 * produces identical output, so this is safe to call on every render and
 * from a cron alike — the same purity discipline as `proof.ts` and
 * `lifecycle.ts`.
 */
export function resolveIncidentPresentation(subject: PresentationSubject): IncidentPresentation {
  const codeMatch = bestCodeMatch(subject);
  if (codeMatch) {
    return {
      title: codeMatch.title,
      operationContext: codeMatch.operationContext,
      technicalSignature: buildTechnicalSignature(subject, null),
      resolvedBy: 'code',
      matchedRule: codeMatch.id,
    };
  }

  // A fingerprint rule scoped to THIS action ("submit + timed out") outranks
  // the bare operation rule for the same action — see the comment on
  // `findScopedFingerprintMatch`.
  const scopedFpMatch = findScopedFingerprintMatch(subject);
  if (scopedFpMatch) {
    return {
      title: scopedFpMatch.title,
      operationContext: scopedFpMatch.operationContext,
      technicalSignature: buildTechnicalSignature(subject, scopedFpMatch),
      resolvedBy: 'fingerprint',
      matchedRule: scopedFpMatch.id,
    };
  }

  const opMatch = findOperationMatch(subject);
  if (opMatch) {
    return {
      title: opMatch.title,
      operationContext: opMatch.operationContext,
      technicalSignature: buildTechnicalSignature(subject, null),
      resolvedBy: 'operation',
      matchedRule: opMatch.id,
    };
  }

  const featMatch = findFeatureMatch(subject);
  if (featMatch) {
    return {
      title: featMatch.title,
      operationContext: `${featureAppLabel(featMatch.featureId)} > ${featMatch.operationSuffix}`,
      technicalSignature: buildTechnicalSignature(subject, null),
      resolvedBy: 'feature',
      matchedRule: featMatch.id,
    };
  }

  const fpMatch = findUnscopedFingerprintMatch(subject);
  if (fpMatch) {
    return {
      title: fpMatch.title,
      operationContext: fpMatch.operationContext,
      technicalSignature: buildTechnicalSignature(subject, fpMatch),
      resolvedBy: 'fingerprint',
      matchedRule: fpMatch.id,
    };
  }

  return genericPresentation(subject);
}

/** Build a `PresentationSubject` straight off a `UnifiedIncident`-shaped record. */
export function presentationSubjectFromIncident(incident: {
  errorCode: string | null;
  actionName: string | null;
  featureId: string | null;
  route: string | null;
  sport: 'golf' | 'baseball' | 'shared' | null;
  title: string;
  description: string;
  klass?: IncidentClass | null;
}): PresentationSubject {
  return {
    errorCode: incident.errorCode,
    actionName: incident.actionName,
    featureId: incident.featureId,
    route: incident.route,
    sport: incident.sport,
    message: `${incident.title} ${incident.description}`,
    klass: incident.klass ?? null,
  };
}
