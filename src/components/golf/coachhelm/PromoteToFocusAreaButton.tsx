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
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { IconTarget } from '@/components/icons';
import {
  createFocusAreaFromReview,
  createFocusAreaFromInsightV2,
} from '@/app/golf/actions/development';

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
  const [targetMetric, setTargetMetric] = useState(suggestedTargetMetric ?? '');
  const [targetValue, setTargetValue] = useState<string>(
    suggestedTargetValue != null ? String(suggestedTargetValue) : '',
  );

  function reset() {
    setTitle(suggestedTitle);
    setDescription(suggestedDescription);
    setTargetMetric(suggestedTargetMetric ?? '');
    setTargetValue(suggestedTargetValue != null ? String(suggestedTargetValue) : '');
    setSubmitting(false);
  }

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

    const trimmedMetric = targetMetric.trim() || undefined;

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
      <button
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
      </button>

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
            <label className="block text-sm font-medium text-warm-700 mb-1.5">
              Area
            </label>
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

          {/* Optional target metric + value */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Target metric (optional)"
              value={targetMetric}
              onChange={(e) => setTargetMetric(e.target.value)}
              placeholder="e.g. 3-putt %"
            />
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
