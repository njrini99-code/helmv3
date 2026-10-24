'use client';

import { useChPhone } from '../../../lib/use-phone';
import { Skeleton } from '../../../ui/States';
import { LargeTitleSkeleton } from '../../../ui/LargeTitle';

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

function Chrome({ label, code, chained, brief = 2, coach, children }: { label: string; code: string; chained?: boolean; brief?: 2 | 3; coach?: ChSkeletonCoach; children: React.ReactNode }) {
  const phone = useChPhone();
  // The sub-navigation: a bar the size of the radiogroup (desktop: Board, Standing, Deep dive 249px; a coach's Deep dive
  // and Standing 183px, measured at 1440) or the chip row (phone), where the page puts it.
  const tabs = (
    <div className="ch-hv-sk-tabs">
      <Skeleton width={phone ? '100%' : coach ? 183 : 249} height={phone ? 36 : 38} radius={phone ? 18 : 12} />
    </div>
  );
  return (
    <main className={'ch-hl ch-hv' + (phone ? ' is-phone' : '')} aria-busy="true" aria-label={label} data-skel={chained ? 'chained' : undefined} data-ch-code={code} data-canopy={phone ? undefined : ''}>
      {/* The screen's one h1 while it loads, for the page outline (P013 D8). */}
      <h1 className="ch-sr-only">CoachHelm</h1>
      {phone && tabs}
      {coach ? (
        // The player's header: the eyebrow, the name (the phone's large title, desktop's 44px) and the one line.
        <header className={'ch-hl-h' + (phone ? '' : ' has-aside')} data-canopy-head="">
          <Skeleton width={84} height={11} />
          {phone ? <LargeTitleSkeleton width={176} /> : <Skeleton width={260} height={44} radius={10} />}
          <Skeleton width={phone ? '72%' : 280} height={14} />
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
        <header className="ch-hl-h has-aside" data-canopy-head="">
          <Skeleton width={190} height={44} radius={10} />
          <Skeleton width={360} height={14} />
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
      <Chrome label={labelFor('standing', coach)} code="CH-13470" chained={chained} coach={coach}>
        <div className="ch-hs-sk__hero">
          <Skeleton width="100%" height={HERO_PHONE_390} radius={14} shape="solid" />
        </div>
        <StandingGroupSkeleton rows={4} />
        <StandingGroupSkeleton rows={3} />
        <StandingGroupSkeleton rows={2} />
      </Chrome>
    );
  }
  return (
    <Chrome label={labelFor('standing', coach)} code="CH-13470" chained={chained} coach={coach}>
      <div className="ch-hs-sk__hero">
        <div className="ch-hs-sk__col">
          <Skeleton width={150} height={11} />
          <Skeleton width="86%" height={32} radius={8} />
          <Skeleton width="60%" height={32} radius={8} />
          <Skeleton width="78%" height={13} />
        </div>
      </div>
      <StandingGroupSkeleton rows={4} />
      <StandingGroupSkeleton rows={5} />
      <StandingGroupSkeleton rows={4} />
      <StandingGroupSkeleton rows={4} />
    </Chrome>
  );
}

/** Deep dive: the one-sentence summary, the read ledger and, on desktop, the read beside it (CH-13480). */
export function DiveSkeleton({ chained, coach }: { chained?: boolean; coach?: ChSkeletonCoach } = {}) {
  const phone = useChPhone();
  return (
    <Chrome label={labelFor('deep dive', coach)} code="CH-13480" chained={chained} brief={3} coach={coach}>
      {/* What CoachHelm has found: one sentence (chs-35). */}
      <div className="ch-hd-sk__hero">
        <div className="ch-hd-sk__col">
          <Skeleton width={phone ? '88%' : '52%'} height={phone ? 22 : 26} radius={8} />
        </div>
      </div>
      <div className="ch-hd">
        <div className="ch-hd-rail">
          {[4, 2].map((rows, g) => (
            <div key={g} className="ch-hd-sk__grp">
              {phone ? <PhoneHead w={110} /> : <Skeleton width={110} height={16} radius={6} />}
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="ch-hd-sk__it">
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                    <Skeleton width="38%" height={10} />
                    <Skeleton width="86%" height={14} />
                  </span>
                  <Skeleton width={34} height={16} />
                </div>
              ))}
            </div>
          ))}
        </div>
        {!phone && (
          <div className="ch-hd-sk__dos">
            <Skeleton width={90} height={11} />
            <Skeleton width="78%" height={32} radius={8} />
            <Skeleton width="92%" height={15} />
            <Skeleton width="100%" height={150} radius={14} />
            <Skeleton width="100%" height={112} radius={14} />
            <Skeleton width="100%" height={168} radius={14} />
            <Skeleton width="100%" height={196} radius={14} />
          </div>
        )}
      </div>
    </Chrome>
  );
}
