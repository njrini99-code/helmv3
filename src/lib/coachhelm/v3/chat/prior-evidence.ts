import { collectEnvelopeDates, collectEnvelopeNumbers, type AuditPlayer, type Measurement, type MeasurementSeries, type ScopedNumber, type ToolEnvelope } from './provenance';
import { playersNamed } from './rank-claims';

/**
 * Evidence carried over from the conversation's earlier turns: where each earlier read goes, and which of the held-back part a turn that
 * read nothing fresh may use.
 *
 * `shared` is safe for any claim (team and round figures; the counts and windows a read's own summary states). `deferred` is player-scoped, or of
 * unknown scope, and is folded in only when this turn's own reads say which player is in play (the route's rule, unchanged). A turn that read
 * nothing fresh (a re-answer: "what should I work on this week?" asked twice) has no such reads, and used to get none of it, so the answer's
 * own figures, all from the earlier reads, were withheld. It now gets the deferred evidence of exactly the players the answer names: a number
 * about Alice still never supports an answer about Bob, because Bob is the player named and Alice is not.
 */
export interface PriorBucket {
  measurements: Measurement[];
  series: MeasurementSeries[];
  detailNumbers: ScopedNumber[];
  detailDates: string[];
}
export interface PriorDeferred extends PriorBucket {
  playerIds: Set<string>;
}
export const emptyBucket = (): PriorBucket => ({ measurements: [], series: [], detailNumbers: [], detailDates: [] });

/** Where one earlier read's evidence goes. An envelope with no entity at all has unknown scope: held back, except the counts its summary states ("the next 60 days"). */
export function placePriorEnvelope(envelope: ToolEnvelope, timezone: string): { shared: PriorBucket; deferred: PriorBucket; playerIds: string[] } {
  const shared = emptyBucket();
  const deferred = emptyBucket();
  const entities = [...envelope.measurements, ...envelope.series].map((m) => m.entity);
  const playerIds = entities.filter((e) => e.kind === 'player').map((e) => e.id);
  const unknownScope = playerIds.length === 0 && entities.length === 0;
  const target = playerIds.length > 0 || unknownScope ? deferred : shared;
  target.measurements.push(...envelope.measurements);
  target.series.push(...envelope.series);
  if (unknownScope) {
    shared.detailNumbers.push(...collectEnvelopeNumbers({ summary: envelope.summary, detail: undefined }));
    deferred.detailNumbers.push(...collectEnvelopeNumbers(envelope));
  } else {
    target.detailNumbers.push(...collectEnvelopeNumbers(envelope));
  }
  target.detailDates.push(...collectEnvelopeDates(envelope, timezone));
  return { shared, deferred, playerIds };
}

/** The ids of the roster players an answer names. */
export function namedPlayerIds(text: string, roster: readonly AuditPlayer[]): Set<string> {
  return playersNamed(text, roster);
}

/**
 * The part of the held-back evidence a turn with no fresh player read may use: the figures of the players the answer names (and the team and
 * round figures beside them), their unscoped numbers, and the dates when at least one named player is among those the earlier reads covered.
 */
export function deferredForNamedPlayers(deferred: PriorDeferred, named: ReadonlySet<string>): PriorBucket {
  const out = emptyBucket();
  const covered = [...named].filter((id) => deferred.playerIds.has(id));
  if (covered.length === 0) return out;
  const mine = (e: { kind: string; id: string }) => e.kind !== 'player' || named.has(e.id);
  out.measurements.push(...deferred.measurements.filter((m) => mine(m.entity)));
  out.series.push(...deferred.series.filter((s) => mine(s.entity)));
  out.detailNumbers.push(...deferred.detailNumbers.filter((n) => n.player_id === null || named.has(n.player_id)));
  out.detailDates.push(...deferred.detailDates);
  return out;
}
