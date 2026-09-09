// @vitest-environment jsdom

/**
 * usePeopleSelection — the picker's "Cancel restores the previous set"
 * guarantee lives here, isolated from ModalShell/PopoverPanel's own
 * open/close animation lifecycle (which keeps its exiting children mounted
 * in jsdom without real animation-frame timing, making that specific
 * contract unreliable to assert through the full overlay in
 * CalendarPeoplePicker.test.tsx).
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePeopleSelection, type PeoplePickerPerson } from '../usePeopleSelection';

const people: PeoplePickerPerson[] = [
  { id: 'p1', name: 'Ava Stone' },
  { id: 'p2', name: 'Ben Cortez' },
  { id: 'p3', name: 'Cam Reyes' },
];

describe('usePeopleSelection', () => {
  it('starts from the caller-provided selection', () => {
    const { result } = renderHook(() => usePeopleSelection({ people, initialSelectedIds: ['p1'], resetKey: true }));
    expect(result.current.selectedIds).toEqual(['p1']);
  });

  it('toggling edits local state without touching the caller until re-seeded', () => {
    const { result } = renderHook(() => usePeopleSelection({ people, initialSelectedIds: ['p1'], resetKey: true }));
    act(() => result.current.toggle('p2'));
    expect(result.current.selectedIds).toEqual(['p1', 'p2']);
  });

  it('re-seeds to the initial selection when resetKey flips — the Cancel/reopen contract', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => usePeopleSelection({ people, initialSelectedIds: ['p1'], resetKey }),
      { initialProps: { resetKey: true } },
    );
    act(() => result.current.toggle('p2'));
    expect(result.current.selectedIds).toEqual(['p1', 'p2']);

    // Simulate close (resetKey -> false) then reopen (resetKey -> true): the
    // in-progress edit is discarded, never carried into the next open.
    rerender({ resetKey: false });
    rerender({ resetKey: true });
    expect(result.current.selectedIds).toEqual(['p1']);
  });

  it('filters by name, case-insensitively', () => {
    const { result } = renderHook(() => usePeopleSelection({ people, initialSelectedIds: [], resetKey: true }));
    act(() => result.current.setQuery('ben'));
    expect(result.current.filtered.map((p) => p.id)).toEqual(['p2']);
  });

  it('selectShown adds only the currently-filtered rows, keeping prior picks', () => {
    // "Ben Cortez" has no letter "a" — filtering to "a" shows only Ava Stone
    // and Cam Reyes, so Ben must stay unselected after selectShown.
    const { result } = renderHook(() => usePeopleSelection({ people, initialSelectedIds: ['p3'], resetKey: true }));
    act(() => result.current.setQuery('a'));
    act(() => result.current.selectShown());
    expect(new Set(result.current.selectedIds)).toEqual(new Set(['p1', 'p3']));
    expect(result.current.selectedIds).not.toContain('p2');
  });

  it('clearShown removes only the currently-filtered rows', () => {
    const { result } = renderHook(() => usePeopleSelection({ people, initialSelectedIds: ['p1', 'p2', 'p3'], resetKey: true }));
    act(() => result.current.setQuery('ava'));
    act(() => result.current.clearShown());
    expect(result.current.selectedIds.sort()).toEqual(['p2', 'p3']);
  });

  it('tracks required/optional independently of selection', () => {
    const { result } = renderHook(() => usePeopleSelection({ people, initialSelectedIds: ['p1'], resetKey: true }));
    expect(result.current.isRequired('p1')).toBe(false);
    act(() => result.current.setRequired('p1', true));
    expect(result.current.isRequired('p1')).toBe(true);
    act(() => result.current.setRequired('p1', false));
    expect(result.current.isRequired('p1')).toBe(false);
  });
});
