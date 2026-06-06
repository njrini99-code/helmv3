'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fromUntyped } from '@/lib/supabase/untyped';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../crm-config';
import { IconX, IconMail, IconPhone, IconCalendar, IconPlus, IconVideo, IconUsers, IconNote } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';

interface ContactLogModalProps {
  coach: Coach;
  onClose: () => void;
  onUpdate: () => void;
}

interface ContactLog {
  id: string;
  contact_type: 'email' | 'call' | 'demo' | 'meeting' | 'note';
  contact_date: string;
  subject: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  created_at: string | null;
}

const CONTACT_TYPES = [
  { value: 'email', label: 'Email', icon: IconMail },
  { value: 'call', label: 'Call', icon: IconPhone },
  { value: 'demo', label: 'Demo', icon: IconVideo },
  { value: 'meeting', label: 'Meeting', icon: IconUsers },
  { value: 'note', label: 'Note', icon: IconNote },
] as const;

const STATUS_OPTIONS: { value: CoachStatus; label: string }[] = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'won', label: 'Customer' },
  { value: 'lost', label: 'Lost' },
  { value: 'nurture', label: 'Nurture' },
];

const inputClass = 'w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm transition-colors focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 outline-none';
const labelClass = 'text-xs font-medium text-warm-600 uppercase tracking-wider mb-1.5 block';

export function ContactLogModal({ coach, onClose, onUpdate }: ContactLogModalProps) {
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [newLog, setNewLog] = useState({
    contact_type: 'email' as ContactLog['contact_type'],
    notes: '',
    next_action: '',
    next_action_date: '',
    update_status: '' as CoachStatus | '',
  });

  const supabase = createClient();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_contact_log')
        .select('*')
        .eq('coach_id', coach.id)
        .order('contact_date', { ascending: false });

      if (error) throw error;
      setLogs((data || []) as ContactLog[]);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `supabase` is the browser-singleton from createClient(); identity is stable across renders even though TS can't prove it.
  }, [coach.id]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Add contact log
      const { error: logError } = await supabase
        .from('crm_contact_log')
        .insert({
          coach_id: coach.id,
          contact_type: newLog.contact_type,
          notes: newLog.notes || null,
          next_action: newLog.next_action || null,
          next_action_date: newLog.next_action_date || null,
        });

      if (logError) throw logError;

      // Update coach record
      const updateData: Record<string, unknown> = {
        last_contacted_at: new Date().toISOString(),
      };

      if (newLog.next_action_date) {
        updateData.next_follow_up_at = newLog.next_action_date;
      }

      if (newLog.update_status) {
        updateData.status = newLog.update_status;
      }

      const { error: updateError } = await fromUntyped(supabase, 'crm_coaches')
        .update(updateData)
        .eq('id', coach.id);

      if (updateError) throw updateError;

      // Reset form and refresh
      setNewLog({
        contact_type: 'email',
        notes: '',
        next_action: '',
        next_action_date: '',
        update_status: '',
      });
      setShowAddForm(false);
      fetchLogs();
      onUpdate();
    } catch (err) {
      console.error('Failed to add log:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <IconPhone size={16} className="text-warm-600" />
              <h2 className="text-lg font-semibold text-warm-900">{coach.name}</h2>
            </div>
            <p className="text-sm text-warm-500 ml-6">{coach.school} &middot; {coach.conference}</p>
          </div>
          <IconButton variant="default"
            onClick={onClose}
            aria-label="Close"
            className="text-warm-400 hover:text-warm-600 transition-colors"
          >
            <IconX size={18} />
          </IconButton>
        </div>

        {/* Coach Details */}
        <div className="px-6 py-4 bg-warm-50/50 border-b border-warm-100 flex-shrink-0">
          <div className="flex items-center gap-6 text-sm">
            {coach.email && (
              <a href={`mailto:${coach.email}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                <IconMail className="w-4 h-4" />
                {coach.email}
              </a>
            )}
            {coach.phone && (
              <a href={`tel:${coach.phone}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                <IconPhone className="w-4 h-4" />
                {coach.phone}
              </a>
            )}
            <span className="text-warm-600">
              Status: <span className="font-medium">{coach.status.replace(/_/g, ' ')}</span>
            </span>
          </div>
          {coach.notes && (
            <p className="mt-2 text-sm text-warm-600">{coach.notes}</p>
          )}
        </div>

        {/* Contact Log */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-warm-900">Contact History</h3>
            {!showAddForm && (
              <Button variant="primary"
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary-50 text-primary-700 hover:bg-primary-100 text-sm font-medium transition-colors"
              >
                <IconPlus className="w-4 h-4" />
                Log Contact
              </Button>
            )}
          </div>

          {/* Add Log Form */}
          {showAddForm && (
            <form onSubmit={handleAddLog} className="mb-6 p-4 bg-warm-50/50 rounded-xl border border-warm-100 space-y-4">
              <div className="flex gap-2 flex-wrap">
                {CONTACT_TYPES.map((type) => {
                  const TypeIcon = type.icon;
                  return (
                    <Button variant="primary"
                      key={type.value}
                      type="button"
                      onClick={() => setNewLog({ ...newLog, contact_type: type.value })}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-colors',
                        newLog.contact_type === type.value
                          ? 'bg-primary-500 text-white'
                          : 'bg-white border border-warm-200 hover:bg-warm-50 text-warm-700'
                      )}
                    >
                      <TypeIcon size={14} />
                      {type.label}
                    </Button>
                  );
                })}
              </div>

              <textarea
                placeholder="Notes about this contact..."
                value={newLog.notes}
                onChange={(e) => setNewLog({ ...newLog, notes: e.target.value })}
                className={`${inputClass} resize-none min-h-[100px]`}
                rows={3}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Next Action</label>
                  <input
                    type="text"
                    placeholder="Follow up with demo offer..."
                    value={newLog.next_action}
                    onChange={(e) => setNewLog({ ...newLog, next_action: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Follow-up Date</label>
                  <input
                    type="date"
                    value={newLog.next_action_date}
                    onChange={(e) => setNewLog({ ...newLog, next_action_date: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Update Status (optional)</label>
                <select
                  value={newLog.update_status}
                  onChange={(e) => setNewLog({ ...newLog, update_status: e.target.value as CoachStatus | '' })}
                  className={`${inputClass} bg-white/60`}
                >
                  <option value="">Keep current status</option>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="ghost"
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="bg-white border border-warm-200 text-warm-700 rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-warm-50 transition-colors"
                >
                  Cancel
                </Button>
                <Button variant="primary"
                  type="submit"
                  disabled={submitting}
                  className="bg-primary-500 hover:bg-primary-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Log'}
                </Button>
              </div>
            </form>
          )}

          {/* Log List */}
          {loading ? (
            <div className="py-4 space-y-3" aria-label="Loading">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-warm-100 animate-pulse" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-warm-500">No contact history yet</div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => {
                const typeConfig = CONTACT_TYPES.find(t => t.value === log.contact_type);
                const TypeIcon = typeConfig?.icon || IconNote;
                return (
                  <div key={log.id} className="border border-warm-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium capitalize flex items-center gap-1.5">
                        <TypeIcon size={14} className="text-warm-500" />
                        {log.contact_type}
                      </span>
                      <span className="text-xs text-warm-500">{formatDate(log.contact_date)}</span>
                    </div>
                    {log.notes && (
                      <p className="text-sm text-warm-700">{log.notes}</p>
                    )}
                    {log.next_action && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-warm-500">
                        <IconCalendar className="w-3 h-3" />
                        Next: {log.next_action}
                        {log.next_action_date && ` (${new Date(log.next_action_date).toLocaleDateString()})`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
