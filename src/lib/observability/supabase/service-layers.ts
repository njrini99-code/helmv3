/**
 * Service-layer attribution — brief §48.
 *
 * "Separate service layers Gateway/API, Auth, PostgREST, Postgres, Storage,
 * Realtime, Edge."
 *
 * Two different questions, deliberately answered separately:
 *
 *   observedLayer      WHERE HELM SAW IT. Mechanical, from the envelope's
 *                      `service`. Never a judgement.
 *   likelyOriginLayer  WHERE IT PROBABLY STARTED. A judgement, and the whole
 *                      reason this module exists — a 42501 surfaced by
 *                      PostgREST was decided by Postgres, and a Storage
 *                      "DatabaseTimeout" is Postgres wearing a Storage label.
 *
 * Collapsing them loses the diagnosis. A board that groups every PostgREST-
 * surfaced failure under "PostgREST" tells an operator to look at the wrong
 * process for most of its rows.
 *
 * AMBIGUITY IS AN ANSWER, NOT A GAP
 * ---------------------------------
 * Some evidence genuinely cannot separate two layers. PGRST003 (a request
 * timed out waiting on the pool) fits a slow Postgres and an exhausted
 * PostgREST pool equally; an HTTP 5xx with no service-specific code fits the
 * gateway and everything behind it. Those return `likelyOriginLayer: 'unknown'`
 * with `ambiguous: true` and BOTH candidates named in `reasons` — which is
 * more useful than a coin-flip attribution, and is the same "unknown is never
 * healthy, and never a fabricated value" rule the rest of this directory
 * follows.
 *
 * PURE. No I/O, no clock. Reads only enumerated envelope dimensions plus the
 * codes; never the message text.
 */
import type { SupabaseErrorEnvelope } from './envelope';

export const SERVICE_LAYERS = [
  'gateway_api',
  'auth',
  'postgrest',
  'postgres',
  'storage',
  'realtime',
  'edge_function',
  'unknown',
] as const;
export type ServiceLayer = (typeof SERVICE_LAYERS)[number];

export const SERVICE_LAYER_LABEL: Readonly<Record<ServiceLayer, string>> = {
  gateway_api: 'GATEWAY / API',
  auth: 'AUTH',
  postgrest: 'POSTGREST',
  postgres: 'POSTGRES',
  storage: 'STORAGE',
  realtime: 'REALTIME',
  edge_function: 'EDGE',
  unknown: 'UNKNOWN',
};

export type OriginConfidence = 'certain' | 'likely' | 'unknown';

export interface ServiceLayerAttribution {
  /** Where Helm observed the failure. Mechanical, from `service`. */
  observedLayer: ServiceLayer;
  /** Where it probably started. `'unknown'` whenever the evidence does not separate layers. */
  likelyOriginLayer: ServiceLayer;
  originConfidence: OriginConfidence;
  /** True when two or more layers fit the evidence equally. */
  ambiguous: boolean;
  /** Every candidate the evidence admits, including the chosen one. */
  candidateLayers: readonly ServiceLayer[];
  /** Short sentences, built from enumerated dimensions only. */
  reasons: readonly string[];
}

/** Mechanical: the envelope's `service` IS the observed layer. `pg_cron` and
 *  `pg_net` both run inside Postgres, so they observe as `postgres`. */
export function observedServiceLayer(service: SupabaseErrorEnvelope['service']): ServiceLayer {
  switch (service) {
    case 'postgrest':
      return 'postgrest';
    case 'postgres':
    case 'pg_cron':
    case 'pg_net':
      return 'postgres';
    case 'auth':
      return 'auth';
    case 'storage':
      return 'storage';
    case 'realtime':
      return 'realtime';
    case 'edge_function':
      return 'edge_function';
    default:
      return 'unknown';
  }
}

/** A five-character SQLSTATE is a Postgres verdict wherever it surfaced. */
function isSqlstate(code: string | null): code is string {
  return code !== null && /^[0-9A-Z]{5}$/.test(code);
}

/** PostgREST could not reach or query Postgres. The DB side is the likelier origin. */
const POSTGREST_CONNECTION_CODES = new Set(['PGRST000', 'PGRST001', 'PGRST002']);
/** PostgREST timed out waiting — genuinely ambiguous between DB slowness and pool exhaustion. */
const POSTGREST_TIMEOUT_CODES = new Set(['PGRST003']);

export type ServiceLayerEnvelope = Pick<
  SupabaseErrorEnvelope,
  'service' | 'sqlstate' | 'postgrestCode' | 'authCode' | 'storageCode' | 'code' | 'httpStatus'
>;

export function attributeServiceLayer(envelope: ServiceLayerEnvelope): ServiceLayerAttribution {
  const observedLayer = observedServiceLayer(envelope.service);
  const sqlstate = envelope.sqlstate ?? (isSqlstate(envelope.code) ? envelope.code : null);
  // A PostgREST-native code MUST start with `PGRST`. Anything else in that
  // field is a caller's mis-derivation, and the catch-all branch below would
  // turn it into a false assertion ("… is a PostgREST-native code — the
  // request never became a Postgres verdict"). `classify.ts`'s message
  // fallback stores `unknown_authorization` / `unknown_deadlock` /
  // `unknown_timeout` / `unknown_missing_object` / `classifier_failure` in
  // `code` with a null sqlstate — every one of those is a SWALLOWED Postgres
  // verdict, the exact opposite of what that sentence claims. Rejecting the
  // value here makes the false assertion unreachable from any caller rather
  // than relying on each of them to derive the field correctly.
  const rawPostgrestCode = envelope.postgrestCode ?? null;
  const postgrestCode = rawPostgrestCode !== null && rawPostgrestCode.startsWith('PGRST') ? rawPostgrestCode : null;
  const reasons: string[] = [];

  const settle = (
    layer: ServiceLayer,
    confidence: OriginConfidence,
    candidates: readonly ServiceLayer[],
  ): ServiceLayerAttribution => ({
    observedLayer,
    likelyOriginLayer: layer,
    originConfidence: confidence,
    ambiguous: candidates.length > 1,
    candidateLayers: candidates,
    reasons,
  });

  // --- A Postgres verdict is a Postgres verdict wherever it surfaced -------
  // This is the single most useful rule in the module: it moves a 42501, a
  // 57014 and a 40P01 out of whatever service relayed them and onto the layer
  // that actually decided them.
  if (isSqlstate(sqlstate)) {
    if (observedLayer === 'postgres') {
      reasons.push(`Observed in Postgres with SQLSTATE ${sqlstate}.`);
      return settle('postgres', 'certain', ['postgres']);
    }
    reasons.push(
      `Carries SQLSTATE ${sqlstate}, which only Postgres emits — ${SERVICE_LAYER_LABEL[observedLayer]} relayed a decision made in the database.`,
    );
    return settle('postgres', 'certain', ['postgres']);
  }

  // --- PostgREST-native codes ---------------------------------------------
  if (postgrestCode !== null && POSTGREST_CONNECTION_CODES.has(postgrestCode)) {
    reasons.push(
      `${postgrestCode} means PostgREST could not connect to or load its schema from Postgres — the database side is the likelier origin.`,
    );
    return settle('postgres', 'likely', ['postgres', 'postgrest']);
  }

  if (postgrestCode !== null && POSTGREST_TIMEOUT_CODES.has(postgrestCode)) {
    reasons.push(
      `${postgrestCode} is a timeout waiting on the connection pool. A slow Postgres and an exhausted PostgREST pool produce it identically; this evidence does not separate them.`,
    );
    return settle('unknown', 'unknown', ['postgres', 'postgrest']);
  }

  if (postgrestCode !== null) {
    reasons.push(`${postgrestCode} is a PostgREST-native code — the request never became a Postgres verdict.`);
    return settle('postgrest', 'likely', ['postgrest']);
  }

  // --- Service-native codes ------------------------------------------------
  if (envelope.authCode !== null && envelope.authCode.length > 0) {
    reasons.push(`Carries the Auth-native code ${envelope.authCode}.`);
    return settle('auth', 'certain', ['auth']);
  }

  if (envelope.storageCode !== null && envelope.storageCode.length > 0) {
    reasons.push(`Carries the Storage-native code ${envelope.storageCode}.`);
    return settle('storage', 'certain', ['storage']);
  }

  // --- No code at all: HTTP status is all that is left ---------------------
  const status = envelope.httpStatus;
  if (status !== null && status >= 500) {
    reasons.push(
      `HTTP ${status} with no service-specific code. The gateway and ${SERVICE_LAYER_LABEL[observedLayer]} both produce this shape; nothing here separates them.`,
    );
    const candidates: ServiceLayer[] =
      observedLayer === 'unknown' ? ['gateway_api'] : ['gateway_api', observedLayer];
    return settle('unknown', 'unknown', candidates);
  }

  if (status !== null && status >= 400) {
    reasons.push(`HTTP ${status} with no service-specific code — a client-side rejection at ${SERVICE_LAYER_LABEL[observedLayer]}.`);
    return settle(observedLayer, observedLayer === 'unknown' ? 'unknown' : 'likely', [observedLayer]);
  }

  if (observedLayer === 'unknown') {
    reasons.push('No service, code or HTTP status identifies a layer.');
    return settle('unknown', 'unknown', ['unknown']);
  }

  reasons.push(`No code or HTTP status beyond the observing service (${SERVICE_LAYER_LABEL[observedLayer]}).`);
  return settle(observedLayer, 'likely', [observedLayer]);
}

/**
 * Multi-layer evidence: several envelopes believed to be one root cause
 * (brief §33 — "one root cause appearing as Sentry exception + Bridge server
 * error + DB error event … is evidence, not five incidents").
 *
 * Returns the deepest layer any member attributes to WITH a non-`unknown`
 * origin, because a failure that reached Postgres explains the ones relayed
 * above it, not the other way round. When members disagree at the same depth,
 * or every member is ambiguous, the result is `unknown` and `ambiguous`.
 */
const LAYER_DEPTH: Readonly<Record<ServiceLayer, number>> = {
  unknown: -1,
  gateway_api: 0,
  auth: 1,
  postgrest: 1,
  storage: 1,
  realtime: 1,
  edge_function: 1,
  postgres: 2,
};

export function attributeMultiLayerEvidence(
  envelopes: readonly ServiceLayerEnvelope[],
): ServiceLayerAttribution & { members: readonly ServiceLayerAttribution[] } {
  const members = envelopes.map(attributeServiceLayer);

  if (members.length === 0) {
    return {
      observedLayer: 'unknown',
      likelyOriginLayer: 'unknown',
      originConfidence: 'unknown',
      ambiguous: false,
      candidateLayers: ['unknown'],
      reasons: ['No evidence supplied.'],
      members,
    };
  }

  const decided = members.filter((m) => m.likelyOriginLayer !== 'unknown');
  if (decided.length === 0) {
    const candidates = Array.from(new Set(members.flatMap((m) => m.candidateLayers)));
    return {
      observedLayer: members[0]!.observedLayer,
      likelyOriginLayer: 'unknown',
      originConfidence: 'unknown',
      ambiguous: true,
      candidateLayers: candidates,
      reasons: ['Every piece of evidence is ambiguous on its own, and together they still do not separate the layers.'],
      members,
    };
  }

  const maxDepth = Math.max(...decided.map((m) => LAYER_DEPTH[m.likelyOriginLayer]));
  const deepest = decided.filter((m) => LAYER_DEPTH[m.likelyOriginLayer] === maxDepth);
  const distinct = Array.from(new Set(deepest.map((m) => m.likelyOriginLayer)));

  if (distinct.length > 1) {
    return {
      observedLayer: members[0]!.observedLayer,
      likelyOriginLayer: 'unknown',
      originConfidence: 'unknown',
      ambiguous: true,
      candidateLayers: distinct,
      reasons: [
        `Evidence attributes to ${distinct.map((l) => SERVICE_LAYER_LABEL[l]).join(' and ')} at the same depth; nothing here chooses between them.`,
      ],
      members,
    };
  }

  const chosen = distinct[0]!;
  const anyCertain = deepest.some((m) => m.originConfidence === 'certain');
  return {
    observedLayer: members[0]!.observedLayer,
    likelyOriginLayer: chosen,
    originConfidence: anyCertain ? 'certain' : 'likely',
    ambiguous: false,
    candidateLayers: Array.from(new Set(members.flatMap((m) => m.candidateLayers))),
    reasons: [
      `${members.length} pieces of evidence across ${new Set(members.map((m) => m.observedLayer)).size} observed layer(s); the deepest decided origin is ${SERVICE_LAYER_LABEL[chosen]}, which explains the layers above it.`,
      ...deepest.flatMap((m) => m.reasons),
    ],
    members,
  };
}
