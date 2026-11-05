/**
 * ============================================================================
 * CoachHelm chat — the typed claim gate's opt-in packet (addendum A7 slice 1,
 * repair plan 14.10)
 * ----------------------------------------------------------------------------
 * `claim-validator.ts`'s `EvidencePacket` is scoped to exactly ONE player and
 * ONE window — that is how compose()'s existing callers (round_review) always
 * shape their evidence. A coach chat turn is not always that shape: "how did
 * Alice do this month" is, but "who's struggling on the greens" or "compare
 * Alice and Bob" is a team- or multi-player question with no single (player,
 * window) pair to validate typed claims against.
 *
 * `buildSinglePlayerPacket` returns a packet only when THIS turn's fresh,
 * player-scoped measurements resolve to exactly one player and one shared
 * window — mirroring compose()'s own opt-in contract (`req.evidence_packet`
 * is optional; the typed gate simply does not run when a caller has nothing
 * to build one from). Returning `null` here means `computeTurnVerdict`'s
 * claim-validation check does not engage for this turn, and the turn is
 * still covered by the legacy numeric audit (`auditNumericClaims`) exactly as
 * before — failing the typed check CLOSED on an ambiguous turn would reject
 * most of chat, which is the opposite of what a "slice 1" opt-in gate is for.
 * ========================================================================== */

import type { Measurement } from './provenance';
import {
  CAUSAL_LANGUAGE_RE,
  validateClaims,
  type ClaimReference,
  type EvidencePacket,
  type EvidencePacketEntry,
  type RejectedClaim,
} from '../llm/claim-validator';
import {
  CLAIMS_BLOCK_RE,
  CLAIMS_CLOSE,
  CLAIMS_OPEN,
  ClaimsBlockSchema,
  countOccurrences,
  stripAllClaimsDelimiters,
  type TypedClaimAttempt,
} from '../llm/claims-block';

/**
 * A measurement's own `sample_size` describes how many observations produced
 * its value. A `sample_size` of 0 or 1 has no "n" to sample — a single
 * round's own score or putt count IS the fact, not an aggregate — so it maps
 * to `kind: 'measurement'` (exempt from `claim-validator.ts`'s MIN_SAMPLE_N
 * floor). Anything aggregated over 2+ observations maps to `'aggregate'`
 * (floored), matching the floor's own reasoning in `checkClaim`.
 */
function entryKind(m: Measurement): EvidencePacketEntry['kind'] {
  return m.sample_size <= 1 ? 'measurement' : 'aggregate';
}

/**
 * Build a single-player, single-window `EvidencePacket` from this turn's
 * fresh measurements, or `null` when the turn is not that shape.
 *
 * Only `entity.kind === 'player'` measurements are considered — a team or
 * round measurement carries no player id to scope a packet by. Chat
 * measurements never carry `causal_support` (no chat tool computes one
 * today), so any causal claim the model tags against them is rejected by
 * `checkClaim`'s existing `unsupported_cause` check, same as a claim with no
 * backing at all.
 */
export function buildSinglePlayerPacket(
  measurements: readonly Measurement[],
): EvidencePacket | null {
  const playerMeasurements = measurements.filter(
    (m): m is Measurement & { window_start: string; window_end: string } =>
      m.entity.kind === 'player' && m.window_start !== null && m.window_end !== null,
  );
  if (playerMeasurements.length === 0) return null;

  const playerIds = new Set(playerMeasurements.map((m) => m.entity.id));
  if (playerIds.size !== 1) return null;

  const windows = new Set(playerMeasurements.map((m) => `${m.window_start}\u0000${m.window_end}`));
  if (windows.size !== 1) return null;

  const playerId = [...playerIds][0] as string;
  const windowKey = [...windows][0] as string;
  const sepIdx = windowKey.indexOf('\u0000');
  const windowStart = windowKey.slice(0, sepIdx);
  const windowEnd = windowKey.slice(sepIdx + 1);

  const withValue = playerMeasurements.filter((m): m is typeof m & { value: number } => m.value !== null);
  if (withValue.length === 0) return null;

  const entries: EvidencePacketEntry[] = withValue.map((m) => ({
    metric_id: m.metric_id,
    value: m.value,
    sample_n: m.sample_size,
    kind: entryKind(m),
    unit: m.unit,
    denominator: m.denominator,
  }));

  return { player_id: playerId, window_start: windowStart, window_end: windowEnd, entries };
}

// ---------------------------------------------------------------------------
// Audit row 47(a) — every claim checked, whatever the turn's shape
// ---------------------------------------------------------------------------

type WindowedMeasurement = Measurement & { window_start: string; window_end: string; value: number };

/**
 * One packet per (player, window) the turn's measurements cover — the
 * multi-player / multi-window generalisation of {@link buildSinglePlayerPacket}.
 * A team or round measurement carries no player to scope by and builds none.
 */
export function buildPlayerPackets(measurements: readonly Measurement[]): EvidencePacket[] {
  return packetsFor(measurements, 'player');
}

function packetsFor(measurements: readonly Measurement[], kind: Measurement['entity']['kind']): EvidencePacket[] {
  const groups = new Map<string, WindowedMeasurement[]>();
  for (const m of measurements) {
    if (m.entity?.kind !== kind || m.window_start === null || m.window_end === null || m.value === null) continue;
    const key = `${m.entity.id}\u0000${m.window_start}\u0000${m.window_end}`;
    const list = groups.get(key) ?? [];
    list.push(m as WindowedMeasurement);
    groups.set(key, list);
  }
  return [...groups.values()].map((list) => {
    const first = list[0] as WindowedMeasurement;
    return {
      player_id: first.entity.id,
      window_start: first.window_start,
      window_end: first.window_end,
      entries: list.map((m) => ({
        metric_id: m.metric_id,
        value: m.value,
        sample_n: m.sample_size,
        kind: entryKind(m),
        unit: m.unit,
        denominator: m.denominator,
      })),
    };
  });
}

function decimalsOf(n: number): number {
  const s = String(n);
  if (/e/i.test(s)) return 20;
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/**
 * Coach-facing prose rounds ("58.3%" for a stored 58.333), and the model is
 * told to copy the value it wrote. `claim-validator.ts` compares at a fixed
 * 0.005 tolerance, so an honest rounding would read as `value_mismatch`.
 * A claim is snapped to its entry's exact value only when the entry, rounded
 * to the claim's OWN precision, equals the claim — so 58.3 and 58 both bind to
 * 58.333, while 58.4 (wrong at its own precision) still fails.
 */
function snapToEntry(claim: ClaimReference, packet: EvidencePacket): ClaimReference {
  const entry = packet.entries.find((e) => e.metric_id === claim.metric_id);
  if (!entry) return claim;
  const d = decimalsOf(claim.value);
  if (d >= decimalsOf(entry.value)) return claim;
  const factor = 10 ** d;
  const rounded = Math.round(entry.value * factor) / factor;
  return Math.abs(rounded - claim.value) < 1e-9 ? { ...claim, value: entry.value } : claim;
}

const SENTENCE_BREAK = /[.!?](?=\s|$)|\n/;

const COUNT_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const SAMPLE_NOUNS: Record<Measurement['sample_unit'], string> = {
  rounds: 'rounds?',
  shots: 'shots?|approach(?:es)?|putts?',
  attempts: 'attempts?|tries|try|putts?|chances?|looks?',
  holes: 'holes?',
  events: 'events?|tournaments?',
  players: 'players?',
};

/** Every "2 rounds" / "those two recorded rounds" in a sentence: the count and where it sits. Letters only between them, so "18 holes across 12 rounds" reads 12. */
function samplesStated(sentence: string, unit: Measurement['sample_unit']): Array<{ n: number; at: number }> {
  const re = new RegExp(`(^|[^\\d.])(\\d+|${COUNT_WORDS.join('|')})\\b(?:\\s+[a-z'’-]+){0,3}?\\s+(?:${SAMPLE_NOUNS[unit]})\\b`, 'gi');
  return [...sentence.matchAll(re)].map((m) => {
    const word = (m[2] ?? '').toLowerCase();
    return { n: /^\d/.test(word) ? Number(word) : COUNT_WORDS.indexOf(word) + 1, at: (m.index ?? 0) + (m[1]?.length ?? 0) };
  });
}

/** Where a claim's value is written in a sentence, sign aside ("-2" reads "2 under par"), at any trailing zeros. */
function valueAt(sentence: string, value: number): number[] {
  const abs = String(Math.abs(value)).replace('.', '\\.');
  const tail = abs.includes('.') ? '0*' : '(?:\\.0+)?';
  return [...sentence.matchAll(new RegExp(`(^|[^\\d.])${abs}${tail}(?!\\d|\\.\\d)`, 'g'))].map((m) => (m.index ?? 0) + (m[1]?.length ?? 0));
}

/**
 * Owner, 2026-11-05: a figure under the floor is allowed when it says what it rests on. The value has already matched by the time
 * the floor fires (checkClaim's order), so all that is left is the honesty the floor is for: the sentence holding the figure states
 * the sample, nearest to the figure if it states more than one, and that sample is the measurement's own. A count that is someone
 * else's ("72.5 over his 9 rounds" for a 2-round figure) fails, as does a figure written with no sample at all.
 */
export function thinSampleStated(prose: string, value: number, sampleSize: number, unit: Measurement['sample_unit']): boolean {
  let stated = false;
  for (const sentence of prose.split(SENTENCE_BREAK)) {
    const samples = samplesStated(sentence, unit);
    for (const at of valueAt(sentence, value)) {
      // The "2" of "2 rounds" is a count, not this figure.
      if (samples.some((s) => s.at === at)) continue;
      const nearest = [...samples].sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];
      if (!nearest) continue;
      if (nearest.n !== sampleSize) return false;
      stated = true;
    }
  }
  return stated;
}

/** The cause side of a causal sentence: after "because", "due to", "caused by"; before "led to", "which is why", "results in". */
function causeSide(sentence: string): string {
  const after = /\b(?:because|due to|caused? by|as a result of|the reason (?:is|for|was))\b/i.exec(sentence);
  if (after) return sentence.slice(after.index + after[0].length);
  const before = CAUSAL_LANGUAGE_RE.exec(sentence);
  return before ? sentence.slice(0, before.index) : sentence;
}

/** What a read can say about itself or a calendar: why a figure is missing or thin, or why a day doesn't work. Not a claim about anyone's play. */
const DATA_CAUSE =
  /\b(?:flag(?:s|ged)?|incomplete|excluded|left out|leaves? out|not counted|(?:doesn|don)['’]?t count|no data|no recorded|no rounds|not recorded|not logged|(?:hasn|haven)['’]?t logged|(?:isn|aren)['’]?t available|not available|unavailable|too few|sample size|the (?:tool|read|window|sample|cache)|9-hole|nine-hole|total only|class|exams?|schedule|calendar|conflict|rsvps?|weather|rain)\b/i;
/** A sentence about this answer's limits ("I can't give you that because..."). "I think..." is not one. */
const ANSWER_LIMIT = /^\s*(?:i|we)\s+(?:can['’]?t|cannot|couldn['’]?t|don['’]?t have|didn['’]?t|left|used|won['’]?t|am not)\b|^\s*i['’]m not\b/i;
/** A measured part of the game: a cause that names one with its figure is arithmetic on the evidence, and the audit checks the figure. */
const MEASURED_CUE =
  /\b(?:strokes? gained|sg|strokes?|putt\w*|approach|off the tee|tee shots?|around the greens?|short game|gir|greens?|fairways?|scrambl\w*|up[- ]and[- ]downs?|sand saves?|bunkers?|penalt\w*|driving|scor\w*|shot|to par|over par|under par|birdies?|bogeys?|doubles?)\b/i;
/** A sentence about someone's play, so an unmeasured cause in it is a claim nothing here can back. */
const PLAY_WORD =
  /\b(?:he|she|his|her|him|score\w*|scoring|averag\w*|strokes?|rounds?|putt\w*|approach|tee|greens?|fairways?|chip\w*|bunkers?|swing|tempo|confidence|pressure|form|game|struggl\w*|improv\w*|slump\w*|fell|falling|drop\w*|rose|rising|declin\w*|slipp\w*|losing|gaining|lost|gained)\b/i;

/**
 * The causal sentences no evidence stands behind. Chat figures never carry `causal_support`, so the whole-prose check refused every
 * "because": a correct answer saying the tool "left 12 out because it flags them as incomplete" was withheld. A cause is now a claim
 * only when it is about play and names nothing measured: "because his tempo gets quicker under pressure" stays refused, whereas
 * "because he lost 2.4 strokes on approach" passes on its figure, which the numeric audit has already checked. A causal claim the
 * model TAGS `causal` still needs backing (`checkClaim`), and recap's compose() gate is untouched.
 */
export function unbackedCausalSentences(prose: string, measurements: readonly Measurement[]): string[] {
  const names = new Set(measurements.filter((m) => m.entity?.kind === 'player').flatMap((m) => m.entity.label.split(/\s+/)).filter((n) => n.length > 1));
  const namesPlayer = (s: string) => [...names].some((n) => new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(s));
  return prose.split(SENTENCE_BREAK).filter((sentence) => {
    if (!CAUSAL_LANGUAGE_RE.test(sentence)) return false;
    const cause = causeSide(sentence);
    if (ANSWER_LIMIT.test(sentence) || DATA_CAUSE.test(cause)) return false;
    // A bare count ("over the last 3 rounds") is the window, not a measured cause.
    const figures = cause.replace(/\b\d+\s+(?:[a-z'’-]+\s+){0,2}rounds?\b/gi, ' ');
    if (/\d/.test(figures) && MEASURED_CUE.test(cause)) return false;
    return PLAY_WORD.test(sentence) || namesPlayer(sentence);
  });
}

const MALFORMED: TypedClaimAttempt = { accepted: [], rejected: [], malformed: true };

function stripOnly(rawText: string): string {
  const hasMarker = rawText.includes(CLAIMS_OPEN) || rawText.includes(CLAIMS_CLOSE);
  return hasMarker ? stripAllClaimsDelimiters(rawText) : rawText;
}

/**
 * The chat claim gate (flag `coachhelm_chat_claim_gate`), audit row 47(a).
 *
 * Strips the claims block and validates EVERY claim in it against the packet
 * for the claim's own (player, window):
 *   - no packet for that player this turn → `wrong_player`;
 *   - the player is in the turn, but not over that window → `wrong_window`;
 *   - otherwise `claim-validator.ts`'s own per-claim checks (metric, value,
 *     unit, denominator, sample floor, causal backing).
 *
 * Returns `claims: null` (the gate does not engage) only when the turn has no
 * player-scoped measurement at all — a team turn has nothing to bind a player
 * claim to, and is judged by the numeric audit alone, as before. With player
 * evidence present, a missing or broken block is `malformed` (rejected).
 *
 * `uncited_number` is deliberately NOT applied here. It compares prose tokens
 * against raw packet VALUES as strings — "58" never equals "58.333", and a
 * round score or an insight's own figure from a tool's `detail` is never a
 * packet entry — so it rejected most honest answers. Every prose number is
 * already checked, before this gate runs, by `auditNumericClaims`, which since
 * row 47(b) binds each number to the player and metric the text names.
 *
 * Causal PROSE is checked sentence by sentence ({@link unbackedCausalSentences}):
 * only a cause about play that names nothing measured is refused.
 *
 * A figure under the sample floor passes when its sentence states the
 * measurement's own sample ({@link thinSampleStated}); owner, 2026-11-05.
 *
 * A claim may also name a team measurement, which never engages the gate on its
 * own but is checked like any other once it does.
 *
 * Never throws: any internal error fails closed as `malformed`.
 */
export function extractAndValidateChatClaims(
  rawText: string,
  measurements: readonly Measurement[],
): { strippedText: string; claims: TypedClaimAttempt | null } {
  let packets: EvidencePacket[];
  try {
    packets = buildPlayerPackets(measurements);
  } catch {
    return { strippedText: stripOnly(rawText), claims: MALFORMED };
  }
  if (packets.length === 0) return { strippedText: stripOnly(rawText), claims: null };
  // Lookups only: a team figure beside a player's is real, and "no packet" would call it the wrong player.
  const claimable = [...packets, ...packetsFor(measurements, 'team')];

  const strippedText = stripAllClaimsDelimiters(rawText);
  try {
    if (countOccurrences(rawText, CLAIMS_OPEN) !== 1 || countOccurrences(rawText, CLAIMS_CLOSE) !== 1) {
      return { strippedText, claims: MALFORMED };
    }
    const match = rawText.match(CLAIMS_BLOCK_RE);
    if (!match) return { strippedText, claims: MALFORMED };
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? '');
    } catch {
      return { strippedText, claims: MALFORMED };
    }
    const result = ClaimsBlockSchema.safeParse(parsed);
    if (!result.success) return { strippedText, claims: MALFORMED };

    const accepted: ClaimReference[] = [];
    const rejected: RejectedClaim[] = [];
    for (const raw of result.data) {
      const forPlayer = claimable.filter((p) => p.player_id === raw.player_id);
      if (forPlayer.length === 0) {
        rejected.push({ claim: raw, reason: 'wrong_player' });
        continue;
      }
      const packet = forPlayer.find((p) => p.window_start === raw.window_start && p.window_end === raw.window_end);
      if (!packet) {
        rejected.push({ claim: raw, reason: 'wrong_window' });
        continue;
      }
      // Empty prose: this call judges the CLAIM only (see the doc comment for
      // why prose-level `uncited_number` is not applied).
      const verdict = validateClaims([snapToEntry(raw, packet)], packet, '');
      accepted.push(...verdict.accepted);
      for (const r of verdict.rejected) {
        const sampleSize = packet.entries.find((e) => e.metric_id === raw.metric_id)?.sample_n ?? 0;
        const unit = measurements.find((m) => m.entity?.id === raw.player_id && m.metric_id === raw.metric_id && m.window_start === raw.window_start && m.window_end === raw.window_end)?.sample_unit;
        if (r.reason === 'unsupported_small_number' && raw.claim_type !== 'causal' && sampleSize > 0 && unit && thinSampleStated(strippedText, raw.value, sampleSize, unit)) accepted.push(r.claim);
        else rejected.push(r);
      }
    }

    // Prose-level causal check, once for the turn (see doc comment).
    const causallyBacked = accepted.some((c) => c.claim_type === 'causal');
    const alreadyFlagged = rejected.some((r) => r.reason === 'unsupported_cause');
    if (!causallyBacked && !alreadyFlagged) {
      const prose = validateClaims([], packets[0] as EvidencePacket, unbackedCausalSentences(strippedText, measurements).join('. '));
      rejected.push(...prose.rejected.filter((r) => r.reason === 'unsupported_cause'));
    }

    return { strippedText, claims: { accepted, rejected, malformed: false } };
  } catch {
    return { strippedText, claims: MALFORMED };
  }
}
