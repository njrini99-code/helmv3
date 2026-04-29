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
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass overflow-hidden">
      <div className="px-5 py-4 border-b border-warm-100/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-warm-100 text-warm-500 flex items-center justify-center">
            <IconPaperclip size={14} />
          </span>
          <h2 className="text-sm font-semibold text-warm-900">Attachments</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-warm-400 font-semibold">
          Coming soon
        </span>
      </div>
      <div className="px-5 py-8 text-center">
        <p className="text-sm text-warm-500">
          File attachments aren’t wired up yet for CRM coaches.
        </p>
        <p className="text-xs text-warm-400 mt-1">
          Once enabled, you’ll be able to drag-and-drop proposals, signed contracts,
          and other artifacts here. For now, store them in your existing document
          system and link them from the timeline notes.
        </p>
      </div>
    </div>
  );
}
