'use client';

/**
 * ============================================================================
 * LeakList: where the strokes go, as ranked rows (coach Brief + player Today)
 * ----------------------------------------------------------------------------
 * Replaces the ribbon / ladder diagrams (owner redesign 2026-09-25). Every
 * strokes-gained screen that uses it follows the same rules:
 *
 *   - rows, never a diagram; one layout that only resizes;
 *   - every number is signed, per round, against the Tour average (said once
 *     per section, in its heading), at one decimal;
 *   - evidence is the sample ("212 putts · 18 rounds"), not a fill pattern;
 *   - each area's rows account for its total: the spots, the part no spot
 *     explains, and the spots inside it that gain;
 *   - a coach row names who carries the spot; a player row never does.
 *
 * `SpotList` ranks spots across areas (the "biggest leaks"); `AreaBreakdown`
 * lists every losing area with all of its spots and every gaining area.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  ROOT_AREA_LABEL,
  type AreaBranch,
  type CauseBranch,
  type RootArea,
  type RootAudience,
  type RootCarrier,
  type RootMapModel,
  type UnsizedCause,
} from '@/lib/coachhelm/root-map/build-root-map';
import type { AreaTrendNote } from '@/lib/coachhelm/root-map/area-trends';

const NEG = 'var(--fw-viz-div-neg)';
const POS = 'var(--fw-viz-div-pos)';

/** The benchmark every number on these screens is measured against. */
export const BENCHMARK_LABEL = 'vs Tour average';

/**
 * Strokes a round at one decimal. Under a tenth prints "under 0.1" (unsigned),
 * so a real but tiny value never reads as 0.0 or −0.0.
 */
export function formatPerRound(value: number, opts: { signed?: boolean } = {}): string {
  const abs = Math.abs(value);
  if (abs < 0.05) return 'under 0.1';
  const text = abs.toFixed(1);
  if (!opts.signed) return text;
  return value > 0 ? `+${text}` : `−${text}`;
}

/** "212 putts · 18 rounds" for a spot read from recorded shots; else null. */
export function sampleText(cause: Pick<CauseBranch, 'measured' | 'area'>): string | null {
  const m = cause.measured;
  if (!m || m.n <= 0) return null;
  const unit = m.unit === 'holes' ? (m.n === 1 ? 'putt' : 'putts') : m.n === 1 ? 'shot' : 'shots';
  const rounds = m.rounds > 0 ? ` · ${m.rounds} ${m.rounds === 1 ? 'round' : 'rounds'}` : '';
  return `${m.n} ${unit}${rounds}`;
}

/** "Mia, Jake +2" — the top two carriers by their own loss, then the rest. */
export function carriersText(carriers: readonly RootCarrier[] | undefined, players?: number): string | null {
  const total = players ?? carriers?.length ?? 0;
  if (!carriers || carriers.length === 0) return total > 0 ? `${total} ${total === 1 ? 'player' : 'players'}` : null;
  const firstName = (n: string) => n.split(' ')[0] || n;
  const top = carriers.slice(0, 2);
  // First names unless two shown carriers share one; then full names.
  const firsts = top.map((c) => firstName(c.name));
  const shown = new Set(firsts).size < firsts.length ? top.map((c) => c.name) : firsts;
  const rest = total - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
}

/** "0.4 better" / "0.2 worse" / "steady", with the window it compares. */
export function TrendText({ note, className }: { note: AreaTrendNote | null | undefined; className?: string }) {
  if (!note) return null;
  const words =
    note.direction === 'steady'
      ? 'Steady'
      : `${note.direction === 'improving' ? '▲' : '▼'} ${formatPerRound(Math.abs(note.delta))} ${
          note.direction === 'improving' ? 'better' : 'worse'
        }`;
  return (
    <span
      className={cn('whitespace-nowrap text-caption', className)}
      style={{
        color:
          note.direction === 'improving'
            ? 'var(--fw-color-success-ink)'
            : note.direction === 'declining'
              ? 'var(--fw-color-danger-ink)'
              : 'var(--fw-color-text-secondary)',
      }}
      title={`Compares ${note.window}`}
      data-slot="area-trend"
    >
      {words}
      <span className="sr-only">, comparing {note.window}</span>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * One spot row
 * ──────────────────────────────────────────────────────────────────────── */

const ROW = 'flex min-h-11 w-full items-center gap-3 py-2 text-left';
const ROW_BUTTON = cn(
  ROW,
  '-mx-2 rounded-fw-md px-2 outline-none hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus motion-safe:transition-colors',
);

function RowShell({
  onClick,
  pressed,
  label,
  slot,
  children,
}: {
  onClick?: () => void;
  pressed?: boolean;
  label?: string;
  slot: string;
  children: ReactNode;
}) {
  if (!onClick)
    return (
      <div className={ROW} data-slot={slot}>
        {children}
      </div>
    );
  return (
    <button type="button" className={ROW_BUTTON} onClick={onClick} aria-pressed={pressed} aria-label={label} data-slot={slot}>
      {children}
      <span aria-hidden className="shrink-0 text-text-tertiary">
        ›
      </span>
    </button>
  );
}

export function SpotRow({
  cause,
  audience,
  showArea = false,
  onSelect,
  selected = false,
}: {
  cause: CauseBranch;
  audience: RootAudience;
  showArea?: boolean;
  onSelect?: (id: string) => void;
  selected?: boolean;
}) {
  const who = audience === 'coach' ? carriersText(cause.carriers, cause.players) : null;
  const sample = sampleText(cause);
  const meta = [showArea ? ROOT_AREA_LABEL[cause.area] : null, who, sample].filter(Boolean).join(' · ');
  const value = `−${formatPerRound(cause.strokes)}`.replace('−under', 'under');
  return (
    <RowShell
      onClick={onSelect ? () => onSelect(cause.id) : undefined}
      pressed={selected}
      label={`${cause.label}${showArea ? `, ${ROOT_AREA_LABEL[cause.area]}` : ''}: ${value} strokes a round ${BENCHMARK_LABEL}${who ? `, ${who}` : ''}${sample ? `, from ${sample}` : ''}`}
      slot="leak-spot"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-medium text-text-primary">{cause.label}</span>
        {meta ? <span className="truncate text-caption text-text-secondary">{meta}</span> : null}
      </span>
      <span className="shrink-0 font-fw-sans text-body font-semibold tabular-nums text-text-primary">{value}</span>
    </RowShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Ranked spots across areas
 * ──────────────────────────────────────────────────────────────────────── */

/** Every sized spot under a losing area, largest first. */
export function rankedSpots(model: RootMapModel): CauseBranch[] {
  return model.losses
    .flatMap((a) => a.causes)
    .slice()
    .sort((a, b) => b.strokes - a.strokes);
}

export function SpotList({
  spots,
  audience,
  onSelect,
  selectedId = null,
  className,
}: {
  spots: CauseBranch[];
  audience: RootAudience;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  className?: string;
}) {
  if (spots.length === 0) return null;
  return (
    <ol className={cn('flex flex-col divide-y divide-border-subtle', className)} data-slot="spot-list">
      {spots.map((c) => (
        <li key={c.id}>
          <SpotRow cause={c} audience={audience} showArea onSelect={onSelect} selected={c.id === selectedId} />
        </li>
      ))}
    </ol>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Every area
 * ──────────────────────────────────────────────────────────────────────── */

/** The part of an area no spot explains, named for how the spots were read. */
export function remainderText(area: AreaBranch): string {
  return area.measured ? 'Not tracked by shot' : 'Not explained yet';
}

function AreaHeader({
  label,
  value,
  share,
  color,
  trend,
}: {
  label: string;
  value: string;
  share: number;
  color: string;
  trend?: AreaTrendNote | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="min-w-0 truncate text-body font-semibold text-text-primary">{label}</h4>
        <span className="flex shrink-0 items-baseline gap-3">
          <TrendText note={trend} />
          <span className="font-fw-sans text-body font-semibold tabular-nums text-text-primary">{value}</span>
        </span>
      </div>
      <span aria-hidden className="block h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, share * 100))}%`, background: color }} />
      </span>
    </div>
  );
}

function UnsizedRow({
  cause,
  audience,
  onSelect,
  selected,
}: {
  cause: UnsizedCause;
  audience: RootAudience;
  onSelect?: (id: string) => void;
  selected: boolean;
}) {
  const who = audience === 'coach' ? carriersText(cause.carriers, cause.players) : null;
  const meta = ['no stroke value yet', who, cause.contextPath ?? null].filter(Boolean).join(' · ');
  return (
    <RowShell
      onClick={onSelect ? () => onSelect(cause.id) : undefined}
      pressed={selected}
      label={`${cause.label}: ${meta}`}
      slot="leak-unsized"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body text-text-primary">{cause.label}</span>
        <span className="truncate text-caption text-text-secondary">{meta}</span>
      </span>
    </RowShell>
  );
}

export interface AreaBreakdownProps {
  model: RootMapModel;
  audience: RootAudience;
  trends?: Partial<Record<RootArea, AreaTrendNote | null>>;
  onSelect?: (id: string) => void;
  /** Unsized causes: open them (team: select; player: its Why page). */
  onSelectUnsized?: (id: string) => void;
  selectedId?: string | null;
  className?: string;
}

export function AreaBreakdown({
  model,
  audience,
  trends,
  onSelect,
  onSelectUnsized,
  selectedId = null,
  className,
}: AreaBreakdownProps) {
  const losses = [...model.losses].sort((a, b) => b.loss - a.loss);
  const maxLoss = Math.max(0, ...losses.map((a) => a.loss));
  const maxGain = Math.max(0, ...model.gains.map((g) => g.sg));
  const max = Math.max(maxLoss, maxGain) || 1;
  if (losses.length === 0 && model.gains.length === 0) return null;
  return (
    <div className={cn('flex flex-col gap-6', className)} data-slot="area-breakdown">
      {losses.length > 0 ? (
        <ol className="flex flex-col gap-6">
          {losses.map((area) => {
            const causes = [...area.causes].sort((a, b) => b.strokes - a.strokes);
            const unsized = model.unsized.filter((u) => u.area === area.area);
            const offsets = area.measured?.offsets ?? [];
            return (
              <li key={area.area} className="flex flex-col gap-1" data-slot="area-row" data-area={area.area}>
                <AreaHeader
                  label={area.label}
                  value={formatPerRound(area.sg, { signed: true })}
                  share={area.loss / max}
                  color={NEG}
                  trend={trends?.[area.area]}
                />
                {causes.length + unsized.length > 0 || area.remainder || offsets.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-border-subtle pl-3">
                    {causes.map((c) => (
                      <li key={c.id}>
                        <SpotRow cause={c} audience={audience} onSelect={onSelect} selected={c.id === selectedId} />
                      </li>
                    ))}
                    {area.remainder ? (
                      <li>
                        <div className={ROW} data-slot="area-remainder">
                          <span className="min-w-0 flex-1 truncate text-body text-text-secondary">{remainderText(area)}</span>
                          <span className="shrink-0 font-fw-sans text-body tabular-nums text-text-secondary">
                            −{formatPerRound(area.remainder.strokes)}
                          </span>
                        </div>
                      </li>
                    ) : null}
                    {offsets.map((o) => (
                      <li key={`offset-${o.label}`}>
                        <div className={ROW} data-slot="area-offset">
                          <span className="min-w-0 flex-1 truncate text-body text-text-secondary">Gaining: {o.label}</span>
                          <span className="shrink-0 font-fw-sans text-body tabular-nums" style={{ color: 'var(--fw-color-success-ink)' }}>
                            {formatPerRound(o.sg, { signed: true })}
                          </span>
                        </div>
                      </li>
                    ))}
                    {unsized.map((u) => (
                      <li key={u.id}>
                        <UnsizedRow cause={u} audience={audience} onSelect={onSelectUnsized} selected={u.id === selectedId} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {area.scaledToFit ? (
                  <p className="pl-3 text-caption text-text-tertiary" data-slot="area-overlap">
                    {offsets.length > 0
                      ? `The spots add to more than ${formatPerRound(area.loss)} because the spots gaining inside ${area.label.toLowerCase()} offset them.`
                      : `These spots overlap, so together they add to more than the ${formatPerRound(area.loss)} total.`}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {model.gains.length > 0 ? (
        <div className="flex flex-col gap-3" data-slot="area-gains">
          <h4 className="text-body-sm font-semibold text-text-primary">Ahead of the Tour average</h4>
          <ol className="flex flex-col gap-4">
            {model.gains.map((g) => (
              <li key={g.area} data-slot="gain-row" data-area={g.area}>
                <AreaHeader
                  label={g.label}
                  value={formatPerRound(g.sg, { signed: true })}
                  share={g.sg / max}
                  color={POS}
                  trend={trends?.[g.area]}
                />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/** One footnote for a whole breakdown: the benchmark and where it comes from. */
export function breakdownFootnote(model: RootMapModel, audience: RootAudience): string {
  const shared = model.losses.filter((a) => a.measured?.mode === 'share').map((a) => a.label.toLowerCase());
  const stored = model.losses.filter((a) => !a.measured).map((a) => a.label.toLowerCase());
  const parts = [`Strokes a round ${BENCHMARK_LABEL}.`];
  if (model.losses.some((a) => a.measured)) {
    parts.push(audience === 'coach' ? 'Spots come from the players’ recorded shots.' : 'Spots come from your recorded shots.');
  }
  if (shared.length > 0) parts.push(`For ${shared.join(' and ')}, some spots are a share of the stored total.`);
  if (stored.length > 0) parts.push(`${stored.join(' and ')} spots come from stored reads, not shots.`.replace(/^./, (c) => c.toUpperCase()));
  return parts.join(' ');
}
