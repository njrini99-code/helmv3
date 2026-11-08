import { describe, expect, it } from 'vitest';
import { collectDates, collectEnvelopeNumbers } from '../provenance';
import type { ToolEnvelope } from '../provenance';
import { computeTurnVerdict } from '../verdict';

// Staging, 2026-11-07 (coach Nick Rini, Demo University Golf): "Where is the team losing the most strokes this season?"
// was stored `failed` with unmatched_tokens ["13", "17"], both misattributed. The prose was right: Cole Bennett has 37
// recorded rounds and the other six players with rounds have 13 to 17 each. The audit bound "13 to 17" to Cole Bennett,
// the nearest name earlier in the sentence, so it rejected two real figures as another player's.

const NOW = '2026-11-08T02:11:05.771Z';
const roster = [
  ['49ffe06d', 'Cole Bennett', 37],
  ['8091da4b', 'Owen Carter', 14],
  ['8e382583', 'Ethan Park', 15],
  ['9458ca63', 'Mason Rivers', 14],
  ['b40a650a', 'Jackson Hale', 17],
  ['b6b87c4d', 'Audit Testplayer', 0],
  ['ed1ff03e', 'Dylan Brooks', 14],
  ['faced578', 'Tyler Hayes', 13],
] as const;

const overview: ToolEnvelope = {
  summary: 'Demo University Golf has 8 active players.',
  measurements: [
    {
      metric_id: 'active_roster_count',
      metric_label: 'Active roster',
      unit: 'count',
      value: 8,
      entity: { kind: 'team', id: 'team-1', label: 'Demo University Golf' },
      window_start: null,
      window_end: null,
      sample_size: 8,
      sample_unit: 'players',
      as_of: NOW,
      coverage: 'complete',
      coverage_note: null,
      source: 'roster',
      method: 'count_active_team_members',
      denominator: null,
      benchmark: null,
      direction: null,
    },
  ],
  series: [],
  detail: {
    players: roster.map(([id, name, rounds_recorded]) => ({ name, player_id: id, rounds_recorded, last_round_date: rounds_recorded ? '2026-09-26' : null })),
    timezone: 'America/New_York',
    team_name: 'Demo University Golf',
    latest_round_date: '2026-10-21',
    active_roster_count: 8,
    players_with_rounds: 7,
  },
  coverage: 'partial',
  coverage_note: '1 player has no recorded rounds (Audit Testplayer)',
  as_of: NOW,
};

const strokesGained: ToolEnvelope = {
  summary: 'Team strokes gained over 66 player rounds.',
  measurements: [],
  series: [],
  detail: { areas: { tee: 0.52, short: -0.26, putting: -3.01, approach: -3.37 }, sample_size: 66, window_start: '2026-06-17', window_end: '2026-10-21' },
  coverage: 'complete',
  coverage_note: null,
  as_of: NOW,
};

const STORED_ANSWER = `Approach play is where the team loses the most strokes, and putting is close behind. The team's strokes gained by area, over 66 player rounds from June 17 to October 21:

- **Approach:** -3.37
- **Putting:** -3.01
- **Short game:** -0.26
- **Off the tee:** +0.52

Approach and putting together account for nearly all of the loss. Short game is close to even. Off the tee is the only area that gains strokes.

Seven of your eight players have recorded rounds. Audit Testplayer has none, so the figures cover seven players. Cole Bennett has 37 rounds recorded, and the others have 13 to 17 each. His rounds probably make up a large share of the 66, so the team figures may lean toward his game. Say if you want approach and putting split out by player.`;

/** The audit exactly as the stream route calls it (`route.ts`, `computeTurnVerdict`). */
function verdictFor(text: string) {
  const envelopes = [strokesGained, overview];
  return computeTurnVerdict({
    streamComplete: true,
    text,
    measurements: envelopes.flatMap((e) => e.measurements),
    series: [],
    detailNumbers: envelopes.flatMap((e) => collectEnvelopeNumbers(e)),
    detailDates: envelopes.flatMap((e) => (e.detail === undefined ? [] : collectDates(e.detail, 'America/New_York'))),
    timezone: 'America/New_York',
    players: roster.map(([id, name]) => ({ id, name })),
  });
}

const flagged = (text: string) => {
  const v = verdictFor(text);
  return v.outcome === 'rejected' ? v.unsupported.map((c) => c.text) : [];
};

describe('a figure about "the others" is not bound to the player named just before it', () => {
  it('accepts the exact answer the staging turn was rejected for', () => {
    expect(verdictFor(STORED_ANSWER)).toEqual({ outcome: 'accepted' });
  });

  it('still binds a number to the named player when the clause names no group', () => {
    // 13 is Tyler Hayes's figure, not Cole Bennett's.
    expect(flagged('Cole Bennett has 13 rounds recorded.')).toEqual(['13']);
  });

  it('still rejects a figure that only the named player has, said of the others', () => {
    // 37 is Cole Bennett's alone; the others do not have it.
    expect(flagged('Cole Bennett has 37 rounds recorded, and the others have 37 each.')).toEqual(['37']);
  });

  it('still rejects an invented figure said of the others', () => {
    expect(flagged('Cole Bennett has 37 rounds recorded, and the others have 21 to 29 each.')).toEqual(['21', '29']);
  });

  it('reads "the rest" and a following sentence the same way', () => {
    expect(flagged('Cole Bennett has 37 rounds recorded. The rest have 13 to 17 each.')).toEqual([]);
    expect(flagged('Cole Bennett has 37 rounds recorded, while everyone else has 14 or 15.')).toEqual([]);
  });

  it('a name inside the clause still wins over the cue', () => {
    expect(flagged('Cole Bennett has 37 rounds recorded, and Tyler Hayes has 13.')).toEqual([]);
    expect(flagged('Cole Bennett has 37 rounds recorded, and Tyler Hayes has 37.')).toEqual(['37']);
  });
});
