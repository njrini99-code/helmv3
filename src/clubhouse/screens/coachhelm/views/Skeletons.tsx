'use client';

import { useChPhone } from '../../../lib/use-phone';
import { SkelLine, Skeleton } from '../../../ui/States';
import { LargeTitleSkeleton } from '../../../ui/LargeTitle';
import type { PlayerHelmView } from '../../../data/coachhelm-views-shape';
import { PlayerHelmTabs } from './PlayerHelmTabs';

/**
 * Route loading for the player's views, each in its own final shape and height (Standing's is CH-13470, the Deep dive's CH-13480), so nothing jumps
 * when the read lands. `coachhelm/loading.tsx` cannot see `?view=`, so the route wraps each view in its own Suspense
 * (routes/coachhelm.tsx) and these are the fallbacks.
 *
 * `coach`: a coach's view of one player (spec A), with the player's header: the "CoachHelm" eyebrow over the name, then the one line
 * (class and newest round), and the label says whose page it is. `first` is null until the route knows who the player is (the
 * address only names an id until the scope is checked), and the label says "this player" meanwhile.
 */
export interface ChSkeletonCoach {
  first: string | null;
}

/** "Loading your deep dive", or for a coach "Loading Jonah’s deep dive". */
const labelFor = (what: string, coach: ChSkeletonCoach | undefined) => `Loading ${coach ? (coach.first ? `${coach.first}’s` : 'this player’s') : 'your'} ${what}`;

function Chrome({ label, code, view, chained, brief = 2, coach, children }: { label: string; code: string; view: PlayerHelmView; chained?: boolean; brief?: 2 | 3; coach?: ChSkeletonCoach; children: React.ReactNode }) {
  const phone = useChPhone();
  // The sub-navigation where the page puts it. Desktop: the strip itself, held (inert, hidden from assistive tech), at the view
  // the address names, so it is as wide as the page's (a player's with its Development link) and does not turn from a bar into
  // the control when the read lands. Phone: the chip row's bar.
  const tabs = (
    <div className="ch-hv-sk-tabs">
      {phone ? <Skeleton width="100%" height={36} radius={18} /> : <PlayerHelmTabs active={view} coach={!!coach} held />}
    </div>
  );
  return (
    <main className={'ch-hl ch-hv' + (phone ? ' is-phone' : '')} aria-busy="true" aria-label={label} data-skel={chained ? 'chained' : undefined} data-ch-code={code} data-canopy={phone ? undefined : ''}>
      {/* The screen's one h1 while it loads, for the page outline (P013 D8). */}
      <h1 className="ch-sr-only">CoachHelm</h1>
      {phone && tabs}
      {coach ? (
        // The player's header: the eyebrow, the name (the phone's large title, desktop's title line) and the one line. Desktop
        // lines are the loaded lines' boxes (18, 48, 21: a 163px head, WebKit 1280 and 1440).
        <header className={'ch-hl-h' + (phone ? '' : ' has-aside')} data-canopy-head="">
          {phone ? <Skeleton width={84} height={11} /> : <SkelLine line={18} bar={11} width={72} />}
          {phone ? <LargeTitleSkeleton width={176} /> : <SkelLine line={48} bar={38} width={218} />}
          {phone ? <Skeleton width="72%" height={14} /> : <SkelLine line={21} bar={13} width={264} />}
          {!phone && <div className="ch-hl-h__aside">{tabs}</div>}
        </header>
      ) : phone ? (
        // The phone's intro at its loaded line heights (the Mobile clubhouse pass): the large title (a player's page has no role eyebrow) and the brief under
        // the double rule, in the lines the view's own brief takes at the phone's width (`brief`: the Deep dive's runs to three).
        <header className="ch-hl-h" data-canopy-head="">
          <LargeTitleSkeleton width={176} />
          <span className="ch-hl-sk__line is-two" style={brief === 3 ? { height: 65.25 } : undefined}>
            <Skeleton width="92%" height={13} />
            {brief === 3 && <Skeleton width="96%" height={13} />}
            <Skeleton width="58%" height={13} />
          </span>
        </header>
      ) : (
        // The player's own: the title, and the brief's two lines beside the views (48 and 42: a 166px head).
        <header className="ch-hl-h has-aside" data-canopy-head="">
          <SkelLine line={48} bar={38} width={196} />
          <span className="ch-hv-sk-brief">
            <SkelLine line={21} bar={13} width="96%" />
            <SkelLine line={21} bar={13} width="62%" />
          </span>
          <div className="ch-hl-h__aside">{tabs}</div>
        </header>
      )}
      {children}
    </main>
  );
}

/** One text line's box at its loaded height, with the bar centred in it (the phone's intro and section heads). */
function Line({ h, w, sh, r }: { h: number; w: number | string; sh: number; r?: number }) {
  return (
    <span className="ch-hl-sk__line" style={{ height: h }}>
      <Skeleton width={w} height={sh} radius={r} />
    </span>
  );
}

/** A section's head on the phone: the heading's line under the double rule (drawn by the section), and its caption. */
function PhoneHead({ w, caption = true }: { w: number; caption?: boolean }) {
  return (
    <span className="ch-hv-sk-head">
      <Line h={22.8} w={w} sh={17} r={6} />
      {caption && <Skeleton width="84%" height={12} />}
    </span>
  );
}

function StandingGroupSkeleton({ rows }: { rows: number }) {
  const phone = useChPhone();
  return (
    <div className="ch-hs-sk__g">
      {phone ? (
        <PhoneHead w={150} />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12 }}>
          <Skeleton width={150} height={20} radius={6} />
          <Skeleton width={240} height={12} />
        </div>
      )}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ch-hs-sk__r">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width="62%" height={14} />
            <Skeleton width="44%" height={11} />
          </span>
          <Skeleton width="100%" height={8} radius={4} />
          <Skeleton width="100%" height={30} radius={8} />
        </div>
      ))}
    </div>
  );
}

/** Standing: the green card with what is most to gain, then the groups of stats (CH-13470). */
/** The loaded hero card's height on a 390 phone, measured in Chromium (the ladder took "Most to gain" off it). */
const HERO_PHONE_390 = 256.3;

export function StandingSkeleton({ chained, coach }: { chained?: boolean; coach?: ChSkeletonCoach } = {}) {
  const phone = useChPhone();
  if (phone) {
    // The phone: where you stand's feature card (the headline and the note), then Where strokes go's four rows, then the
    // groups. The card's height is the loaded card's at 390; coachhelm-standing.css follows it at other widths.
    return (
      <Chrome label={labelFor('standing', coach)} code="CH-13470" view="standing" chained={chained} coach={coach}>
        <div className="ch-hs-sk__hero">
          <Skeleton width="100%" height={HERO_PHONE_390} radius={14} shape="solid" />
        </div>
        <StandingGroupSkeleton rows={4} />
        <StandingGroupSkeleton rows={3} />
        <StandingGroupSkeleton rows={2} />
      </Chrome>
    );
  }
  // Desktop: where they stand on the green board it lands as (237px: the window's line over its rule, the two-line headline and
  // its note), then Where strokes go's four ladder rows (the stat and its figure, the bar, "Because"), then the other groups.
  return (
    <Chrome label={labelFor('standing', coach)} code="CH-13470" view="standing" chained={chained} coach={coach}>
      <div className="ch-hs-sk__hero ch-scoreboard ch-sk-on-green is-board">
        <div className="ch-hs-sk__col">
          <span className="ch-hs-sk__k">
            <Skeleton width={110} height={11} />
            <Skeleton width={290} height={11} />
          </span>
          <SkelLine line={37.5} bar={28} width="58%" />
          <SkelLine line={37.5} bar={28} width="44%" />
          <span className="ch-hs-sk__sub">
            <SkelLine line={19} bar={12} width="44%" />
            <SkelLine line={19} bar={12} width="15%" />
          </span>
        </div>
      </div>
      <div className="ch-hs-sk__g is-ladder">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 37, paddingBottom: 12, boxSizing: 'border-box' }}>
          <Skeleton width={160} height={20} radius={6} />
          <Skeleton width={360} height={12} />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ch-hs-sk__r is-ld">
            <span className="ch-hs-sk__ldh">
              <Skeleton width={[74, 70, 112, 56][i]} height={13} />
              <Skeleton width={30} height={14} />
            </span>
            <Skeleton width="100%" height={4} radius={2} />
            <span className="ch-hs-sk__ldh is-why">
              <Skeleton width={60} height={12} />
              <Skeleton width={96} height={12} />
            </span>
          </div>
        ))}
      </div>
      <StandingGroupSkeleton rows={2} />
      <StandingGroupSkeleton rows={4} />
    </Chrome>
  );
}

/** Deep dive: the one-sentence summary, the read ledger and, on desktop, the read beside it (CH-13480). */
export function DiveSkeleton({ chained, coach }: { chained?: boolean; coach?: ChSkeletonCoach } = {}) {
  const phone = useChPhone();
  return (
    <Chrome label={labelFor('deep dive', coach)} code="CH-13480" view="deep-dive" chained={chained} brief={3} coach={coach}>
      {/* What CoachHelm has found: one sentence (chs-35), two lines on desktop at its 40ch measure. */}
      <div className="ch-hd-sk__hero">
        <div className="ch-hd-sk__col">
          {phone ? (
            <Skeleton width="88%" height={22} radius={8} />
          ) : (
            <span>
              <SkelLine line={28} bar={20} width={330} />
              <SkelLine line={28} bar={20} width={300} />
            </span>
          )}
        </div>
      </div>
      <div className="ch-hd">
        <div className="ch-hd-rail">
          {[3, 2].map((rows, g) => (
            <div key={g} className="ch-hd-sk__grp">
              {phone ? <PhoneHead w={110} /> : <Skeleton width={g ? 124 : 60} height={16} radius={6} />}
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="ch-hd-sk__it">
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                    <Skeleton width="86%" height={14} />
                    {!phone && <Skeleton width="62%" height={14} />}
                    <Skeleton width="38%" height={10} />
                  </span>
                  <Skeleton width={34} height={16} />
                </div>
              ))}
            </div>
          ))}
        </div>
        {!phone && (
          // The open read: its category and stance over the rule, the claim, then What, Why, Next and When as label rows on
          // soft rules, the actions, and What was measured.
          <div className="ch-hd-sk__dos">
            <span className="ch-hd-sk__k">
              <Skeleton width={128} height={12} />
              <Skeleton width={46} height={12} />
            </span>
            <SkelLine line={48} bar={30} width="56%" />
            {[66, 66, 45, 45].map((h, i) => (
              <span key={i} className="ch-hd-sk__row" style={{ height: h }}>
                <Skeleton width={34} height={12} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <Skeleton width={i < 2 ? '86%' : '40%'} height={13} />
                  {i < 2 && <Skeleton width="48%" height={13} />}
                </span>
              </span>
            ))}
            <span className="ch-hd-sk__acts">
              <Skeleton width={156} height={38} radius={10} />
              <Skeleton width={88} height={38} radius={10} />
              <Skeleton width={136} height={38} radius={10} />
            </span>
            <Skeleton width="100%" height={196} radius={14} />
          </div>
        )}
      </div>
    </Chrome>
  );
}
