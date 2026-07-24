'use client';

// =============================================================================
// ClassScheduleModal — minimal class-schedule editor for a single
// student-athlete, opened from AcademicsClient's roster table/cards.
//
// WHY THIS EXISTS: getPlayerClasses/addPlayerClass/updatePlayerClass/
// deletePlayerClass (src/app/baseball/actions/academics.ts) were fully built
// server-side but had zero UI callers — a coach could never enter a player's
// class schedule, so the class-conflict engine (class-conflict-engine.ts,
// triggered via runClassConflictDetection) never had any input data and
// baseball_class_conflicts stayed empty forever, which the Practice Planner
// and Decision Room read as "verified clean" rather than "never populated."
// This wires the existing, already-gated (assertPlayerClassAccess: coach with
// can_view_academics + team membership) CRUD into a real UI.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Modal, ConfirmModal } from '@/components/ui/modal';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconPlus, IconEdit, IconTrash } from '@/components/icons';
import { useToast } from '@/components/ui/sonner';
import {
  getPlayerClasses,
  addPlayerClass,
  updatePlayerClass,
  deletePlayerClass,
  type BaseballPlayerClass,
} from '@/app/baseball/actions/academics';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface ClassScheduleModalProps {
  open: boolean;
  onClose: () => void;
  playerId: string;
  teamId: string;
  playerName: string;
  /** Lets the parent refresh its per-player class_count after a change. */
  onChanged?: () => void;
}

interface ClassFormState {
  id?: string;
  class_name: string;
  instructor: string;
  days: string[];
  start_time: string;
  end_time: string;
  building: string;
  room: string;
  credits: string;
  notes: string;
}

const EMPTY_FORM: ClassFormState = {
  class_name: '',
  instructor: '',
  days: [],
  start_time: '',
  end_time: '',
  building: '',
  room: '',
  credits: '',
  notes: '',
};

function formatSchedule(cls: BaseballPlayerClass): string {
  const days = cls.days && cls.days.length > 0 ? cls.days.join('/') : 'No days set';
  const time = cls.start_time && cls.end_time ? `${cls.start_time}–${cls.end_time}` : 'No time set';
  return `${days} · ${time}`;
}

export function ClassScheduleModal({
  open,
  onClose,
  playerId,
  teamId,
  playerName,
  onChanged,
}: ClassScheduleModalProps) {
  const { showToast } = useToast();
  const [classes, setClasses] = useState<BaseballPlayerClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ClassFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BaseballPlayerClass | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    const result = await getPlayerClasses(playerId);
    if (result.success) {
      setClasses(result.data ?? []);
    } else {
      showToast(result.error, 'error');
    }
    setLoading(false);
  }, [playerId, showToast]);

  useEffect(() => {
    if (open) {
      setShowForm(false);
      setForm(EMPTY_FORM);
      void fetchClasses();
    }
    // Only re-fetch when the modal opens for a (possibly new) player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playerId]);

  const toggleDay = (day: string) => {
    setForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }));
  };

  const startAdd = () => {
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const startEdit = (cls: BaseballPlayerClass) => {
    setForm({
      id: cls.id,
      class_name: cls.class_name,
      instructor: cls.instructor ?? '',
      days: cls.days ?? [],
      start_time: cls.start_time ?? '',
      end_time: cls.end_time ?? '',
      building: cls.building ?? '',
      room: cls.room ?? '',
      credits: cls.credits !== null && cls.credits !== undefined ? String(cls.credits) : '',
      notes: cls.notes ?? '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.class_name.trim()) {
      showToast('Class name is required.', 'error');
      return;
    }
    setSaving(true);

    const basePayload = {
      class_name: form.class_name.trim(),
      instructor: form.instructor.trim() || undefined,
      days: form.days.length > 0 ? form.days : undefined,
      start_time: form.start_time || undefined,
      end_time: form.end_time || undefined,
      building: form.building.trim() || undefined,
      room: form.room.trim() || undefined,
      credits: form.credits ? Number(form.credits) : undefined,
      notes: form.notes.trim() || undefined,
    };

    const result = form.id
      ? await updatePlayerClass(form.id, basePayload)
      : await addPlayerClass(playerId, { ...basePayload, team_id: teamId });

    setSaving(false);

    if (!result.success) {
      showToast(result.error, 'error');
      return;
    }

    showToast(form.id ? 'Class updated.' : 'Class added.', 'success');
    setShowForm(false);
    setForm(EMPTY_FORM);
    await fetchClasses();
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deletePlayerClass(deleteTarget.id);
    setDeleting(false);

    if (!result.success) {
      showToast(result.error, 'error');
      return;
    }

    showToast('Class deleted.', 'success');
    setDeleteTarget(null);
    await fetchClasses();
    onChanged?.();
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={`${playerName}'s Classes`} size="lg">
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 bg-warm-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : showForm ? (
            <div className="space-y-3">
              <Input
                placeholder="Class name (required)"
                value={form.class_name}
                onChange={(e) => setForm({ ...form, class_name: e.target.value })}
                aria-label="Class name"
              />
              <Input
                placeholder="Instructor"
                value={form.instructor}
                onChange={(e) => setForm({ ...form, instructor: e.target.value })}
                aria-label="Instructor"
              />
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => {
                  const active = form.days.includes(day);
                  return (
                    <Button
                      key={day}
                      type="button"
                      variant={active ? 'primary' : 'secondary'}
                      size="sm"
                      haptic="none"
                      onClick={() => toggleDay(day)}
                      aria-pressed={active}
                      className="min-h-0 rounded-full px-3 py-1.5"
                    >
                      {day}
                    </Button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  aria-label="Start time"
                />
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  aria-label="End time"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Building"
                  value={form.building}
                  onChange={(e) => setForm({ ...form, building: e.target.value })}
                  aria-label="Building"
                />
                <Input
                  placeholder="Room"
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  aria-label="Room"
                />
              </div>
              <Input
                type="number"
                min="0"
                max="12"
                placeholder="Credits"
                value={form.credits}
                onChange={(e) => setForm({ ...form, credits: e.target.value })}
                aria-label="Credits"
              />
              <div className="flex items-center gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Add Class'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : classes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-warm-500 mb-4">No classes on file yet.</p>
              <Button onClick={startAdd} leftIcon={<IconPlus size={14} />}>
                Add First Class
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-warm-200 p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-warm-900 truncate">{cls.class_name}</p>
                    <p className="text-sm text-warm-500">{formatSchedule(cls)}</p>
                    {(cls.building || cls.room) && (
                      <p className="text-xs text-warm-400">
                        {[cls.building, cls.room].filter(Boolean).join(' ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <IconButton variant="default" aria-label={`Edit ${cls.class_name}`} onClick={() => startEdit(cls)}>
                      <IconEdit size={14} />
                    </IconButton>
                    <IconButton variant="default" aria-label={`Delete ${cls.class_name}`} onClick={() => setDeleteTarget(cls)}>
                      <IconTrash size={14} />
                    </IconButton>
                  </div>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={startAdd} className="w-full" leftIcon={<IconPlus size={14} />}>
                Add Class
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete this class?"
        description={deleteTarget ? `Remove "${deleteTarget.class_name}" from ${playerName}'s schedule.` : undefined}
        confirmText="Delete"
        variant="danger"
        isLoading={deleting}
      />
    </>
  );
}
