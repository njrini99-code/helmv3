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
import { Button, IconButton } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

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
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-5 space-y-4">
      {/* Coaching header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-fw-md bg-accent-100 flex items-center justify-center flex-shrink-0">
          <IconZap size={20} className="text-accent-700" />
        </div>
        <div>
          <h3 className="font-bold text-text-primary text-base">Get Started with Your Pipeline</h3>
          <p className="text-sm text-text-secondary mt-0.5">
            All {newLeadCount} coaches are in &quot;New Lead&quot;. Start by contacting your top prospects to move them through the pipeline.
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Button variant="ghost"
          onClick={() => handleMoveToPipeline(10)}
          disabled={processing === 'research'}
          className={cn(
            'flex items-center gap-3 p-4 rounded-fw-md transition-all text-left',
            'bg-surface border border-border-subtle shadow-flat',
            'hover:shadow-soft hover:-translate-y-0.5',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <div className="w-10 h-10 rounded-fw-md bg-surface-sunken flex items-center justify-center flex-shrink-0">
            <IconArrowRight size={18} className="text-accent-700" />
          </div>
          <div>
            <div className="font-semibold text-text-primary text-sm">Move 10 to Pipeline</div>
            <div className="text-xs text-text-tertiary">Advance 10 leads to Contacted</div>
          </div>
          <IconArrowRight size={14} className="ml-auto text-text-tertiary" />
        </Button>

        <Button variant="ghost"
          onClick={() => handleMoveToPipeline(25)}
          disabled={processing === 'research'}
          className={cn(
            'flex items-center gap-3 p-4 rounded-fw-md transition-all text-left',
            'bg-surface border border-border-subtle shadow-flat',
            'hover:shadow-soft hover:-translate-y-0.5',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <div className="w-10 h-10 rounded-fw-md bg-accent-100 flex items-center justify-center flex-shrink-0">
            <IconUsers size={18} className="text-accent-700" />
          </div>
          <div>
            <div className="font-semibold text-text-primary text-sm">Move 25 to Pipeline</div>
            <div className="text-xs text-text-tertiary">Batch move 25 leads</div>
          </div>
          <IconArrowRight size={14} className="ml-auto text-text-tertiary" />
        </Button>

        <div className={cn(
          'flex items-center gap-3 p-4 rounded-fw-md text-left',
          'bg-surface border border-border-subtle shadow-flat'
        )}>
          <div className="w-10 h-10 rounded-fw-md bg-fw-warning-bg flex items-center justify-center flex-shrink-0">
            <IconTarget size={18} className="text-fw-warning-ink" />
          </div>
          <div>
            <div className="font-semibold text-text-primary text-sm">Pipeline Stats</div>
            <div className="text-xs text-text-tertiary">{stats.total} total &middot; {stats.contacted} contacted</div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface rounded-fw-md border border-border-subtle">
        <IconAlertCircle size={14} className="text-text-tertiary flex-shrink-0" />
        <p className="text-xs text-text-secondary">
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
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismisses on click; Escape is handled by the dialog
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-nav-bg/40" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents backdrop click from closing modal */}
      <div
        className="rounded-card bg-elevated shadow-raise w-full max-w-md mx-4 overflow-clip"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-surface-tint border-b border-border-subtle text-text-primary px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base">{coach.name}</h3>
              <p className="text-text-secondary text-sm">{coach.school} &middot; {coach.conference}</p>
            </div>
            <IconButton variant="default" onClick={onClose} aria-label="Close" className="p-1.5 rounded-fw-md hover:bg-surface/10 transition-colors">
              <IconX size={18} className="text-text-secondary" aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        {/* Log Contact Form */}
        <div className="p-5 space-y-4">
          <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">Log Contact</h4>

          <div className="flex flex-wrap gap-2">
            {CONTACT_TYPES.map((type) => (
              <Button variant="primary"
                key={type.value}
                onClick={() => setLogForm(f => ({ ...f, type: type.value }))}
                className={cn(
                  'px-3 py-1.5 rounded-fw-md text-sm font-medium transition-all flex items-center gap-1.5',
                  logForm.type === type.value
                    ? 'bg-accent-650 text-text-on-accent shadow-flat'
                    : 'bg-surface border border-border-subtle text-text-secondary hover:bg-surface-sunken'
                )}
              >
                {type.icon} {type.label}
              </Button>
            ))}
          </div>

          <Textarea
            value={logForm.notes}
            onChange={(e) => setLogForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full bg-surface border border-border-subtle rounded-fw-md px-4 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-border-focus/30 focus:border-accent-400"
            rows={3}
            placeholder="Notes about this contact..."
          />

          <div className="flex gap-3">
            <Button variant="ghost"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-fw-md text-sm font-medium bg-surface border border-border-subtle text-text-secondary hover:bg-surface-sunken transition-colors"
            >
              Cancel
            </Button>
            <Button variant="primary"
              onClick={handleLogContact}
              disabled={submitting}
              className="flex-1 py-2.5 bg-accent-650 text-text-on-accent rounded-fw-md text-sm font-bold hover:bg-accent-700 transition-colors disabled:opacity-50 shadow-flat flex items-center justify-center gap-1.5"
            >
              <IconCheck size={14} />
              {submitting ? 'Saving...' : 'Log Contact'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
