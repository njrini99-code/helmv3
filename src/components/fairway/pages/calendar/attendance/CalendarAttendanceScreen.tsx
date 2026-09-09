'use client';

/**
 * CalendarAttendanceScreen — S5 (SCREEN-BUILD-PLAN.md §2.5). Opened from the
 * event detail drawer's Attendance section. Replaces the legacy
 * `AttendancePanel` embed.
 *
 * A stable roster grouped by RSVP response (Accepted / Tentative / Declined /
 * No response — group membership never changes while the coach works, only
 * the mark within a row does), a persistent unsaved-count, and a bulk
 * "Mark selected present" that only stages a pending mark (Save still
 * required). Player callers see their own row only, read-only, with other
 * players' notes already stripped server-side (attendance.ts finding #30).
 */

import * as React from 'react';
import { CalendarClock, RefreshCw, Search, UsersRound } from 'lucide-react';
import { ModalShell, Button, Input, EmptyState, InlineNotice } from '@/components/fairway';
import { getAttendanceReport, type AttendanceRecord } from '@/app/golf/actions/attendance';
import { AttendanceRow } from './AttendanceRow';
import { useAttendanceDraft, type DraftMark } from './useAttendanceDraft';

export interface CalendarAttendanceScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
  /** True from the server's RSVP-group perspective is resolved per-viewer by
   * getAttendanceReport itself; this only gates which controls render. */
  isCoach: boolean;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; rows: AttendanceRecord[]; viewerIsCoach: boolean; viewerPlayerId: string | null }
  | { status: 'failed'; error: string };

const GROUP_ORDER: Array<{ key: string; label: string; test: (status: AttendanceRecord['status']) => boolean }> = [
  { key: 'accepted', label: 'Accepted', test: (s) => s === 'accepted' || s === 'attending' },
  { key: 'tentative', label: 'Tentative', test: (s) => s === 'tentative' || s === 'maybe' },
  { key: 'declined', label: 'Declined', test: (s) => s === 'declined' || s === 'not_attending' },
  {
    key: 'no_response',
    label: 'No response',
    test: (s) => !s || s === 'pending' || s === 'excused' || s === 'unexcused',
  },
];

export function CalendarAttendanceScreen({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  isCoach,
}: CalendarAttendanceScreenProps) {
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });
  const [rows, setRows] = React.useState<AttendanceRecord[]>([]);
  const [search, setSearch] = React.useState('');
  const [noteEditorFor, setNoteEditorFor] = React.useState<string | null>(null);
  const requestRef = React.useRef(0);
  const [isOffline, setIsOffline] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setIsOffline(!navigator.onLine);
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const load = React.useCallback(() => {
    if (!eventId) return;
    const requestId = ++requestRef.current;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const result = await getAttendanceReport(eventId);
        if (requestId !== requestRef.current) return;
        if (!result.success || !result.data) {
          setState({ status: 'failed', error: result.error ?? 'Could not load attendance.' });
          return;
        }
        setRows(result.data.attendance);
        setState({
          status: 'loaded',
          rows: result.data.attendance,
          viewerIsCoach: result.data.viewerIsCoach,
          viewerPlayerId: result.data.viewerPlayerId,
        });
      } catch {
        if (requestId === requestRef.current) {
          setState({ status: 'failed', error: 'Could not load attendance.' });
        }
      }
    })();
  }, [eventId]);

  React.useEffect(() => {
    if (open) load();
    return () => {
      requestRef.current += 1;
    };
  }, [open, load]);

  const draft = useAttendanceDraft(eventId, rows);

  if (!open) return null;

  const loaded = state.status === 'loaded';
  const viewerIsCoach = loaded ? state.viewerIsCoach : isCoach;
  const viewerPlayerId = loaded ? state.viewerPlayerId : null;

  const visibleRows = viewerIsCoach ? rows : rows.filter((r) => r.player_id === viewerPlayerId);

  const searchLower = search.trim().toLowerCase();
  const filteredRows = searchLower
    ? visibleRows.filter((r) => {
        const name = `${r.player?.first_name ?? ''} ${r.player?.last_name ?? ''}`.toLowerCase();
        return name.includes(searchLower);
      })
    : visibleRows;

  const groups = GROUP_ORDER.map((g) => ({
    ...g,
    rows: filteredRows.filter((r) => g.test(r.status)),
  })).filter((g) => g.rows.length > 0);

  const handleSave = async () => {
    const summary = await draft.save();
    return summary;
  };

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      size="full"
      title={`Attendance · ${eventTitle}`}
      className="flex h-[min(44rem,calc(100dvh-2rem))] flex-col"
    >
      <ModalShell.Body className="flex min-h-0 flex-1 flex-col gap-4">
        {state.status === 'loading' ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <p className="font-fw-sans text-body-sm text-text-tertiary">Loading roster…</p>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-fw-md bg-surface-sunken" />
            ))}
          </div>
        ) : state.status === 'failed' ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<RefreshCw className="h-7 w-7" strokeWidth={1.75} />}
              title="Couldn't load attendance"
              description={state.error}
              action={
                <Button variant="primary" onClick={load}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<UsersRound className="h-7 w-7" strokeWidth={1.75} />}
              title="No one invited yet"
              description="Invite players from Edit event before recording attendance."
            />
          </div>
        ) : (
          <>
            {viewerIsCoach ? (
              <Input
                leading={<Search className="h-4 w-4" aria-hidden />}
                placeholder="Search players"
                aria-label="Search players"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            ) : null}

            {viewerIsCoach && draft.selected.size > 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-fw-md bg-surface-sunken px-3.5 py-2.5">
                <span className="font-fw-sans text-body-sm text-text-secondary">
                  {draft.selected.size} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={draft.clearSelection}>
                    Clear
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSaveMessage(null);
                      draft.markSelectedPresent();
                    }}
                  >
                    Mark selected present
                  </Button>
                </div>
              </div>
            ) : null}

            {isOffline ? (
              <InlineNotice tone="warning">
                Edits are kept while you&apos;re offline. Reconnect to save.
              </InlineNotice>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto pr-0.5" data-testid="attendance-roster">
              {groups.length === 0 ? (
                <p className="py-6 text-center font-fw-sans text-body-sm text-text-tertiary">
                  No one matches “{search}”.
                </p>
              ) : (
                <div className="flex flex-col gap-5">
                  {groups.map((group) => (
                    <div key={group.key}>
                      <p className="mb-2 font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
                        {group.label} · {group.rows.length}
                      </p>
                      <div className="flex flex-col gap-2">
                        {group.rows.map((record) => {
                          const mark = draft.markFor(record.player_id);
                          const isPending = draft.pending.has(record.player_id);
                          return (
                            <AttendanceRow
                              key={record.id}
                              record={record}
                              mark={mark}
                              isPending={isPending}
                              error={draft.rowErrors.get(record.player_id)}
                              selectable={viewerIsCoach}
                              selected={draft.selected.has(record.player_id)}
                              onToggleSelected={() => draft.toggleSelected(record.player_id)}
                              onMarkChange={(next: DraftMark) => {
                                setSaveMessage(null);
                                draft.setMark(record.player_id, next);
                              }}
                              showTimes
                              disabled={draft.saving}
                              readOnly={!viewerIsCoach}
                              noteEditor={
                                viewerIsCoach
                                  ? {
                                      eventId,
                                      open: noteEditorFor === record.player_id,
                                      onOpenChange: (next) =>
                                        setNoteEditorFor(next ? record.player_id : null),
                                      onSaved: (note) => {
                                        setRows((prev) =>
                                          prev.map((r) =>
                                            r.player_id === record.player_id ? { ...r, notes: note } : r,
                                          ),
                                        );
                                      },
                                    }
                                  : undefined
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </ModalShell.Body>

      {viewerIsCoach && loaded && visibleRows.length > 0 ? (
        <ModalShell.Footer className="flex items-center justify-between gap-3 border-t border-border-subtle px-6 py-4">
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 font-fw-sans text-body-sm text-text-secondary"
          >
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {saveMessage ?? (draft.pendingCount > 0 ? `${draft.pendingCount} unsaved` : 'All changes saved')}
          </p>
          <Button
            variant="primary"
            busy={draft.saving}
            disabled={draft.pendingCount === 0 || isOffline}
            onClick={async () => {
              const summary = await handleSave();
              // A clean save (nothing failed) just returns to the live
              // pendingCount/"All changes saved" state; a partial failure
              // pins the exact §2.5 phrasing until the next edit or save
              // attempt clears it (see the onMarkChange/bulk wrappers above).
              setSaveMessage(
                summary.failed > 0
                  ? `${summary.saved} saved, ${summary.failed} failed, still pending`
                  : null,
              );
            }}
          >
            {draft.saving ? 'Saving…' : 'Save attendance'}
          </Button>
        </ModalShell.Footer>
      ) : null}
    </ModalShell>
  );
}
