'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayShotEntry  (CALM SINGLE PANEL)
 * ----------------------------------------------------------------------------
 * PRESENTATION re-skin of the legacy live per-shot entry column. Every
 * conditional, option list, validation gate and dispatch is copied VERBATIM
 * from ShotTrackingComprehensive.tsx — only the layout/tokens change: the
 * separate boxed cards are now ONE calm panel of hairline-divided sections, the
 * option chips are thumb-sized, and the Next-Shot / Penalty / Undo actions live
 * in a sticky bottom bar (thumb zone).
 *
 * RISKY BEHAVIORS PRESERVED:
 *  • Result selection ONLY ever goes through `onResultSelect` → HANDLE_RESULT_SELECT.
 *  • The distance input is a REAL focusable native <input ref={distanceInputRef}>
 *    (min-w-0 so it can shrink — never widens the layout).
 *  • Distance bail-on-zero / green ≤150ft live in the parent.
 *  • ApproachMissSelector / PuttMissTagSelector reused AS-IS.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { Surface, Inset } from '@/components/fairway/surfaces/surface';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { ApproachMissSelector } from '@/components/golf/approach-miss-selector';
import { PuttMissTagSelector } from '@/components/golf/putt-miss-tag-selector';
import { calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { displayToFeet, displayToYards, yardsToDisplay } from '@/lib/golf/distance-units';
import type { ShotRecord, RoundHole, PuttMissTag, ApproachMissDirection } from '@/lib/types/golf';
import type { ShotAction } from '@/hooks/golf/use-shot-state-machine';

interface FairwayShotEntryProps {
  currentHole: RoundHole;
  currentShot: number;
  shotHistory: ShotRecord[];
  isTeeShot: boolean;
  isPutting: boolean;
  isApproachOrAroundGreen: boolean;
  usedDriver: boolean | null;
  resultOfShot: ShotRecord['result'] | null;
  missDirection: string | null;
  puttBreak: ShotRecord['puttBreak'] | null;
  puttSlope: ShotRecord['puttSlope'] | null;
  puttMissTags: PuttMissTag[];
  approachMissDirection: ApproachMissDirection | null;
  distanceToHole: number;
  distanceUnit: 'yards' | 'feet';
  distanceAfterShot: string;
  distanceAfterUnit: 'yards' | 'feet';
  isHoleComplete: boolean;
  undoSaving: boolean;
  showUndoConfirm: boolean;
  distanceInputRef: React.RefObject<HTMLInputElement | null>;
  dispatch: React.Dispatch<ShotAction>;
  onResultSelect: (result: string) => void;
  isReadyForNextShot: () => boolean;
  onNextShot: () => void;
  onAddPenalty: () => void;
  onUndoLastShot: () => void;
}

/* Shared chip styles — thumb-sized selectable options */
const segWrap = 'flex w-full gap-2 rounded-fw-md border border-border-subtle bg-surface-sunken p-1';
const segBtn = (active: boolean) =>
  cn(
    'min-h-[48px] flex-1 rounded-fw-sm px-2 font-fw-sans text-sm font-medium transition-colors',
    'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-inset',
    active ? 'bg-accent-700 text-text-on-accent shadow-flat' : 'text-text-secondary hover:text-text-primary',
  );

function Section({
  label,
  labelFor,
  hint,
  tint,
  children,
}: {
  label: string;
  /** When set, the section heading becomes a real <label htmlFor> bound to the
   *  control's id, so the visible label is programmatically associated with the
   *  input (WCAG 1.3.1 / 3.3.2) — not just visually adjacent. */
  labelFor?: string;
  hint?: React.ReactNode;
  tint?: boolean;
  children: React.ReactNode;
}) {
  const headingClass =
    'font-fw-sans text-eyebrow font-medium uppercase tracking-wider text-text-tertiary';
  return (
    <div className={cn('px-5 py-5', tint && 'bg-accent-50/40')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        {labelFor ? (
          <label htmlFor={labelFor} className={headingClass}>{label}</label>
        ) : (
          <p className={headingClass}>{label}</p>
        )}
        {hint}
      </div>
      {children}
    </div>
  );
}

export function FairwayShotEntry({
  currentHole,
  currentShot,
  shotHistory,
  isTeeShot,
  isPutting,
  isApproachOrAroundGreen,
  usedDriver,
  resultOfShot,
  missDirection,
  puttBreak,
  puttSlope,
  puttMissTags,
  approachMissDirection,
  distanceToHole,
  distanceUnit,
  distanceAfterShot,
  distanceAfterUnit,
  isHoleComplete,
  undoSaving,
  showUndoConfirm,
  distanceInputRef,
  dispatch,
  onResultSelect,
  isReadyForNextShot,
  onNextShot,
  onAddPenalty,
  onUndoLastShot,
}: FairwayShotEntryProps) {
  // Distance-unit preference — mirrors the parent's read so the entry panel's
  // labels, quick-select chips and shot-distance preview stay honest for
  // meters-preference players (input parsing/write-time conversion happens in
  // the parent's handleNextShot; this component only needs display awareness).
  const { distancePref } = useDistanceUnits();
  const isMeters = distancePref === 'meters';

  const ready = isReadyForNextShot();
  const distanceInvalid =
    !!distanceAfterShot && (!Number.isFinite(parseFloat(distanceAfterShot)) || parseFloat(distanceAfterShot) < 0);

  // Visibility of system status (Nielsen #1) + error prevention/recovery (#5/#9):
  // when the primary action is disabled, name the ONE requirement still missing so
  // the user knows what to do. The order/conditions mirror isReadyForNextShot()
  // VERBATIM so the hint can never disagree with the disabled state.
  const nextShotBlocker: string | null = (() => {
    if (ready) return null;
    if (!resultOfShot) return isPutting ? 'Select a putt result' : 'Select a shot result';
    if (isTeeShot && currentHole.par !== 3 && usedDriver === null) return 'Choose driver or non-driver';
    if (isPutting && !puttBreak) return 'Select a putt break';
    if (isTeeShot && ['rough', 'sand', 'other'].includes(resultOfShot) && !missDirection)
      return 'Choose a miss direction';
    if (isApproachOrAroundGreen && !['green', 'hole'].includes(resultOfShot) && !approachMissDirection)
      return 'Choose a miss direction';
    if (resultOfShot !== 'hole') {
      const trimmed = distanceAfterShot.trim();
      if (!trimmed) return isPutting ? 'Enter the leave distance' : 'Enter the distance remaining';
      const parsed = parseFloat(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) return 'Enter a valid distance';
      if (resultOfShot === 'green') {
        const afterInFeet = isMeters
          ? displayToFeet(parsed, 'meters')
          : (distanceAfterUnit === 'feet' ? parsed : parsed * 3);
        if (afterInFeet > 150) return isMeters ? 'Green proximity must be under 46 m' : 'Green proximity must be under 150 ft';
      }
    }
    return 'Complete the required fields above';
  })();

  // Distance-after unit is DETERMINED by context, never a free toggle. This kills the
  // footgun that let putts / on-green proximity be stored in yards — the unit-blend that
  // inflated approach-proximity stats. On the green (a putt) or a shot that finished on
  // the green is measured in FEET; everything else (the distance still remaining) in YARDS.
  const lockedAfterUnit: 'yards' | 'feet' = isPutting || resultOfShot === 'green' ? 'feet' : 'yards';
  const distanceLabel = isPutting
    ? `Leave distance (${isMeters ? 'm' : 'ft'})`
    : resultOfShot === 'green'
      ? `Proximity to hole (${isMeters ? 'm' : 'ft'})`
      : `Distance remaining (${isMeters ? 'm' : 'yds'})`;

  return (
    <>
      <Surface elevation="shadow" padding="none" className="overflow-hidden">
        <div className="divide-y divide-border-subtle">
          {/* Club Selection (Tee Shot Par 4/5) */}
          {isTeeShot && currentHole.par !== 3 && (
            <Section label="Club off tee">
              <div className={segWrap} role="radiogroup" aria-label="Club off tee">
                <Button variant="ghost"
                  type="button"
                  onClick={() => dispatch({ type: 'SET_DRIVER', payload: true })}
                  role="radio"
                  aria-checked={usedDriver === true}
                  className={segBtn(usedDriver === true)}
                >
                  Driver
                </Button>
                <Button variant="ghost"
                  type="button"
                  onClick={() => dispatch({ type: 'SET_DRIVER', payload: false })}
                  role="radio"
                  aria-checked={usedDriver === false}
                  className={segBtn(usedDriver === false)}
                >
                  Non-Driver
                </Button>
              </div>
            </Section>
          )}

          {/* Putt Details (FIRST - when putting) */}
          {isPutting && (
            <Section
              label="Putting details"
              tint
              hint={<StatusPill tone="accent" dot={false} size="sm">Fill first</StatusPill>}
            >
              <div className="space-y-4">
                <div>
                  <p className="mb-2 font-fw-sans text-xs font-medium uppercase tracking-wide text-text-tertiary">Break</p>
                  <div className={segWrap} role="radiogroup" aria-label="Putt break direction">
                    {[{ v: 'left_to_right', l: 'L → R' }, { v: 'straight', l: 'Straight' }, { v: 'right_to_left', l: 'R → L' }, { v: 'multiple', l: 'Mult.' }].map((b) => (
                      <Button variant="ghost"
                        key={b.v}
                        type="button"
                        onClick={() => dispatch({ type: 'SET_PUTT_BREAK', payload: b.v as ShotRecord['puttBreak'] })}
                        role="radio"
                        aria-checked={puttBreak === b.v}
                        className={segBtn(puttBreak === b.v)}
                      >
                        {b.l}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 font-fw-sans text-xs font-medium uppercase tracking-wide text-text-tertiary">Slope</p>
                  <div className={segWrap} role="radiogroup" aria-label="Putt slope">
                    {[{ v: 'uphill', l: 'Uphill' }, { v: 'level', l: 'Level' }, { v: 'downhill', l: 'Down' }, { v: 'severe', l: 'Severe' }].map((s) => (
                      <Button variant="ghost"
                        key={s.v}
                        type="button"
                        onClick={() => dispatch({ type: 'SET_PUTT_SLOPE', payload: s.v as ShotRecord['puttSlope'] })}
                        role="radio"
                        aria-checked={puttSlope === s.v}
                        className={segBtn(puttSlope === s.v)}
                      >
                        {s.l}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* Shot Result - Context-Aware */}
          <Section label={isPutting ? 'Putt result' : 'Shot result'}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={isPutting ? 'Putt result' : 'Shot result'}>
              {(() => {
                const formatLieLabel = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
                // VERBATIM option-set logic from legacy.
                const isFirstShotPar3 = currentShot === 1 && currentHole.par === 3;
                let options: string[];
                if (isPutting) {
                  options = ['hole', 'green', 'rough', 'sand'];
                } else if (isTeeShot && currentHole.par !== 3) {
                  options = ['fairway', 'rough', 'sand', 'green', 'hole', 'other'];
                } else if ((isTeeShot && currentHole.par === 3) || isFirstShotPar3) {
                  options = ['green', 'rough', 'sand', 'hole', 'other'];
                } else {
                  options = ['fairway', 'rough', 'sand', 'green', 'hole', 'other'];
                }
                return options.map((r) => {
                  const isRareTeeResult = (isTeeShot || isFirstShotPar3) && (r === 'hole' || (r === 'green' && currentHole.par !== 3));
                  const isRarePuttResult = isPutting && (r === 'rough' || r === 'sand');
                  const isSubtle = isRareTeeResult || isRarePuttResult;
                  const isSelected = resultOfShot === r;
                  return (
                    <Button variant="ghost"
                      key={r}
                      type="button"
                      onClick={() => onResultSelect(r)}
                      role="radio"
                      aria-checked={isSelected}
                      className={cn(
                        'min-h-[52px] rounded-fw-md px-3 font-fw-sans text-sm font-medium transition-colors',
                        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                        isSelected
                          ? 'bg-accent-700 text-text-on-accent shadow-flat ring-1 ring-accent-600'
                          : isSubtle
                            ? 'bg-surface-sunken text-text-tertiary ring-1 ring-border-subtle hover:bg-surface-tint hover:text-text-secondary hover:ring-border-strong'
                            : 'bg-surface-sunken text-text-primary ring-1 ring-border-subtle hover:bg-surface-tint hover:ring-border-strong',
                      )}
                    >
                      {formatLieLabel(r)}
                      {r === 'green' && !isTeeShot && !isPutting && (
                        <span className={cn('block text-[0.6875rem] font-normal leading-tight', isSelected ? 'text-white/80' : 'text-text-tertiary')}>(not fringe)</span>
                      )}
                      {r === 'hole' && (isTeeShot || isFirstShotPar3) && (
                        <span className={cn('block text-[0.6875rem] font-normal leading-tight', isSelected ? 'text-white/80' : 'text-text-tertiary')}>(ace!)</span>
                      )}
                      {isRarePuttResult && (
                        <span className={cn('block text-[0.6875rem] font-normal leading-tight', isSelected ? 'text-white/80' : 'text-text-tertiary')}>(rolled off)</span>
                      )}
                    </Button>
                  );
                });
              })()}
            </div>
          </Section>

          {/* Miss Direction */}
          {((isTeeShot && ['rough', 'sand', 'other'].includes(resultOfShot || '')) ||
            (isApproachOrAroundGreen && resultOfShot && !['green', 'hole'].includes(resultOfShot)) ||
            (isPutting && resultOfShot && resultOfShot !== 'hole')) && (
            <Section label="Miss direction">
              {isTeeShot && (
                <div className={segWrap} role="radiogroup" aria-label="Miss direction">
                  {['left', 'right'].map((d) => (
                    <Button variant="ghost"
                      key={d}
                      type="button"
                      onClick={() => dispatch({ type: 'SET_MISS_DIRECTION', payload: d })}
                      role="radio"
                      aria-checked={missDirection === d}
                      className={segBtn(missDirection === d)}
                    >
                      {d === 'left' ? '← ' : ''}{d.charAt(0).toUpperCase() + d.slice(1)}{d === 'right' ? ' →' : ''}
                    </Button>
                  ))}
                </div>
              )}
              {isApproachOrAroundGreen && resultOfShot && !['green', 'hole'].includes(resultOfShot) && (
                <ApproachMissSelector
                  selectedDirection={approachMissDirection}
                  onDirectionChange={(dir) => dispatch({ type: 'SET_APPROACH_MISS', payload: { direction: dir } })}
                />
              )}
              {isPutting && resultOfShot && resultOfShot !== 'hole' && (
                <PuttMissTagSelector
                  selectedTags={puttMissTags}
                  onTagsChange={(tags) => dispatch({ type: 'SET_PUTT_MISS_TAGS', payload: tags })}
                />
              )}
            </Section>
          )}

          {/* Distance Remaining - Final Step (if not holed) */}
          {resultOfShot && resultOfShot !== 'hole' && (
            <Section
              label={distanceLabel}
              labelFor="fw-distance-after"
              tint
              hint={<StatusPill tone="accent" dot={false} size="sm">Required</StatusPill>}
            >
              <div className="space-y-3">
                {/* REAL focusable native input — the state-machine auto-focus effect targets this ref. */}
                {/* eslint-disable-next-line helm/no-raw-input */}
                <input
                  id="fw-distance-after"
                  ref={distanceInputRef}
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  aria-label={isMeters
                    ? (isPutting ? 'Leave distance in meters' : lockedAfterUnit === 'feet' ? 'Proximity to hole in meters' : 'Distance remaining to hole in meters')
                    : (isPutting ? 'Leave distance in feet' : lockedAfterUnit === 'feet' ? 'Proximity to hole in feet' : 'Distance remaining to hole in yards')}
                  value={distanceAfterShot}
                  onChange={(e) => dispatch({ type: 'SET_DISTANCE_AFTER', payload: e.target.value })}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  placeholder="0"
                  className={cn(
                    'h-16 w-full min-w-0 rounded-fw-md border-2 bg-surface px-4 text-center font-fw-display text-display font-light tracking-[-0.025em] tabular-nums text-text-primary transition-colors placeholder:text-text-tertiary/50 focus:outline-none focus:ring-4',
                    distanceInvalid
                      ? 'border-fw-danger focus:border-fw-danger focus:ring-fw-danger/15'
                      : 'border-accent-300 focus:border-accent-500 focus:ring-accent-500/15',
                  )}
                />
                {distanceInvalid && <p className="font-fw-sans text-sm text-fw-danger-ink">Please enter a valid distance</p>}

                {isPutting && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {/* In meters-mode the quick-select values ARE meters (converted to
                        canonical feet at the write boundary in the parent); in
                        yards-mode they're already-canonical feet. */}
                    {(isMeters ? [1, 2, 3, 5, 9, 12] : [5, 10, 15, 20, 30, 40]).map((val) => (
                      <Button variant="ghost"
                        key={val}
                        type="button"
                        onClick={() => {
                          dispatch({ type: 'SET_DISTANCE_AFTER', payload: String(val) });
                          dispatch({ type: 'SET_DISTANCE_AFTER_UNIT', payload: 'feet' });
                        }}
                        className={cn(
                          'min-h-[44px] rounded-fw-md transition-colors',
                          'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                          distanceAfterShot === String(val) && distanceAfterUnit === 'feet'
                            ? 'bg-accent-700 text-text-on-accent shadow-flat'
                            : 'border border-accent-200 bg-surface text-accent-700 hover:bg-accent-50',
                        )}
                      >
                        {val}{isMeters ? 'm' : 'ft'}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Unit is locked by context — no manual toggle. Putts & on-green proximity
                    are always feet; the distance still remaining is always yards. This is
                    the entry-side half of the unit-integrity fix (the write path enforces
                    the same rule), so a value can never be stored in the wrong unit. In
                    meters-mode the DISPLAY unit is meters — the write boundary still
                    converts back to the canonical feet/yards shown here. */}
                <div className="flex items-center justify-center gap-2 rounded-fw-md border border-border-subtle bg-surface-sunken px-3 py-2.5">
                  <span className="font-fw-sans text-xs font-medium uppercase tracking-wide text-text-tertiary">Measured in</span>
                  <span className="font-fw-sans text-sm font-semibold uppercase tracking-wide text-text-secondary">
                    {isMeters ? 'Meters' : lockedAfterUnit === 'feet' ? 'Feet' : 'Yards'}
                  </span>
                </div>

                {distanceAfterShot && (
                  <Inset padding="sm" className="flex items-center justify-between px-4 py-2.5">
                    <span className="font-fw-sans text-xs font-medium uppercase tracking-wide text-text-secondary">Shot distance</span>
                    <span className="font-fw-mono text-body-lg font-medium tabular-nums text-accent-700">
                      {(() => {
                        // Convert the user-typed value to yards for the geometry calc —
                        // meters-mode input must go through the same conversion boundary
                        // the write path uses, or this preview (and the stored value)
                        // silently double as feet/yards.
                        const rawParsed = parseFloat(distanceAfterShot) || 0;
                        const afterInYards = isMeters
                          ? (lockedAfterUnit === 'feet' ? displayToFeet(rawParsed, 'meters') / 3 : displayToYards(rawParsed, 'meters'))
                          : (lockedAfterUnit === 'feet' ? rawParsed / 3 : rawParsed);
                        const shotYards = Math.round(calculateShotDistanceWithDirection(
                          distanceUnit === 'feet' ? distanceToHole / 3 : distanceToHole,
                          afterInYards,
                          isApproachOrAroundGreen ? (approachMissDirection || missDirection) : missDirection,
                        ));
                        return isMeters ? `~${yardsToDisplay(shotYards, 'meters')} m` : `~${shotYards} yds`;
                      })()}
                    </span>
                  </Inset>
                )}
              </div>
            </Section>
          )}
        </div>
      </Surface>

      {/* Max score warning */}
      {currentShot >= 12 && !isHoleComplete && (
        <InlineNotice tone="warning">
          {currentShot >= 15
            ? 'Maximum recordable score (15) reached. Please hole out or pick up.'
            : `Shot ${currentShot} of 15 max — ${15 - currentShot} shot${15 - currentShot !== 1 ? 's' : ''} remaining before the limit.`}
        </InlineNotice>
      )}

      {/* Undo Confirmation */}
      {showUndoConfirm && shotHistory.length > 0 && (
        <InlineNotice
          tone="warning"
          title={`Undo shot ${shotHistory.length}?`}
          action={
            <>
              <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'HIDE_UNDO_CONFIRM' })}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={onUndoLastShot} disabled={undoSaving}>
                {undoSaving ? 'Removing...' : 'Confirm'}
              </Button>
            </>
          }
        >
          {shotHistory[shotHistory.length - 1]!.isPenalty
            ? `Penalty (${shotHistory[shotHistory.length - 1]!.penaltyType || 'unknown'})`
            : `${shotHistory[shotHistory.length - 1]!.shotType.replace('_', ' ')} → ${shotHistory[shotHistory.length - 1]!.result}`}
        </InlineNotice>
      )}

      {/* ── Sticky action bar (thumb zone) ──────────────────────────────────────
          On mobile it spans the full content width (negative margins) and pins
          to the bottom of the viewport — the natural thumb zone. On desktop the
          two-pane layout makes a viewport-pinned bar feel detached, so it sits
          inline within the entry pane (no negative margins, not sticky). */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-1 border-t border-border-subtle bg-canvas px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-fw-md lg:border lg:bg-surface lg:px-4 lg:pb-3">
        {/* Visibility of system status (Nielsen #1): name the missing requirement
            instead of leaving the primary action silently disabled. */}
        {nextShotBlocker && (
          <p
            id="fw-next-shot-blocker"
            role="status"
            aria-live="polite"
            className="mb-2 text-center font-fw-sans text-caption font-medium text-text-tertiary"
          >
            {nextShotBlocker}
          </p>
        )}
        <Button
          variant="primary"
          fullWidth
          onClick={onNextShot}
          disabled={!ready}
          aria-describedby={nextShotBlocker ? 'fw-next-shot-blocker' : undefined}
          aria-label={resultOfShot === 'hole' ? `Complete hole with score ${currentShot}` : 'Record next shot'}
        >
          {resultOfShot === 'hole' ? `Complete hole · Score ${currentShot}` : 'Next shot →'}
        </Button>
        <div className="mt-2 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onAddPenalty} aria-label="Add penalty stroke">
            + Penalty
          </Button>
          {shotHistory.length > 0 && (
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => dispatch({ type: 'SHOW_UNDO_CONFIRM' })}
              disabled={undoSaving}
              aria-label="Undo last shot"
            >
              {undoSaving ? 'Undoing...' : 'Undo last'}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
