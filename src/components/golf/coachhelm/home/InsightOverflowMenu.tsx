'use client';

import { useState } from 'react';
import { Check, MoreHorizontal, X } from 'lucide-react';
import { Button, PopoverPanel } from '@/components/fairway';

/**
 * HUB-04: an insight shows at most one visible action. Feedback on the read
 * itself (acknowledge or helpful, dismiss) is secondary, so it lives behind
 * one "More" trigger instead of two buttons competing with the main action.
 * Used by the insights sheet (InsightsDrill) and the overview's lead insight
 * (HubInsight).
 */
export function InsightOverflowMenu({
  onPositive,
  onDismiss,
  positiveLabel = 'Acknowledge',
}: {
  onPositive: () => void;
  onDismiss: () => void;
  positiveLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <PopoverPanel
      open={open}
      onOpenChange={setOpen}
      surface="matte"
      side="top"
      align="start"
      width="sm"
      ariaLabel="Insight feedback"
      data-slot="insight-overflow-menu"
      trigger={
        <Button type="button" variant="ghost" aria-label="More insight actions" leftIcon={<MoreHorizontal aria-hidden className="h-4 w-4" />}>
          More
        </Button>
      }
    >
      <PopoverPanel.Item
        onClick={() => {
          setOpen(false);
          onPositive();
        }}
      >
        <Check aria-hidden className="h-4 w-4" />
        {positiveLabel}
      </PopoverPanel.Item>
      <PopoverPanel.Item
        onClick={() => {
          setOpen(false);
          onDismiss();
        }}
      >
        <X aria-hidden className="h-4 w-4" />
        Dismiss
      </PopoverPanel.Item>
    </PopoverPanel>
  );
}
