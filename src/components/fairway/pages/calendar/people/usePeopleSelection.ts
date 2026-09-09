'use client';

/**
 * ============================================================================
 * Fairway · Calendar · usePeopleSelection — the People Picker's selection state
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.3 (S3). Owns search, the selected-id set, and the
 * client-only required/optional flag a comparison can carry (there is no
 * `golf_event_attendance` column for it — gate G3 — so this state never
 * leaves the browser). One rule this hook exists to guarantee: Escape or
 * Cancel must restore the picker to exactly what it looked like before it
 * opened, never a partially-applied selection. That is done by re-seeding
 * from `initialSelectedIds`/`initialRequiredIds` every time `resetKey` flips,
 * which the picker ties to its own open transition — never by trying to
 * "undo" edits after the fact.
 * ========================================================================== */

import * as React from 'react';

export interface PeoplePickerPerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Free text under the name — role, position, "Coach". Optional. */
  role?: string | null;
  /** The signed-in viewer's own row, when it appears in the roster at all. */
  isViewer?: boolean;
}

export interface UsePeopleSelectionOptions {
  people: PeoplePickerPerson[];
  initialSelectedIds: string[];
  initialRequiredIds?: string[];
  /**
   * Flip (or toggle) this whenever the picker transitions to open. Selection,
   * required/optional, and the search query all re-seed from the `initial*`
   * props at that instant — so a picker left half-edited and dismissed never
   * leaks its draft into the next time it opens.
   */
  resetKey: boolean | number | string;
}

export interface UsePeopleSelectionResult {
  query: string;
  setQuery: (query: string) => void;
  /** `people`, filtered by `query` against `name` (case-insensitive). */
  filtered: PeoplePickerPerson[];
  selectedIds: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Select every row currently shown (post-filter), keeping prior picks. */
  selectShown: () => void;
  /** Deselect only the rows currently shown, leaving other picks untouched. */
  clearShown: () => void;
  clearAll: () => void;
  /** True only when there is at least one shown row and all are selected. */
  allShownSelected: boolean;
  requiredIds: string[];
  isRequired: (id: string) => boolean;
  setRequired: (id: string, required: boolean) => void;
}

export function usePeopleSelection({
  people,
  initialSelectedIds,
  initialRequiredIds = [],
  resetKey,
}: UsePeopleSelectionOptions): UsePeopleSelectionResult {
  const [query, setQuery] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<string[]>(initialSelectedIds);
  const [requiredIds, setRequiredIds] = React.useState<string[]>(initialRequiredIds);

  // Re-seed on every open (see `resetKey` doc above). Intentionally NOT
  // depending on `initialSelectedIds`/`initialRequiredIds` by reference — the
  // parent may pass a fresh array each render, and re-seeding on every render
  // would make in-picker toggles vanish before Done is ever pressed.
  const initialSelectedRef = React.useRef(initialSelectedIds);
  const initialRequiredRef = React.useRef(initialRequiredIds);
  initialSelectedRef.current = initialSelectedIds;
  initialRequiredRef.current = initialRequiredIds;
  React.useEffect(() => {
    setSelectedIds(initialSelectedRef.current);
    setRequiredIds(initialRequiredRef.current);
    setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((person) => person.name.toLowerCase().includes(q));
  }, [people, query]);

  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const isSelected = React.useCallback((id: string) => selectedSet.has(id), [selectedSet]);

  const toggle = React.useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const allShownSelected = filtered.length > 0 && filtered.every((person) => selectedSet.has(person.id));

  const selectShown = React.useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((person) => next.add(person.id));
      return Array.from(next);
    });
  }, [filtered]);

  const clearShown = React.useCallback(() => {
    const shown = new Set(filtered.map((person) => person.id));
    setSelectedIds((prev) => prev.filter((id) => !shown.has(id)));
  }, [filtered]);

  const clearAll = React.useCallback(() => setSelectedIds([]), []);

  const requiredSet = React.useMemo(() => new Set(requiredIds), [requiredIds]);
  const isRequired = React.useCallback((id: string) => requiredSet.has(id), [requiredSet]);
  const setRequired = React.useCallback((id: string, required: boolean) => {
    setRequiredIds((prev) => {
      if (required) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }, []);

  return {
    query,
    setQuery,
    filtered,
    selectedIds,
    isSelected,
    toggle,
    selectShown,
    clearShown,
    clearAll,
    allShownSelected,
    requiredIds,
    isRequired,
    setRequired,
  };
}
