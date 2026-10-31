'use client';

import * as React from 'react';
import type { UIMessage } from 'ai';
import type { ValidatedComposition } from '@/lib/coachhelm/v3/chat/visuals/composition';
import { fairwayScope } from '@/lib/redesign/flag';
import { ChatThread } from '@/components/golf/coachhelm/chat/ChatThread';
import type { Measurement, MeasurementSeries, ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';

// Two days ago, so the freshness copy reads like a real cached stat.
const AS_OF = new Date(Date.now() - 2 * 86_400_000).toISOString();
const WIN = { window_start: '2026-05-18', window_end: '2026-09-26' };
const MAYA = { kind: 'player' as const, id: 'p-maya', label: 'Maya Chen' };
const BASE = { coverage: 'complete' as const, coverage_note: null, source: 'rounds', method: 'fixture', as_of: AS_OF };

function m(over: Partial<Measurement> & Pick<Measurement, 'metric_id' | 'metric_label' | 'unit' | 'value'>): Measurement {
  return {
    entity: MAYA,
    ...WIN,
    sample_size: 15,
    sample_unit: 'rounds',
    denominator: null,
    benchmark: null,
    direction: null,
    ...BASE,
    ...over,
  };
}

function series(
  over: Partial<MeasurementSeries> & Pick<MeasurementSeries, 'metric_id' | 'metric_label' | 'unit' | 'points'>,
): MeasurementSeries {
  return { entity: MAYA, ...WIN, benchmark: null, direction: null, ...BASE, ...over };
}

const ROUND_DATES = [
  '2026-05-18', '2026-05-30', '2026-06-08', '2026-06-21', '2026-07-02', '2026-07-14',
  '2026-07-26', '2026-08-09', '2026-08-23', '2026-09-06', '2026-09-14', '2026-09-26',
];
const timePoints = (values: number[]) =>
  values.map((value, i) => ({ at: ROUND_DATES[i]!, value, bucket: null, sample_size: 1 }));

const envelope = (over: Partial<ToolEnvelope>): ToolEnvelope => ({
  summary: 'fixture',
  measurements: [],
  series: [],
  coverage: 'complete',
  coverage_note: null,
  as_of: AS_OF,
  ...over,
});

const PUTTING = envelope({
  measurements: [
    m({ metric_id: 'putts_per_round', metric_label: 'Putts per round', unit: 'score', value: 30.4, direction: 'lower_better' }),
    m({ metric_id: 'make_rate_inside_8ft', metric_label: 'Make rate inside 8 ft', unit: 'percent', value: 71, denominator: 112, sample_size: 112, sample_unit: 'attempts', direction: 'higher_better' }),
    m({ metric_id: 'three_putt_rate', metric_label: 'Three-putt rate', unit: 'percent', value: 6, denominator: 270, sample_size: 270, sample_unit: 'holes', direction: 'lower_better' }),
    m({ metric_id: 'sg_putting', metric_label: 'Strokes gained: putting', unit: 'strokes', value: -0.42, direction: 'higher_better' }),
  ],
});

const SCORING = envelope({
  // The shape `read-tools` returns for a trend: the series plus its mean.
  measurements: [
    m({ metric_id: 'scoring_average_mean', metric_label: 'Scoring average (average)', unit: 'score', value: 73.17, sample_size: 12, direction: 'lower_better' }),
  ],
  series: [
    series({
      metric_id: 'scoring_average',
      metric_label: 'Scoring average',
      unit: 'score',
      direction: 'lower_better',
      points: timePoints([76, 74, 75, 73, 77, 72, 73, 71, 74, 72, 70, 71]),
    }),
  ],
});

const MAKE_CURVE = envelope({
  series: [
    series({
      metric_id: 'make_rate_by_distance',
      metric_label: 'Make rate by distance',
      unit: 'percent',
      direction: 'higher_better',
      points: [
        { at: '2026-09-26', bucket: '0–3 ft', value: 97, sample_size: 270 },
        { at: '2026-09-26', bucket: '3–8 ft', value: 64, sample_size: 88 },
        { at: '2026-09-26', bucket: '8–15 ft', value: 31, sample_size: 52 },
        { at: '2026-09-26', bucket: '15–25 ft', value: 14, sample_size: 29 },
        { at: '2026-09-26', bucket: '25 ft+', value: 5, sample_size: 11 },
      ],
    }),
  ],
});

const PROXIMITY = envelope({
  series: [
    series({
      metric_id: 'proximity_by_club',
      metric_label: 'Proximity to hole by approach distance',
      unit: 'feet',
      direction: 'lower_better',
      points: [
        { at: '2026-09-26', bucket: '50–100 yds', value: 18, sample_size: 41 },
        { at: '2026-09-26', bucket: '100–150 yds', value: 27, sample_size: 63 },
        { at: '2026-09-26', bucket: '150–200 yds', value: 39, sample_size: 48 },
        { at: '2026-09-26', bucket: '200+ yds', value: 58, sample_size: 17 },
      ],
    }),
  ],
});

const SG = envelope({
  measurements: [
    m({ metric_id: 'sg_off_tee', metric_label: 'Strokes gained: off the tee', unit: 'strokes', value: 0.61, direction: 'higher_better' }),
    m({ metric_id: 'sg_approach', metric_label: 'Strokes gained: approach', unit: 'strokes', value: -1.18, direction: 'higher_better' }),
    m({ metric_id: 'sg_around_green', metric_label: 'Strokes gained: around the green', unit: 'strokes', value: 0.12, direction: 'higher_better' }),
    m({ metric_id: 'sg_putting', metric_label: 'Strokes gained: putting', unit: 'strokes', value: -0.42, direction: 'higher_better' }),
  ],
});

const ROSTER = [
  { kind: 'player' as const, id: 'p-maya', label: 'Maya Chen' },
  { kind: 'player' as const, id: 'p-jules', label: 'Jules Ortega' },
  { kind: 'player' as const, id: 'p-ava', label: 'Ava Lindqvist' },
  { kind: 'player' as const, id: 'p-noor', label: 'Noor Haddad' },
  { kind: 'player' as const, id: 'p-ella', label: 'Ella Brooks' },
];

const COMPARISON = envelope({
  measurements: ROSTER.slice(0, 2).flatMap((entity, i) => [
    m({ entity, metric_id: 'scoring_average', metric_label: 'Scoring average', unit: 'score', value: i ? 74.2 : 72.6, sample_size: i ? 11 : 15, direction: 'lower_better' }),
    m({ entity, metric_id: 'gir_pct', metric_label: 'Greens in regulation', unit: 'percent', value: i ? 52 : 61, sample_size: i ? 11 : 15, direction: 'higher_better' }),
    m({ entity, metric_id: 'sg_total', metric_label: 'Strokes gained: total', unit: 'strokes', value: i ? -3.92 : 0.46, sample_size: i ? 11 : 15, direction: 'higher_better' }),
    m({ entity, metric_id: 'putts_per_round', metric_label: 'Putts per round', unit: 'score', value: i ? 31.8 : 30.4, sample_size: i ? 11 : 15, direction: 'lower_better' }),
  ]),
});

const RANKING = envelope({
  coverage: 'partial',
  coverage_note: 'Ella Brooks has no rounds in this window.',
  measurements: ROSTER.map((entity, i) =>
    m({
      entity,
      metric_id: 'scoring_average',
      metric_label: 'Scoring average',
      unit: 'score',
      value: [72.6, 73.1, 74.2, 75.8, null][i]!,
      sample_size: [15, 12, 11, 9, 0][i]!,
      direction: 'lower_better',
    }),
  ),
});

const EMPTY = envelope({
  coverage: 'empty',
  coverage_note: 'No rounds logged between Oct 20 and Oct 26.',
});

const UNAVAILABLE = envelope({
  coverage: 'unavailable',
  coverage_note: 'The stats service did not respond. Try again in a minute.',
});

// What `compileComposition` returns for a model design over the reads above:
// the figures are the reads' own objects.
const COMPOSED: ValidatedComposition = {
  artifactId: 'vc-fixture',
  schemaVersion: 1,
  kind: 'compose',
  title: 'Approach play is where Maya gives strokes back',
  lede: 'Her scoring keeps improving, but the iron game is the one part of her round still costing her.',
  layout: 'split',
  blocks: [
    { type: 'headline', measurement: SG.measurements[1]!, label: 'Biggest leak' },
    { type: 'trend', series: SCORING.series[0]!, reference: 'average' },
    { type: 'split', measurements: SG.measurements },
    { type: 'bands', series: PROXIMITY.series[0]!, highlight: '150–200 yds' },
    { type: 'note', kind: 'association', text: 'Her longest approaches finish furthest away, which is where the strokes go.' },
    { type: 'note', kind: 'hypothesis', text: 'Club selection from long range may be worth a look in practice.' },
  ],
  evidenceRefs: [],
  coverageNotes: [],
  dataHash: 'fixture',
  createdAt: AS_OF,
};

let seq = 0;
const ev = (e: ToolEnvelope) => ({ type: 'data-evidence', id: `ev-${seq++}`, data: { envelope: e } });
const text = (t: string) => ({ type: 'text', text: t });
const user = (id: string, t: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text: t }] });
const assistant = (id: string, parts: unknown[]): UIMessage =>
  ({ id, role: 'assistant', parts }) as unknown as UIMessage;

const COMPOSED_TURN: UIMessage[] = [
  user('u0', 'Where is Maya losing strokes, and is she getting better?'),
  assistant('a0', [
    { type: 'data-visual-composition', id: 'visual-vc-fixture', data: COMPOSED },
    text('Spend the next two practices on 150 to 200 yard approaches; her scoring trend says the rest of her game is carrying her.'),
  ]),
];

const MESSAGES: UIMessage[] = [
  user('u1', 'How is Maya putting this season?'),
  assistant('a1', [
    text('Maya is a steady short putter but is losing strokes on the greens overall.'),
    ev(PUTTING),
    text('Inside 8 feet she holds up; the losses come from lag putting, where make rate falls off fast past 15 feet.'),
    ev(MAKE_CURVE),
  ]),
  user('u2', 'Show her scoring trend and where she gains or loses strokes.'),
  assistant('a2', [
    text('Her scoring average has come down about four strokes since May.'),
    ev(SCORING),
    text('Approach play is the biggest leak; off the tee is a strength.'),
    ev(SG),
    ev(PROXIMITY),
  ]),
  user('u3', 'Compare Maya and Jules, then rank the team on scoring.'),
  assistant('a3', [text('Maya leads Jules on every measure here.'), ev(COMPARISON), ev(RANKING)]),
  user('u4', 'How did the team play last week?'),
  assistant('a4', [text('There is nothing to read for last week yet.'), ev(EMPTY), ev(UNAVAILABLE)]),
];

const noop = () => undefined;

export function CoachHelmEvidencePreview() {
  // `?live` mounts the composed answer as a streaming turn, so its visuals
  // animate in; the replay button remounts it to watch again.
  const [run, setRun] = React.useState(0);
  const [live, setLive] = React.useState(false);
  React.useEffect(() => setLive(new URLSearchParams(window.location.search).has('live')), []);
  return (
    <div className={fairwayScope('min-h-dvh bg-canvas')}>
      <main className="mx-auto flex w-full max-w-[52rem] flex-col gap-8 px-4 py-8">
        {live && (
          // eslint-disable-next-line helm/no-raw-button -- dev-only fixture control
          <button type="button" className="self-start font-fw-sans text-caption text-accent-ink underline" onClick={() => setRun((r) => r + 1)}>
            Replay motion
          </button>
        )}
        <ChatThread key={`${run}-${live}`} messages={COMPOSED_TURN} busy={live} onApprove={noop} onDeny={noop} />
        <ChatThread messages={MESSAGES} busy={false} onApprove={noop} onDeny={noop} />
      </main>
    </div>
  );
}
