'use client';

import { useState, useId } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconX, IconUser } from '@/components/icons';
import type { Division, ProgramType, CoachStatus } from '../crm-config';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface AddCoachModalProps {
  onClose: () => void;
  onSuccess: () => void;
  statusConfig: Record<CoachStatus, { label: string; iconLabel: React.ReactNode }>;
}

const labelClass = 'text-xs font-medium text-warm-600 uppercase tracking-wider mb-1.5 block';

export function AddCoachModal({ onClose, onSuccess, statusConfig }: AddCoachModalProps) {
  const uid = useId();
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
      <div className="glass-prominent rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-warm-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <IconUser size={16} className="text-warm-600" />
            <h2 className="text-lg font-semibold text-warm-900">Add New Coach</h2>
          </div>
          <IconButton variant="default"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-warm-400 hover:text-warm-600 transition-colors"
          >
            <IconX size={18} />
          </IconButton>
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
              <label htmlFor={`${uid}-name`} className={labelClass}>Name *</label>
              <Input
                id={`${uid}-name`}
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Coach name"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-title`} className={labelClass}>Title</label>
              <Input
                id={`${uid}-title`}
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Head Coach"
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-email`} className={labelClass}>Email</label>
              <Input
                id={`${uid}-email`}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="coach@school.edu"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-phone`} className={labelClass}>Phone</label>
              <Input
                id={`${uid}-phone`}
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* School & Conference */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-school`} className={labelClass}>School *</label>
              <Input
                id={`${uid}-school`}
                type="text"
                required
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
                placeholder="University name"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-conference`} className={labelClass}>Conference *</label>
              <Input
                id={`${uid}-conference`}
                type="text"
                required
                value={form.conference}
                onChange={(e) => setForm({ ...form, conference: e.target.value })}
                placeholder="Conference name"
              />
            </div>
          </div>

          {/* Division & Program */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-division`} className={labelClass}>Division</label>
              <Select
                options={[
                  { value: 'D1', label: 'Division I' },
                  { value: 'D2', label: 'Division II' },
                  { value: 'D3', label: 'Division III' },
                  { value: 'NAIA', label: 'NAIA' },
                  { value: 'JUCO', label: 'JUCO' },
                ]}
                value={form.division}
                onChange={(value) => setForm({ ...form, division: value as Division })}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-program`} className={labelClass}>Program</label>
              <Select
                options={[
                  { value: 'both', label: "Both (Men's & Women's)" },
                  { value: 'mens', label: "Men's Only" },
                  { value: 'womens', label: "Women's Only" },
                ]}
                value={form.program}
                onChange={(value) => setForm({ ...form, program: value as ProgramType })}
              />
            </div>
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-status`} className={labelClass}>Status</label>
              <Select
                options={Object.entries(statusConfig).map(([value, config]) => ({
                  value,
                  label: config.label,
                }))}
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value as CoachStatus })}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-priority`} className={labelClass}>Priority</label>
              <Select
                options={[
                  { value: '0', label: 'Normal' },
                  { value: '1', label: 'High' },
                  { value: '2', label: 'Hot' },
                ]}
                value={String(form.priority)}
                onChange={(value) => setForm({ ...form, priority: parseInt(value, 10) })}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor={`${uid}-notes`} className={labelClass}>Notes</label>
            <Textarea
              id={`${uid}-notes`}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="min-h-[100px]"
              rows={3}
              placeholder="Any initial notes..."
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-warm-100 flex justify-end gap-3 flex-shrink-0">
          <Button variant="ghost"
            type="button"
            onClick={onClose}
            className="bg-cream-50 border border-warm-200 text-warm-700 rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-warm-50 transition-colors"
          >
            Cancel
          </Button>
          <Button variant="primary"
            type="submit"
            form="add-coach-form"
            disabled={submitting}
            className="bg-primary-500 hover:bg-primary-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add Coach'}
          </Button>
        </div>
      </div>
    </div>
  );
}
