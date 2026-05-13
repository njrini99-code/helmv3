'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  IconZap,
  IconAlertCircle,
  IconUsers,
  IconTarget,
  IconArrowRight,
  IconX,
  IconMail,
  IconPhone,
  IconVideo,
  IconPencil,
  IconCheck,
} from '@/components/icons';
import type { Coach, CoachStatus } from '../crm-config';

interface QuickActionsToolbarProps {
  allCoaches: Coach[];
  stats: {
    total: number;
    byStatus: Record<CoachStatus, number>;
    byStage: Record<string, number>;
    starred: number;
    hot: number;
    followUpsDue: number;
    contacted: number;
    inPipeline: number;
  };
  onBulkUpdate: (ids: string[], updates: Partial<Coach>) => Promise<void>;
  onRefresh: () => void;
  singleCoach?: Coach | null;
  onCloseSingle?: () => void;
}

export function QuickActionsToolbar({
  allCoaches,
  stats,
  onBulkUpdate,
  onRefresh,
  singleCoach,
  onCloseSingle,
}: QuickActionsToolbarProps) {
  const [processing, setProcessing] = useState<string | null>(null);
  const [logForm, setLogForm] = useState({ type: 'email' as string, notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();

  // Single coach quick action mode
  if (singleCoach && onCloseSingle) {
    return (
      <SingleCoachQuickAction
        coach={singleCoach}
        onClose={onCloseSingle}
        logForm={logForm}
        setLogForm={setLogForm}
        submitting={submitting}
        setSubmitting={setSubmitting}
        supabase={supabase}
        onBulkUpdate={onBulkUpdate}
        onRefresh={onRefresh}
      />
    );
  }

  const newLeadCount = stats.byStatus.new_lead || 0;
  const allNewLeads = newLeadCount === stats.total;

  // "Move to Pipeline" — move coaches from new_lead to contacted
  const handleMoveToPipeline = async (count: number) => {
    setProcessing('research');
    try {
      const newLeads = allCoaches
        .filter(c => c.status === 'new_lead')
        .sort((a, b) => {
          if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.name.localeCompare(b.name);
        })
        .slice(0, count);

      if (newLeads.length === 0) return;

      await onBulkUpdate(
        newLeads.map(c => c.id),
        { status: 'contacted' as CoachStatus }
      );
      onRefresh();
    } catch (err) {
      console.error('Failed to advance leads:', err);
    } finally {
      setProcessing(null);
    }
  };

  // If not all coaches are new leads and we're not in the initial coaching state, don't show this
  if (!allNewLeads) return null;

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-5 space-y-4">
      {/* Coaching header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
          <IconZap size={20} className="text-primary-600" />
        </div>
        <div>
          <h3 className="font-bold text-warm-900 text-base">Get Started with Your Pipeline</h3>
          <p className="text-sm text-warm-600 mt-0.5">
            All {newLeadCount} coaches are in &quot;New Lead&quot;. Start by contacting your top prospects to move them through the pipeline.
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => handleMoveToPipeline(10)}
          disabled={processing === 'research'}
          className={cn(
            'flex items-center gap-3 p-4 rounded-xl transition-all text-left',
            'bg-white/60 border border-white/20 shadow-sm',
            'hover:shadow-md hover:-tranwarm-y-0.5',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <IconArrowRight size={18} className="text-blue-600" />
          </div>
          <div>
            <div className="font-semibold text-warm-800 text-sm">Move 10 to Pipeline</div>
            <div className="text-xs text-warm-500">Advance 10 leads to Contacted</div>
          </div>
          <IconArrowRight size={14} className="ml-auto text-warm-400" />
        </button>

        <button
          onClick={() => handleMoveToPipeline(25)}
          disabled={processing === 'research'}
          className={cn(
            'flex items-center gap-3 p-4 rounded-xl transition-all text-left',
            'bg-white/60 border border-white/20 shadow-sm',
            'hover:shadow-md hover:-tranwarm-y-0.5',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
            <IconUsers size={18} className="text-violet-600" />
          </div>
          <div>
            <div className="font-semibold text-warm-800 text-sm">Move 25 to Pipeline</div>
            <div className="text-xs text-warm-500">Batch move 25 leads</div>
          </div>
          <IconArrowRight size={14} className="ml-auto text-warm-400" />
        </button>

        <div className={cn(
          'flex items-center gap-3 p-4 rounded-xl text-left',
          'bg-white/60 border border-white/20 shadow-sm'
        )}>
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <IconTarget size={18} className="text-amber-600" />
          </div>
          <div>
            <div className="font-semibold text-warm-800 text-sm">Pipeline Stats</div>
            <div className="text-xs text-warm-500">{stats.total} total &middot; {stats.contacted} contacted</div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/60 rounded-xl border border-white/20">
        <IconAlertCircle size={14} className="text-blue-500 flex-shrink-0" />
        <p className="text-xs text-warm-600">
          <strong>Tip:</strong> Star your top prospects first, then use &quot;Move to Pipeline&quot; to prioritize starred coaches. Use the list view to bulk-select and categorize.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// SINGLE COACH QUICK ACTION (replaces old QuickActionsPanel for inline use)
// ============================================================================
interface SingleCoachQuickActionProps {
  coach: Coach;
  onClose: () => void;
  logForm: { type: string; notes: string };
  setLogForm: React.Dispatch<React.SetStateAction<{ type: string; notes: string }>>;
  submitting: boolean;
  setSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  supabase: ReturnType<typeof createClient>;
  onBulkUpdate: (ids: string[], updates: Partial<Coach>) => Promise<void>;
  onRefresh: () => void;
}

const CONTACT_TYPES = [
  { value: 'email', label: 'Email', icon: <IconMail size={14} /> },
  { value: 'call', label: 'Call', icon: <IconPhone size={14} /> },
  { value: 'demo', label: 'Demo', icon: <IconVideo size={14} /> },
  { value: 'meeting', label: 'Meeting', icon: <IconUsers size={14} /> },
  { value: 'note', label: 'Note', icon: <IconPencil size={14} /> },
];

function SingleCoachQuickAction({
  coach,
  onClose,
  logForm,
  setLogForm,
  submitting,
  setSubmitting,
  supabase,
  onBulkUpdate,
  onRefresh,
}: SingleCoachQuickActionProps) {
  const handleLogContact = async () => {
    setSubmitting(true);
    try {
      await supabase.from('crm_contact_log').insert({
        coach_id: coach.id,
        contact_type: logForm.type as 'email' | 'call' | 'demo' | 'meeting' | 'note',
        notes: logForm.notes || null,
      });

      const updates: Partial<Coach> = { last_contacted_at: new Date().toISOString() };
      if (coach.status === 'new_lead') {
        updates.status = 'contacted' as CoachStatus;
      }

      await onBulkUpdate([coach.id], updates);
      setLogForm({ type: 'email', notes: '' });
      onRefresh();
      onClose();
    } catch (err) {
      console.error('Failed to log contact:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 w-full max-w-md mx-4 overflow-clip"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-warm-800 to-warm-900 text-white px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base">{coach.name}</h3>
              <p className="text-warm-300 text-sm">{coach.school} &middot; {coach.conference}</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-xl hover:bg-white/10 transition-colors">
              <IconX size={18} className="text-white/70" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Log Contact Form */}
        <div className="p-5 space-y-4">
          <h4 className="text-xs font-medium text-warm-600 uppercase tracking-wider">Log Contact</h4>

          <div className="flex flex-wrap gap-2">
            {CONTACT_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setLogForm(f => ({ ...f, type: type.value }))}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5',
                  logForm.type === type.value
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'bg-white/60 border border-warm-200 text-warm-700 hover:bg-warm-50'
                )}
              >
                {type.icon} {type.label}
              </button>
            ))}
          </div>

          <textarea
            value={logForm.notes}
            onChange={(e) => setLogForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full bg-white/60 border border-warm-200 rounded-xl px-4 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            rows={3}
            placeholder="Notes about this contact..."
          />

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/60 border border-warm-200 text-warm-700 hover:bg-warm-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleLogContact}
              disabled={submitting}
              className="flex-1 py-2.5 bg-primary-500 text-white rounded-xl text-sm font-bold hover:bg-primary-600 transition-colors disabled:opacity-50 shadow-sm flex items-center justify-center gap-1.5"
            >
              <IconCheck size={14} />
              {submitting ? 'Saving...' : 'Log Contact'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
