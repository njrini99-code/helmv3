/**
 * RE-S5 (round-entry audit): the edit-shot modal saved any distance — a
 * negative one, or a shot that left the ball further away — with no check,
 * while live entry ran the shared rules on the same shot. Negative/malformed
 * distances now block, the shared `confirm` rules ask once ("Save anyway"),
 * and the shared `block` rules block.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ShotRecord } from '@/lib/types/golf';
import type { EditFormData } from '@/hooks/golf/use-shot-state-machine';
import { FairwayEditShotModal, editedShotIssues } from '../FairwayEditShotModal';

const HOLE = { holeNumber: 5, par: 4, yardage: 410 };

function shot(overrides: Partial<ShotRecord> = {}): ShotRecord {
  return {
    shotNumber: 2,
    shotType: 'approach',
    clubType: 'non_driver',
    lieBefore: 'fairway',
    distanceToHoleBefore: 150,
    distanceUnitBefore: 'yards',
    result: 'green',
    distanceToHoleAfter: 20,
    distanceUnitAfter: 'feet',
    shotDistance: 143,
    isPenalty: false,
    ...overrides,
  } as ShotRecord;
}

function form(overrides: Partial<EditFormData> = {}): EditFormData {
  return {
    clubType: 'non_driver',
    lieBefore: 'fairway',
    result: 'green',
    distanceToHoleBefore: '150',
    distanceUnitBefore: 'yards',
    distanceToHoleAfter: '20',
    distanceUnitAfter: 'feet',
    missDirection: null,
    puttBreak: null,
    puttSlope: null,
    isPenalty: false,
    penaltyType: null,
    puttMissTags: [],
    approachMissDirection: null,
    approachMissLieType: undefined,
    ...overrides,
  } as EditFormData;
}

describe('editedShotIssues', () => {
  it('passes an ordinary edit', () => {
    expect(editedShotIssues(form(), shot(), HOLE)).toEqual([]);
  });

  it.each([
    ['a negative distance before', { distanceToHoleBefore: '-10' }, /can't be negative/],
    ['a negative distance after', { result: 'rough' as const, distanceToHoleAfter: '-3', distanceUnitAfter: 'yards' as const }, /can't be negative/],
    ['an empty distance before', { distanceToHoleBefore: '' }, /Enter the distance to the hole before/],
    ['an empty distance after', { result: 'rough' as const, distanceToHoleAfter: '' }, /Enter the distance to the hole after/],
  ])('blocks %s', (_name, overrides, message) => {
    const [issue] = editedShotIssues(form(overrides), shot(), HOLE);
    expect(issue?.severity).toBe('block');
    expect(issue?.message).toMatch(message);
  });

  it('asks to confirm a shot that finishes further away than it started', () => {
    const issues = editedShotIssues(form({ result: 'rough', distanceToHoleAfter: '170', distanceUnitAfter: 'yards' }), shot(), HOLE);
    expect(issues.map((i) => [i.rule, i.severity])).toEqual([['distance_not_decreasing', 'confirm']]);
  });

  it('asks to confirm when the edited start no longer meets the previous shot', () => {
    const history = [
      shot({ shotNumber: 1, shotType: 'tee', distanceToHoleBefore: 410, result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards' }),
      shot(),
    ];
    const issues = editedShotIssues(form({ distanceToHoleBefore: '190' }), shot(), HOLE, history);
    expect(issues.map((i) => i.rule)).toContain('shot_start_mismatch');
  });

  it('holds the shared block rule on a tee shot onto a green 500+ yd away', () => {
    const tee = shot({ shotNumber: 1, shotType: 'tee' });
    const issues = editedShotIssues(form({ distanceToHoleBefore: '560', result: 'green' }), tee, { holeNumber: 5, par: 5, yardage: 560 });
    expect(issues.some((i) => i.rule === 'tee_shot_unreachable' && i.severity === 'block')).toBe(true);
  });

  it('never judges a penalty record', () => {
    expect(editedShotIssues(form({ isPenalty: true, distanceToHoleBefore: '-1' }), shot({ isPenalty: true }), HOLE)).toEqual([]);
  });
});

describe('FairwayEditShotModal save gate', () => {
  function ui(f: EditFormData, onSave = vi.fn()) {
    render(
      <FairwayEditShotModal
        open
        editingShot={shot()}
        editFormData={f}
        showDeleteConfirm={false}
        editSaving={false}
        editError={null}
        dispatch={vi.fn()}
        updateEditForm={vi.fn()}
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
        hole={HOLE}
      />,
    );
    return onSave;
  }

  it('does not save a negative distance and says why', () => {
    const onSave = ui(form({ distanceToHoleBefore: '-10' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/can't be negative/)).toBeInTheDocument();
  });

  it('asks once for a confirm-level edit, then saves on "Save anyway"', () => {
    const onSave = ui(form({ result: 'rough', distanceToHoleAfter: '170', distanceUnitAfter: 'yards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('saves an ordinary edit on the first tap', () => {
    const onSave = ui(form());
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
