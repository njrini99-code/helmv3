'use client';

/**
 * EventFilesSection — files on an event (SCREEN-BUILD-PLAN §2.6). Self-
 * contained data fetch (same pattern as the drawer's linked-itinerary
 * lookup): keyed by `active` + `eventId`, failure-silent to a Retry state,
 * never assuming a document exists that hasn't loaded.
 *
 * Presentation (calendar.mobile.md "CONTAINERS TO REMOVE / MERGE" item 5):
 * an eyebrow ("Files · N") above one InsetGroup, a row per file — no
 * wrapper card around the section in the drawer.
 */

import * as React from 'react';
import { ExternalLink, FileText, Paperclip, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, EmptyState, InlineNotice, Skeleton, InsetGroup, Eyebrow } from '@/components/fairway';
import { getEventDocuments, detachDocumentFromEvent, type EventDocumentRow } from '@/app/golf/actions/event-documents';
import { EventFilePicker } from './EventFilePicker';

export interface EventFilesSectionProps {
  eventId: string;
  teamId: string;
  isCoach: boolean;
  active: boolean;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; rows: EventDocumentRow[] }
  | { status: 'failed'; error: string };

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function EventFilesSection({ eventId, teamId, isCoach, active }: EventFilesSectionProps) {
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [detachError, setDetachError] = React.useState<string | null>(null);
  const [detachingId, setDetachingId] = React.useState<string | null>(null);
  const requestRef = React.useRef(0);

  const load = React.useCallback(() => {
    if (!active || !eventId) return;
    const requestId = ++requestRef.current;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const result = await getEventDocuments(eventId);
        if (requestId !== requestRef.current) return;
        if (!result.success || !result.data) {
          setState({ status: 'failed', error: result.error ?? 'Could not load attachments.' });
          return;
        }
        setState({ status: 'loaded', rows: result.data });
      } catch {
        if (requestId === requestRef.current) {
          setState({ status: 'failed', error: 'Could not load attachments.' });
        }
      }
    })();
  }, [active, eventId]);

  React.useEffect(() => {
    load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  if (!active) return null;

  const rows = state.status === 'loaded' ? state.rows : [];

  const handleDetach = async (documentId: string) => {
    setDetachingId(documentId);
    setDetachError(null);
    const previous = rows;
    setState({ status: 'loaded', rows: rows.filter((r) => r.document.id !== documentId) });
    try {
      const result = await detachDocumentFromEvent(eventId, documentId);
      if (!result.success) {
        setState({ status: 'loaded', rows: previous });
        setDetachError(result.error ?? 'Could not remove this file. Try again.');
      }
    } catch {
      setState({ status: 'loaded', rows: previous });
      setDetachError('Could not remove this file. Try again.');
    } finally {
      setDetachingId(null);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Eyebrow as="p">
          Files{state.status === 'loaded' ? ` · ${rows.length}` : ''}
        </Eyebrow>
        {isCoach && state.status !== 'failed' ? (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Paperclip className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => setPickerOpen(true)}
          >
            Attach file
          </Button>
        ) : null}
      </div>

      {detachError ? (
        <div className="mb-3">
          <InlineNotice tone="danger" dismissible onDismiss={() => setDetachError(null)}>
            {detachError}
          </InlineNotice>
        </div>
      ) : null}

      {state.status === 'loading' ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 rounded-fw-md" />
          ))}
        </div>
      ) : state.status === 'failed' ? (
        <div className={cn('flex items-center justify-between gap-3 rounded-fw-md px-4 py-3', 'border border-fw-warning-ring bg-fw-warning-bg text-fw-warning-ink')}>
          <p className="font-fw-sans text-body-sm">{state.error}</p>
          <Button variant="secondary" size="sm" onClick={load} leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        isCoach ? (
          <EmptyState
            variant="subtle"
            icon={<FileText className="h-5 w-5" strokeWidth={1.75} />}
            title="No files attached"
            description="Attach a practice plan, roster, or other document from your team library."
            action={
              <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
                Attach file
              </Button>
            }
          />
        ) : (
          <p className="font-fw-sans text-body-sm text-text-tertiary">No files attached.</p>
        )
      ) : (
        <InsetGroup variant="inset">
          {rows.map(({ document, attachedAt, note }) => (
            <InsetGroup.Row
              key={document.id}
              trailing={
                isCoach ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDetach(document.id)}
                    disabled={detachingId === document.id}
                    aria-label={`Remove ${document.title}`}
                    className="h-9 w-9 shrink-0 rounded-fw-sm p-0 text-text-tertiary hover:bg-surface hover:text-fw-danger-ink disabled:opacity-50"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                ) : undefined
              }
            >
              <a
                href={document.file_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${document.title} (opens in a new tab)`}
                className={cn(
                  'flex min-w-0 items-center gap-2.5 rounded-fw-sm outline-none',
                  'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1',
                )}
              >
                <FileText className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                    {document.title}
                    <ExternalLink className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden />
                  </span>
                  <span className="font-fw-sans text-caption text-text-tertiary">
                    {[formatSize(document.file_size), `Attached ${formatDate(attachedAt)}`, note]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </a>
            </InsetGroup.Row>
          ))}
        </InsetGroup>
      )}

      {isCoach ? (
        <EventFilePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          eventId={eventId}
          teamId={teamId}
          attachedDocumentIds={new Set(rows.map((r) => r.document.id))}
          onAttached={() => load()}
        />
      ) : null}
    </div>
  );
}
