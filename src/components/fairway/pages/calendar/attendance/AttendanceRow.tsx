'use client';

import { NotebookPen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Segmented, Checkbox } from '@/components/fairway';
import surfaces from '../CalendarSurfaces.module.css';
import { enterStyle } from '../motion';
import type { AttendanceRecord } from '@/app/golf/actions/attendance';
import type { DraftMark } from './useAttendanceDraft';
import { AttendanceNoteEditor } from './AttendanceNoteEditor';

const MARK_OPTIONS = [
  { value: 'present' as const, label: 'Present' },
  { value: 'late' as const, label: 'Late' },
  { value: 'no_show' as const, label: 'No-show' },
];

export interface AttendanceRowProps {
  record: AttendanceRecord;
  mark: DraftMark | null;
  isPending: boolean;
  error?: string;
  /** Coach-only bulk selection checkbox. Omit entirely for the player view. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  onMarkChange?: (mark: DraftMark) => void;
  /**
   * Present only when `updateAttendanceNote` is wired (N1) AND the caller is
   * a coach. The row owns the popover so it anchors to the actual note
   * button instead of a disconnected trigger.
   */
  noteEditor?: {
    eventId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: (note: string | null) => void;
  };
  /** Desktop: show RSVP + check-in timestamps alongside the controls. */
  showTimes?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Position in the roster for the staggered `.enter` reveal. */
  enterIndex?: number;
}

function playerName(record: AttendanceRecord): string {
  const first = record.player?.first_name ?? '';
  const last = record.player?.last_name ?? '';
  const full = `${first} ${last}`.trim();
  return full || 'Unnamed player';
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function AttendanceRow({
  record,
  mark,
  isPending,
  error,
  selectable = false,
  selected = false,
  onToggleSelected,
  onMarkChange,
  noteEditor,
  showTimes = false,
  disabled = false,
  readOnly = false,
  enterIndex,
}: AttendanceRowProps) {
  const name = playerName(record);
  const jersey = record.player?.jersey_number;
  const segmentValue: (typeof MARK_OPTIONS)[number]['value'] | '' =
    mark && mark !== 'clear' ? mark : '';

  return (
    <div
      role="group"
      aria-label={name}
      className={cn(
        'flex flex-col gap-2 rounded-fw-md border border-transparent bg-surface-sunken px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between',
        isPending && surfaces.pending,
        enterIndex !== undefined && surfaces.enter,
      )}
      style={enterStyle(enterIndex)}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {selectable ? (
          <Checkbox
            aria-label={`Select ${name} for bulk present`}
            checked={selected}
            onCheckedChange={() => onToggleSelected?.()}
            disabled={disabled}
          />
        ) : null}
        <div className="min-w-0">
          <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
            {name}
            {typeof jersey === 'number' ? (
              <span className="ml-1.5 text-text-tertiary">#{jersey}</span>
            ) : null}
          </p>
          {showTimes ? (
            <p className="font-fw-sans text-caption text-text-tertiary">
              {formatTime(record.rsvp_at) ? `RSVP ${formatTime(record.rsvp_at)}` : 'No response yet'}
              {record.checked_in_at ? ` · Checked in ${formatTime(record.checked_in_at)}` : ''}
            </p>
          ) : null}
          {error ? (
            <p className="font-fw-sans text-caption text-fw-danger-ink" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        {readOnly ? (
          <span className="font-fw-sans text-body-sm text-text-secondary">
            {mark === 'present' ? 'Present' : mark === 'late' ? 'Late' : mark === 'no_show' ? 'No-show' : 'Not marked yet'}
          </span>
        ) : (
          <Segmented
            aria-label={`${name} attendance`}
            options={MARK_OPTIONS}
            value={segmentValue}
            onValueChange={(next) => {
              // Segmented (single-select toggle group) never fires a
              // deselect on re-click of the active item, so `next` is
              // always one of MARK_OPTIONS' real values, never ''. The
              // guard exists only to keep that guarantee out of DraftMark's
              // type instead of widening it to include ''.
              if (next) onMarkChange?.(next);
            }}
            size="sm"
          />
        )}
        {noteEditor ? (
          <AttendanceNoteEditor
            eventId={noteEditor.eventId}
            playerId={record.player_id}
            playerName={name}
            note={record.notes}
            open={noteEditor.open}
            onOpenChange={noteEditor.onOpenChange}
            onSaved={noteEditor.onSaved}
            trigger={
              <button
                type="button"
                aria-label={record.notes ? `Edit note for ${name}` : `Add note for ${name}`}
                disabled={disabled}
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-fw-sm text-text-tertiary transition-colors',
                  surfaces.press,
                  'hover:bg-surface hover:text-text-secondary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1',
                  record.notes && 'text-accent-700',
                )}
              >
                <NotebookPen className="h-4 w-4" aria-hidden />
              </button>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
