'use client';

// =============================================================================
// src/components/lifting/soreness/SorenessBodyMap.tsx
//
// Full body-map surface.
//
// Layout (per mockup spec):
//   — [Front] / [Back] pill segmented control, centered, green when active
//   — Centered athletic silhouette (smooth matte grayscale) with radial heat glow
//   — Multi-region selection + selected-region summary list
//   — Big green "Ready to Go" CTA + ghost "Report Soreness" button
//     (shown only in standalone / prompt modes; SorenessCheckCard wires them up)
//
// This component handles view switching and region-tap → bottom-sheet orchestration.
// The caller (SorenessCheckCard) owns the "Ready to Go" / "Report Soreness" CTA layer.
// =============================================================================

import { useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { haptic } from '@/lib/lifting/haptics';
import { regionsForView } from '@/lib/lifting/soreness-regions';
import type { SorenessRegionId } from '@/lib/lifting/soreness-regions';
import { BodySilhouetteFront } from './BodySilhouetteFront';
import type { RegionHitState } from './BodySilhouetteFront';
import { BodySilhouetteBack } from './BodySilhouetteBack';
import { SorenessRegionBottomSheet } from './SorenessRegionBottomSheet';
import type { RegionEntry } from './SorenessRegionBottomSheet';
import { SorenessSelectedRegionList } from './SorenessSelectedRegionList';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SorenessMapState = Partial<Record<SorenessRegionId, RegionEntry>>;

interface Props {
  value: SorenessMapState;
  onChange: (next: SorenessMapState) => void;
  /** Restrict which regions are shown (e.g. 'throwing_arm' focus). */
  allowedRegions?: Set<SorenessRegionId>;
  /** Read-only rendering — no tap handlers (for Performance history tab). */
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SorenessBodyMap({ value, onChange, allowedRegions, readOnly = false }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [view, setView] = useState<'front' | 'back'>('front');
  const [openRegion, setOpenRegion] = useState<SorenessRegionId | null>(null);

  // Build the RegionHitState map for the silhouette overlays
  const hitStates: Partial<Record<SorenessRegionId, RegionHitState>> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (entry) {
      hitStates[id as SorenessRegionId] = { severity: entry.severity };
    }
  }

  const handleRegionTap = useCallback(
    (id: SorenessRegionId) => {
      if (readOnly) return;
      if (allowedRegions && !allowedRegions.has(id)) return;
      haptic('tap');
      setOpenRegion(id);
    },
    [allowedRegions, readOnly],
  );

  const handleSave = useCallback(
    (id: SorenessRegionId, entry: RegionEntry) => {
      onChange({ ...value, [id]: entry });
      setOpenRegion(null);
    },
    [value, onChange],
  );

  const handleRemove = useCallback(
    (id: SorenessRegionId) => {
      const next = { ...value };
      delete next[id];
      onChange(next);
    },
    [value, onChange],
  );

  // Regions visible on the current view, filtered if allowedRegions set
  const visibleIds = new Set(
    regionsForView(view)
      .map((r) => r.id)
      .filter((id) => !allowedRegions || allowedRegions.has(id)),
  );

  // Filter hitStates to only show in-view regions on the silhouette
  const viewHitStates: Partial<Record<SorenessRegionId, RegionHitState>> = {};
  for (const id of visibleIds) {
    if (hitStates[id]) viewHitStates[id] = hitStates[id];
  }

  const selectedCount = Object.keys(value).length;

  return (
    <div className="space-y-5">
      {/* Front / Back pill segmented control */}
      <div className="flex justify-center">
        <div
          className="inline-flex items-center rounded-2xl bg-warm-100/80 p-1 gap-0.5"
          role="group"
          aria-label="Body view"
        >
          {(['front', 'back'] as const).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                onClick={() => {
                  haptic('tap');
                  setView(v);
                }}
                aria-pressed={active}
                className={`relative rounded-xl px-6 py-2 text-sm font-semibold transition-all duration-200
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400
                  ${active
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-warm-500 hover:text-warm-700'
                  }`}
              >
                {v === 'front' ? 'Front' : 'Back'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Helper text */}
      {!readOnly && (
        <p className="text-center text-xs text-warm-400">
          Tap a body area to mark soreness
        </p>
      )}

      {/* Silhouette */}
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={prefersReducedMotion ? false : { opacity: 0, x: view === 'front' ? -10 : 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex justify-center"
        >
          {view === 'front' ? (
            <BodySilhouetteFront
              selected={viewHitStates}
              onRegionTap={readOnly ? undefined : handleRegionTap}
              readOnly={readOnly}
              className={readOnly ? 'mx-auto h-[300px] max-w-[180px]' : 'mx-auto w-full max-w-[300px] h-[640px] sm:h-[420px] sm:max-w-[250px]'}
            />
          ) : (
            <BodySilhouetteBack
              selected={viewHitStates}
              onRegionTap={readOnly ? undefined : handleRegionTap}
              readOnly={readOnly}
              className={readOnly ? 'mx-auto h-[300px] max-w-[180px]' : 'mx-auto w-full max-w-[300px] h-[640px] sm:h-[420px] sm:max-w-[250px]'}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Selected regions summary */}
      {selectedCount > 0 && (
        <SorenessSelectedRegionList
          entries={value}
          onEdit={readOnly ? () => {} : setOpenRegion}
          onRemove={readOnly ? () => {} : handleRemove}
        />
      )}

      {/* Bottom sheet */}
      {!readOnly && (
        <SorenessRegionBottomSheet
          regionId={openRegion}
          existing={openRegion ? value[openRegion] : undefined}
          onSave={handleSave}
          onClose={() => setOpenRegion(null)}
        />
      )}
    </div>
  );
}
