'use client';

/**
 * ============================================================================
 * TeamPlayerDrill: Team roots → one player's root map (coach view)
 * ----------------------------------------------------------------------------
 * `?view=team&player=<id>&cause=<insightId>`. The same Where → What → Why
 * `RootMap` and `RootWhy` the player sees on their CoachHelm Today view,
 * built server-side for that player with the coach's access
 * (`loadCoachPlayerDrill`), in the coach's voice: the player's first name,
 * never "you". The clicked cause's Why opens under the map; picking another
 * branch swaps it in place and keeps `?cause=` in step, so back/forward and a
 * shared link reopen the same read.
 *
 * ONE primary action (RootWhy's "Propose as a focus for …"); "Open signal"
 * and the back link are secondary.
 * ========================================================================== */

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button, EmptyState, Eyebrow } from '@/components/fairway';
import {
  CONFIDENCE_LABEL,
  formatStrokes,
  rootStyleLabel,
  shortDate,
} from '@/lib/coachhelm/root-map/build-root-map';
import type { CoachPlayerDrill } from '@/lib/coachhelm/root-map/coach-player-drill';
import { RootBranchList, RootMap } from './RootMap';
import { RootWhy } from './RootWhy';
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

  // Land the coach on the drill (the Brief header sits above it) and move
  // focus to its heading so a screen reader announces the new view.
  useEffect(() => {
    const h = headingRef.current;
    if (!h) return;
    h.focus({ preventScroll: true });
    // Scroll the drill's top (its back link) into view, not the heading.
    rootRef.current?.scrollIntoView?.({ block: 'start' });
  }, [drill.playerId]);

  const name = drill.playerName;
  const backUpdate = { view: 'team', player: null, cause: null } as const;

  function select(id: string) {
    setSelectedId(id);
    navigate({ cause: id });
  }

  const summary = useMemo(() => {
    if (!ready) return '';
    const m = ready.model;
    const parts: string[] = [];
    if (m.gains.length > 0) parts.push(`Gaining: ${m.gains.map((g) => `${g.label} ${formatStrokes(g.sg, { signed: true })}`).join(', ')}.`);
    if (m.losses.length > 0) {
      parts.push(
        `Losing: ${m.losses
          .map((a) => {
            const causes = a.causes.map((c) => `${c.label} ${formatStrokes(c.strokes)} (${rootStyleLabel(c.style, 'coach').toLowerCase()})`);
            return `${a.label} ${formatStrokes(a.sg, { signed: true })}${causes.length ? `, from ${causes.join(', ')}` : ''}`;
          })
          .join('; ')}.`,
      );
    }
    if (m.netSg !== null) parts.push(`Net ${formatStrokes(m.netSg, { signed: true })} a round against the Tour line.`);
    return `${name}'s root map. ${parts.join(' ')}`;
  }, [ready, name]);

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
      Team roots
    </Link>
  );

  const through = ready ? shortDate(ready.throughDate) : null;
  const readLine = ready
    ? [ready.roundsRead ? `Read from ${ready.roundsRead} rounds` : null, through ? `through ${through}` : null].filter(Boolean).join(' · ')
    : '';

  return (
    <div ref={rootRef} className="flex min-w-0 scroll-mt-20 flex-col gap-6" data-slot="team-player-drill">
      {back}
      <header className="flex flex-col gap-2">
        <Eyebrow as="p">{['Player root map', readLine].filter(Boolean).join(' · ')}</Eyebrow>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-fw-display text-title-1 font-semibold text-text-primary outline-none md:text-h1"
        >
          {name}
        </h2>
        {ready?.headline ? <p className="text-body text-text-secondary">{ready.headline}</p> : null}
      </header>

      {!ready ? (
        <EmptyState
          title={`${name}'s root map did not load`}
          description="The read failed or this player is no longer on your roster. Go back to Team roots and try again."
        />
      ) : ready.model.gains.length === 0 && ready.model.losses.length === 0 ? (
        <EmptyState
          title="No strokes-gained rounds yet"
          description={`${name}'s root map is drawn from strokes gained per round. It fills in once a counted round with shot detail is logged.`}
        />
      ) : (
        <>
          <RootMap
            model={ready.model}
            selectedId={selectedId}
            onSelect={select}
            summary={summary}
            audience="coach"
            figureLabel={`${name}'s root map`}
          />
          <RootBranchList
            model={ready.model}
            selectedId={selectedId}
            onSelect={select}
            includeUnsized
            label={`Branches of ${name}'s map`}
          />
          {ready.model.other.length > 0 ? (
            <section aria-labelledby="drill-other-heading" className="flex flex-col gap-2">
              <h3 id="drill-other-heading" className="text-body-sm font-medium text-text-secondary">
                Other reads (not under a strokes-gained area)
              </h3>
              <ul className="flex flex-wrap gap-2">
                {ready.model.other.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      aria-pressed={o.id === selectedId}
                      onClick={() => select(o.id)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-subtle px-3 text-body-sm text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus aria-pressed:border-text-primary aria-pressed:text-text-primary"
                    >
                      <span className="max-w-[14rem] truncate">{o.title}</span>
                      {o.tier ? <span className="text-caption text-text-tertiary">{CONFIDENCE_LABEL[o.tier]}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {ready && selectedId ? (
        <div className="border-t border-text-primary pt-6">
          <RootWhy
            model={ready.model}
            details={ready.details}
            insights={ready.insights}
            greenView={ready.greenView}
            approachWhy={ready.approachWhy}
            audience="coach"
            playerName={name}
            insightId={selectedId}
            backLink={null}
            secondaryActions={
              <Button asChild variant="secondary" size="lg" fullWidth>
                <Link
                  href={hrefFor({ view: 'signals', signal: selectedId })}
                  scroll={false}
                  onClick={(event) => {
                    if (!plainClick(event)) return;
                    event.preventDefault();
                    navigate({ view: 'signals', signal: selectedId });
                  }}
                >
                  Open signal
                </Link>
              </Button>
            }
          />
        </div>
      ) : ready ? (
        <p className="text-body-sm text-text-secondary">Pick a branch of {name}&apos;s map to see why.</p>
      ) : null}
    </div>
  );
}
