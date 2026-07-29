'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  IconX,
  IconCheck,
  IconWarning,
  IconUsers,
  IconLayers,
  IconLayers3,
} from '@/components/icons';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { Button, IconButton } from '@/components/ui/button';
import {
  findDuplicateCoaches,
  mergeCoaches,
  type DuplicateGroup,
} from '@/app/golf/actions/crm-dedup';

// ============================================================================
// DuplicateReview — panel that surfaces likely-duplicate coach records and lets
// the admin pick a canonical row per group ("Keep this") to merge the rest into.
//
// Self-contained: opened from ImportModal, drives its own data + feedback state
// (no ToastProvider dependency — it isn't guaranteed to be in the tree here).
// Merges are soft (server archives the loser; never hard-deletes).
// ============================================================================

interface DuplicateReviewProps {
  onClose: () => void;
  /** Called after at least one successful merge so the caller can refresh. */
  onMerged?: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never contacted';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never contacted';
  return `Last contacted ${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

export function DuplicateReview({ onClose, onMerged }: DuplicateReviewProps) {
  const uid = useId();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  // matchKey -> coach id selected as the canonical "keep" row.
  const [selectedKeep, setSelectedKeep] = useState<Record<string, string>>({});
  // matchKey currently being merged (disables that group's button).
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [mergedCount, setMergedCount] = useState(0);
  const [didMerge, setDidMerge] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await findDuplicateCoaches();
      setGroups(result);
      // Default each group's "keep" to its first member.
      const defaults: Record<string, string> = {};
      for (const g of result) {
        const first = g.coaches[0];
        if (first) defaults[g.matchKey] = first.id;
      }
      setSelectedKeep(defaults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load duplicates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMerge = async (group: DuplicateGroup) => {
    const keepId = selectedKeep[group.matchKey];
    if (!keepId) return;

    const losers = group.coaches.filter((c) => c.id !== keepId);
    if (losers.length === 0) return;

    setMergingKey(group.matchKey);
    setError(null);
    try {
      for (const loser of losers) {
        await mergeCoaches({ keep_id: keepId, merge_id: loser.id });
      }
      setMergedCount((n) => n + losers.length);
      setDidMerge(true);
      // Remove the resolved group from the list.
      setGroups((prev) => prev.filter((g) => g.matchKey !== group.matchKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setMergingKey(null);
    }
  };

  const handleClose = () => {
    if (didMerge) onMerged?.();
    onClose();
  };

  // Focus trap + Escape + scroll-lock + focus-restore. Mounted == open.
  const { modalRef } = useFocusTrap(true, handleClose);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismisses on click; Escape is handled by the dialog. stopPropagation guards against DuplicateReview being nested inside another modal's own backdrop (e.g. ImportModal) so one Escape/click doesn't cascade-close both.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-nav-bg/40 p-4"
      onClick={(e) => { e.stopPropagation(); handleClose(); }}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- stopPropagation-only wrapper prevents backdrop click from closing modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="rounded-card bg-elevated shadow-raise w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center gap-2">
            <IconLayers size={16} className="text-text-secondary" />
            <h2 id={`${uid}-title`} className="text-lg font-semibold text-text-primary">Review Duplicates</h2>
          </div>
          <IconButton
            variant="default"
            onClick={handleClose}
            aria-label="Close"
            className="text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <IconX size={18} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary / status */}
          <p className="text-xs uppercase tracking-wider text-text-tertiary mb-3">
            Duplicate detection
          </p>

          {mergedCount > 0 && (
            <div className="mb-4 p-3 bg-accent-50 border border-accent-200 rounded-fw-md">
              <p className="text-sm text-accent-700 flex items-center gap-1.5">
                <IconCheck className="w-4 h-4" />
                {mergedCount} duplicate{mergedCount !== 1 ? 's' : ''} merged and archived
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-fw-danger-bg border border-fw-danger/25 rounded-fw-md">
              <p className="text-sm text-fw-danger-ink flex items-center gap-1.5">
                <IconWarning className="w-4 h-4" />
                {error}
              </p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-10">
              <div className="flex items-center justify-center gap-2 mx-auto mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-500 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                <span className="w-2.5 h-2.5 rounded-full bg-accent-500 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                <span className="w-2.5 h-2.5 rounded-full bg-accent-500 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-sm text-text-tertiary">Scanning for duplicate coaches…</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-full bg-accent-100 flex items-center justify-center mx-auto mb-3">
                <IconCheck className="w-7 h-7 text-accent-700" />
              </div>
              <h3 className="text-base font-semibold text-text-primary mb-1">No duplicates found</h3>
              <p className="text-sm text-text-tertiary">
                {mergedCount > 0
                  ? 'All flagged duplicates have been resolved.'
                  : 'Every coach record looks unique by email and by school + name.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Found <span className="font-semibold">{groups.length}</span> potential
                duplicate group{groups.length !== 1 ? 's' : ''}. Pick the record to keep —
                the others are merged into it and archived (never deleted).
              </p>

              {groups.map((group) => {
                const keepId = selectedKeep[group.matchKey];
                const isMerging = mergingKey === group.matchKey;
                return (
                  <div
                    key={group.matchKey}
                    className="border border-border-subtle rounded-fw-md overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-sunken border-b border-border-subtle">
                      <IconUsers size={14} className="text-text-tertiary" />
                      <span className="text-xs font-medium text-text-secondary">
                        {group.matchType === 'email' ? 'Same email' : 'Same school + name'}
                      </span>
                      <span className="text-xs text-text-tertiary truncate">· {group.matchKey}</span>
                      <span className="ml-auto text-xs font-semibold text-text-tertiary">
                        {group.coaches.length} records
                      </span>
                    </div>

                    <ul className="divide-y divide-border-subtle">
                      {group.coaches.map((coach) => {
                        const isKeep = coach.id === keepId;
                        return (
                          <li key={coach.id}>
                            <label
                              className={cn(
                                'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors tap-44',
                                isKeep
                                  ? 'bg-accent-50 ring-1 ring-inset ring-accent-200'
                                  : 'hover:bg-surface-sunken',
                              )}
                            >
                              <input
                                type="radio"
                                name={`keep-${group.matchKey}`}
                                checked={isKeep}
                                onChange={() =>
                                  setSelectedKeep((prev) => ({
                                    ...prev,
                                    [group.matchKey]: coach.id,
                                  }))
                                }
                                disabled={isMerging}
                                className="mt-1 accent-accent-650"
                                aria-label={`Keep ${coach.name} at ${coach.school}`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-text-primary truncate">
                                    {coach.name}
                                  </span>
                                  {isKeep && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-micro font-semibold bg-accent-100 text-accent-700">
                                      Keep
                                    </span>
                                  )}
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-micro font-medium bg-surface-sunken text-text-secondary capitalize">
                                    {coach.status.replace(/_/g, ' ')}
                                  </span>
                                </div>
                                <p className="text-xs text-text-tertiary truncate">{coach.school}</p>
                                <p className="text-xs text-text-tertiary truncate">
                                  {coach.email || 'No email'} · {formatDate(coach.last_contacted_at)}
                                </p>
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="flex justify-end px-4 py-3 bg-surface-sunken/70 border-t border-border-subtle">
                      <Button
                        variant="primary"
                        onClick={() => handleMerge(group)}
                        disabled={isMerging || !keepId}
                        className="inline-flex items-center gap-1.5 bg-accent-650 hover:bg-accent-700 text-text-on-accent rounded-fw-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <IconLayers3 size={14} />
                        {isMerging
                          ? 'Merging…'
                          : `Merge ${group.coaches.length - 1} into selected`}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border-subtle flex-shrink-0">
          <Button
            variant="ghost"
            onClick={handleClose}
            className="bg-surface border border-border-subtle text-text-secondary rounded-fw-md px-5 py-2.5 text-sm font-medium hover:bg-surface-sunken transition-colors"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
