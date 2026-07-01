'use client';

/**
 * RecruitCard — the War Room pipeline chip (spec §6 #2). CLAY lane only.
 *
 * A mini box-score chip on Paper stock: a serif surname over a `pos · class ·
 * state` `<Eyebrow>`, ONE clay `<RuledStatLine>` top measurable, up to three
 * `<GradeStamp>`s, a clay `<AgingBar>` that darkens like a deadline, and an
 * `<InkBadge>` stamping the pipeline stage. Drag is the only elevation moment,
 * so this stays flat; it is drag-friendly — it forwards `className` (for the dnd
 * transform) and is keyboard-activatable when `onClick` is set.
 */
import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { PaperCard, Eyebrow, RuledStatLine, GradeStamp, AgingBar, InkBadge } from '..';

export interface RecruitCardGrade {
  /** Tool name, e.g. `HIT`, `POWER`, `ARM`. */
  tool: string;
  /** The 20-80 grade. */
  value: number;
  /** Solid present grade vs. ghost future/projected outline. */
  present?: boolean;
}

export interface RecruitCardProps {
  firstName: string;
  lastName: string;
  /** Position / role, e.g. `SS`, `RHP`. */
  position?: string;
  /** Class year, e.g. `2027`. */
  classYear?: string;
  /** Home state, e.g. `TX`. */
  state?: string;
  /** The headline measurable (one ruled clay stat line). */
  topStat?: { label: string; value: number | string; unit?: string };
  /** Up to three tool grades (extra entries are dropped). */
  grades?: Array<RecruitCardGrade>;
  /** Days since last contact — drives the clay aging bar. */
  daysSinceContact?: number;
  /** Pipeline stage, stamped as an ink badge, e.g. `HIGH PRIORITY`. */
  stage?: string;
  /** Open the dossier on click (keyboard-activatable). */
  onClick?: () => void;
  className?: string;
}

export function RecruitCard({
  firstName,
  lastName,
  position,
  classYear,
  state,
  topStat,
  grades,
  daysSinceContact,
  stage,
  onClick,
  className,
}: RecruitCardProps) {
  const clickable = Boolean(onClick);

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  }

  const inner = (
    <PaperCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block font-annual text-body-sm font-normal leading-none text-text-secondary">{firstName}</span>
          <span
            className="mt-0.5 block truncate font-annual text-h3 font-semibold uppercase leading-tight text-text-primary"
            style={{ fontVariant: 'small-caps' }}
          >
            {lastName}
          </span>
        </div>
        {stage ? <InkBadge label={stage} tone="pursuit" variant="solid" className="shrink-0" /> : null}
      </div>

      {position || classYear || state ? (
        <Eyebrow items={[position, classYear, state]} ink="pursuit" className="mt-1.5" />
      ) : null}

      {topStat ? (
        <div className="mt-3">
          <RuledStatLine label={topStat.label} value={topStat.value} unit={topStat.unit} ink="pursuit" size="row" />
        </div>
      ) : null}

      {grades && grades.length > 0 ? (
        <div className="mt-3 flex gap-2">
          {grades.slice(0, 3).map((g, i) => (
            <GradeStamp key={`${g.tool}-${i}`} tool={g.tool} value={g.value} present={g.present} size="sm" />
          ))}
        </div>
      ) : null}

      {daysSinceContact != null ? (
        <div className="mt-4">
          <AgingBar days={daysSinceContact} />
        </div>
      ) : null}
    </PaperCard>
  );

  const base = cn(
    'block w-full text-left',
    clickable &&
      'cursor-pointer rounded-card transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pursuit',
    className,
  );

  if (onClick) {
    return (
      <div role="button" tabIndex={0} onClick={onClick} onKeyDown={handleKey} className={base}>
        {inner}
      </div>
    );
  }

  return <div className={base}>{inner}</div>;
}
