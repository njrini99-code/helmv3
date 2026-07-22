'use client';

/**
 * PromoteToFocusAreaButton — promotes a round-review takeaway or a CoachHelm
 * insight into a player focus area. Self-contained: renders a primary CTA
 * that opens a Drawer with editable title/description, a read-only
 * area-type chip, and optional target metric/value inputs.
 *
 * Wires into the locked A4 actions:
 *   - createFocusAreaFromReview({ playerId, reviewId, ... })
 *   - createFocusAreaFromInsight({ playerId, insightId, ... })
 *
 * Toast contract: addToast({ type, title, description? }) from useToast().
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Input, Textarea } from '@/components/ui/input';
import {
  Select as FairwaySelect,
  FormField as FairwayFormField,
  type SelectOption,
} from '@/components/fairway/forms';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { IconTarget } from '@/components/icons';
import {
  createFocusAreaFromReview,
  createFocusAreaFromInsightV2,
} from '@/app/golf/actions/development';
import { metricsForArea, findMetric } from '@/lib/coachhelm/focus-areas/catalog';

/** Sentinel Select value for the free-text escape hatch. */
const CUSTOM_METRIC_VALUE = '__custom__';

/**
 * Starting state for the metric picker. Prefers a catalog match for
 * `suggested` (so a caller-supplied metric_id/label preselects the right
 * card); falls back to the free-text "Other (custom)" slot — carrying the
 * suggestion through verbatim — when the area has no catalog metrics, the
 * suggestion doesn't resolve, or it resolves to a DIFFERENT area's metric
 * (never preselect a metric that doesn't belong to this area's chip).
 */
function resolveInitialMetric(
  areaType: string,
  suggested: string | undefined,
): { metricSelection: string; customMetricText: string } {
  const catalogMetrics = metricsForArea(areaType);
  if (catalogMetrics.length === 0) {
    return { metricSelection: CUSTOM_METRIC_VALUE, customMetricText: suggested ?? '' };
  }
  if (suggested) {
    const entry = findMetric(suggested);
    if (entry && entry.areaType === areaType) {
      return { metricSelection: entry.key, customMetricText: '' };
    }
    return { metricSelection: CUSTOM_METRIC_VALUE, customMetricText: suggested };
  }
  return { metricSelection: '', customMetricText: '' };
}

export interface PromoteToFocusAreaButtonProps {
  source: 'review' | 'insight';
  /** reviewId when source='review', insightId when source='insight'. */
  sourceId: string;
  playerId: string;
  suggestedTitle: string;
  suggestedDescription: string;
  /** e.g. 'putting', 'approach', 'driving' — surfaced as a read-only chip. */
  suggestedAreaType: string;
  suggestedTargetMetric?: string;
  suggestedTargetValue?: number;
  /** Only used when source='review' — passed through as `reviewContext`. */
  reviewContext?: string;
  className?: string;
  /** Optional override for the trigger label. */
  label?: string;
}

export function PromoteToFocusAreaButton({
  source,
  sourceId,
  playerId,
  suggestedTitle,
  suggestedDescription,
  suggestedAreaType,
  suggestedTargetMetric,
  suggestedTargetValue,
  reviewContext,
  className,
  label = 'Add to focus areas',
}: PromoteToFocusAreaButtonProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState(suggestedTitle);
  const [description, setDescription] = useState(suggestedDescription);
  // Catalog-driven metric picker (see resolveInitialMetric above) — replaces
  // the old free-text 'Target metric' input. A catalog key resolves to an
  // exact METRIC_CATALOG entry so the windowed auto-tracker
  // (progress-drivers.ts → isWindowableFocusMetric) can pick it up; the
  // CUSTOM_METRIC_VALUE escape hatch still allows any free text, honestly
  // labeled as non-auto-tracking.
  const [metricSelection, setMetricSelection] = useState<string>(
    () => resolveInitialMetric(suggestedAreaType, suggestedTargetMetric).metricSelection,
  );
  const [customMetricText, setCustomMetricText] = useState<string>(
    () => resolveInitialMetric(suggestedAreaType, suggestedTargetMetric).customMetricText,
  );
  const [targetValue, setTargetValue] = useState<string>(
    suggestedTargetValue != null ? String(suggestedTargetValue) : '',
  );

  function reset() {
    setTitle(suggestedTitle);
    setDescription(suggestedDescription);
    const initialMetric = resolveInitialMetric(suggestedAreaType, suggestedTargetMetric);
    setMetricSelection(initialMetric.metricSelection);
    setCustomMetricText(initialMetric.customMetricText);
    setTargetValue(suggestedTargetValue != null ? String(suggestedTargetValue) : '');
    setSubmitting(false);
  }

  // Catalog metrics scoped to this area (empty for areas with no cached
  // metrics, e.g. 'mental_game'/'other' — the picker falls straight to
  // custom text, mirroring FocusAreaModal).
  const areaMetrics = metricsForArea(suggestedAreaType);
  const metricOptions: SelectOption[] = [
    // Leading empty-value option preserves the old `clearable` affordance
    // (fairway's Select has no built-in clear button) — picking it resets
    // back to "no metric chosen" instead of leaving no way to undo a pick.
    { value: '', label: 'No target metric' },
    ...areaMetrics.map((m) => ({ value: m.key, label: m.label })),
    { value: CUSTOM_METRIC_VALUE, label: 'Other (custom)' },
  ];

  function handleClose() {
    if (submitting) return;
    setOpen(false);
    // Defer reset so the form does not flash during the close animation.
    setTimeout(reset, 200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      addToast({
        type: 'error',
        title: 'Title required',
        description: 'Give your focus area a short, actionable title.',
      });
      return;
    }

    const parsedTargetValue =
      targetValue.trim() === '' ? undefined : Number(targetValue);
    if (parsedTargetValue !== undefined && !Number.isFinite(parsedTargetValue)) {
      addToast({
        type: 'error',
        title: 'Invalid target value',
        description: 'Target value must be a number.',
      });
      return;
    }

    const trimmedMetric =
      metricSelection === CUSTOM_METRIC_VALUE
        ? customMetricText.trim() || undefined
        : metricSelection || undefined;

    setSubmitting(true);
    try {
      const result =
        source === 'review'
          ? await createFocusAreaFromReview({
              playerId,
              reviewId: sourceId,
              title: trimmedTitle,
              description: description.trim(),
              areaType: suggestedAreaType,
              targetMetric: trimmedMetric,
              targetValue: parsedTargetValue,
              reviewContext,
            })
          : await createFocusAreaFromInsightV2({
              playerId,
              insightId: sourceId,
              title: trimmedTitle,
              description: description.trim(),
              areaType: suggestedAreaType,
              targetMetric: trimmedMetric,
              targetValue: parsedTargetValue,
            });

      if (result.success) {
        addToast({
          type: 'success',
          title: 'Added to focus areas',
        });
        setOpen(false);
        router.refresh();
        setTimeout(reset, 200);
      } else {
        addToast({
          type: 'error',
          title: 'Failed to add',
          description: result.error,
        });
        setSubmitting(false);
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to add',
        description: err instanceof Error ? err.message : undefined,
      });
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="primary"
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-lg',
          'bg-primary-600 text-white text-xs font-medium',
          'hover:bg-primary-700 active:scale-95 transition-all',
          'shadow-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50',
          className,
        )}
      >
        <IconTarget size={14} />
        {label}
      </Button>

      <Drawer
        open={open}
        onOpenChange={(next) => {
          if (!next) handleClose();
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Add to focus areas</DrawerTitle>
            <DrawerDescription>Build a coachable focus from this insight.</DrawerDescription>
          </DrawerHeader>
          <form
            onSubmit={handleSubmit}
            className="space-y-5 px-6 pb-6 overflow-y-auto overscroll-contain"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
          >
          {/* Read-only area-type chip */}
          <div>
            <p className="block text-sm font-medium text-warm-700 mb-1.5">
              Area
            </p>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
                'bg-primary-50 text-primary-700 border border-primary-200',
                'text-xs font-medium',
              )}
            >
              <IconTarget size={12} />
              {formatAreaType(suggestedAreaType)}
            </span>
          </div>

          {/* Title */}
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Tighten lag putts from 20-30 ft"
            required
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            maxLength={120}
          />

          {/* Description */}
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this focus area look like in practice?"
            rows={4}
            maxLength={600}
          />

          {/* Target metric + value — catalog-driven so a promoted area
              resolves to an exact METRIC_CATALOG key and auto-tracks, same
              picker contract as FocusAreaModal (src/components/fairway/pages/
              coachhelm/FocusAreaModal.tsx selectMetric, ~269-281). */}
          <div className="grid grid-cols-2 gap-3">
            {areaMetrics.length > 0 ? (
              // FairwayFormField (Base UI Field), not a bare sibling <label>:
              // Base UI's Select registers with the surrounding Field context
              // to associate its trigger with the label (id/aria-labelledby)
              // automatically — the same pattern FocusAreaModal.tsx uses for
              // its Player/Category Selects. A plain unassociated <label>
              // here fails jsx-a11y/label-has-associated-control since the
              // Select's trigger is a <button>, not a native labelable
              // control.
              <FairwayFormField label="Target metric (optional)">
                {/* Fairway Select, not the legacy ui/select.tsx: this Drawer
                    wraps @radix-ui/react-dialog (via vaul) which traps focus
                    by real DOM containment, and ui/select.tsx's dropdown
                    portals to document.body with its own hand-rolled
                    fixed-position math that isn't containing-block-aware —
                    nesting it inside the Drawer's transformed content would
                    both fight the focus trap AND mis-place the popup. The
                    fairway Select (Base UI + floating-ui) handles both
                    correctly once ui/drawer.tsx's DrawerContent hands it a
                    portal container via ModalPortalContext. */}
                <FairwaySelect
                  options={metricOptions}
                  value={metricSelection || undefined}
                  onValueChange={(v) => setMetricSelection(v ?? '')}
                  placeholder="Select a metric…"
                />
              </FairwayFormField>
            ) : (
              <Input
                label="Target metric (optional)"
                value={customMetricText}
                onChange={(e) => setCustomMetricText(e.target.value)}
                placeholder="e.g. Pre-shot routine consistency"
              />
            )}
            <Input
              label="Target value (optional)"
              type="number"
              inputMode="decimal"
              step="any"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="e.g. 5"
            />
          </div>

          {areaMetrics.length > 0 && metricSelection === CUSTOM_METRIC_VALUE ? (
            <div>
              <Input
                label="Custom metric name"
                value={customMetricText}
                onChange={(e) => setCustomMetricText(e.target.value)}
                placeholder="e.g. Pre-shot routine consistency"
              />
              <p className="mt-1.5 text-xs text-warm-500">
                Custom metrics won&apos;t auto-track — update progress manually.
              </p>
            </div>
          ) : null}

          {areaMetrics.length === 0 ? (
            <p className="-mt-3 text-xs text-warm-500">
              Custom metrics won&apos;t auto-track — update progress manually.
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting} disabled={submitting}>
              Confirm
            </Button>
          </div>
        </form>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** Pretty-print snake_case area types for the read-only chip. */
function formatAreaType(raw: string): string {
  if (!raw) return 'Focus area';
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default PromoteToFocusAreaButton;
