'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Division, ProgramType, CoachStatus } from '../page';

interface AddCoachModalProps {
  onClose: () => void;
  onSuccess: () => void;
  statusConfig: Record<CoachStatus, { label: string; icon: string }>;
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-4">
          <h2 className="text-xl font-bold text-white">Add New Coach</h2>
          <p className="text-emerald-100 text-sm">Enter coach details below</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Name & Title */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Coach name"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Head Coach"
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="coach@school.edu"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* School & Conference */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">School *</label>
              <input
                type="text"
                required
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="University name"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Conference *</label>
              <input
                type="text"
                required
                value={form.conference}
                onChange={(e) => setForm({ ...form, conference: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Conference name"
              />
            </div>
          </div>

          {/* Division & Program */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Division</label>
              <select
                value={form.division}
                onChange={(e) => setForm({ ...form, division: e.target.value as Division })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="D2">🔵 Division II</option>
                <option value="D3">🟣 Division III</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Program</label>
              <select
                value={form.program}
                onChange={(e) => setForm({ ...form, program: e.target.value as ProgramType })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
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
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as CoachStatus })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                {Object.entries(statusConfig).map(([value, config]) => (
                  <option key={value} value={value}>{config.iconLabel} {config.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value={0}>Normal</option>
                <option value={1}>⚡ High</option>
                <option value={2}>🔥 Hot</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              rows={3}
              placeholder="Any initial notes..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 font-bold transition-colors"
            >
              {submitting ? 'Adding...' : 'Add Coach'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
