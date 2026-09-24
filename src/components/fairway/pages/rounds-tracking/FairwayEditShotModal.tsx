'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayEditShotModal
 * ----------------------------------------------------------------------------
 * PRESENTATION-ONLY re-skin of the legacy edit-shot modal (legacy lines
 * ~1525-2003). EVERY conditional + the Result onClick auto-derivation block
 * (legacy ~1735-1762: green→feet, hole→'0'+feet, switch-away→yards, approach
 * lie-type derive, green/hole null-outs) is copied VERBATIM. The save / delete
 * logic lives in useEditShotModal; this only dispatches + calls those handlers.
 *
 * NOTE: the edit-modal distance inputs are NOT the auto-focus target (only the
 * live-entry distanceInputRef is), so token-styled native inputs are fine here.
 * ========================================================================== */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { Inset } from '@/components/fairway/surfaces/surface';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { ApproachMissSelector } from '@/components/golf/approach-miss-selector';
import { PuttMissTagSelector } from '@/components/golf/putt-miss-tag-selector';
import { calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';
import type { ShotRecord } from '@/lib/types/golf';
import type { ShotAction, EditFormData } from '@/hooks/golf/use-shot-state-machine';
import {
  validateShot,
  validateShotContinuity,
  type RoundEntryIssue,
  type ValidatableShot,
} from '@/lib/golf/round-entry-validation';

/** The hole an edited shot belongs to — what the shared shot rules judge against. */
export interface EditShotHoleContext {
  holeNumber: number;
  par: number;
  yardage?: number | null;
}

/**
 * RE-S5: the edit modal saved whatever was typed — a negative distance, or a
 * shot that left the ball further away — with no check at all, while the live
 * entry panel ran the shared rules on the same shot. Run those rules here too:
 * malformed or negative distances block; the shared `confirm` rules (further
 * away than before, a shot that doesn't start where the last one finished, a
 * 400+ yd drive onto the green) ask once; the shared `block` rules block.
 */
export function editedShotIssues(
  form: EditFormData,
  shot: ShotRecord,
  hole?: EditShotHoleContext,
  shotHistory?: readonly ShotRecord[],
): RoundEntryIssue[] {
  if (form.isPenalty || shot.isPenalty) return [];
  const blockMsg = (message: string): RoundEntryIssue => ({
    rule: 'distance_not_decreasing',
    severity: 'block',
    message,
    holeNumber: hole?.holeNumber,
    shotNumber: shot.shotNumber,
  });
  const before = Number.parseFloat(form.distanceToHoleBefore);
  if (form.distanceToHoleBefore.trim() === '' || !Number.isFinite(before)) {
    return [blockMsg('Enter the distance to the hole before this shot.')];
  }
  if (before < 0) return [blockMsg("The distance before the shot can't be negative.")];
  const holed = form.result === 'hole';
  const after = holed ? 0 : Number.parseFloat(form.distanceToHoleAfter);
  if (!holed && (form.distanceToHoleAfter.trim() === '' || !Number.isFinite(after))) {
    return [blockMsg('Enter the distance to the hole after this shot.')];
  }
  if (after < 0) return [blockMsg("The distance after the shot can't be negative.")];
  if (!hole) return [];

  const candidate: ValidatableShot = {
    shotNumber: shot.shotNumber,
    shotType: shot.shotType,
    distanceToHoleBefore: before,
    distanceUnitBefore: form.distanceUnitBefore,
    result: form.result,
    distanceToHoleAfter: after,
    distanceUnitAfter: form.distanceUnitAfter,
    isPenalty: form.isPenalty,
    lieBefore: form.lieBefore,
    missDirection: form.missDirection,
    approachMissDirection: form.approachMissDirection,
    puttMissTags: form.puttMissTags,
  };
  const issues = validateShot(candidate, hole);
  if (shotHistory && shotHistory.length > 1) {
    const chain = shotHistory.map((s) => (s.shotNumber === shot.shotNumber ? candidate : (s as ValidatableShot)));
    issues.push(
      ...validateShotContinuity(chain, hole).filter(
        (i) => i.shotNumber === shot.shotNumber || i.shotNumber === shot.shotNumber + 1,
      ),
    );
  }
  return issues;
}

interface FairwayEditShotModalProps {
  open: boolean;
  editingShot: ShotRecord;
  editFormData: EditFormData;
  showDeleteConfirm: boolean;
  editSaving: boolean;
  editError: string | null;
  dispatch: React.Dispatch<ShotAction>;
  updateEditForm: (updates: Partial<EditFormData>) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  /** The hole this shot belongs to; enables the shared shot rules (RE-S5). */
  hole?: EditShotHoleContext;
  /** The hole's shots, for the "starts where the last one finished" check. */
  shotHistory?: readonly ShotRecord[];
}

const sectionLabel = 'mb-3 font-fw-sans text-eyebrow font-medium uppercase tracking-wider text-text-secondary';

const PENALTY_OPTIONS = [
  { v: 'ob', l: 'Out of Bounds' },
  { v: 'water', l: 'Water Hazard' },
  { v: 'unplayable', l: 'Unplayable Lie' },
  { v: 'lost', l: 'Lost Ball' },
];

/** Selected vs default segment/grid button styling shared across the modal. */
function gridBtn(selected: boolean): string {
  return cn(
    'min-h-[48px] rounded-fw-md py-3 font-fw-sans text-sm font-medium transition-colors',
    'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    selected
      ? 'bg-accent-fill text-text-on-accent-fill shadow-flat ring-1 ring-accent-600'
      : 'bg-surface-sunken text-text-primary ring-1 ring-border-subtle hover:ring-border-strong',
  );
}

export function FairwayEditShotModal({
  open,
  editingShot,
  editFormData,
  showDeleteConfirm,
  editSaving,
  editError,
  dispatch,
  updateEditForm,
  onClose,
  onSave,
  onDelete,
  hole,
  shotHistory,
}: FairwayEditShotModalProps) {
  // The issue currently shown for this form. A `confirm` issue already shown
  // turns the next Save into "save anyway"; any edit re-arms the check.
  const [issue, setIssue] = useState<RoundEntryIssue | null>(null);
  const [checkedForm, setCheckedForm] = useState(editFormData);
  if (checkedForm !== editFormData) {
    setCheckedForm(editFormData);
    if (issue) setIssue(null);
  }

  const handleSave = () => {
    const issues = editedShotIssues(editFormData, editingShot, hole, shotHistory);
    const blocking = issues.find((i) => i.severity === 'block');
    if (blocking) {
      setIssue(blocking);
      return;
    }
    const confirm = issues.find((i) => i.severity === 'confirm');
    if (confirm && issue?.message !== confirm.message) {
      setIssue(confirm);
      return;
    }
    setIssue(null);
    onSave();
  };

  return (
    <ModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="md"
      title={`Edit shot ${editingShot.shotNumber}`}
      hideTitle
      hideClose
    >
      {/* Modal Header */}
      <div className="sticky top-0 z-10 rounded-t-fw-lg border-b border-border-subtle bg-surface px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="font-fw-display text-body-lg font-medium tracking-[-0.012em] text-text-primary">
            Edit Shot {editingShot.shotNumber}
          </h2>
          <IconButton variant="ghost" onClick={onClose} aria-label="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </IconButton>
        </div>
        {editError && (
          <div className="mt-3">
            <InlineNotice tone="danger">{editError}</InlineNotice>
          </div>
        )}
        {issue && !showDeleteConfirm && (
          <div className="mt-3" data-slot="edit-shot-issue">
            <InlineNotice tone={issue.severity === 'block' ? 'danger' : 'warning'}>{issue.message}</InlineNotice>
          </div>
        )}
      </div>

      {/* Modal Body */}
      <div
        className="min-h-0 flex-auto space-y-5 overflow-y-auto overscroll-contain touch-pan-y px-6 py-4 pb-6"
        style={{ WebkitOverflowScrolling: 'touch' }}
        data-scroll-container
      >
        {showDeleteConfirm ? (
          <div className="space-y-4">
            <InlineNotice tone="danger" title="Are you sure you want to delete this shot?">
              This action cannot be undone. Shot numbers will be resequenced.
            </InlineNotice>
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => dispatch({ type: 'HIDE_DELETE_CONFIRM' })} disabled={editSaving}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={onDelete} disabled={editSaving} busy={editSaving}>
                {editSaving ? 'Deleting...' : 'Delete Shot'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Shot Type Info */}
            <Inset padding="sm" className="flex items-center gap-3">
              <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-wide text-text-tertiary">Type:</span>
              <span className="font-fw-sans text-sm font-medium capitalize text-text-secondary">
                {editingShot.isPenalty ? 'Penalty' : editingShot.shotType.replace('_', ' ')}
              </span>
            </Inset>

            {/* Penalty Shot Edit */}
            {editFormData.isPenalty ? (
              <div>
                <p className={sectionLabel}>Penalty Type</p>
                <div className="space-y-2">
                  {PENALTY_OPTIONS.map((p) => (
                    <Button variant="ghost"
                      key={p.v}
                      type="button"
                      onClick={() => updateEditForm({ penaltyType: p.v })}
                      className={cn(
                        'w-full rounded-fw-md px-4 py-3 text-left font-fw-sans text-sm font-medium transition-colors',
                        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                        editFormData.penaltyType === p.v
                          ? 'bg-fw-danger text-text-on-accent shadow-flat ring-1 ring-fw-danger'
                          : 'bg-surface-sunken text-text-primary ring-1 ring-border-subtle hover:bg-fw-danger-bg hover:ring-fw-danger/25',
                      )}
                    >
                      {p.l}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Club Type (for non-penalty tee shots) */}
                {editingShot.shotType === 'tee' && (
                  <div>
                    <p className={sectionLabel}>Club</p>
                    <div className="inline-flex w-full gap-1 rounded-fw-md border border-border-subtle bg-surface-sunken p-1">
                      <Button variant="ghost" type="button" onClick={() => updateEditForm({ clubType: 'driver' })} className={cn('flex-1', gridBtn(editFormData.clubType === 'driver'))}>
                        Driver
                      </Button>
                      <Button variant="ghost" type="button" onClick={() => updateEditForm({ clubType: 'non_driver' })} className={cn('flex-1', gridBtn(editFormData.clubType === 'non_driver'))}>
                        Non-Driver
                      </Button>
                    </div>
                  </div>
                )}

                {/* Lie Before */}
                <div>
                  <p className={sectionLabel}>Lie Before</p>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {(['tee', 'fairway', 'rough', 'sand', 'green', 'other'] as const).map((lie) => {
                      const lieLabel = lie.charAt(0).toUpperCase() + lie.slice(1);
                      return (
                        <Button variant="ghost" key={lie} type="button" onClick={() => updateEditForm({ lieBefore: lie, distanceUnitBefore: lie === 'green' ? 'feet' : 'yards' })} className={gridBtn(editFormData.lieBefore === lie)}>
                          {lieLabel}
                          {lie === 'green' && (
                            <span className={cn('block text-xs font-normal leading-tight', editFormData.lieBefore === 'green' ? 'text-white/80' : 'text-text-tertiary')}>(putting surface)</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Distance Before */}
                <div>
                  <p className={sectionLabel}>Distance Before</p>
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line helm/no-raw-input */}
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      aria-label="Distance to hole before shot"
                      value={editFormData.distanceToHoleBefore}
                      onChange={(e) => updateEditForm({ distanceToHoleBefore: e.target.value })}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      className="h-12 flex-1 rounded-fw-md border-2 border-border-subtle bg-surface px-4 text-center font-fw-mono text-body-lg font-medium tabular-nums text-text-primary transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/15"
                    />
                    {/* Unit is locked by the lie (no manual toggle): on the green → feet,
                        otherwise yards. Re-tapping the lie above re-derives it. */}
                    <div className="inline-flex items-center rounded-fw-md border border-border-subtle bg-surface-sunken px-3.5 py-2">
                      <span className="font-fw-sans text-sm font-semibold uppercase tracking-wide text-accent-700">
                        {editFormData.distanceUnitBefore === 'feet' ? 'Ft' : 'Yds'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Result */}
                <div>
                  <p className={sectionLabel}>Result</p>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {(['fairway', 'rough', 'sand', 'green', 'hole', 'other'] as const).map((r) => {
                      const resultLabel = r.charAt(0).toUpperCase() + r.slice(1);
                      return (
                        <Button variant="ghost"
                          key={r}
                          type="button"
                          onClick={() => {
                            // ── Auto-derivation block (was legacy ~1735-1762; the unit
                            //    branch is now fully deterministic to match the entry
                            //    write guard — see FairwayShotTracking handleNextShot). ──
                            if (!editFormData) return;
                            const updates: Partial<EditFormData> = { result: r };
                            // Distance-after unit is DETERMINED by context, never free-toggled:
                            // on the green (or holed) → FEET; otherwise the distance remaining
                            // is YARDS, except a putt that rolled off the green which stays feet.
                            if (r === 'green') {
                              updates.distanceUnitAfter = 'feet';
                            } else if (r === 'hole') {
                              updates.distanceToHoleAfter = '0';
                              updates.distanceUnitAfter = 'feet';
                            } else {
                              updates.distanceUnitAfter = editingShot.shotType === 'putting' ? 'feet' : 'yards';
                            }
                            // Auto-derive approach miss lie type from result
                            if (editingShot.shotType === 'approach' || editingShot.shotType === 'around_green') {
                              if (r === 'rough' || r === 'other') updates.approachMissLieType = 'rough';
                              else if (r === 'sand') updates.approachMissLieType = 'bunker';
                              else if (r === 'fairway') updates.approachMissLieType = 'fairway';
                              else updates.approachMissLieType = undefined;
                            }
                            // Clear irrelevant miss data when result changes
                            if (r === 'green' || r === 'hole') {
                              updates.missDirection = null;
                              updates.approachMissDirection = null;
                              updates.approachMissLieType = undefined;
                              updates.puttMissTags = [];
                            }
                            dispatch({ type: 'SET_EDIT_FORM_DATA', payload: { ...editFormData, ...updates } });
                          }}
                          className={gridBtn(editFormData.result === r)}
                        >
                          {resultLabel}
                          {r === 'green' && (
                            <span className={cn('block text-xs font-normal leading-tight', editFormData.result === 'green' ? 'text-white/80' : 'text-text-tertiary')}>(putting surface, not fringe)</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Distance After (if not holed) */}
                {editFormData.result !== 'hole' && (
                  <div>
                    <p className={sectionLabel}>Distance After</p>
                    {/* Quick-select distance presets */}
                    {editingShot.shotType === 'putting' ? (
                      <div className="mb-3 grid grid-cols-3 gap-2 md:grid-cols-6">
                        {[3, 5, 10, 15, 20, 30].map((ft) => (
                          <Button variant="ghost"
                            key={ft}
                            type="button"
                            onClick={() => updateEditForm({ distanceToHoleAfter: String(ft), distanceUnitAfter: 'feet' })}
                            className={cn(
                              'min-h-[44px] rounded-fw-md py-2 font-fw-sans text-eyebrow font-medium transition-colors',
                              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                              editFormData.distanceToHoleAfter === String(ft) && editFormData.distanceUnitAfter === 'feet'
                                ? 'bg-accent-fill text-text-on-accent-fill shadow-flat'
                                : 'bg-surface-sunken text-text-primary ring-1 ring-border-subtle hover:ring-border-strong',
                            )}
                          >
                            {ft} ft
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="mb-3 grid grid-cols-5 gap-2">
                        {[50, 100, 150, 200, 250].map((yds) => (
                          <Button variant="ghost"
                            key={yds}
                            type="button"
                            onClick={() => updateEditForm({ distanceToHoleAfter: String(yds), distanceUnitAfter: 'yards' })}
                            className={cn(
                              'rounded-fw-md py-2 font-fw-sans text-eyebrow font-medium transition-colors',
                              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                              editFormData.distanceToHoleAfter === String(yds) && editFormData.distanceUnitAfter === 'yards'
                                ? 'bg-accent-fill text-text-on-accent-fill shadow-flat'
                                : 'bg-surface-sunken text-text-primary ring-1 ring-border-subtle hover:ring-border-strong',
                            )}
                          >
                            {yds}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line helm/no-raw-input */}
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        aria-label="Distance to hole after shot"
                        value={editFormData.distanceToHoleAfter}
                        onChange={(e) => updateEditForm({ distanceToHoleAfter: e.target.value })}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        className="h-12 flex-1 rounded-fw-md border-2 border-border-subtle bg-surface px-4 text-center font-fw-mono text-body-lg font-medium tabular-nums text-text-primary transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/15"
                      />
                      {/* Unit is locked by context (no manual toggle) — putts & on-green
                          proximity are feet, the distance remaining is yards. Re-tapping a
                          result re-derives it; this prevents the unit-blend footgun on edit. */}
                      <div className="inline-flex items-center rounded-fw-md border border-border-subtle bg-surface-sunken px-3.5 py-2">
                        <span className="font-fw-sans text-sm font-semibold uppercase tracking-wide text-accent-700">
                          {editFormData.distanceUnitAfter === 'feet' ? 'Ft' : 'Yds'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Miss Direction (tee shots only) */}
                {editingShot.shotType === 'tee' && editFormData.result !== 'hole' && editFormData.result !== 'green' && (
                  <div>
                    <p className={sectionLabel}>Miss Direction</p>
                    <div className="grid grid-cols-2 gap-2">
                      {['left', 'right', 'short', 'long'].map((dir) => (
                        <Button variant="ghost"
                          key={dir}
                          type="button"
                          onClick={() => updateEditForm({ missDirection: editFormData.missDirection === dir ? null : dir })}
                          className={cn('capitalize', gridBtn(editFormData.missDirection === dir))}
                        >
                          {dir}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approach Miss Details (approach/around_green misses) */}
                {(editingShot.shotType === 'approach' || editingShot.shotType === 'around_green') &&
                  editFormData.result !== 'hole' && editFormData.result !== 'green' && (
                    <ApproachMissSelector
                      selectedDirection={editFormData.approachMissDirection}
                      onDirectionChange={(dir) => updateEditForm({ approachMissDirection: dir })}
                    />
                  )}

                {/* Putt Details (putting shots) */}
                {editingShot.shotType === 'putting' && (
                  <>
                    <div>
                      <p className={sectionLabel}>Putt Break</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[{ v: 'left_to_right', l: 'L to R' }, { v: 'straight', l: 'Straight' }, { v: 'right_to_left', l: 'R to L' }, { v: 'multiple', l: 'Multiple' }].map((b) => (
                          <Button variant="ghost" key={b.v} type="button" onClick={() => updateEditForm({ puttBreak: b.v as ShotRecord['puttBreak'] })} className={gridBtn(editFormData.puttBreak === b.v)}>
                            {b.l}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className={sectionLabel}>Putt Slope</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[{ v: 'uphill', l: 'Uphill' }, { v: 'level', l: 'Level' }, { v: 'downhill', l: 'Downhill' }, { v: 'severe', l: 'Severe' }].map((s) => (
                          <Button variant="ghost" key={s.v} type="button" onClick={() => updateEditForm({ puttSlope: s.v as ShotRecord['puttSlope'] })} className={gridBtn(editFormData.puttSlope === s.v)}>
                            {s.l}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Putt Miss Tags (missed putts) */}
                    {editFormData.result !== 'hole' && (
                      <PuttMissTagSelector selectedTags={editFormData.puttMissTags} onTagsChange={(tags) => updateEditForm({ puttMissTags: tags })} />
                    )}
                  </>
                )}

                {/* Calculated Shot Distance */}
                {editFormData.distanceToHoleBefore && editFormData.distanceToHoleAfter && (
                  <Inset padding="sm" className="flex items-center justify-between border border-accent-200 px-4 py-3">
                    <span className="font-fw-sans text-xs font-medium uppercase tracking-wide text-accent-700">Calculated Distance</span>
                    <span className="font-fw-mono text-body-lg font-medium tabular-nums text-accent-700">
                      ~{Math.round(calculateShotDistanceWithDirection(
                        editFormData.distanceUnitBefore === 'feet' ? parseFloat(editFormData.distanceToHoleBefore) / 3 : parseFloat(editFormData.distanceToHoleBefore),
                        editFormData.distanceUnitAfter === 'feet' ? parseFloat(editFormData.distanceToHoleAfter) / 3 : parseFloat(editFormData.distanceToHoleAfter),
                        (editingShot.shotType === 'approach' || editingShot.shotType === 'around_green')
                          ? (editFormData.approachMissDirection || editFormData.missDirection)
                          : editFormData.missDirection,
                      ))} yds
                    </span>
                  </Inset>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Modal Footer — hand-rolled (sticky + danger slot), so it must carry
          ModalShell.Footer's safe-area formula itself: contentInset:'never'
          in capacitor.config.ts means web code owns the home-indicator inset,
          and a tall shot form can run the panel to its max-height cap where
          plain py-4 leaves the buttons riding the indicator. */}
      {!showDeleteConfirm && (
        <div
          className="sticky bottom-0 rounded-b-fw-lg border-t border-border-subtle bg-surface px-6 pt-4"
          style={{ paddingBottom: 'max(1rem, calc(0.5rem + env(safe-area-inset-bottom)))' }}
        >
          <div className="flex gap-3">
            <IconButton variant="danger" onClick={() => dispatch({ type: 'SHOW_DELETE_CONFIRM' })} disabled={editSaving} aria-label="Delete shot">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </IconButton>
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={editSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleSave}
              disabled={editSaving || issue?.severity === 'block'}
              busy={editSaving}
            >
              {editSaving ? 'Saving…' : issue?.severity === 'confirm' ? 'Save anyway' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
