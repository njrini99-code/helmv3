'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconX, IconUser } from '@/components/icons';
import type { Division, ProgramType, CoachStatus } from '../crm-config';

interface AddCoachModalProps {
  onClose: () => void;
  onSuccess: () => void;
  statusConfig: Record<CoachStatus, { label: string; iconLabel: React.ReactNode }>;
}

const inputClass = 'w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm transition-colors focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 outline-none';
const labelClass = 'text-xs font-medium text-warm-600 uppercase tracking-wider mb-1.5 block';
const selectClass = `${inputClass} bg-white/60`;

export function AddCoachModal({ onClose, onSuccess, statusConfig }: AddCoachModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    title: 'Head Coach',
    email: '',
    phone: '',
    school: '',
    conference: '',
    division: 'D3' as Division,
    program: 'both' as ProgramType,
    status: 'new_lead' as CoachStatus,
    priority: 0,
    notes: '',
  });

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('crm_coaches')
        .insert({
          name: form.name,
          title: form.title || null,
          email: form.email || null,
          phone: form.phone || null,
          school: form.school,
          conference: form.conference,
          division: form.division,
          program: form.program,
          status: form.status,
          priority: form.priority,
          notes: form.notes || null,
        });

      if (insertError) throw insertError;
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add coach');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-warm-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <IconUser size={16} className="text-warm-600" />
            <h2 className="text-lg font-semibold text-warm-900">Add New Coach</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-warm-400 hover:text-warm-600 transition-colors"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Body */}
        <form id="add-coach-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Name & Title */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                placeholder="Coach name"
              />
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={inputClass}
                placeholder="Head Coach"
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
                placeholder="coach@school.edu"
              />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputClass}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* School & Conference */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>School *</label>
              <input
                type="text"
                required
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
                className={inputClass}
                placeholder="University name"
              />
            </div>
            <div>
              <label className={labelClass}>Conference *</label>
              <input
                type="text"
                required
                value={form.conference}
                onChange={(e) => setForm({ ...form, conference: e.target.value })}
                className={inputClass}
                placeholder="Conference name"
              />
            </div>
          </div>

          {/* Division & Program */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Division</label>
              <select
                value={form.division}
                onChange={(e) => setForm({ ...form, division: e.target.value as Division })}
                className={selectClass}
              >
                <option value="D2">Division II</option>
                <option value="D3">Division III</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Program</label>
              <select
                value={form.program}
                onChange={(e) => setForm({ ...form, program: e.target.value as ProgramType })}
                className={selectClass}
              >
                <option value="both">Both (Men&apos;s & Women&apos;s)</option>
                <option value="mens">Men&apos;s Only</option>
                <option value="womens">Women&apos;s Only</option>
              </select>
            </div>
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as CoachStatus })}
                className={selectClass}
              >
                {Object.entries(statusConfig).map(([value, config]) => (
                  <option key={value} value={value}>{config.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
                className={selectClass}
              >
                <option value={0}>Normal</option>
                <option value={1}>High</option>
                <option value={2}>Hot</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={`${inputClass} resize-none min-h-[100px]`}
              rows={3}
              placeholder="Any initial notes..."
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-warm-100 flex justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="bg-white border border-warm-200 text-warm-700 rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-warm-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-coach-form"
            disabled={submitting}
            className="bg-primary-500 hover:bg-primary-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add Coach'}
          </button>
        </div>
      </div>
    </div>
  );
}
