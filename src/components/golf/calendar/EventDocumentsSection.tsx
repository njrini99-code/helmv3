'use client';

/**
 * EventDocumentsSection — surfaces the documents attached to a calendar
 * event. Coaches get an "Attach document" affordance that pops a picker
 * over the team's existing golf_documents (no upload here — re-uses the
 * documents library so attachments stay in one place). Players see the
 * read-only list with click-to-open.
 *
 * Expected wiring: pass the event id + team id and the section handles
 * load + attach + detach internally. Drop into EventDetailModal and
 * MobileEventSheet — both render the same component.
 */

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Paperclip,
  FileText,
  Image as ImageIcon,
  File,
  Plus,
  X,
  Search,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { toast } from '@/components/ui/toast';
import {
  attachDocumentToEvent,
  detachDocumentFromEvent,
  getEventDocuments,
  type EventDocumentRow,
} from '@/app/golf/actions/event-documents';
import { getDocuments } from '@/app/golf/actions/documents';
import type { GolfDocument } from '@/lib/types/golf';

interface EventDocumentsSectionProps {
  eventId: string | null;
  teamId: string | null;
  isCoach: boolean;
  /** Subtle UI variation when rendered in the mobile bottom sheet. */
  compact?: boolean;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIconFor(fileType: string | null | undefined) {
  const t = (fileType ?? '').toLowerCase();
  if (t.startsWith('image/')) return ImageIcon;
  if (t.includes('pdf') || t === 'application/pdf') return FileText;
  return File;
}

export function EventDocumentsSection({
  eventId,
  teamId,
  isCoach,
  compact = false,
}: EventDocumentsSectionProps) {
  const [attached, setAttached] = useState<EventDocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) {
      setAttached([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getEventDocuments(eventId).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setAttached(res.data);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const handleAttach = async (docId: string) => {
    if (!eventId) return;
    setPendingAction(docId);
    const res = await attachDocumentToEvent(eventId, docId);
    if (res.success) {
      const refreshed = await getEventDocuments(eventId);
      if (refreshed.success && refreshed.data) setAttached(refreshed.data);
      toast.success('Attached', 'Document added to this event.');
      setShowPicker(false);
    } else {
      toast.error('Could not attach', res.error || 'Try again in a moment.');
    }
    setPendingAction(null);
  };

  const handleDetach = async (docId: string) => {
    if (!eventId) return;
    setPendingAction(docId);
    const res = await detachDocumentFromEvent(eventId, docId);
    if (res.success) {
      setAttached((prev) => prev.filter((r) => r.document.id !== docId));
    } else {
      toast.error('Could not remove', res.error || 'Try again in a moment.');
    }
    setPendingAction(null);
  };

  if (!eventId) {
    return null;
  }

  const sectionPadding = compact ? 'px-0 pb-0' : 'px-1 pb-1';

  return (
    <section className={cn('space-y-2', sectionPadding)} aria-label="Attachments">
      <div className="flex items-center justify-between gap-2">
        <h4 className={cn(
          'flex items-center gap-1.5 font-semibold text-warm-900',
          compact ? 'text-sm' : 'text-sm',
        )}>
          <Paperclip className="w-4 h-4 text-warm-500" />
          Documents
          {attached.length > 0 && (
            <span className="text-[11px] text-warm-500 tabular-nums font-medium">
              ({attached.length})
            </span>
          )}
        </h4>
        {isCoach && (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-50 hover:bg-primary-100 text-primary-700 text-xs font-semibold ring-1 ring-primary-100 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Attach
          </button>
        )}
      </div>

      {loading && attached.length === 0 ? (
        <div className="flex items-center gap-2 text-warm-400 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading attachments…
        </div>
      ) : attached.length === 0 ? (
        <p className="text-xs text-warm-500">
          {isCoach
            ? 'No documents attached yet. Tap Attach to add a practice plan, scouting report, or other team file.'
            : 'No documents attached for this event.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {attached.map((row) => {
            const Icon = fileIconFor(row.document.file_type);
            const sizeLabel = formatFileSize(row.document.file_size);
            return (
              <li
                key={row.document.id}
                className="group flex items-center gap-3 px-3 py-2 rounded-xl bg-white/70 ring-1 ring-warm-200/60 hover:bg-white transition-colors"
              >
                <span className="w-8 h-8 rounded-lg bg-primary-50 ring-1 ring-primary-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-primary-700" />
                </span>
                <div className="flex-1 min-w-0">
                  <a
                    href={row.document.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-warm-900 hover:text-primary-700 truncate block"
                  >
                    {row.document.title}
                    <ExternalLink className="inline-block w-3 h-3 ml-1 align-middle text-warm-400" />
                  </a>
                  <p className="text-[11px] text-warm-500 truncate">
                    {[row.document.category, sizeLabel].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {isCoach && (
                  <button
                    type="button"
                    onClick={() => handleDetach(row.document.id)}
                    disabled={pendingAction === row.document.id}
                    className={cn(
                      'flex-shrink-0 p-1.5 rounded-lg text-warm-400',
                      'hover:bg-rose-50 hover:text-rose-600',
                      'transition-colors disabled:opacity-50',
                    )}
                    aria-label={`Remove ${row.document.title}`}
                  >
                    {pendingAction === row.document.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showPicker && teamId && (
        <DocumentPickerDialog
          teamId={teamId}
          alreadyAttachedIds={new Set(attached.map((r) => r.document.id))}
          onCancel={() => setShowPicker(false)}
          onPick={handleAttach}
          pendingAction={pendingAction}
        />
      )}
    </section>
  );
}

interface DocumentPickerDialogProps {
  teamId: string;
  alreadyAttachedIds: Set<string>;
  onCancel: () => void;
  onPick: (documentId: string) => void;
  pendingAction: string | null;
}

function DocumentPickerDialog({
  teamId,
  alreadyAttachedIds,
  onCancel,
  onPick,
  pendingAction,
}: DocumentPickerDialogProps) {
  const [docs, setDocs] = useState<GolfDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDocuments(teamId).then((res) => {
      if (cancelled) return;
      if (res.data) setDocs(res.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (!q) return true;
      return (
        (d.title ?? '').toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q) ||
        (d.category ?? '').toLowerCase().includes(q)
      );
    });
  }, [docs, query]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-doc-picker-title"
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col bg-white/95 backdrop-blur-xl rounded-2xl border border-white/40 shadow-glass overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-warm-200/60 bg-gradient-to-br from-white/70 via-warm-50/40 to-primary-50/15">
          <h3
            id="event-doc-picker-title"
            className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-warm-900"
          >
            Attach a document
          </h3>
          <p className="text-sm text-warm-500 mt-0.5">
            Pick from your team library. New uploads happen on the Documents page.
          </p>
        </div>

        <div className="px-4 py-3 border-b border-warm-200/60">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, category, description…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-warm-50 border-0 focus:bg-white focus:ring-2 focus:ring-primary-100 transition-colors text-warm-900 placeholder:text-warm-400"
              aria-label="Search documents"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-warm-400 text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading library…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-warm-500">
                {query ? 'No documents match that search.' : 'Your team library is empty.'}
              </p>
              <p className="text-[11px] text-warm-400 mt-1">
                Visit Documents to upload one first.
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((d) => {
                const Icon = fileIconFor(d.file_type);
                const sizeLabel = formatFileSize(d.file_size);
                const alreadyAttached = alreadyAttachedIds.has(d.id);
                const pending = pendingAction === d.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => !alreadyAttached && !pending && onPick(d.id)}
                      disabled={alreadyAttached || pending}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left',
                        'transition-colors',
                        alreadyAttached
                          ? 'bg-warm-50 opacity-60 cursor-not-allowed'
                          : 'hover:bg-warm-50 active:bg-warm-100',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                      )}
                    >
                      <span className="w-9 h-9 rounded-lg bg-primary-50 ring-1 ring-primary-100 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary-700" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-warm-900 truncate">
                          {d.title}
                        </p>
                        <p className="text-[11px] text-warm-500 truncate">
                          {[d.category, sizeLabel].filter(Boolean).join(' · ') || 'Document'}
                        </p>
                      </div>
                      {pending ? (
                        <Loader2 className="w-4 h-4 animate-spin text-warm-400 flex-shrink-0" />
                      ) : alreadyAttached ? (
                        <span className="text-[11px] text-warm-500 flex-shrink-0 font-medium">
                          Attached
                        </span>
                      ) : (
                        <Plus className="w-4 h-4 text-warm-400 flex-shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 border-t border-warm-200/60 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium text-warm-600 hover:text-warm-900 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
