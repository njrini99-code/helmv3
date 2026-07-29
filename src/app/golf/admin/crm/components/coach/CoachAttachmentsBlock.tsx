'use client';

import { IconPaperclip } from '@/components/icons';

// ============================================================================
// CoachAttachmentsBlock — placeholder for the attachments surface.
// Phase 1 schema does not define an attachments table for CRM coaches; the
// placeholder ships intentionally so the per-coach page layout stabilizes
// before Phase 3+ adds the real implementation.
// ============================================================================

interface CoachAttachmentsBlockProps {
  coachId: string;
}

export function CoachAttachmentsBlock({ coachId: _coachId }: CoachAttachmentsBlockProps) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-fw-sm bg-surface-sunken text-text-tertiary flex items-center justify-center">
            <IconPaperclip size={14} />
          </span>
          <h2 className="text-sm font-semibold text-text-primary">Attachments</h2>
        </div>
        <span className="text-eyebrow uppercase tracking-wider text-text-tertiary font-semibold">
          Coming soon
        </span>
      </div>
      <div className="px-5 py-8 text-center">
        <p className="text-sm text-text-tertiary">
          File attachments aren’t wired up yet for CRM coaches.
        </p>
        <p className="text-xs text-text-tertiary mt-1">
          Once enabled, you’ll be able to drag-and-drop proposals, signed contracts,
          and other artifacts here. For now, store them in your existing document
          system and link them from the timeline notes.
        </p>
      </div>
    </div>
  );
}
