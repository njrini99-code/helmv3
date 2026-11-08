/**
 * Offline replay of Ask's grounding audit over stored staging turns.
 *
 * `replayVerdict` rebuilds the audit's inputs the way `chat/stream/route.ts` does for a live turn (the
 * route's POST body: `collect`, `coachRequestDates`, `coachRequestedSpans`, the prior-evidence seeding and
 * `priorTurnEvidence`), then calls the real `computeTurnVerdict`. Nothing here talks to a model or a database.
 *
 * The route builds those inputs inline and does not export them, so this file mirrors them. If the route's
 * `computeTurnVerdict` call gains or loses an argument, `ask-replay.test.ts` fails on the drift check; if the
 * way the inputs are assembled changes, update `replayVerdict` to match.
 *
 * Not replayed: the typed claim gate (`coachhelm_chat_claim_gate`). It reads the raw `<<<CLAIMS>>>` block,
 * and the stored `content` has that block stripped, so the numeric audit is the only check a stored turn can be
 * put through. Turns that carry action proposals or receipts are not exported (their numbers reach the audit
 * through `collectActionNumbers`, which a stored `ui_parts` cannot reproduce).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  coachRequestDates,
  coachRequestedSpans,
  collectEnvelopeDates,
  collectEnvelopeNumbers,
  ToolEnvelope,
  type AuditPlayer,
  type Measurement,
  type MeasurementSeries,
  type ScopedNumber,
} from '../provenance';
import { computeTurnVerdict, type TurnVerdict } from '../verdict';
import { todayIsoInZone } from '@/lib/golf/timezone';

export const FIXTURE_DIR = join(__dirname, 'fixtures', 'ask-turns');
export const LABELS_PATH = join(__dirname, 'fixtures', 'ask-turn-labels.json');

export interface AskFixture {
  id: string;
  messageId: string;
  timezone: string;
  roster: Array<AuditPlayer & { id: string; name: string }>;
  userMessage: { content: string; createdAt: string };
  priorMessages: Array<{ role: string; createdAt: string; content: string; evidence: unknown[] }>;
  turn: {
    createdAt: string;
    status: 'complete' | 'failed';
    costUsd: number | null;
    content: string;
    tools: Array<{ name: string; input: unknown }>;
    evidence: Array<{ tool: string; ref: string | null; envelope: unknown }>;
    recorded: { outcome: 'accepted' | 'rejected'; reason?: string; unmatchedTokens?: string[]; misattributedTokens?: string[] };
  };
}

/**
 * A hand label for one stored turn. The audit rates use ONE rule: is every figure and date in the answer supported by
 * what THIS turn's reads returned? That is what the audit can know. Whether the answer is also true is recorded
 * separately (`answerWrong`), because a tool that returns a wrong figure makes a wrong answer the audit rightly accepts.
 */
export interface AskLabel {
  /**
   * `accepted`: every figure and date is supported by the turn's evidence. `rejected`: something is not (or contradicts it).
   * `incomplete`: the stored turn did not finish; it must be rejected as `stream_incomplete` and counts in no rate.
   */
  expect: 'accepted' | 'rejected' | 'incomplete';
  /** One line: why this label, naming the figure(s) checked. */
  why: string;
  /** Set on an `accepted` label the current audit rejects: a known wrong block. The suite reports it instead of failing, and says when it starts passing. */
  knownWrongBlock?: true;
  /** Set on a `rejected` label the current audit accepts: a known wrong accept. Reported the same way. */
  knownWrongAccept?: true;
  /** Set when the answer is supported by its reads but not true (a tool returned wrong data). Reported, never a failure of the audit. */
  answerWrong?: string;
}

export function loadFixtures(): AskFixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')) as AskFixture);
}

export function loadLabels(): Record<string, AskLabel> {
  return JSON.parse(readFileSync(LABELS_PATH, 'utf8')) as Record<string, AskLabel>;
}

interface Evidence {
  measurements: Measurement[];
  series: MeasurementSeries[];
  detailNumbers: ScopedNumber[];
  detailDates: string[];
}
const emptyEvidence = (): Evidence => ({ measurements: [], series: [], detailNumbers: [], detailDates: [] });

/** Route: `priorTurnEvidence`. Team and round evidence is safe for any claim; player-scoped (or scope-less) evidence is held back. */
function priorTurnEvidence(prior: AskFixture['priorMessages'], timezone: string) {
  const shared = emptyEvidence();
  const deferred = { ...emptyEvidence(), playerIds: new Set<string>() };
  const assistantTurns = prior.filter((m) => m.role === 'assistant').slice(-5);
  for (const message of assistantTurns) {
    for (const raw of message.evidence) {
      const parsed = ToolEnvelope.safeParse(raw);
      if (!parsed.success) continue;
      const envelope = parsed.data;
      const entities = [...envelope.measurements, ...envelope.series].map((m) => m.entity);
      const playerIdsHere = entities.filter((e) => e.kind === 'player').map((e) => e.id);
      const target = playerIdsHere.length > 0 || entities.length === 0 ? deferred : shared;
      target.measurements.push(...envelope.measurements);
      target.series.push(...envelope.series);
      target.detailNumbers.push(...collectEnvelopeNumbers(envelope));
      target.detailDates.push(...collectEnvelopeDates(envelope, timezone));
      for (const id of playerIdsHere) deferred.playerIds.add(id);
    }
  }
  return { shared, deferred };
}

export interface ReplayOptions {
  /** Audit this text instead of the stored answer (a corrupted copy). */
  text?: string;
  /** Use these envelopes as the turn's own evidence instead of the stored ones. */
  evidence?: unknown[];
  /** Whether the stream finished. Defaults to what the stored turn recorded: false only for a stored `stream_incomplete`. */
  streamComplete?: boolean;
}

/** The arguments the route passes to `computeTurnVerdict`, by name. The drift check in the test compares this list with the route. */
export const VERDICT_ARGS = ['streamComplete', 'text', 'measurements', 'series', 'detailNumbers', 'detailDates', 'timezone', 'players', 'requestedSpans', 'claims'] as const;

export function replayVerdict(fixture: AskFixture, options: ReplayOptions = {}): TurnVerdict {
  const tz = fixture.timezone;
  const userText = fixture.userMessage.content;
  const measurements: Measurement[] = [];
  const series: MeasurementSeries[] = [];
  const detailNumbers: ScopedNumber[] = [];
  const detailDates: string[] = [];

  // Route: `collect`, run for every read the turn made.
  for (const raw of options.evidence ?? fixture.turn.evidence.map((e) => e.envelope)) {
    const parsed = ToolEnvelope.safeParse(raw);
    if (!parsed.success) continue;
    measurements.push(...parsed.data.measurements);
    series.push(...parsed.data.series);
    detailNumbers.push(...collectEnvelopeNumbers(parsed.data));
    detailDates.push(...collectEnvelopeDates(parsed.data, tz));
  }

  // Route: the coach's own words name dates and spans they may have restated.
  const asked = new Date(fixture.userMessage.createdAt);
  detailDates.push(...coachRequestDates(userText, todayIsoInZone(tz, asked)));
  const requestedSpans = coachRequestedSpans(userText);

  // Route: earlier messages of the conversation (`listRecentMessages`, 40 rows) seed the audit.
  const prior = fixture.priorMessages.slice(-40);
  for (const m of prior) {
    if (m.role === 'user') {
      detailDates.push(...coachRequestDates(m.content, todayIsoInZone(tz, new Date(m.createdAt))));
      requestedSpans.push(...coachRequestedSpans(m.content));
    }
  }
  const seeded = priorTurnEvidence(prior, tz);
  measurements.push(...seeded.shared.measurements);
  series.push(...seeded.shared.series);
  detailNumbers.push(...seeded.shared.detailNumbers);
  detailDates.push(...seeded.shared.detailDates);

  // Route: player-scoped prior evidence joins only when this turn's own reads name a player and at most one player is in play.
  const currentTurnPlayerIds = new Set([...measurements, ...series].map((m) => m.entity).filter((e) => e.kind === 'player').map((e) => e.id));
  // The shared prior measurements were pushed above; the route computes this set from the same arrays at the same point, after the turn's reads and before the deferred fold-in, so shared player-free entities do not change it.
  const allPlayerIds = new Set([...currentTurnPlayerIds, ...seeded.deferred.playerIds]);
  if (currentTurnPlayerIds.size > 0 && allPlayerIds.size <= 1) {
    measurements.push(...seeded.deferred.measurements);
    series.push(...seeded.deferred.series);
    detailNumbers.push(...seeded.deferred.detailNumbers);
    detailDates.push(...seeded.deferred.detailDates);
  }

  return computeTurnVerdict({
    streamComplete: options.streamComplete ?? fixture.turn.recorded.reason !== 'stream_incomplete',
    text: options.text ?? fixture.turn.content,
    measurements,
    series,
    detailNumbers,
    detailDates,
    timezone: tz,
    players: fixture.roster,
    requestedSpans,
    claims: null,
  });
}
