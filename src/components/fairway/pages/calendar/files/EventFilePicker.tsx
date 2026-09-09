'use client';

/**
 * EventFilePicker — attach-from-library (SCREEN-BUILD-PLAN §2.6). No upload
 * here: the legacy section's own note that upload is unavailable from the
 * calendar still holds (gate G5) — this only lets a coach attach a document
 * that already exists in the team's library (`golf_documents`).
 */

import * as React from 'react';
import { Search, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import surfaces from '../CalendarSurfaces.module.css';
import { ModalShell, Button, Input, Segmented, EmptyState, InlineNotice, Skeleton } from '@/components/fairway';
import { getDocuments } from '@/app/golf/actions/documents';
import { attachDocumentToEvent } from '@/app/golf/actions/event-documents';
import type { GolfDocument } from '@/lib/types/golf';

export interface EventFilePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  teamId: string;
  /** Document ids already attached — filtered out of the pickable list. */
  attachedDocumentIds: ReadonlySet<string>;
  onAttached: (documentId: string) => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; documents: GolfDocument[] }
  | { status: 'failed'; error: string };

export function EventFilePicker({
  open,
  onOpenChange,
  eventId,
  teamId,
  attachedDocumentIds,
  onAttached,
}: EventFilePickerProps) {
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState<string>('all');
  const [attachingId, setAttachingId] = React.useState<string | null>(null);
  const [attachError, setAttachError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !teamId) return;
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const result = await getDocuments(teamId);
        if (cancelled) return;
        if (result.error || !result.data) {
          setState({ status: 'failed', error: result.error ?? 'Could not load the document library.' });
          return;
        }
        setState({ status: 'loaded', documents: result.data });
      } catch {
        if (!cancelled) setState({ status: 'failed', error: 'Could not load the document library.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, teamId]);

  const documents = state.status === 'loaded' ? state.documents : [];
  const categories = React.useMemo(
    () => Array.from(new Set(documents.map((d) => d.category).filter((c): c is string => Boolean(c)))),
    [documents],
  );

  const searchLower = search.trim().toLowerCase();
  const filtered = documents
    .filter((d) => !attachedDocumentIds.has(d.id))
    .filter((d) => category === 'all' || d.category === category)
    .filter((d) => !searchLower || d.title.toLowerCase().includes(searchLower));

  const handleAttach = async (documentId: string) => {
    setAttachingId(documentId);
    setAttachError(null);
    try {
      const result = await attachDocumentToEvent(eventId, documentId);
      if (!result.success) {
        setAttachError(result.error ?? 'Could not attach this file. Try again.');
        return;
      }
      onAttached(documentId);
      onOpenChange(false);
    } catch {
      setAttachError('Could not attach this file. Try again.');
    } finally {
      setAttachingId(null);
    }
  };

  return (
    <ModalShell open={open} onOpenChange={onOpenChange} size="lg" title="Attach a file">
      <ModalShell.Body className="flex flex-col gap-3">
        <Input
          leading={<Search className="h-4 w-4" aria-hidden />}
          placeholder="Search the team library"
          aria-label="Search documents"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {categories.length > 1 ? (
          <Segmented
            aria-label="Filter by category"
            value={category}
            onValueChange={setCategory}
            options={[{ value: 'all', label: 'All' }, ...categories.map((c) => ({ value: c, label: c.replace(/_/g, ' ') }))]}
            size="sm"
          />
        ) : null}

        {attachError ? <InlineNotice tone="danger">{attachError}</InlineNotice> : null}

        {state.status === 'loading' ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 rounded-fw-md" />
            ))}
          </div>
        ) : state.status === 'failed' ? (
          <EmptyState
            variant="subtle"
            title="Couldn't load the library"
            description={state.error}
            action={
              <Button variant="secondary" size="sm" onClick={() => setState({ status: 'loading' })}>
                Retry
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="search"
            title={documents.length === 0 ? 'No documents in your team library yet' : 'No matches'}
            description={documents.length === 0 ? undefined : 'Try a different search or category.'}
          />
        ) : (
          <ul className="flex max-h-96 flex-col gap-1.5 overflow-y-auto" role="list">
            {filtered.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => handleAttach(doc.id)}
                  disabled={attachingId !== null}
                  className={cn(
                    'flex w-full min-h-11 items-center justify-between gap-3 rounded-fw-md bg-surface-sunken px-3.5 py-2.5 text-left',
                    'transition-colors hover:bg-surface-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                    'disabled:opacity-60',
                    surfaces.press,
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Paperclip className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
                    <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                      {doc.title}
                    </span>
                  </span>
                  <span className="shrink-0 font-fw-sans text-caption text-text-tertiary">
                    {attachingId === doc.id ? 'Attaching…' : doc.category ?? ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ModalShell.Body>
    </ModalShell>
  );
}
