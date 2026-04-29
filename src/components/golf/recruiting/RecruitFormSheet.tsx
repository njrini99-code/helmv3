'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { X, Trash2, Save, GraduationCap, MapPin, Mail, Phone } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import {
  createRecruit,
  updateRecruit,
  deleteRecruit,
  type Recruit,
  type RecruitInput,
  type RecruitStatus,
} from '@/app/golf/actions/recruiting';
import { RECRUIT_STATUSES } from './RecruitStatusChip';

interface RecruitFormSheetProps {
  open: boolean;
  recruit: Recruit | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_FORM: RecruitInput = {
  first_name: '',
  last_name: '',
  hs_class: null,
  email: '',
  phone: '',
  hometown: '',
  state: '',
  notes: '',
  status: 'recruiting',
};

export function RecruitFormSheet({ open, recruit, onClose, onSaved }: RecruitFormSheetProps) {
  const isEditing = recruit !== null;
  const { modalRef } = useFocusTrap(open, onClose);
  const [form, setForm] = useState<RecruitInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (recruit) {
      setForm({
        first_name: recruit.first_name,
        last_name: recruit.last_name ?? '',
        hs_class: recruit.hs_class,
        email: recruit.email ?? '',
        phone: recruit.phone ?? '',
        hometown: recruit.hometown ?? '',
        state: recruit.state ?? '',
        notes: recruit.notes ?? '',
        status: recruit.status,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setConfirmingDelete(false);
  }, [open, recruit]);

  if (!open) return null;

  const handleSave = async () => {
    if (!form.first_name?.trim()) {
      toast.error('First name required', 'Add a first name to save this prospect.');
      return;
    }
    setSaving(true);
    try {
      if (isEditing && recruit) {
        const res = await updateRecruit(recruit.id, form);
        if (!res.success) throw new Error(res.error);
        toast.success('Saved', `${form.first_name}'s record was updated.`);
      } else {
        const res = await createRecruit(form);
        if (!res.success) throw new Error(res.error);
        toast.success('Added', `${form.first_name} is now on your prospect list.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        'Save failed',
        err instanceof Error ? err.message : 'Try again in a moment.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!recruit) return;
    setSaving(true);
    try {
      const res = await deleteRecruit(recruit.id);
      if (!res.success) throw new Error(res.error);
      toast.success('Removed', `${recruit.first_name} was removed from your list.`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        'Remove failed',
        err instanceof Error ? err.message : 'Try again in a moment.',
      );
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof RecruitInput>(key: K, value: RecruitInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recruit-form-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col bg-cream-50/95 backdrop-blur-xl rounded-t-3xl sm:rounded-2xl border border-warm-200/55 shadow-glass overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Premium gradient header */}
        <div className="relative px-6 py-5 border-b border-warm-200/60 bg-gradient-to-br from-white/70 via-warm-50/40 to-primary-50/15">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary-700 mb-1">
                {isEditing ? 'Edit prospect' : 'New prospect'}
              </p>
              <h2
                id="recruit-form-title"
                className="font-[family-name:var(--font-fraunces)] text-[26px] leading-tight font-semibold text-warm-900"
              >
                {isEditing
                  ? `${form.first_name} ${form.last_name ?? ''}`.trim() || 'Prospect'
                  : 'Add to Recruiting HQ'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-warm-500 hover:text-warm-900 hover:bg-warm-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Status selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-warm-500 mb-2">
              Status
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {RECRUIT_STATUSES.map((s) => {
                const active = form.status === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => set('status', s.value as RecruitStatus)}
                    className={cn(
                      'flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl text-left transition-all',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                      active
                        ? cn(s.solidBg, s.solidText, 'shadow-md scale-[1.02]')
                        : cn(s.softBg, s.softText, 'ring-1 ring-inset', s.softRing, 'hover:scale-[1.01]'),
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          active ? 'bg-cream-100/82' : s.dot,
                        )}
                      />
                      {s.label}
                    </span>
                    <span className={cn('text-[10px] font-medium', active ? 'text-white/85' : 'text-warm-500')}>
                      {s.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldShell label="First name" required>
              <input
                type="text"
                value={form.first_name ?? ''}
                onChange={(e) => set('first_name', e.target.value)}
                disabled={saving}
                placeholder="Jordan"
                className={INPUT_CLASS}
              />
            </FieldShell>
            <FieldShell label="Last name">
              <input
                type="text"
                value={form.last_name ?? ''}
                onChange={(e) => set('last_name', e.target.value)}
                disabled={saving}
                placeholder="Spieth"
                className={INPUT_CLASS}
              />
            </FieldShell>
          </div>

          {/* HS Class + Hometown row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FieldShell label="HS Class" icon={GraduationCap}>
              <input
                type="number"
                value={form.hs_class ?? ''}
                onChange={(e) => set('hs_class', e.target.value ? Number(e.target.value) : null)}
                disabled={saving}
                placeholder="2027"
                min={2024}
                max={2032}
                className={cn(INPUT_CLASS, 'tabular-nums')}
              />
            </FieldShell>
            <FieldShell label="Hometown" icon={MapPin} className="sm:col-span-1">
              <input
                type="text"
                value={form.hometown ?? ''}
                onChange={(e) => set('hometown', e.target.value)}
                disabled={saving}
                placeholder="Dallas"
                className={INPUT_CLASS}
              />
            </FieldShell>
            <FieldShell label="State">
              <input
                type="text"
                value={form.state ?? ''}
                onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))}
                disabled={saving}
                placeholder="TX"
                maxLength={2}
                className={cn(INPUT_CLASS, 'uppercase')}
              />
            </FieldShell>
          </div>

          {/* Contact row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldShell label="Email" icon={Mail}>
              <input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                disabled={saving}
                placeholder="player@school.edu"
                className={INPUT_CLASS}
              />
            </FieldShell>
            <FieldShell label="Phone" icon={Phone}>
              <input
                type="tel"
                value={form.phone ?? ''}
                onChange={(e) => set('phone', e.target.value)}
                disabled={saving}
                placeholder="(555) 123-4567"
                className={cn(INPUT_CLASS, 'tabular-nums')}
              />
            </FieldShell>
          </div>

          {/* Notes */}
          <FieldShell label="Notes">
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              disabled={saving}
              rows={4}
              placeholder="Tournament results, coach contact, scholarship offers, anything worth remembering…"
              className={cn(INPUT_CLASS, 'resize-none')}
            />
          </FieldShell>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-warm-200/60 bg-warm-50/40 flex items-center justify-between gap-2">
          <div>
            {isEditing && (
              confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
                  >
                    Confirm remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={saving}
                    className="text-xs text-warm-500 hover:text-warm-900 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-rose-700 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-2 text-sm font-medium text-warm-700 hover:text-warm-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.first_name?.trim()}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold',
                'hover:bg-primary-700 active:scale-[0.99] transition-all',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'shadow-[0_2px_10px_rgba(22,163,74,0.25)]',
              )}
            >
              <Save className="w-4 h-4" />
              {isEditing ? 'Save changes' : 'Add prospect'}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

const INPUT_CLASS = cn(
  'w-full px-3 py-2 rounded-xl bg-warm-50 border-0 text-sm text-warm-900',
  'placeholder:text-warm-400 transition-colors',
  'focus:bg-white focus:ring-2 focus:ring-primary-100 focus:outline-none',
  'disabled:opacity-60 disabled:cursor-not-allowed',
);

function FieldShell({
  label,
  required,
  icon: Icon,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-warm-500 mb-1.5">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
