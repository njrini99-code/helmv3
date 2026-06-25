'use client';

// =============================================================================
// src/components/lifting/soreness/SorenessSelectedRegionList.tsx
//
// Summary list of all selected body regions with severity badge and tags.
// Tapping a row re-opens the bottom sheet. Remove button clears the region.
// =============================================================================

import { motion, AnimatePresence } from 'framer-motion';
import { SORENESS_REGIONS } from '@/lib/lifting/soreness-regions';
import type { SorenessRegionId } from '@/lib/lifting/soreness-regions';
import type { RegionEntry } from './SorenessRegionBottomSheet';
import { IconX, IconChevronRight } from '@/components/icons';
import { severityBadge } from './severity-colors';

interface Props {
  entries: Partial<Record<SorenessRegionId, RegionEntry>>;
  onEdit: (id: SorenessRegionId) => void;
  onRemove: (id: SorenessRegionId) => void;
}

function SeverityBadge({ severity }: { severity: number }) {
  const { cls, label } = severityBadge(severity);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {severity}/10 · {label}
    </span>
  );
}

export function SorenessSelectedRegionList({ entries, onEdit, onRemove }: Props) {
  const ids = (Object.keys(entries) as SorenessRegionId[]).filter(
    (id) => entries[id] !== undefined,
  );

  if (ids.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-warm-500 px-0.5">
        {ids.length === 1 ? '1 area marked' : `${ids.length} areas marked`}
      </p>
      <ul className="space-y-2" role="list">
        <AnimatePresence initial={false}>
          {ids.map((id) => {
            const entry = entries[id]!;
            const region = SORENESS_REGIONS[id];
            return (
              <motion.li
                key={id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 12, transition: { duration: 0.15 } }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-3 rounded-2xl bg-white/80 backdrop-blur-sm
                  border border-white/30 px-4 py-3 shadow-glass-sm">
                  {/* Edit button */}
                  <button
                    className="flex-1 text-left min-w-0 group"
                    onClick={() => onEdit(id)}
                    aria-label={`Edit soreness for ${region.label}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-warm-900 truncate">{region.label}</p>
                      <IconChevronRight
                        size={13}
                        className="text-warm-400 group-hover:text-warm-600 transition-colors shrink-0"
                      />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={entry.severity} />
                      {(entry.tags ?? []).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-warm-100 px-2 py-0.5 text-[11px] text-warm-600"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    {entry.note ? (
                      <p className="mt-1 text-xs text-warm-400 line-clamp-1">{entry.note}</p>
                    ) : null}
                  </button>

                  {/* Remove */}
                  <button
                    onClick={() => onRemove(id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                      text-warm-400 hover:bg-warm-100 hover:text-warm-600 transition-colors
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    aria-label={`Remove ${region.label}`}
                  >
                    <IconX size={13} />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
