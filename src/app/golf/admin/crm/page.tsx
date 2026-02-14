'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { CoachTable } from './components/CoachTable';
import { PipelineStats } from './components/PipelineStats';
import { PipelineView } from './components/PipelineView';
import { CoachFilters, type Filters } from './components/CoachFilters';
import { AddCoachModal } from './components/AddCoachModal';
import { CoachDetailPanel } from './components/CoachDetailPanel';
import { ImportModal } from './components/ImportModal';
import { BulkActionsBar } from './components/BulkActionsBar';
import {
  IconUsers,
  IconPlus,
  IconUpload,
  IconRefresh,
  IconChart,
  IconDownload,
} from '@/components/icons';

// ============================================
// TYPES
// ============================================
export type CoachStatus = 
  | 'new_lead'
  | 'researching'
  | 'outreach_pending'
  | 'initial_contact'
  | 'follow_up'
  | 'engaged'
  | 'demo_scheduled'
  | 'demo_completed'
  | 'proposal_sent'
  | 'negotiating'
  | 'closed_won'
  | 'closed_lost'
  | 'not_interested'
  | 'bad_timing'
  | 'nurture';

export type Division = 'D2' | 'D3';
export type ProgramType = 'mens' | 'womens' | 'both';

export interface Coach {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  school: string;
  conference: string;
  division: Division;
  program: ProgramType;
  status: CoachStatus;
  priority: number;
  highlight_color: string | null;
  is_starred: boolean;
  notes: string | null;
  internal_comments: string | null;
  tags: string[] | null;
  team_size: number | null;
  current_software: string | null;
  budget_range: string | null;
  decision_timeline: string | null;
  pain_points: string[] | null;
  best_contact_method: string | null;
  best_contact_time: string | null;
  timezone: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// STATUS CONFIGURATION
// ============================================
export const STATUS_CONFIG: Record<CoachStatus, { 
  label: string; 
  color: string; 
  bgColor: string;
  stage: 'lead' | 'active' | 'closing' | 'closed';
  order: number;
}> = {
  new_lead: { label: 'New Lead', color: 'text-slate-600', bgColor: 'bg-slate-100', stage: 'lead', order: 1 },
  researching: { label: 'Researching', color: 'text-slate-600', bgColor: 'bg-slate-100', stage: 'lead', order: 2 },
  outreach_pending: { label: 'Outreach Pending', color: 'text-amber-600', bgColor: 'bg-amber-100', stage: 'lead', order: 3 },
  initial_contact: { label: 'Initial Contact', color: 'text-blue-600', bgColor: 'bg-blue-100', stage: 'active', order: 4 },
  follow_up: { label: 'Follow Up', color: 'text-blue-600', bgColor: 'bg-blue-100', stage: 'active', order: 5 },
  engaged: { label: 'Engaged', color: 'text-indigo-600', bgColor: 'bg-indigo-100', stage: 'active', order: 6 },
  demo_scheduled: { label: 'Demo Scheduled', color: 'text-purple-600', bgColor: 'bg-purple-100', stage: 'closing', order: 7 },
  demo_completed: { label: 'Demo Done', color: 'text-purple-600', bgColor: 'bg-purple-100', stage: 'closing', order: 8 },
  proposal_sent: { label: 'Proposal Sent', color: 'text-pink-600', bgColor: 'bg-pink-100', stage: 'closing', order: 9 },
  negotiating: { label: 'Negotiating', color: 'text-orange-600', bgColor: 'bg-orange-100', stage: 'closing', order: 10 },
  closed_won: { label: '✓ Customer', color: 'text-emerald-700', bgColor: 'bg-emerald-100', stage: 'closed', order: 11 },
  closed_lost: { label: '✗ Lost', color: 'text-red-600', bgColor: 'bg-red-100', stage: 'closed', order: 12 },
  not_interested: { label: 'Not Interested', color: 'text-gray-500', bgColor: 'bg-gray-100', stage: 'closed', order: 13 },
  bad_timing: { label: 'Bad Timing', color: 'text-yellow-600', bgColor: 'bg-yellow-100', stage: 'closed', order: 14 },
  nurture: { label: 'Nurture', color: 'text-teal-600', bgColor: 'bg-teal-100', stage: 'closed', order: 15 },
};

export const PRIORITY_CONFIG: Record<number, { label: string; color: string; icon: string }> = {
  0: { label: 'Normal', color: 'text-gray-500', icon: '' },
  1: { label: 'High', color: 'text-orange-500', icon: '!' },
  2: { label: 'Urgent', color: 'text-red-500', icon: '!!' },
  3: { label: 'Hot', color: 'text-red-600', icon: '🔥' },
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function CRMPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'pipeline'>('table');
  
  const [filters, setFilters] = useState<Filters>({
    status: 'all',
    stage: 'all',
    division: 'all',
    conference: 'all',
    program: 'all',
    priority: 'all',
    search: '',
    followUpDue: false,
    starred: false,
    hasNotes: false,
    noContact30Days: false,
  });
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [conferences, setConferences] = useState<string[]>([]);
  
  // Modals & Panels
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  const supabase = createClient();

  // ============================================
  // DATA FETCHING
  // ============================================
  const fetchCoaches = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('crm_coaches')
        .select('*')
        .order('is_starred', { ascending: false })
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false });

      // Apply filters
      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.stage !== 'all') {
        const stageStatuses = Object.entries(STATUS_CONFIG)
          .filter(([_, config]) => config.stage === filters.stage)
          .map(([status]) => status as CoachStatus);
        query = query.in('status', stageStatuses);
      }
      if (filters.division !== 'all') {
        query = query.eq('division', filters.division);
      }
      if (filters.conference !== 'all') {
        query = query.eq('conference', filters.conference);
      }
      if (filters.program !== 'all') {
        query = query.eq('program', filters.program);
      }
      if (filters.priority !== 'all') {
        query = query.eq('priority', parseInt(filters.priority));
      }
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,school.ilike.%${filters.search}%,email.ilike.%${filters.search}%,conference.ilike.%${filters.search}%`);
      }
      if (filters.followUpDue) {
        query = query.lte('next_follow_up_at', new Date().toISOString());
      }
      if (filters.starred) {
        query = query.eq('is_starred', true);
      }
      if (filters.hasNotes) {
        query = query.not('notes', 'is', null);
      }
      if (filters.noContact30Days) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query = query.or(`last_contacted_at.is.null,last_contacted_at.lt.${thirtyDaysAgo.toISOString()}`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCoaches((data || []) as Coach[]);
      
      // Get unique conferences
      const uniqueConferences = [...new Set((data || []).map(c => c.conference))].sort();
      setConferences(uniqueConferences);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch coaches');
    } finally {
      setLoading(false);
    }
  }, [filters, supabase]);

  useEffect(() => {
    fetchCoaches();
  }, [fetchCoaches]);

  // ============================================
  // ACTIONS
  // ============================================
  const updateCoach = async (coachId: string, updates: Partial<Coach>) => {
    try {
      const { error } = await supabase
        .from('crm_coaches')
        .update(updates)
        .eq('id', coachId);

      if (error) throw error;
      
      // Optimistic update
      setCoaches(prev => prev.map(c => 
        c.id === coachId ? { ...c, ...updates } : c
      ));
      
      if (selectedCoach?.id === coachId) {
        setSelectedCoach(prev => prev ? { ...prev, ...updates } : null);
      }
    } catch (err) {
      console.error('Failed to update coach:', err);
      fetchCoaches(); // Revert on error
    }
  };

  const toggleStar = async (coachId: string, currentStarred: boolean) => {
    await updateCoach(coachId, { is_starred: !currentStarred });
  };

  const handleCoachClick = (coach: Coach) => {
    setSelectedCoach(coach);
    setDetailPanelOpen(true);
  };

  const handleBulkAction = async (action: string, value?: unknown) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      if (action === 'status') {
        await supabase
          .from('crm_coaches')
          .update({ status: value as CoachStatus })
          .in('id', ids);
      } else if (action === 'priority') {
        await supabase
          .from('crm_coaches')
          .update({ priority: value as number })
          .in('id', ids);
      } else if (action === 'delete') {
        await supabase
          .from('crm_coaches')
          .delete()
          .in('id', ids);
      }
      
      setSelectedIds(new Set());
      fetchCoaches();
    } catch (err) {
      console.error('Bulk action failed:', err);
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Name', 'Title', 'Email', 'Phone', 'School', 'Conference', 
      'Division', 'Program', 'Status', 'Priority', 'Starred',
      'Last Contact', 'Next Follow-up', 'Notes'
    ];
    
    const rows = coaches.map(c => [
      c.name,
      c.title || '',
      c.email || '',
      c.phone || '',
      c.school,
      c.conference,
      c.division,
      c.program,
      STATUS_CONFIG[c.status]?.label || c.status,
      PRIORITY_CONFIG[c.priority]?.label || 'Normal',
      c.is_starred ? 'Yes' : 'No',
      c.last_contacted_at ? new Date(c.last_contacted_at).toLocaleDateString() : '',
      c.next_follow_up_at ? new Date(c.next_follow_up_at).toLocaleDateString() : '',
      (c.notes || '').replace(/"/g, '""'),
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `golfhelm-crm-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================
  const stats = useMemo(() => {
    const total = coaches.length;
    const starred = coaches.filter(c => c.is_starred).length;
    const followUpsDue = coaches.filter(c => 
      c.next_follow_up_at && new Date(c.next_follow_up_at) <= new Date()
    ).length;
    const customers = coaches.filter(c => c.status === 'closed_won').length;
    
    return { total, starred, followUpsDue, customers };
  }, [coaches]);

  // ============================================
  // RENDER
  // ============================================
  if (error) {
    return (
      <div className="min-h-screen bg-warm-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading CRM</h2>
            <p className="text-red-600">{error}</p>
            <p className="text-sm text-red-500 mt-2">
              Make sure the CRM tables exist. Run the migration in Supabase SQL editor.
            </p>
            <button 
              onClick={fetchCoaches}
              className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50 flex">
      {/* Main Content */}
      <div className={cn(
        'flex-1 transition-all duration-300',
        detailPanelOpen && selectedCoach ? 'mr-[480px]' : ''
      )}>
        {/* Header */}
        <div className="bg-white border-b border-warm-200 sticky top-0 z-20">
          <div className="max-w-full px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <IconUsers className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-warm-900">Coach CRM</h1>
                  <div className="flex items-center gap-4 text-sm text-warm-500">
                    <span>{stats.total} coaches</span>
                    <span>•</span>
                    <span className="text-emerald-600">{stats.customers} customers</span>
                    {stats.followUpsDue > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-orange-600">{stats.followUpsDue} follow-ups due</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {/* View Toggle */}
                <div className="flex items-center bg-warm-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('table')}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      viewMode === 'table' 
                        ? 'bg-white text-warm-900 shadow-sm' 
                        : 'text-warm-600 hover:text-warm-900'
                    )}
                  >
                    Table
                  </button>
                  <button
                    onClick={() => setViewMode('pipeline')}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      viewMode === 'pipeline' 
                        ? 'bg-white text-warm-900 shadow-sm' 
                        : 'text-warm-600 hover:text-warm-900'
                    )}
                  >
                    <IconChart className="w-4 h-4 inline mr-1" />
                    Pipeline
                  </button>
                </div>
                
                <button
                  onClick={() => fetchCoaches()}
                  className="p-2 rounded-lg hover:bg-warm-100 text-warm-600 transition-colors"
                  title="Refresh"
                >
                  <IconRefresh className={cn('w-5 h-5', loading && 'animate-spin')} />
                </button>
                <button
                  onClick={exportToCSV}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-warm-100 hover:bg-warm-200 text-warm-700 transition-colors"
                  title="Export to CSV"
                >
                  <IconDownload className="w-4 h-4" />
                  Export
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-warm-100 hover:bg-warm-200 text-warm-700 transition-colors"
                >
                  <IconUpload className="w-4 h-4" />
                  Import
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                  <IconPlus className="w-4 h-4" />
                  Add Coach
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-full px-6 py-6 space-y-4">
          {/* Pipeline Stats */}
          {viewMode === 'pipeline' && (
            <PipelineStats coaches={coaches} statusConfig={STATUS_CONFIG} />
          )}

          {/* Filters */}
          <CoachFilters
            filters={filters}
            setFilters={setFilters}
            conferences={conferences}
            statusConfig={STATUS_CONFIG}
          />

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <BulkActionsBar
              selectedCount={selectedIds.size}
              onAction={handleBulkAction}
              onClear={() => setSelectedIds(new Set())}
              statusConfig={STATUS_CONFIG}
            />
          )}

          {/* Coach Table or Pipeline View */}
          {viewMode === 'table' ? (
            <CoachTable
              coaches={coaches}
              loading={loading}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onStatusChange={(id, status) => updateCoach(id, { status })}
              onPriorityChange={(id, priority) => updateCoach(id, { priority })}
              onToggleStar={toggleStar}
              onCoachClick={handleCoachClick}
              statusConfig={STATUS_CONFIG}
              priorityConfig={PRIORITY_CONFIG}
            />
          ) : (
            <PipelineView
              coaches={coaches}
              onCoachClick={handleCoachClick}
              onStatusChange={(id, status) => updateCoach(id, { status })}
              onToggleStar={toggleStar}
              statusConfig={STATUS_CONFIG}
              priorityConfig={PRIORITY_CONFIG}
            />
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {detailPanelOpen && selectedCoach && (
        <CoachDetailPanel
          coach={selectedCoach}
          onClose={() => {
            setDetailPanelOpen(false);
            setSelectedCoach(null);
          }}
          onUpdate={(updates) => {
            updateCoach(selectedCoach.id, updates);
          }}
          onRefresh={fetchCoaches}
          statusConfig={STATUS_CONFIG}
          priorityConfig={PRIORITY_CONFIG}
        />
      )}

      {/* Modals */}
      {showAddModal && (
        <AddCoachModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchCoaches();
          }}
          statusConfig={STATUS_CONFIG}
        />
      )}

      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            fetchCoaches();
          }}
        />
      )}
    </div>
  );
}
