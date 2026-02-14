'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Division, ProgramType, CoachStatus } from '../page';
import { IconX } from '@/components/icons';

interface AddCoachModalProps {
  onClose: () => void;
  onSuccess: () => void;
  statusConfig: Record<CoachStatus, { label: string }>;
}

export function AddCoachModal({ onClose, onSuccess, statusConfig }: AddCoachModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    school: '',
    conference: '',
    division: 'D3' as Division,
    program: 'both' as ProgramType,
    status: 'new_lead' as CoachStatus,
    priority: 0,
    notes: '',
    team_size: '',
    current_software: '',
    decision_timeline: '',
  });

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('crm_coaches')
        .insert({
          name: formData.name,
          title: formData.title || null,
          email: formData.email || null,
          phone: formData.phone || null,
          school: formData.school,
          conference: formData.conference,
          division: formData.division,
          program: formData.program,
          status: formData.status,
          priority: formData.priority,
          notes: formData.notes || null,
          team_size: formData.team_size ? parseInt(formData.team_size) : null,
          current_software: formData.current_software || null,
          decision_timeline: formData.decision_timeline || null,
        });

      if (error) throw error;
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add coach');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200 bg-gradient-to-r from-emerald-50 to-white">
          <h2 className="text-lg font-semibold text-warm-900">Add New Coach</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-warm-100 text-warm-500 transition-colors"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Basic Info */}
            <div>
              <h3 className="text-sm font-semibold text-warm-700 mb-3">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-warm-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="John Smith"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Head Golf Coach"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="jsmith@university.edu"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
            </div>

            {/* School Info */}
            <div>
              <h3 className="text-sm font-semibold text-warm-700 mb-3">School Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-warm-700 mb-1">School *</label>
                  <input
                    type="text"
                    required
                    value={formData.school}
                    onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="State University"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-warm-700 mb-1">Conference *</label>
                  <input
                    type="text"
                    required
                    value={formData.conference}
                    onChange={(e) => setFormData({ ...formData, conference: e.target.value })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Big South Conference"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1">Division *</label>
                  <select
                    value={formData.division}
                    onChange={(e) => setFormData({ ...formData, division: e.target.value as Division })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="D2">Division II</option>
                    <option value="D3">Division III</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1">Program *</label>
                  <select
                    value={formData.program}
                    onChange={(e) => setFormData({ ...formData, program: e.target.value as ProgramType })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="mens">Men's</option>
                    <option value="womens">Women's</option>
                    <option value="both">Both</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1">Team Size</label>
                  <input
                    type="number"
                    value={formData.team_size}
                    onChange={(e) => setFormData({ ...formData, team_size: e.target.value })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="12"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1">Current Software</label>
                  <input
                    type="text"
                    value={formData.current_software}
                    onChange={(e) => setFormData({ ...formData, current_software: e.target.value })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g., Spreadsheets, GameChanger"
                  />
                </div>
              </div>
            </div>

            {/* CRM Settings */}
            <div>
              <h3 className="text-sm font-semibold text-warm-700 mb-3">CRM Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1">Initial Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as CoachStatus })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    {Object.entries(statusConfig).map(([value, config]) => (
                      <option key={value} value={value}>{config.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="0">Normal</option>
                    <option value="1">! High</option>
                    <option value="2">!! Urgent</option>
                    <option value="3">🔥 Hot</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-warm-700 mb-1">Decision Timeline</label>
                  <input
                    type="text"
                    value={formData.decision_timeline}
                    onChange={(e) => setFormData({ ...formData, decision_timeline: e.target.value })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g., Next season, Q1 2026"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-warm-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    rows={3}
                    placeholder="Any initial notes about this coach..."
                  />
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-warm-200 bg-warm-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-warm-200 text-warm-600 hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors font-medium"
          >
            {loading ? 'Adding...' : 'Add Coach'}
          </button>
        </div>
      </div>
    </div>
  );
}
