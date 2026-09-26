'use client';

/**
 * ============================================================================
 * TeamPlayerDrill: Team roots → one player's root map (coach view)
 * ----------------------------------------------------------------------------
 * `?view=team&player=<id>&cause=<insightId>`. The same model and `RootWhy`
 * the player sees on their CoachHelm Today view, built server-side for that
 * player with the coach's access (`loadCoachPlayerDrill`), in the coach's
 * voice: the player's first name, never "you".
 *
 * Summary first: `RootSummary` in the third person (the player's biggest
 * leak, one line of Why, their strength, ONE primary action "See why"), then
 * their next two leaks, every area collapsed (`AreaBreakdown`) and other
 * reads. A spot opens its
 * Why in a sheet (bottom on phones, a right-hand panel from md). A `?cause=`
 * link opens that sheet on load; picking a spot keeps `?cause=` in step and
 * closing the sheet clears it, so back/forward and a shared link reopen the
 * same read. Inside the sheet, RootWhy's "Propose as a focus for …" is the
 * one primary action; "Open signal" is secondary.
 * ========================================================================== */

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button, EmptyState, Sheet } from '@/components/fairway';
import {
  CONFIDENCE_LABEL,
  ROOT_AREA_LABEL,
  findBranch,
  formatStrokes,
  whyIdOf,
  shortDate,
  staleRoundLine,
} from '@/lib/coachhelm/root-map/build-root-map';
import type { CoachPlayerDrill } from '@/lib/coachhelm/root-map/coach-player-drill';
import { AreaBreakdown, SpotList, breakdownFootnote, rankedSpots } from './LeakList';
import { RootSummary } from './RootSummary';
import { Disclosure } from './Disclosure';
import { RootWhy } from './RootWhy';
import { MeasuredFacts, StaleRoundNote } from './RootToday';
import { PathCrumbs, pathSteps } from './SpotVisuals';
import type { TeamRootsViewProps } from './TeamRootsView';

export interface TeamPlayerDrillProps {
  drill: CoachPlayerDrill;
  hrefFor: TeamRootsViewProps['hrefFor'];
  navigate: TeamRootsViewProps['navigate'];
}

function plainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !(event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

export function TeamPlayerDrill({ drill, hrefFor, navigate }: TeamPlayerDrillProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ready = drill.status === 'ready' ? drill : null;
  const firstId = drill.causeId ?? ready?.model.defaultSelectedId ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(firstId);
  useEffect(() => setSelectedId(firstId), [firstId]);
  // The Why sheet: opened after mount (so the sheet's phone / desktop side is
  // resolved first) when the URL names a cause, never for the default pick.
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (drill.causeId && drill.status === 'ready') setSheetOpen(true);
  }, [drill.causeId, drill.status]);

  // Land the coach on the drill (the Brief header sits above it) and move
  // focus to its heading so a screen reader announces the new view.
  useEffect(() => {
    const h = headingRef.current;
    if (!h) return;
    h.focus({ preventScroll: true });
    // Scroll the drill's top (its back link) into view, not the heading.
    // The Brief above the drill keeps streaming in after the drill mounts
    // (measured at 375px: the drill landed 1,200px below the fold), so the
    // scroll is repeated while that layout settles, and stops for good the
    // moment the coach scrolls, touches or types.
    // It keeps running behind an open Why sheet, so closing the sheet lands
    // on the drill, not in the Brief.
    const align = () => rootRef.current?.scrollIntoView?.({ block: 'start' });
    align();
    let stopped = false;
    const stop = () => {
      stopped = true;
    };
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    for (const e of events) window.addEventListener(e, stop, { passive: true, once: true });
    const timers = [100, 300, 700, 1500].map((ms) =>
      window.setTimeout(() => {
        if (!stopped) align();
      }, ms),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
      for (const e of events) window.removeEventListener(e, stop);
    };
  }, [drill.playerId]);

  const name = drill.playerName;
  const backUpdate = { view: 'team', player: null, cause: null } as const;

  // `selectedId` is a branch id (a measured spot) or an insight id (from a
  // link); either resolves to the spot on the map and the read its Why opens.
  const selectedBranch = ready ? findBranch(ready.model, selectedId) : null;
  const whyId = selectedBranch ? whyIdOf(selectedBranch) : selectedId;

  function select(id: string) {
    setSelectedId(id);
    setSheetOpen(true);
    const b = ready ? findBranch(ready.model, id) : null;
    navigate({ cause: (b ? whyIdOf(b) : null) ?? id });
  }

  function closeSheet(open: boolean) {
    if (open) return;
    setSheetOpen(false);
    navigate({ cause: null });
  }


  const back = (
    <Link
      href={hrefFor(backUpdate)}
      scroll={false}
      onClick={(event) => {
        if (!plainClick(event)) return;
        event.preventDefault();
        navigate(backUpdate);
      }}
      className="inline-flex min-h-11 items-center gap-1 self-start text-body-sm font-medium text-accent-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      <ChevronLeft aria-hidden className="h-4 w-4" />
      Whole team
    </Link>
  );

  const stale = ready ? staleRoundLine(ready.throughDate, ready.daysSinceThrough) : null;
  const through = ready && !stale ? shortDate(ready.throughDate) : null;
  const readLine = ready
    ? [ready.roundsRead ? `Read from ${ready.roundsRead} rounds` : null, through ? `through ${through}` : null].filter(Boolean).join(' · ')
    : '';

  const spotArea = selectedBranch ? ROOT_AREA_LABEL[selectedBranch.area] : null;
  const selectedUnsized = !selectedBranch ? ready?.model.unsized.find((u) => u.id === selectedId) ?? null : null;
  const sheetTitle = selectedBranch
    ? `${spotArea} › ${selectedBranch.label}`
    : selectedUnsized
      ? `${ROOT_AREA_LABEL[selectedUnsized.area]} › ${selectedUnsized.label}`
      : // An off-map read: RootWhy's own heading names it, so the sheet
        // title stays short instead of repeating it.
        `${name}'s read`;

  const whyBody =
    ready && selectedBranch && !whyId ? (
      <section aria-labelledby="drill-spot-heading" className="flex flex-col gap-3" data-slot="drill-measured-spot">
        <h3 id="drill-spot-heading" className="font-fw-display text-title-2 font-semibold text-text-primary">
          {selectedBranch.title}
        </h3>
        <p className="text-body-sm text-text-primary">
          <span className="font-fw-mono tabular-nums">{formatStrokes(selectedBranch.strokes)}</span> strokes a round lost,{' '}
          {selectedBranch.sizingNote}.
        </p>
        <MeasuredFacts branch={selectedBranch} />
        {selectedBranch.contextPath ? (
          <div className="flex flex-col gap-1.5 text-body-sm" data-slot="drill-spot-path">
            <p className="font-medium text-text-primary">Where it concentrates</p>
            <PathCrumbs steps={pathSteps(selectedBranch.contextPath)} />
          </div>
        ) : null}
        <p className="text-body-sm text-text-secondary">No stored read on {name}&apos;s map matches this spot yet.</p>
      </section>
    ) : ready && whyId ? (
      <RootWhy
        model={ready.model}
        details={ready.details}
        insights={ready.insights}
        greenView={ready.greenView}
        approachWhy={ready.approachWhy}
        audience="coach"
        playerName={name}
        insightId={whyId}
        backLink={null}
        secondaryActions={
          <Button asChild variant="secondary" size="lg" fullWidth>
            <Link
              href={hrefFor({ view: 'signals', signal: whyId })}
              scroll={false}
              onClick={(event) => {
                if (!plainClick(event)) return;
                event.preventDefault();
                navigate({ view: 'signals', signal: whyId });
              }}
            >
              Open signal
            </Link>
          </Button>
        }
      />
    ) : null;

  const lead = ready ? ready.model.losses.flatMap((a) => a.causes).sort((a, b) => b.strokes - a.strokes)[0] ?? null : null;

  return (
    <div ref={rootRef} className="flex min-w-0 scroll-mt-20 flex-col gap-6" data-slot="team-player-drill">
      {back}
      <header className="flex flex-col gap-2">
        <p className="text-caption text-text-secondary">{['Player map', readLine].filter(Boolean).join(' · ')}</p>
        {stale ? <StaleRoundNote text={stale} /> : null}
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-fw-display text-title-1 font-semibold text-text-primary outline-none md:text-h1"
        >
          {name}
        </h2>
      </header>

      {!ready ? (
        <EmptyState
          title={`${name}'s map did not load`}
          description="The read failed or this player is no longer on your roster. Go back to the whole team and try again."
        />
      ) : ready.model.gains.length === 0 && ready.model.losses.length === 0 ? (
        <EmptyState
          title="No strokes-gained rounds yet"
          description={`${name}'s map is drawn from strokes gained per round. It fills in once a counted round with shot detail is logged.`}
        />
      ) : (
        <>
          <RootSummary
            model={ready.model}
            headline={ready.headline}
            details={ready.details}
            audience="coach"
            subjectName={name}
            action={
              lead ? (
                <Button variant="primary" size="lg" fullWidth type="button" onClick={() => select(lead.id)}>
                  See why
                </Button>
              ) : null
            }
          />
          {rankedSpots(ready.model).length > 1 ? (
            <section aria-labelledby="drill-next-heading" className="flex flex-col gap-1" data-slot="drill-next">
              <h3 id="drill-next-heading" className="text-body font-semibold text-text-primary">
                Also costing {name.split(' ')[0] || name}
              </h3>
              <SpotList
                spots={rankedSpots(ready.model).slice(1, 3)}
                audience="player"
                onSelect={select}
                selectedId={sheetOpen ? selectedBranch?.id ?? selectedId : null}
              />
            </section>
          ) : null}
          <Disclosure title="Every area" slot="drill-breakdown" bodyClassName="flex flex-col gap-3">
            <AreaBreakdown
              model={ready.model}
              audience="player"
              onSelect={select}
              onSelectUnsized={select}
              selectedId={sheetOpen ? selectedBranch?.id ?? selectedId : null}
            />
            <p className="text-caption text-text-tertiary" data-slot="breakdown-footnote">
              {breakdownFootnote(ready.model, 'coach')}
            </p>
          </Disclosure>
          {ready.model.other.length > 0 ? (
            <Disclosure title={`Other reads (${ready.model.other.length})`} slot="drill-other">
              <ul className="flex flex-wrap gap-2">
                {ready.model.other.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      aria-pressed={sheetOpen && o.id === selectedId}
                      onClick={() => select(o.id)}
                      className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-border-subtle px-3 text-body-sm text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus aria-pressed:border-text-primary aria-pressed:text-text-primary"
                    >
                      <span className="min-w-0 truncate">{o.title}</span>
                      {o.tier ? <span className="shrink-0 text-caption text-text-tertiary">{CONFIDENCE_LABEL[o.tier]}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
          <Sheet
            open={sheetOpen && !!whyBody}
            onOpenChange={closeSheet}
            side="right"
            mobileSide="bottom"
            title={sheetTitle}
            className="md:w-[min(32rem,calc(100vw-3rem))]"
          >
            <Sheet.Body className="pb-[max(1.5rem,env(safe-area-inset-bottom))]" data-slot="drill-why-sheet">
              {whyBody}
            </Sheet.Body>
          </Sheet>
        </>
      )}
    </div>
  );
}
