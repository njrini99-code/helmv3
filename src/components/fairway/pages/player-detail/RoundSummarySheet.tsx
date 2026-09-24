'use client';

/**
 * Read-only summary of one round, opened from the round strip or the round
 * list. It deliberately does NOT link to /rounds/[id]: that page starts a paid
 * AI review, and a tap on a bar is a glance, not a request for one.
 */

import { Sheet } from '@/components/fairway/overlays/Sheet';
import { formatSigned, formatToPar } from './buildPlayerDetailModel';
import type { RoundPoint } from './types';

const ROUND_TYPE_LABEL: Record<string, string> = {
  tournament: 'Tournament',
  qualifier: 'Qualifier',
  practice: 'Practice',
};

function Row({ label, value, sample }: { label: string; value: string; sample?: string | null }) {
  return (
    <div className="flex min-h-11 items-baseline justify-between gap-4 border-b border-border-subtle py-2.5 last:border-b-0">
      <span className="font-fw-sans text-body text-text-primary">{label}</span>
      <span className="text-right">
        <span className="font-fw-sans text-body font-medium tabular-nums text-text-primary">{value}</span>
        {sample ? <span className="block font-fw-sans text-caption text-text-tertiary">{sample}</span> : null}
      </span>
    </div>
  );
}

export function RoundSummarySheet({
  round,
  onOpenChange,
}: {
  round: RoundPoint | null;
  onOpenChange: (open: boolean) => void;
}) {
  const r = round;
  const typeLabel = r?.roundType ? ROUND_TYPE_LABEL[r.roundType] ?? null : null;
  const pct = (hit: number, total: number) => `${Math.round((hit / total) * 100)}%`;
  const sgRows = r?.sg
    ? ([
        ['Off the tee', r.sg.tee],
        ['Approach', r.sg.approach],
        ['Around the green', r.sg.aroundGreen],
        ['Putting', r.sg.putting],
      ] as const).filter(([, v]) => v != null)
    : [];

  return (
    <Sheet
      open={r != null}
      onOpenChange={onOpenChange}
      title={r ? r.course : 'Round'}
      description={r ? [r.dateLabel, typeLabel, r.holes === 9 ? '9 holes' : null].filter(Boolean).join(' · ') : undefined}
      data-slot="round-summary-sheet"
    >
      {r ? (
        <div className="px-1 pb-4">
          <p className="flex items-baseline gap-3">
            <span className="font-fw-display text-h1 font-semibold tabular-nums text-text-primary">{r.score}</span>
            {r.toPar != null ? (
              <span
                className={
                  r.toPar > 0
                    ? 'font-fw-sans text-body-lg tabular-nums text-fw-warning-ink'
                    : r.toPar < 0
                      ? 'font-fw-sans text-body-lg tabular-nums text-accent-700'
                      : 'font-fw-sans text-body-lg tabular-nums text-text-secondary'
                }
              >
                {r.toPar === 0 ? 'Even par' : `${formatToPar(r.toPar)} to par`}
              </span>
            ) : null}
          </p>

          <div className="mt-4">
            {r.putts != null && r.putts > 0 ? <Row label="Putts" value={String(r.putts)} /> : null}
            {r.fairways ? (
              <Row label="Fairways" value={pct(r.fairways.hit, r.fairways.total)} sample={`${r.fairways.hit} of ${r.fairways.total}`} />
            ) : null}
            {r.greens ? (
              <Row label="Greens in regulation" value={pct(r.greens.hit, r.greens.total)} sample={`${r.greens.hit} of ${r.greens.total}`} />
            ) : null}
            {r.scrambles ? (
              <Row label="Scrambling" value={pct(r.scrambles.made, r.scrambles.attempts)} sample={`${r.scrambles.made} of ${r.scrambles.attempts} chances`} />
            ) : null}
            {r.sg?.total != null ? <Row label="Strokes gained" value={formatSigned(r.sg.total)} /> : null}
          </div>

          {sgRows.length > 0 ? (
            <div className="mt-5">
              <h3 className="font-fw-sans text-body-sm font-semibold text-text-secondary">Strokes gained by area</h3>
              <div className="mt-1">
                {sgRows.map(([label, v]) => (
                  <Row key={label} label={label} value={formatSigned(v as number)} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
