'use client';

// =============================================================================
// src/components/lifting/soreness/SorenessRegionBottomSheet.tsx
//
// Glass bottom sheet for rating a selected soreness region.
// Slides up with a spring animation. Tags, severity slider, optional note.
// Footer line: "Visible to performance staff" with a shield icon.
// Haptic on save; haptic warning on severity ≥ 7.
// Escape key closes the sheet.
// =============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { haptic } from '@/lib/lifting/haptics';
import { SORENESS_REGIONS } from '@/lib/lifting/soreness-regions';
import type { SorenessRegionId } from '@/lib/lifting/soreness-regions';
import { SorenessSeveritySlider } from './SorenessSeveritySlider';
import { IconX, IconShield } from '@/components/icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegionEntry {
  severity: number;
  tags: string[];
  note: string;
}

interface Props {
  regionId: SorenessRegionId | null;
  existing: RegionEntry | undefined;
  onSave: (regionId: SorenessRegionId, entry: RegionEntry) => void;
  onClose: () => void;
}

const SORENESS_TAGS = [
  'Tight', 'Sharp', 'Dull ache', 'Limited movement',
  'Swollen', 'Burning', 'After activity', 'At rest',
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SorenessRegionBottomSheet({ regionId, existing, onSave, onClose }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [severity, setSeverity] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);

  // Reset when region changes
  useEffect(() => {
    if (regionId) {
      setSeverity(existing?.severity ?? 0);
      setTags(existing?.tags ?? []);
      setNote(existing?.note ?? '');
    }
  }, [regionId, existing]);

  // Escape key handler
  useEffect(() => {
    if (!regionId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [regionId, onClose]);

  const toggleTag = useCallback((tag: string) => {
    haptic('tap');
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const handleSave = useCallback(() => {
    if (!regionId) return;
    haptic('select');
    onSave(regionId, { severity, tags, note });
  }, [regionId, severity, tags, note, onSave]);

  const label = regionId ? SORENESS_REGIONS[regionId].label : '';

  return (
    <AnimatePresence>
      {regionId && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-warm-900/25 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
            onClick={onClose}
            aria-hidden
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            ref={sheetRef}
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg
              rounded-t-[28px] bg-white/92 backdrop-blur-xl
              border-t border-white/40 shadow-2xl"
            initial={prefersReducedMotion ? false : { y: '100%' }}
            animate={{ y: 0 }}
            exit={prefersReducedMotion ? {} : { y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320, mass: 0.9 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Rate soreness — ${label}`}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1" aria-hidden>
              <div className="h-1 w-10 rounded-full bg-warm-200" />
            </div>

            <div className="px-6 pb-safe pt-2 space-y-5" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-600">
                    Soreness
                  </p>
                  <h2 className="text-xl font-semibold text-warm-900 mt-0.5 leading-tight">
                    {label}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-warm-100 text-warm-500
                    hover:bg-warm-200 transition-colors focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-primary-400"
                  aria-label="Close"
                >
                  <IconX size={16} />
                </button>
              </div>

              {/* Severity slider */}
              <SorenessSeveritySlider value={severity} onChange={setSeverity} />

              {/* Tags */}
              <div>
                <p className="mb-2.5 text-sm font-medium text-warm-700">What does it feel like?</p>
                <div className="flex flex-wrap gap-2">
                  {SORENESS_TAGS.map((tag) => {
                    const active = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        aria-pressed={active}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400
                          ${active
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                          }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional note */}
              <div>
                <label
                  htmlFor="soreness-note"
                  className="mb-1.5 block text-sm font-medium text-warm-700"
                >
                  Note{' '}
                  <span className="font-normal text-warm-400">(optional)</span>
                </label>
                <textarea
                  id="soreness-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Felt it after long toss yesterday"
                  rows={2}
                  maxLength={280}
                  className="w-full resize-none rounded-xl bg-warm-50 border border-warm-200 px-4 py-3
                    text-sm text-warm-900 placeholder:text-warm-400
                    focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400
                    transition-shadow"
                />
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                className="w-full rounded-2xl bg-primary-600 px-6 py-4 text-base font-semibold text-white
                  shadow-sm transition-all duration-150 hover:bg-primary-700 active:scale-[0.98]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
              >
                Save Area
              </button>

              {/* Privacy footer */}
              <div className="flex items-center justify-center gap-1.5 pb-1">
                <IconShield size={12} className="text-warm-400 shrink-0" />
                <p className="text-[11px] text-warm-400">
                  Visible to performance staff only
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
