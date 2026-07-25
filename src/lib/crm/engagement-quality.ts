/**
 * Engagement quality — the single shared discriminator between a human buying
 * signal and a machine touching a link.
 *
 * ## Why this exists
 *
 * Corporate email security appliances (Proofpoint, Mimecast, Barracuda,
 * Microsoft Safe Links, Cisco/IronPort, ...) open and follow every URL in an
 * inbound message *before* the recipient ever sees it. Every downstream CRM
 * signal we derive from a link — `email_events` opens/clicks, demo-gate
 * sessions, "engaged" status promotions, follow-up tasks — is therefore
 * contaminated by traffic no coach ever generated.
 *
 * Measured on production data (2026-07):
 *   - 1,133 of 1,218 total link clicks (93%) fired **< 2 minutes** after the
 *     message was delivered.
 *   - 178 of 220 golf demo-gate sessions fired **< 2 minutes** after that
 *     coach's send timestamp. The demo-invite email carries an auto-submitting
 *     gate link, so a scanner following it manufactures a complete, entirely
 *     fake session — name, email, school and all.
 *
 * ## The one thing a future reader must not "improve"
 *
 * **Latency is the primary signal. User-agent matching is deliberately
 * secondary and is NOT trustworthy on its own.** The scanners we measured
 * spoof real browser user-agent strings: 79 demo sessions shared a single
 * `Chrome/142.0.7...` UA across **49 distinct IP addresses**. No blocklist,
 * bot-name regex, or UA heuristic can separate that from a real Chrome user.
 * If you are here to "make the detection smarter", do not promote UA matching
 * to the primary check — it will quietly re-open the exact hole this module
 * was written to close. The only reliable discriminators are:
 *
 *   (a) latency between the delivery/send reference and the event
 *       (sub-2-minute is machine speed, not human speed), and
 *   (b) IP fan-out for an identical UA string
 *       (see {@link detectUserAgentIpFanOut}).
 *
 * ## Contract
 *
 * Pure functions only — no Supabase, no network, no `Date.now()`. Every
 * timestamp the logic needs is passed in as an argument so callers stay in
 * control of the clock and every branch is unit-testable.
 *
 * When we cannot tell, we say `'unknown'`. We never fall back to
 * `'likely_human'` — silently assuming human is precisely how six weeks of
 * poisoned engagement metrics got into the CRM in the first place.
 */

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * Events landing strictly inside this window after their reference timestamp
 * are classified `'automated'`.
 *
 * Evidence: 1,133 of 1,218 recorded link clicks (93%) and 178 of 220 golf
 * demo-gate sessions fired in under two minutes from delivery/send. Two
 * minutes is not a human reading-and-deciding interval for a cold outreach
 * email; it is the round-trip of a scanner walking the links in a message it
 * just accepted.
 *
 * A boundary-exact latency (`=== PREFETCH_LATENCY_MS`) is *not* automated —
 * the rule is "sub-2-minute", so the comparison is strictly `<`.
 */
export const PREFETCH_LATENCY_MS = 2 * 60 * 1000;

/**
 * Above this gap we are confident the event is human. Between
 * {@link PREFETCH_LATENCY_MS} and this value sits the soft band: probably a
 * person, but a delayed/queued scanner run or a deferred mailbox scan can also
 * land there, so the verdict carries markedly lower confidence and callers
 * should not treat it as a hard buying signal on its own.
 */
export const CONFIDENT_HUMAN_LATENCY_MS = 30 * 60 * 1000;

/**
 * Window used by {@link detectUserAgentIpFanOut} when grouping events that
 * share a user-agent string. One hour comfortably contains a scanner sweep of
 * a single send batch without merging genuinely unrelated activity from the
 * same browser build days apart.
 */
export const FANOUT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Distinct-IP count (inclusive) at which a single user-agent string inside one
 * {@link FANOUT_WINDOW_MS} window is treated as machine fan-out.
 *
 * A real person generates engagement from a small handful of addresses — the
 * campus network, home, an LTE hop. Five or more distinct IPs presenting the
 * *byte-identical* UA string inside an hour is a distributed scanner fleet.
 * The measured case was far past this line: one UA, 49 IPs.
 */
export const FANOUT_MIN_DISTINCT_IPS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Anything a caller might plausibly hold for a timestamp. Numbers are epoch milliseconds. */
export type TimestampInput = Date | string | number | null | undefined;

/** Reason codes that accompany an `'automated'` verdict. */
export type AutomatedReason =
  /** Fired inside {@link PREFETCH_LATENCY_MS} of the reference timestamp. */
  | 'prefetch_latency'
  /** The user-agent self-identified as a non-browser client or a known scanner. */
  | 'automation_user_agent'
  /** Emitted by {@link flagAutomatedByIpFanOut}: one UA string, many distinct IPs. */
  | 'ip_fan_out';

/** Reason codes that accompany a `'likely_human'` verdict. */
export type LikelyHumanReason =
  /** In the soft 2–30 minute band. Probably a person; not certain. */
  | 'ambiguous_latency'
  /** Beyond {@link CONFIDENT_HUMAN_LATENCY_MS}. No scanner waits this long. */
  | 'human_latency';

/** Reason codes that accompany an `'unknown'` verdict. */
export type UnknownReason =
  /** `occurredAt` was absent or unparseable — there is nothing to reason about. */
  | 'invalid_timestamp'
  /** No delivery/send timestamp to measure against. The common, important case. */
  | 'missing_reference_timestamp'
  /** The event predates its own reference: mis-joined row or clock skew. */
  | 'event_precedes_reference';

export type EngagementReason = AutomatedReason | LikelyHumanReason | UnknownReason;

export type EngagementVerdict = EngagementClassification['verdict'];

/**
 * Discriminated on `verdict`. `confidence` is `0..1`. `latencyMs` is the
 * measured gap between the event and its reference, or `null` when it could
 * not be computed — note that the `'likely_human'` arm always has a number,
 * because you cannot reach that verdict without a measurable latency.
 */
export type EngagementClassification =
  | {
      readonly verdict: 'automated';
      readonly reason: AutomatedReason;
      readonly confidence: number;
      readonly latencyMs: number | null;
    }
  | {
      readonly verdict: 'likely_human';
      readonly reason: LikelyHumanReason;
      readonly confidence: number;
      readonly latencyMs: number;
    }
  | {
      readonly verdict: 'unknown';
      readonly reason: UnknownReason;
      readonly confidence: number;
      readonly latencyMs: number | null;
    };

/**
 * A single engagement to classify.
 *
 * `referenceAt` is the delivery/send timestamp the event is measured against —
 * `emails.delivered_at` (falling back to `sent_at`) for opens and clicks, the
 * coach's outreach send timestamp for demo-gate entries. Pass `null` when you
 * genuinely do not have one; do not substitute a convenient nearby timestamp,
 * because a wrong reference produces a confident wrong answer.
 *
 * `ip` is accepted for call-site symmetry with {@link FanOutEvent} and is
 * deliberately unused by the single-event path: one address in isolation
 * carries no signal. IP only becomes evidence in aggregate, via
 * {@link detectUserAgentIpFanOut}.
 */
export interface EngagementSignal {
  readonly occurredAt: TimestampInput;
  readonly referenceAt: TimestampInput;
  readonly userAgent?: string | null;
  readonly ip?: string | null;
}

/** One event in a fan-out batch. `id` is echoed back on any group that gets flagged. */
export interface FanOutEvent {
  readonly id: string;
  readonly occurredAt: TimestampInput;
  readonly userAgent?: string | null;
  readonly ip?: string | null;
}

export interface FanOutGroup {
  /** Normalized (trimmed, whitespace-collapsed, lowercased) user-agent string. */
  readonly userAgent: string;
  /** Epoch ms of the earliest event in the group. */
  readonly windowStart: number;
  /** Epoch ms of the latest event in the group. */
  readonly windowEnd: number;
  readonly distinctIpCount: number;
  /** Ids of every event in the group, in ascending time order. */
  readonly eventIds: readonly string[];
}

export interface FanOutOptions {
  /** Defaults to {@link FANOUT_WINDOW_MS}. */
  readonly windowMs?: number;
  /** Inclusive lower bound. Defaults to {@link FANOUT_MIN_DISTINCT_IPS}. */
  readonly minDistinctIps?: number;
}

// ---------------------------------------------------------------------------
// User-agent tokens (SECONDARY signal — read the module header before editing)
// ---------------------------------------------------------------------------

/**
 * Substrings that, when present in a lowercased user-agent, mean the client
 * announced itself as something other than a person's browser.
 *
 * Two halves: generic non-browser HTTP clients and headless automation, then
 * the security vendors whose link-rewriting proxies we actually see in the
 * wild. This list only ever catches the *honest* machines. The dishonest ones
 * — the ones that matter — copy a real Chrome UA verbatim, which is why this
 * check is an override on top of latency rather than the mechanism itself.
 *
 * Matching is plain substring containment, which is intentionally slightly
 * over-eager. A false positive costs one uncounted engagement; a false
 * negative costs a fabricated buying signal that a human then acts on. We bias
 * toward the cheaper error.
 */
export const AUTOMATION_USER_AGENT_TOKENS: readonly string[] = [
  // Non-browser HTTP clients.
  'curl/',
  'wget',
  'python-requests',
  'python-urllib',
  'go-http-client',
  'java/',
  'okhttp',
  'libwww-perl',
  'axios/',
  'node-fetch',
  'httpclient',
  'apache-httpclient',
  'ruby',
  'powershell',
  // Headless / automation runtimes.
  'headlesschrome',
  'phantomjs',
  'puppeteer',
  'playwright',
  'selenium',
  'electron/',
  // Self-declaring crawlers.
  'bot',
  'crawler',
  'spider',
  'slurp',
  'preview',
  'fetcher',
  'monitoring',
  // Email-security link scanners and rewriting proxies.
  'proofpoint',
  'mimecast',
  'barracuda',
  'symantec',
  'forcepoint',
  'safelinks',
  'urldefense',
  'messagelabs',
  'ironport',
  'netskope',
  'zscaler',
  'trendmicro',
  'bitdefender',
  'sophos',
  'fireeye',
  'gmailimageproxy',
];

/**
 * True when the user-agent openly identifies as a non-browser client or a
 * known scanner. An empty/missing UA is *not* a hit — plenty of legitimate
 * clients omit it, and we have latency for the real work.
 */
export function isKnownAutomationUserAgent(userAgent: string | null | undefined): boolean {
  if (typeof userAgent !== 'string') return false;
  const normalized = userAgent.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return AUTOMATION_USER_AGENT_TOKENS.some((token) => normalized.includes(token));
}

// ---------------------------------------------------------------------------
// Confidence levels
// ---------------------------------------------------------------------------

/**
 * Confidence is a reporting aid, not a second threshold — callers should
 * branch on `verdict` and use `confidence` for ranking or for surfacing "we
 * think, but we are not sure" in admin UI.
 */
const CONFIDENCE = {
  /** Self-declared scanner AND sub-threshold latency: both signals agree. */
  automationUserAgentCorroborated: 0.99,
  /** Self-declared scanner, latency neutral or unavailable. */
  automationUserAgent: 0.95,
  /** Sub-2-minute. 93% of measured clicks landed here. */
  prefetchLatency: 0.9,
  /** One UA string across many distinct IPs inside one window. */
  ipFanOut: 0.9,
  /** > 30 minutes. No scanner in the measured set waited this long. */
  humanLatency: 0.85,
  /** The 2–30 minute soft band. Deliberately weak. */
  ambiguousLatency: 0.45,
  /** We do not know, and we are not going to pretend otherwise. */
  unknown: 0,
} as const;

// ---------------------------------------------------------------------------
// Core classifier
// ---------------------------------------------------------------------------

/**
 * Classify one engagement event.
 *
 * Evaluation order, and why:
 *
 *   1. Parse timestamps and compute latency. Latency is the primary signal, so
 *      it is what the function is built around.
 *   2. Apply the user-agent override. It can only ever *downgrade* a result to
 *      `'automated'` — it can never produce `'likely_human'`. That asymmetry is
 *      what makes it safe to consult a signal we know to be unreliable.
 *   3. Fall through to the latency bands.
 *
 * A missing `referenceAt` yields `'unknown'`, never `'likely_human'`. The one
 * exception is step 2: a client that literally announces itself as `curl` is
 * automated whether or not we have a reference to measure against. That still
 * honours the invariant that a missing reference can never manufacture a human.
 */
export function classifyEngagement(signal: EngagementSignal): EngagementClassification {
  const occurredAtMs = toEpochMs(signal.occurredAt);
  const referenceAtMs = toEpochMs(signal.referenceAt);

  const latencyMs =
    occurredAtMs !== null && referenceAtMs !== null ? occurredAtMs - referenceAtMs : null;

  // Step 2 — the secondary override. See the module header: this catches only
  // the machines that do not bother to lie about who they are.
  if (isKnownAutomationUserAgent(signal.userAgent)) {
    const corroborated = latencyMs !== null && latencyMs >= 0 && latencyMs < PREFETCH_LATENCY_MS;
    return {
      verdict: 'automated',
      reason: 'automation_user_agent',
      confidence: corroborated
        ? CONFIDENCE.automationUserAgentCorroborated
        : CONFIDENCE.automationUserAgent,
      latencyMs,
    };
  }

  if (occurredAtMs === null) {
    return {
      verdict: 'unknown',
      reason: 'invalid_timestamp',
      confidence: CONFIDENCE.unknown,
      latencyMs: null,
    };
  }

  if (referenceAtMs === null) {
    return {
      verdict: 'unknown',
      reason: 'missing_reference_timestamp',
      confidence: CONFIDENCE.unknown,
      latencyMs: null,
    };
  }

  // `latencyMs` is non-null here; the narrowing above guarantees both operands.
  const latency = occurredAtMs - referenceAtMs;

  if (latency < 0) {
    // The event predates the send it is supposedly a response to. Either the
    // reference row is mis-joined or two clocks disagree. Both mean our
    // measurement is meaningless — and a meaningless measurement must not be
    // laundered into "human".
    return {
      verdict: 'unknown',
      reason: 'event_precedes_reference',
      confidence: CONFIDENCE.unknown,
      latencyMs: latency,
    };
  }

  if (latency < PREFETCH_LATENCY_MS) {
    return {
      verdict: 'automated',
      reason: 'prefetch_latency',
      confidence: CONFIDENCE.prefetchLatency,
      latencyMs: latency,
    };
  }

  if (latency <= CONFIDENT_HUMAN_LATENCY_MS) {
    return {
      verdict: 'likely_human',
      reason: 'ambiguous_latency',
      confidence: CONFIDENCE.ambiguousLatency,
      latencyMs: latency,
    };
  }

  return {
    verdict: 'likely_human',
    reason: 'human_latency',
    confidence: CONFIDENCE.humanLatency,
    latencyMs: latency,
  };
}

/**
 * The only predicate that should gate a CRM side effect (status promotion,
 * follow-up task, sequence enrolment). `'unknown'` deliberately returns
 * `false`: an unmeasurable event is not evidence of a buyer.
 */
export function countsAsHumanEngagement(classification: EngagementClassification): boolean {
  return classification.verdict === 'likely_human';
}

// ---------------------------------------------------------------------------
// Batch: IP fan-out for a shared user-agent
// ---------------------------------------------------------------------------

/**
 * Group events by normalized user-agent, then into windows of at most
 * `windowMs` measured from each group's first event, and return the groups
 * whose distinct-IP count reaches `minDistinctIps`.
 *
 * This is the counterpart to latency, and it exists for the case latency
 * cannot cover: a scanner fleet that spoofs a real Chrome UA *and* arrives
 * without a usable reference timestamp. One person does not browse from five
 * addresses in an hour with a byte-identical UA string; a distributed
 * link-scanning service does. The measured instance was one UA across 49 IPs.
 *
 * Windowing is greedy from each group's first event rather than aligned to
 * fixed epoch buckets, so a burst is never split in half by an arbitrary clock
 * boundary. Results are deterministic for a given input set.
 *
 * Events without a parseable timestamp, without a user-agent, or without an IP
 * are skipped — every one of the three is required to form the signal.
 */
export function detectUserAgentIpFanOut(
  events: readonly FanOutEvent[],
  options: FanOutOptions = {},
): FanOutGroup[] {
  const windowMs = options.windowMs ?? FANOUT_WINDOW_MS;
  const minDistinctIps = options.minDistinctIps ?? FANOUT_MIN_DISTINCT_IPS;

  // The UA itself lives on the map key, so it is not repeated per event.
  type PreparedEvent = { id: string; at: number; ip: string };

  const byUserAgent = new Map<string, PreparedEvent[]>();

  for (const event of events) {
    const at = toEpochMs(event.occurredAt);
    if (at === null) continue;

    const userAgent = normalizeUserAgent(event.userAgent);
    if (userAgent === null) continue;

    const ip = normalizeIp(event.ip);
    if (ip === null) continue;

    const bucket = byUserAgent.get(userAgent);
    if (bucket) {
      bucket.push({ id: event.id, at, ip });
    } else {
      byUserAgent.set(userAgent, [{ id: event.id, at, ip }]);
    }
  }

  const flagged: FanOutGroup[] = [];

  for (const [userAgent, bucket] of byUserAgent) {
    // Stable ordering: time first, then id, so equal timestamps never make the
    // grouping depend on input order.
    const ordered = [...bucket].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

    let current: PreparedEvent[] = [];

    const flush = (): void => {
      const first = current[0];
      const last = current[current.length - 1];
      if (first === undefined || last === undefined) return;

      const distinctIps = new Set(current.map((event) => event.ip));
      if (distinctIps.size >= minDistinctIps) {
        flagged.push({
          userAgent,
          windowStart: first.at,
          windowEnd: last.at,
          distinctIpCount: distinctIps.size,
          eventIds: current.map((event) => event.id),
        });
      }
      current = [];
    };

    for (const event of ordered) {
      const groupStart = current[0];
      // Inclusive upper bound: an event exactly `windowMs` after the group's
      // first event still belongs to that window.
      if (groupStart !== undefined && event.at - groupStart.at > windowMs) {
        flush();
      }
      current.push(event);
    }
    flush();
  }

  // Deterministic output ordering for callers that log or snapshot this.
  return flagged.sort((a, b) => a.windowStart - b.windowStart || a.userAgent.localeCompare(b.userAgent));
}

/**
 * Convenience wrapper over {@link detectUserAgentIpFanOut}: returns a map from
 * event id to an `'automated'` classification, ready to merge over whatever
 * {@link classifyEngagement} produced per event.
 *
 * `latencyMs` is `null` on these results by construction — fan-out is an
 * aggregate signal and says nothing about any individual event's timing.
 */
export function flagAutomatedByIpFanOut(
  events: readonly FanOutEvent[],
  options: FanOutOptions = {},
): Map<string, EngagementClassification> {
  const flagged = new Map<string, EngagementClassification>();

  for (const group of detectUserAgentIpFanOut(events, options)) {
    for (const eventId of group.eventIds) {
      flagged.set(eventId, {
        verdict: 'automated',
        reason: 'ip_fan_out',
        confidence: CONFIDENCE.ipFanOut,
        latencyMs: null,
      });
    }
  }

  return flagged;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Normalize a timestamp to epoch milliseconds, or `null` when it is absent or
 * unparseable. Numeric input is treated as epoch **milliseconds** — we never
 * guess at seconds-vs-millis, because guessing wrong shifts latency by three
 * orders of magnitude and silently flips every verdict.
 */
function toEpochMs(value: TimestampInput): number | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Trim, collapse internal whitespace, lowercase. `null` when there is nothing to group on. */
function normalizeUserAgent(userAgent: string | null | undefined): string | null {
  if (typeof userAgent !== 'string') return null;
  const normalized = userAgent.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/** Trim and lowercase (IPv6 is hex-cased inconsistently). `null` when absent. */
function normalizeIp(ip: string | null | undefined): string | null {
  if (typeof ip !== 'string') return null;
  const normalized = ip.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}
