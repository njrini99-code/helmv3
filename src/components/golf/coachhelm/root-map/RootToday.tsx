'use client';

/**
 * ============================================================================
 * RootToday: the player CoachHelm "Today" view as one root map
 * ----------------------------------------------------------------------------
 * Summary first: `RootSummary` (the loss by area, the two biggest leaks, one
 * line of Why, ONE primary action "See why") → the collapsed per-area ladder,
 * full map and notes (`RootMap`) → reads not sized yet (collapsed) → the
 * "Moving" sparklines → a compact "New since" timeline → every other read
 * (collapsed), so each insight the page fetched is reachable here. A spot
 * opens its chain in a sheet (bottom on phones, a right-hand panel from md)
 * whose one primary action opens the full Why view.
 *
 * Every value is handed in by the server page, read from stored rows. This
 * component formats; it never computes a statistic.
 * ========================================================================== */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { surfaceHref } from '@/lib/golf/surface-registry';
import { Button, Chip, EmptyState, Eyebrow, Sheet } from '@/components/fairway';
import { formatValue } from '@/components/golf/coachhelm/insights/format-value';
import {
  CONFIDENCE_LABEL,
  ROOT_AREA_LABEL,
  ROOT_STYLE_LABEL,
  findBranch,
  formatStrokes,
  isRootArea,
  shortDate,
  staleRoundLine,
  supportPhrase,
  whyIdOf,
  type BranchDetail,
  type CauseBranch,
  type RootAudience,
  type RootMapModel,
  type RootStyle,
} from '@/lib/coachhelm/root-map/build-root-map';
import type { AreaSparkline } from '@/lib/coachhelm/root-map/area-trends';
import type { GreenView } from '@/lib/coachhelm/root-map/green-view';
import type { ApproachWhyView } from '@/lib/coachhelm/root-map/approach-context';
import { RootMap, rootStyleCss } from './RootMap';
import { AreaSparklines } from './AreaSparklines';
import { RootSummary } from './RootSummary';
import { Disclosure } from './Disclosure';
import { LieSplitBars } from './SpotVisuals';

export const COACHHELM_HOME = surfaceHref('overview');

export function rootWhyHref(insightId: string): string {
  return `${surfaceHref('root-why')}&insight=${encodeURIComponent(insightId)}`;
}

export interface NewSinceItem {
  id: string;
  title: string;
  category: string | null;
}

export interface RootTodayProps {
  model: RootMapModel;
  /** Branch/insight id → stored evidence detail. */
  details: Record<string, BranchDetail>;
  /** Built server-side from the model and its default selection. */
  headline: string | null;
  roundsRead: number | null;
  /** Date-only `round_date` of the latest counted round. */
  throughDate: string | null;
  /** Days from `throughDate` to today, computed on the server (the client
   *  never reads the clock). Over 30 the header calls out the last round. */
  daysSinceThrough?: number | null;
  sparklines: AreaSparkline[];
  newSince: NewSinceItem[];
  /** Short-putt green for putting branches' Why view; null when below its gate. */
  greenView?: GreenView | null;
  /** Insight id → approach band Why evidence (length / par / shape). */
  approachWhy?: Record<string, ApproachWhyView> | null;
}

function supportTone(style: RootStyle): 'success' | 'warning' | 'neutral' {
  if (style === 'observed') return 'success';
  if (style === 'likely') return 'warning';
  return 'neutral';
}

export function SupportChips({
  style,
  tier,
  audience = 'player',
}: {
  style: RootStyle;
  tier: BranchDetail['tier'];
  audience?: RootAudience;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip tone={supportTone(style)} size="sm">
        {style === 'unexplained' ? ROOT_STYLE_LABEL.unexplained : supportPhrase(style, audience).replace(/^./, (c) => c.toUpperCase())}
      </Chip>
      {tier ? (
        <Chip tone="neutral" variant="outline" size="sm">
          {CONFIDENCE_LABEL[tier]}
        </Chip>
      ) : null}
    </div>
  );
}

function areaLabelOf(category: string | null): string | null {
  return isRootArea(category) ? ROOT_AREA_LABEL[category] : null;
}

function rootSentence(detail: BranchDetail | null, branch: CauseBranch): string {
  const cause = detail?.whySentence ?? detail?.rootCause ?? branch.rootCause;
  if (branch.measured && !whyIdOf(branch)) return 'No stored read explains this spot yet; the value above is measured from the shots.';
  if (!cause || branch.style === 'unexplained') return 'The cause behind this one is not explained yet.';
  if (branch.style === 'observed') return `Seen in your shots: ${cause}`;
  if (branch.style === 'likely') return `Likely: ${cause}`;
  return `Still forming: ${cause}`;
}

/**
 * A measured spot's facts: the value's source, the lie split inside an
 * approach band, and what an "Other" node folds together. Shared by the
 * chain, the Why view and the coach drill.
 */
export function MeasuredFacts({ branch }: { branch: CauseBranch }) {
  const m = branch.measured;
  if (!m) return null;
  return (
    <div className="flex flex-col gap-1 text-body-sm text-text-secondary" data-slot="measured-facts">
      {m.lies ? (
        <div className="flex flex-col gap-1.5">
          <p className="font-medium text-text-primary">By lie</p>
          <LieSplitBars
            rows={[
              ...m.lies.map((l) => ({ label: l.label, sg: l.sg, n: l.n })),
              ...(m.liesRest !== null ? [{ label: 'Thinner lies', sg: m.liesRest, n: null }] : []),
            ]}
          />
        </div>
      ) : null}
      {m.merged.length > 0 ? <p>Together: {m.merged.join(', ')}.</p> : null}
      {m.mode === 'share' ? (
        <p className="text-caption text-text-tertiary">
          A share of the stored total: the shot-by-shot split did not match it closely enough to print as measured.
        </p>
      ) : null}
    </div>
  );
}

/** What a branch's stroke value is, in words. */
function strokesText(branch: CauseBranch): string {
  if (branch.measured && branch.sizingNote) return `strokes a round lost to the Tour line: ${branch.title.toLowerCase()}, ${branch.sizingNote}`;
  if (branch.sizedBy === 'band_sg' && branch.sizingNote) return `strokes a round lost to the Tour line: ${branch.sizingNote}`;
  return `strokes a round on ${branch.label.toLowerCase()}, to the Tour line`;
}

function Chain({ model, branch, detail }: { model: RootMapModel; branch: CauseBranch; detail: BranchDetail | null }) {
  const area = model.losses.find((a) => a.area === branch.area);
  const rows: { value: string; text: string }[] = [];
  if (area) rows.push({ value: formatStrokes(area.sg, { signed: true }), text: `${area.label}, a round` });
  if (branch.measured) rows.push({ value: formatStrokes(branch.strokes), text: strokesText(branch) });
  if (branch.measured) {
    if (detail) {
      rows.push({
        value: formatValue(detail.yourValue, detail.unit, detail.yourDisplay ?? undefined),
        text: `${detail.metricLabel} · ${detail.comparisonLabel} ${formatValue(detail.comparisonValue, detail.unit)}`,
      });
    }
  } else if (detail) {
    rows.push({
      value: formatValue(detail.yourValue, detail.unit, detail.yourDisplay ?? undefined),
      text: `${detail.metricLabel} · ${detail.comparisonLabel} ${formatValue(detail.comparisonValue, detail.unit)}`,
    });
    if (detail.driver) {
      rows.push({
        value: formatValue(detail.driver.value, detail.driver.unit),
        text: `${detail.driver.label}${detail.driver.sampleN > 0 ? ` · ${detail.driver.sampleN} tracked` : ''}`,
      });
    } else {
      rows.push({ value: formatStrokes(branch.strokes), text: strokesText(branch) });
    }
    // A band-sized branch also states its width, whatever the driver row says.
    if (detail.driver && branch.sizedBy === 'band_sg') rows.push({ value: formatStrokes(branch.strokes), text: strokesText(branch) });
  } else {
    rows.push({ value: formatStrokes(branch.strokes), text: strokesText(branch) });
  }
  return (
    <section aria-labelledby="root-chain-heading" className="flex flex-col gap-3">
      <h3 id="root-chain-heading" className="sr-only">
        Selected branch: {branch.label}
      </h3>
      <SupportChips style={branch.style} tier={branch.tier} />
      <dl className="flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3">
            <dt className="font-fw-display text-title-2 tabular-nums text-text-primary">{r.value}</dt>
            <dd className="text-body-sm text-text-secondary">{r.text}</dd>
          </div>
        ))}
      </dl>
      <MeasuredFacts branch={branch} />
      {branch.contextPath ? (
        <p className="text-body-sm text-text-primary">
          <span className="font-medium">Where it concentrates: </span>
          {branch.contextPath}
        </p>
      ) : null}
      <p className="text-body-sm text-text-primary">{rootSentence(detail, branch)}</p>
    </section>
  );
}

/** The map's data is old: say when the last round was, so it stands out. */
export function StaleRoundNote({ text }: { text: string }) {
  return (
    <p
      className="self-start rounded-fw-sm border border-fw-warning-ring bg-fw-warning-bg px-2 py-1 text-body-sm font-medium text-fw-warning-ink"
      data-slot="stale-round"
    >
      {text}
    </p>
  );
}

function NewSinceTimeline({ date, items }: { date: string | null; items: NewSinceItem[] }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 3);
  const label = shortDate(date);
  return (
    <section aria-labelledby="root-new-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-text-primary pb-2">
        <h3 id="root-new-heading" className="font-fw-display text-body-lg font-semibold text-text-primary">
          {label ? `New since ${label}` : 'New since your last round'}
        </h3>
        <Chip tone="success" size="sm">
          {items.length} new
        </Chip>
      </div>
      <ol className="relative grid grid-cols-3 gap-3">
        <span aria-hidden className="absolute left-2 right-2 top-[7px] h-px bg-border-strong" />
        {shown.map((item) => (
          <li key={item.id} className="relative min-w-0">
            <Link
              href={rootWhyHref(item.id)}
              className="group flex min-h-11 flex-col gap-1 rounded-fw-sm outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              <span aria-hidden className="relative h-3.5 w-3.5 rounded-full border-2 border-canvas bg-accent-500" />
              <span className="line-clamp-2 text-body-sm font-medium text-text-primary group-hover:underline">{item.title}</span>
              {areaLabelOf(item.category) ? (
                <span className="text-caption text-text-tertiary">{areaLabelOf(item.category)}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RootToday({ model, details, headline, roundsRead, throughDate, daysSinceThrough = null, sparklines, newSince }: RootTodayProps) {
  const [selectedId, setSelectedId] = useState<string | null>(model.defaultSelectedId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const open = (id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  };
  const branch = findBranch(model, selectedId);
  const whyId = branch ? whyIdOf(branch) : null;
  const detail = whyId ? details[whyId] ?? null : null;

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (model.gains.length > 0) parts.push(`Gaining: ${model.gains.map((g) => `${g.label} ${formatStrokes(g.sg, { signed: true })}`).join(', ')}.`);
    if (model.losses.length > 0) {
      parts.push(
        `Losing: ${model.losses
          .map((a) => {
            const causes = a.causes.map((c) => `${c.label} ${formatStrokes(c.strokes)} (${ROOT_STYLE_LABEL[c.style].toLowerCase()})`);
            return `${a.label} ${formatStrokes(a.sg, { signed: true })}${causes.length ? `, from ${causes.join(', ')}` : ''}`;
          })
          .join('; ')}.`,
      );
    }
    if (model.netSg !== null) parts.push(`Net ${formatStrokes(model.netSg, { signed: true })} a round against the Tour line.`);
    return parts.join(' ');
  }, [model]);

  const hasMap = model.gains.length > 0 || model.losses.length > 0;
  const stale = staleRoundLine(throughDate, daysSinceThrough);
  const through = stale ? null : shortDate(throughDate);
  const readLine = [roundsRead ? `Read from ${roundsRead} rounds` : null, through ? `through ${through}` : null]
    .filter(Boolean)
    .join(' · ');

  const lead = model.losses.flatMap((a) => a.causes).sort((x, y) => y.strokes - x.strokes)[0] ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-6" data-slot="root-today">
      <header className="flex flex-col gap-2">
        {readLine ? <Eyebrow as="p">{readLine}</Eyebrow> : null}
        {stale ? <StaleRoundNote text={stale} /> : null}
        <h2 className="font-fw-display text-title-1 text-text-primary md:text-h1">
          {hasMap ? 'Where your strokes go' : headline ?? 'Your root map fills in as your rounds are counted.'}
        </h2>
      </header>

      {hasMap ? (
        <>
          <RootSummary
            model={model}
            headline={headline}
            summary={summary}
            details={details}
            onSpot={open}
            selectedId={sheetOpen ? branch?.id ?? null : null}
            action={
              lead ? (
                <Button variant="primary" size="lg" fullWidth type="button" onClick={() => open(lead.id)}>
                  See why
                </Button>
              ) : null
            }
          />
          <RootMap
            model={model}
            selectedId={sheetOpen ? selectedId : null}
            onSelect={open}
            summary={summary}
            listUnsized={false}
            whatEyebrow="By area"
          />

          {model.unsized.length > 0 ? (
            <Disclosure title={`Not sized yet (${model.unsized.length})`} slot="root-unsized" bodyClassName="flex flex-col gap-2">
              <p className="text-body-sm text-text-secondary">Also under a losing area, with no stroke value stored.</p>
              {model.unsized.some((u) => u.note) ? (
                <ul className="flex flex-col gap-0.5 text-caption text-text-tertiary">
                  {model.unsized
                    .filter((u) => u.note)
                    .map((u) => (
                      <li key={u.id}>
                        {u.label}: {u.note}
                      </li>
                    ))}
                </ul>
              ) : null}
              <ul className="flex flex-wrap gap-2">
                {model.unsized.map((u) => (
                  <li key={u.id} className="max-w-full">
                    <Link
                      href={rootWhyHref(u.id)}
                      className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-dashed border-border-strong px-3 text-body-sm text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-sm" style={rootStyleCss(u.style)} />
                      <span className="min-w-0 truncate">{u.label}</span>
                      {u.contextPath ? (
                        <span className="min-w-0 truncate text-caption text-text-primary">{u.contextPath}</span>
                      ) : null}
                      <span className="shrink-0 text-caption text-text-tertiary">{ROOT_AREA_LABEL[u.area]}</span>
                      {u.isNew ? <span aria-label="new" className="h-2 w-2 shrink-0 rounded-full bg-accent-500" /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}

          {!lead && model.losses.length > 0 ? (
            <p className="text-body-sm text-text-secondary">
              None of the reads under a losing area has a stored stroke value yet, so the map shows where strokes go but
              not what drives them. Open one of the reads below to see its evidence.
            </p>
          ) : null}

          <Sheet
            open={sheetOpen && !!branch}
            onOpenChange={setSheetOpen}
            side="right"
            mobileSide="bottom"
            title={branch ? `${ROOT_AREA_LABEL[branch.area]} › ${branch.label}` : 'Root map'}
            className="md:w-[min(32rem,calc(100vw-3rem))]"
          >
            <Sheet.Body className="pb-[max(1.5rem,env(safe-area-inset-bottom))]" data-slot="root-chain-sheet">
              {branch ? (
                <div className="flex flex-col gap-4">
                  <Chain model={model} branch={branch} detail={detail} />
                  {whyId ? (
                    <Button asChild variant="primary" size="lg" fullWidth>
                      <Link href={rootWhyHref(whyId)}>See the evidence</Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Sheet.Body>
          </Sheet>
        </>
      ) : (
        <EmptyState
          title="No strokes-gained rounds yet"
          description="The root map is drawn from strokes gained per round. Log a round with shot detail and it fills in."
          action={
            <Button asChild variant="primary">
              <Link href="/golf/dashboard/rounds/new">Log a round</Link>
            </Button>
          }
        />
      )}

      {sparklines.length > 0 ? <AreaSparklines lines={sparklines} /> : null}

      <NewSinceTimeline date={throughDate} items={newSince} />

      {model.other.length > 0 ? (
        <Disclosure title={`Other reads (${model.other.length})`} slot="root-other">
          <ul className="flex flex-col divide-y divide-border-subtle">
            {model.other.map((o) => (
              <li key={o.id}>
                <Link
                  href={rootWhyHref(o.id)}
                  className="flex min-h-11 items-center justify-between gap-3 py-2 text-body-sm text-text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {o.isNew ? <span aria-label="new" className="h-2 w-2 shrink-0 rounded-full bg-accent-500" /> : null}
                    <span className="truncate">{o.title}</span>
                  </span>
                  {o.tier ? (
                    <span className={cn('shrink-0 text-caption text-text-tertiary')}>{CONFIDENCE_LABEL[o.tier]}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}
