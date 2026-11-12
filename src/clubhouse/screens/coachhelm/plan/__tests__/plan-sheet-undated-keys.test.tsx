import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PP_PLAN_PART } from '../../../../preview/fixtures-practice-plan';
import { PracticePlanSheet } from '../sheet/PracticePlanSheet';
import { toSheetModel } from '../sheet/plan-sheet-model';

/**
 * capture-2c (11 Nov 2026): opening a plan with no practice date logged "Encountered two children with the same key, `—`". An
 * undated plan prints every rotation turn as "—", and the turn headers were keyed by their text.
 */
afterEach(() => vi.restoreAllMocks());

describe('an undated plan’s rotation', () => {
  it('prints its turns as dashes and draws them without a key clash', () => {
    const body = PP_PLAN_PART.draft.body;
    const model = toSheetModel({ body, title: 'Short game and pressure', team: 'Varsity', start: null, end: null, zone: null, coaches: [], names: new Map(), state: 'draft' }, 'coach');
    const rotation = model.rows.find((r) => r.rotation)?.rotation;
    expect(rotation, 'the fixture plan has a stations block').toBeTruthy();
    expect(rotation!.turns.length).toBeGreaterThan(1);
    expect(new Set(rotation!.turns)).toEqual(new Set(['—']));

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PracticePlanSheet plan={model} />);
    const clashes = error.mock.calls.filter((c) => String(c[0]).includes('same key'));
    expect(clashes).toHaveLength(0);
  });
});
