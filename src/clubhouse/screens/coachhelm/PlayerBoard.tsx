'use client';

import { useMemo, useRef, useState } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { partitionInsights, type ChInsight, type ChPlayerHelm } from '../../data/coachhelm-shape';
import { PLAYER_HELM_HREF, type PlayerHelmView } from '../../data/coachhelm-views-shape';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { rebuiltHref } from '../../shell/nav';
import { Button } from '../../ui/Button';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { EmptyState } from '../../ui/States';
import { BoardPartial, FocusCard, Head, InsightRow } from './parts';
import { Proposals } from './Proposals';
import { paramNow, writeParam } from './url-state';
import { useViewSwitch } from './use-view-switch';
import { PlayerHelmTabs } from './views/PlayerHelmTabs';
import { LIVE_PLAYER_WRITES, type ChPlayerWrites } from './writes';

/** Where each control goes. A target that isn't rebuilt yet isn't drawn (nav.rebuiltHref), never a dead button. */
export const coachHelmLinks = {
  /** Round entry once it is rebuilt; until then the Rounds library, named for what it is. */
  startRound: (): { href: string; label: string } | null => {
    const entry = rebuiltHref('/golf/dashboard/rounds/new', 'player');
    if (entry) return { href: entry, label: 'Start a round' };
    const library = rebuiltHref('/golf/dashboard/rounds', 'player');
    return library ? { href: library, label: 'Open Rounds' } : null;
  },
};

/**
 * CoachHelm for the player (P013; design/handoff/Player - CoachHelm.html,
 * helm3.jsx `PlayerHelm`; spec docs/clubhouse/phone/coachhelm.md): one focus,
 * then the other things worth knowing and what is working. The player reads
 * only their own insights and has no coach controls. The one thing they write
 * is their answer to a focus area a coach proposed: Accept or Decline (Q-77).
 */
export function PlayerBoard({ data, writes = LIVE_PLAYER_WRITES, initialPicked }: { data: ChPlayerHelm; writes?: ChPlayerWrites; initialPicked?: string }) {
  const phone = useChPhone();
  // The read the player chose, by id and title: a refresh that takes it off the board falls back to the current focus, and says so. It
  // lives in the address (`?insight=`, the one the Deep dive opens on; written without a server round trip) so Back and a reload
  // return to it (owner rule 8), and is read from the address when the board mounts, as Back restores the render with its first props.
  const opening = (...ids: Array<string | null | undefined>) => {
    const ins = ids.map((id) => (id ? data.insights.list.find((i) => i.id === id && i.kind !== 'note') : undefined)).find((i) => i);
    return ins ? { id: ins.id, title: ins.title } : null;
  };
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(() => opening(paramNow('insight'), initialPicked));
  const [seenInitial, setSeenInitial] = useState(initialPicked);
  if (initialPicked !== seenInitial) {
    setSeenInitial(initialPicked);
    const next = opening(initialPicked);
    if (next) setPicked(next);
  }
  const focusTop = useRef<HTMLDivElement>(null);
  // A switch of view moves the strip at once and dims the board (aria-busy) until the next view is ready.
  const sw = useViewSwitch<PlayerHelmView>('board', (v) => PLAYER_HELM_HREF[v]);

  const list = data.insights.list;
  const { focus, also, working } = useMemo(() => partitionInsights(list, picked?.id), [list, picked]);
  const gone = picked && focus && focus.id !== picked.id ? picked : null;
  const startHref = coachHelmLinks.startRound();
  const pick = (ins: ChInsight) => {
    setPicked({ id: ins.id, title: ins.title });
    writeParam('insight', ins.id);
    // On the phone the focus sits above the lists, so bring it into view.
    if (phone) focusTop.current?.scrollIntoView?.({ block: 'start' });
  };

  // With CoachHelm off (CH-13304) nothing is read and the views lead nowhere, so the strip is not drawn, as the coach's is not (CH-13305).
  const tabs = data.off ? null : <PlayerHelmTabs active={sw.shown} onGo={sw.go} />;
  return (
    <main className={'ch-hl' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hl-title" aria-busy={sw.pending || undefined}>
      {phone && <PhoneTop start title="CoachHelm" />}
      {phone && tabs}
      <Head who="Player">One thing to work on this week, based on the rounds you’ve posted.</Head>
      {!phone && tabs}

      {!data.off && <Proposals proposals={data.proposals} writes={writes} />}
      {/* CH-13208: a read beside the cards failed (the Tour's values, the drills, which cards have a focus, how current each read is). */}
      {!data.off && data.missing && <BoardPartial missing={data.missing} what="board" />}

      {data.off ? (
        <EmptyState
          size="page"
          code="CH-13304"
          icon={Sparkles}
          title="CoachHelm is off for your team"
          body={
            data.off.reason
              ? `Your coach turned it off: “${data.off.reason}”. Ask your coach if you want it back on.`
              : 'CoachHelm is turned off, so no insights are being shown. Ask your coach if you want it back on.'
          }
        />
      ) : data.insights.error ? (
        <RefreshNotice code="CH-13201" title="Your insights didn’t load" body="Nothing is lost. Your CoachHelm reads are still saved; try again in a moment." />
      ) : list.length === 0 ? (
        data.rounds === 0 ? (
          <EmptyState
            size="page"
            code="CH-13301"
            icon={Sparkles}
            title="Post a round to start CoachHelm"
            body="CoachHelm reads the rounds you post. Once there is enough to go on, one thing to work on this week shows up here."
            action={
              startHref ? (
                <Button variant="primary" leftIcon={Play} href={startHref.href}>
                  {startHref.label}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            size="page"
            code="CH-13302"
            icon={Sparkles}
            title="No insights yet"
            body={`${data.rounds ? `You’ve posted ${data.rounds} ${data.rounds === 1 ? 'round' : 'rounds'}. ` : ''}CoachHelm needs enough rounds to find a pattern worth acting on. Every round you post sharpens the read.`}
            action={
              startHref ? (
                <Button variant="primary" leftIcon={Play} href={startHref.href}>
                  {startHref.label}
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="ch-hl-grid">
          <div ref={focusTop} aria-live="polite">
            <SectionBoundary surface="coachhelm.focus" label="Your focus" code="CH-13204">
              {gone && (
                <p className="ch-hl-note" role="status" data-ch-code="CH-13909">
                  “{gone.title}” is no longer on your board, so this is your current focus.
                </p>
              )}
              {focus ? (
                <FocusCard key={focus.id} ins={focus} />
              ) : (
                <EmptyState
                  code="CH-13303"
                  icon={Sparkles}
                  title="Nothing needs work right now"
                  body="CoachHelm found nothing to fix in the rounds you’ve posted. What is working is listed beside this."
                />
              )}
            </SectionBoundary>
          </div>
          <aside className="ch-hl-side">
            <SectionBoundary surface="coachhelm.side" label="Your other insights" code="CH-13204">
              {also.length > 0 && (
                <section className="ch-hl-sec" aria-labelledby="ch-hl-also">
                  <h2 id="ch-hl-also">Also worth knowing</h2>
                  {also.map((i) => (
                    <InsightRow key={i.id} ins={i} onPick={() => pick(i)} />
                  ))}
                </section>
              )}
              {working.length > 0 && (
                <section className="ch-hl-sec" aria-labelledby="ch-hl-working">
                  <h2 id="ch-hl-working">Working</h2>
                  {working.map((i) => (
                    <InsightRow key={i.id} ins={i} onPick={() => pick(i)} />
                  ))}
                </section>
              )}
              <p className="ch-hl-note">Reads update as you post rounds. Your coaches see the same insights.</p>
            </SectionBoundary>
          </aside>
        </div>
      )}
    </main>
  );
}
