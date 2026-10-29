'use client';

import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useGolfUserOptional } from '@/contexts/golf-user-context';
import { playerHelmDrill } from '../../data/coachhelm-views-shape';
import { SkelLine, Skeleton } from '../../ui/States';
import { useChPhone } from '../../lib/use-phone';
import '../../styles/coachhelm.css';
import { LargeTitleSkeleton } from '../../ui/LargeTitle';
import { AskSkeleton } from './chat/AskSkeleton';
import { CoachHelmTabs } from './chat/SubTabs';
import { PlayerHelmTabs } from './views/PlayerHelmTabs';
import { DiveSkeleton, StandingSkeleton } from './views/Skeletons';

/** One text line's box at its loaded height, with the bar centred in it (the phone intro's lines). */
function Line({ h, w, sh, r }: { h: number; w: number | string; sh: number; r?: number }) {
  return (
    <span className="ch-hl-sk__line" style={{ height: h }}>
      <Skeleton width={w} height={sh} radius={r} />
    </span>
  );
}

/**
 * The phone's focus in its loaded shape (the Mobile clubhouse pass): the claim's feature card, then the evidence, the week's
 * drill and the reasoning's row flush on the parchment under it. `claim` is the card's height for a typical claim of the role
 * (measured at 390: the coach's one-line claim and two-line opening, 146px; the player's two-line claim and three-line opening,
 * 194px); a longer or shorter claim still moves what follows by its difference.
 */
function PhoneFocusSkeleton({ claim }: { claim: number }) {
  return (
    <div className="ch-hl-sk__card">
      <Skeleton width="100%" height={claim} radius={14} shape="solid" />
      <Skeleton width="62%" height={12} />
      <Skeleton width="100%" height={10} radius={5} />
      <Skeleton width="100%" height={10} radius={5} />
      <Skeleton width="54%" height={11} />
      <span className="ch-hl-sk__rule" />
      <Skeleton width={90} height={12} />
      <Skeleton width="92%" height={13} />
      <Skeleton width="78%" height={13} />
    </div>
  );
}

function FocusSkeleton() {
  return (
    <div className="ch-hl-sk__card">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton width={140} height={11} />
        <Skeleton width={90} height={22} radius={11} />
      </div>
      <Skeleton width="84%" height={30} radius={8} />
      <Skeleton width="56%" height={30} radius={8} />
      <Skeleton width="92%" height={13} />
      <Skeleton width="70%" height={13} />
      <Skeleton width="100%" height={140} radius={16} />
      <Skeleton width="100%" height={90} radius={16} />
    </div>
  );
}

/**
 * The view strip (the player's Board, Standing and Deep dive; the coach's Board and Ask) in the place and at the
 * height the page draws it: the phone's 44px (the 36px chips or segments and the room their tap area keeps). Without it the
 * strip arrived with the page and pushed everything below it down. On desktop it is the strip itself, held (inert, hidden from
 * assistive tech), so it is exactly as wide and placed as the page's and does not turn from a bar into the control on landing.
 */
function StripSkeleton({ coach, phone }: { coach: boolean; phone: boolean }) {
  if (!phone) return coach ? <CoachHelmTabs active="board" held /> : <PlayerHelmTabs active="board" held />;
  return (
    <div className="ch-hl-sk__tabs" style={{ height: 44 }}>
      <Skeleton width="100%" height={36} radius={18} />
    </div>
  );
}

/**
 * The coach's board on desktop, in the loaded page's measured boxes (WebKit 1280 and 1440, 2026-10-29): By player over its rule
 * and the players at their 65px pitch; beside them the focus, whose claim is the page's one lit green card (201px), then the
 * evidence, "Why we think this" and the three actions; Re-check reads under the board.
 */
function CoachBoardBody(): ReactNode {
  return (
    <>
      <div className="ch-hl-sk ch-hl-sk--coach">
        <div>
          <div className="ch-hl-sk__ph">
            <Skeleton width={64} height={12} />
          </div>
          <div className="ch-hl-sk__pl">
            {[46, 58, 52, 40, 36].map((w, i) => (
              <div key={i} className="ch-hl-sk__p">
                <Skeleton width={34} height={34} radius={17} />
                <span>
                  <Skeleton width={`${w + 6}%`} height={13} />
                  <Skeleton width={`${w + 30}%`} height={10} />
                </span>
                {i < 3 && <Skeleton width={22} height={22} radius={11} />}
              </div>
            ))}
          </div>
        </div>
        <div className="ch-hl-sk__focus">
          <div className="ch-hl-focus__head ch-hl-sk__claim ch-sk-on-green">
            <SkelLine line={18} bar={11} width={200} />
            <SkelLine line={44} bar={30} width="64%" />
            <SkelLine line={20} bar={11} width="42%" />
            <SkelLine line={24} bar={13} width="72%" />
          </div>
          <div className="ch-hl-sk__ev">
            <SkelLine line={20} bar={12} width={130} />
            {[0, 1].map((i) => (
              <span key={i} className="ch-hl-sk__evr">
                <Skeleton width={i ? 40 : 30} height={12} />
                <Skeleton width={28} height={13} />
              </span>
            ))}
            <SkelLine line={36} bar={10} width={200} />
          </div>
          <div className="ch-hl-sk__why">
            <Skeleton width={118} height={13} />
            <Skeleton width={14} height={14} radius={4} />
          </div>
          <div className="ch-hl-sk__acts">
            <Skeleton width={155} height={36} radius={10} />
            <Skeleton width={106} height={36} radius={10} />
            <Skeleton width={150} height={36} radius={10} />
          </div>
        </div>
      </div>
      <div className="ch-hl-sk__recheck">
        <Skeleton width={156} height={36} radius={10} />
      </div>
    </>
  );
}

/**
 * Route loading for CoachHelm, in each role's own shape (gh-states.jsx): the
 * player's focus beside a short list; the coach's header with its "Since you
 * were last here" line, then the players beside the focus. CH-13401 (player) and CH-13402 (coach). `chained`: the page's own Suspense draws it after the route's
 * `loading.tsx` skeleton, in the same place, so it does not fade in again over it (a second fade would dip the page).
 */
export function CoachHelmSkeleton({ view, chained }: { view: 'coach' | 'player'; chained?: boolean }) {
  const coach = view === 'coach';
  const phone = useChPhone();
  return (
    // Desktop: on the canopy, with the view strip level with the title as the page draws it (Head's aside), so neither the
    // green nor the content below moves when the page lands.
    <main className={'ch-hl' + (phone ? ' is-phone' : '')} aria-busy="true" aria-label="Loading CoachHelm" data-skel={chained ? 'chained' : undefined} data-ch-code={coach ? 'CH-13402' : 'CH-13401'} data-canopy={phone ? undefined : ''}>
      {/* The screen's one h1 while it loads, for the page outline (P013 D8). */}
      <h1 className="ch-sr-only">CoachHelm</h1>
      {phone && <StripSkeleton coach={coach} phone />}
      {phone ? (
        // The phone's intro at its loaded line heights: the coach's eyebrow, the large title and the live line under the double rule.
        <header className="ch-hl-h" data-canopy-head="">
          {coach && <Line h={14.4} w={56} sh={11} />}
          <LargeTitleSkeleton width={176} />
          {coach ? (
            <>
              <Line h={21.75} w="74%" sh={13} />
              {/* The header's "Since you were last here" line (D4). */}
              <Line h={32} w={196} sh={13} />
            </>
          ) : (
            // The player's line runs to two lines at the phone's width.
            <span className="ch-hl-sk__line is-two">
              <Skeleton width="92%" height={13} />
              <Skeleton width="48%" height={13} />
            </span>
          )}
        </header>
      ) : (
        // Each line at the loaded line's height (the role 18, the title 48, the line 21, "Since you were last here" 32), so the
        // head is the loaded head's 195px (coach) and the strip sits where the page puts it.
        <header className="ch-hl-h has-aside" data-canopy-head="">
          {/* The role line is the coach's only (Head). */}
          {coach && <SkelLine line={18} bar={11} width={40} />}
          <SkelLine line={48} bar={38} width={196} />
          <SkelLine line={21} bar={13} width={coach ? 210 : 360} />
          {coach && <SkelLine line={32} bar={13} width={196} />}
          <div className="ch-hl-h__aside">
            <StripSkeleton coach={coach} phone={false} />
          </div>
        </header>
      )}
      {phone ? (
        coach ? (
          <div className="ch-hl-sk ch-hl-sk--coach">
            <div className="ch-hl-sk__chips" aria-hidden="true">
              {[132, 140, 120].map((w) => (
                <Skeleton key={w} width={w} height={40} radius={20} />
              ))}
            </div>
            <PhoneFocusSkeleton claim={146} />
          </div>
        ) : (
          <div className="ch-hl-sk ch-hl-sk--player">
            <PhoneFocusSkeleton claim={194} />
            <div className="ch-hl-sk__col">
              <Line h={22.8} w={170} sh={17} r={6} />
              {[0, 1].map((i) => (
                <div key={i} className="ch-hl-sk__row">
                  <Skeleton width={8} height={8} radius={4} />
                  <span>
                    <Skeleton width="34%" height={10} />
                    <Skeleton width="76%" height={13} />
                  </span>
                  <Skeleton width={34} height={13} />
                </div>
              ))}
            </div>
          </div>
        )
      ) : coach ? (
        <CoachBoardBody />
      ) : (
        <div className="ch-hl-sk ch-hl-sk--player">
          <FocusSkeleton />
          <div className="ch-hl-sk__col">
            <Skeleton width={120} height={11} />
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Skeleton width={10} height={10} radius={5} />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Skeleton width="40%" height={10} />
                  <Skeleton width="80%" height={13} />
                </span>
                <Skeleton width={36} height={13} />
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * Which skeleton an address draws, as `ClubhouseCoachHelmRoute` decides which view it is (routes/coachhelm.tsx): the coach's Ask
 * for `?view=ask`; a coach's Deep dive or Standing of one player only with `&player=`; the player's own Standing or Deep dive;
 * the board's for everything else (the Track record, the briefs, an unknown view, and a player's `?view=ask`). `role` is null until
 * the shell knows who is signed in, and is the player's meanwhile.
 */
export type ChRouteSkeleton = 'coach' | 'player' | 'ask' | 'coach-standing' | 'coach-deep-dive' | 'standing' | 'deep-dive';
export function routeSkeletonFor(role: string | null | undefined, params: { get(name: string): string | null; has(name: string): boolean } | null): ChRouteSkeleton {
  const view = params?.get('view') ?? undefined;
  const drill = playerHelmDrill(view);
  if (role === 'coach') {
    if (view === 'ask') return 'ask';
    // The route's test is `typeof player === 'string'`: an empty `&player=` is still a coach's view of a player (whose check fails).
    if (drill && params?.has('player')) return drill === 'standing' ? 'coach-standing' : 'coach-deep-dive';
    return 'coach';
  }
  return drill ?? 'player';
}

/**
 * For loading.tsx: the shell knows who is signed in, so the skeleton takes their role's shape (a player until it is known), and
 * the address says which view is coming. `loading.tsx` cannot read `?view=` on the server, but this client part can, so a hard
 * load or a link straight to Ask or a Deep dive draws that view's shape at once instead of the board's and then the view's (two
 * skeletons in a row, the second a different shape). The view's own Suspense fallback is the same skeleton, chained, so it takes
 * over without fading in again.
 */
export function CoachHelmRouteSkeleton() {
  const role = useGolfUserOptional()?.role;
  const params = useSearchParams();
  const which = routeSkeletonFor(role, params);
  if (which === 'ask') return <AskSkeleton />;
  if (which === 'coach-standing' || which === 'coach-deep-dive') {
    // The player's name is not known until the page checks the address against the team, as the route's first skeleton says.
    return which === 'coach-standing' ? <StandingSkeleton coach={{ first: null }} /> : <DiveSkeleton coach={{ first: null }} />;
  }
  if (which === 'standing') return <StandingSkeleton />;
  if (which === 'deep-dive') return <DiveSkeleton />;
  return <CoachHelmSkeleton view={which} />;
}
