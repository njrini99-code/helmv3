'use client';

// =============================================================================
// src/components/lifting/exercises/ExercisePicker.tsx
//
// Helm Lifting Lab — exercise picker modal. Searches helm_lifting_exercises by
// name within the org, then calls onSelect with the chosen exercise id + name.
// Used by ProgramEditorClient's "+ Add exercise" affordance inside a section.
// Honest empty state "No exercises yet" with a link to the library.
// =============================================================================

import { useState, useTransition, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  IconSearch, IconDumbbell, IconPlus,
} from '@/components/icons';
import type { HelmLiftingExerciseRow } from '@/lib/types/helm-lifting-data';
import { searchExercises } from '@/app/lifting/actions/programs';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ExercisePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (exerciseId: string, exerciseName: string) => void;
  /** orgId is accepted for forward-compatibility (future org-scoped fetch) */
  orgId: string;
  sport?: 'baseball' | 'golf';
}

// Category display labels
const CATEGORY_LABELS: Record<string, string> = {
  warmup: 'Warmup',
  power: 'Power',
  strength: 'Strength',
  accessory: 'Accessory',
  arm_care: 'Arm care',
  mobility: 'Mobility',
  conditioning: 'Conditioning',
  recovery: 'Recovery',
  test: 'Test',
};

// Category accent colours (warm palette)
const CATEGORY_PILL: Record<string, string> = {
  power: 'bg-amber-50 text-amber-700 border-amber-200',
  strength: 'bg-primary-50 text-primary-700 border-primary-200',
  arm_care: 'bg-rose-50 text-rose-700 border-rose-200',
  conditioning: 'bg-sky-50 text-sky-700 border-sky-200',
  warmup: 'bg-green-50 text-green-700 border-green-200',
  mobility: 'bg-violet-50 text-violet-700 border-violet-200',
  accessory: 'bg-warm-50 text-warm-700 border-warm-200',
  recovery: 'bg-teal-50 text-teal-700 border-teal-200',
  test: 'bg-warm-100 text-warm-500 border-warm-200',
};

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ExercisePicker({ open, onClose, onSelect, orgId: _orgId, sport }: ExercisePickerProps) {
  const [query, setQuery] = useState('');
  const [exercises, setExercises] = useState<HelmLiftingExerciseRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Initial load — all active exercises for the org.
  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    startTransition(async () => {
      const result = await searchExercises({ sport });
      setExercises(result.success ? result.exercises : []);
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus the search input when the modal opens.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Live search as query changes.
  useEffect(() => {
    if (!open || !loaded) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchExercises({ query: query.trim() || undefined, sport });
        setExercises(result.success ? result.exercises : []);
      });
    }, 220);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, loaded]);

  function handleClose() {
    setQuery('');
    onClose();
  }

  function handleSelect(ex: HelmLiftingExerciseRow) {
    onSelect(ex.id, ex.name);
    setQuery('');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Pick an exercise"
      size="lg"
    >
      <div className="space-y-3 p-1">
        {/* Search box */}
        <div className="relative">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises…"
            className="pl-8"
          />
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto rounded-xl border border-warm-100">
          {!loaded || isPending ? (
            <div className="space-y-1 p-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded-lg bg-warm-50 animate-pulse"
                  style={{ opacity: 1 - i * 0.2 }}
                />
              ))}
            </div>
          ) : exercises.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
              <IconDumbbell size={28} className="text-warm-200" />
              <p className="text-sm font-medium text-warm-700">No exercises yet</p>
              <p className="text-xs text-warm-400">
                Add exercises in the{' '}
                <a
                  href="/lifting/dashboard/exercises"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 underline hover:text-primary-700"
                >
                  Exercise Library
                </a>{' '}
                then come back here to pick one.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-warm-50">
              {exercises.map((ex) => (
                <li key={ex.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(ex)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary-50 transition-colors text-left group"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-warm-900 group-hover:text-primary-700 truncate">
                        {ex.name}
                      </span>
                      {ex.equipment && (
                        <span className="block text-xs text-warm-400 truncate">{ex.equipment}</span>
                      )}
                    </span>
                    {ex.category && (
                      <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_PILL[ex.category] ?? 'bg-warm-50 text-warm-500 border-warm-200'}`}>
                        {CATEGORY_LABELS[ex.category] ?? ex.category}
                      </span>
                    )}
                    <IconPlus size={14} className="shrink-0 text-warm-300 group-hover:text-primary-500 transition-colors" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
