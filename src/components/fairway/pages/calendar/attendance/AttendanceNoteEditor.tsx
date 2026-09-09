'use client';

/**
 * AttendanceNoteEditor — the N1 gated note editor (SCREEN-BUILD-PLAN §2.5).
 * Ships because `updateAttendanceNote` exists (attendance.ts) and its UPDATE
 * policy's WITH CHECK was verified to cover a coach's own write (see that
 * action's doc comment). Coach-only, matching the action's own contract.
 *
 * A dedicated small surface, not inline editing — "clear access labeling"
 * per DESIGN-PLAN §18 ("Attendance: fast and forgiving").
 */

import * as React from 'react';
import { PopoverPanel, Button, TextArea } from '@/components/fairway';
import { updateAttendanceNote } from '@/app/golf/actions/attendance';

export interface AttendanceNoteEditorProps {
  eventId: string;
  playerId: string;
  playerName: string;
  note: string | null;
  trigger: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the saved note so the caller can update its own roster copy. */
  onSaved: (note: string | null) => void;
}

const MAX_LENGTH = 2000;

export function AttendanceNoteEditor({
  eventId,
  playerId,
  playerName,
  note,
  trigger,
  open,
  onOpenChange,
  onSaved,
}: AttendanceNoteEditorProps) {
  const [draft, setDraft] = React.useState(note ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDraft(note ?? '');
      setError(null);
    }
  }, [open, note]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await updateAttendanceNote(eventId, playerId, draft);
      if (!result.success) {
        setError(result.error ?? 'Could not save the note. Try again.');
        return;
      }
      onSaved(draft.trim() === '' ? null : draft.trim());
      onOpenChange(false);
    } catch {
      setError('Could not save the note. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PopoverPanel
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      align="start"
      width="md"
      surface="matte"
      ariaLabel={`Note for ${playerName}`}
    >
      <PopoverPanel.Header>Note · {playerName}</PopoverPanel.Header>
      <div className="px-2 pb-1">
        <p className="mb-1.5 font-fw-sans text-caption text-text-tertiary">
          Visible to this team&apos;s coaches and {playerName.split(' ')[0] || 'the player'}. Never shown to teammates.
        </p>
        <TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
          rows={3}
          aria-label={`Attendance note for ${playerName}`}
          placeholder="Add a private note…"
        />
        {error ? (
          <p role="alert" className="mt-1.5 font-fw-sans text-caption text-fw-danger-ink">
            {error}
          </p>
        ) : null}
        <div className="mt-2.5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" busy={saving} onClick={handleSave}>
            Save note
          </Button>
        </div>
      </div>
    </PopoverPanel>
  );
}
