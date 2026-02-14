'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { CoachTable } from './components/CoachTable';
import { PipelineView } from './components/PipelineView';
import { CoachFilters, type Filters } from './components/CoachFilters';
import { AddCoachModal } from './components/AddCoachModal';
import { CoachDetailPanel } from './components/CoachDetailPanel';
import { ImportModal } from './components/ImportModal';
import { BulkActionsBar } from './components/BulkActionsBar';

// ============================================
// TYPES
// ============================================
export type CoachStatus = 
  | 'new_lead'
  | 'contacted'
  | 'demo_scheduled'
  | 'customer'
  | 'closed';

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
// SIMPLIFIED 5-STATUS PIPELINE
// ============================================
export const STATUS_CONFIG: Record<CoachStatus, { 
  label: string; 
  color: string; 
  bgColor: string;
  ringColor: string;
  icon: string;
  order: number;
}> = {
  new_lead: { 
    label: 'New Lead', 
    color: 'text-slate-700', 
    bgColor: 'bg-slate-100', 
    ringColor: 'ring-slate-300',
    icon: '📋',
    order: 1 
  },
  contacted: { 
    label: 'Contacted', 
    color: 'text-blue-700', 
    bgColor: 'bg-blue-100', 
    ringColor: 'ring-blue-300',
    icon: '💬',
    order: 2 
  },
  demo_scheduled: { 
    label: 'Demo Set', 
    color: 'text-violet-700', 
    bgColor: 'bg-violet-100', 
    ringColor: 'ring-violet-300',
    icon: '📅',
    order: 3 
  },
  customer: { 
    label: 'Customer', 
    color: 'text-emerald-700', 
    bgColor: 'bg-emerald-100', 
    ringColor: 'ring-emerald-400',
    icon: '✅',
    order: 4 
  },
  closed: { 
    label: 'Closed', 
    color: 'text-rose-700', 
    bgColor: 'bg-rose-100', 
    ringColor: 'ring-rose-300',
    icon: '🚫',
    order: 5 
  },
};

export const PRIORITY_CONFIG: Record<number, { label: string; color: string; bgColor: string; icon: string }> = {
  0: { label: 'Normal', color: 'text-slate-500', bgColor: 'bg-slate-50', icon: '' },
  1: { label: 'High', color: 'text-amber-600', bgColor: 'bg-amber-50', icon: '⚡' },
  2: { label: 'Hot', color: 'text-orange-600', bgColor: 'bg-orange-50', icon: '🔥' },
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
      
      setCoaches(prev => prev.map(c => 
        c.id === coachId ? { ...c, ...updates } : c
      ));
      
      if (selectedCoach?.id === coachId) {
        setSelectedCoach(prev => prev ? { ...prev, ...updates } : null);
      }
    } catch (err) {
      console.error('Failed to update coach:', err);
      fetchCoaches();
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
    const headers = ['Name', 'Email', 'School', 'Conference', 'Division', 'Status', 'Priority', 'Starred', 'Notes'];
    
    const rows = coaches.map(c => [
      c.name,
      c.email || '',
      c.school,
      c.conference,
      c.division,
      STATUS_CONFIG[c.status]?.label || c.status,
      PRIORITY_CONFIG[c.priority]?.label || 'Normal',
      c.is_starred ? 'Yes' : 'No',
      (c.notes || '').replace(/"/g, '""'),
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `golfhelm-crm-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================
  const stats = useMemo(() => {
    const total = coaches.length;
    const byStatus = Object.keys(STATUS_CONFIG).reduce((acc, status) => {
      acc[status as CoachStatus] = coaches.filter(c => c.status === status).length;
      return acc;
    }, {} as Record<CoachStatus, number>);
    const starred = coaches.filter(c => c.is_starred).length;
    const hot = coaches.filter(c => c.priority >= 2).length;
    const followUpsDue = coaches.filter(c => 
      c.next_follow_up_at && new Date(c.next_follow_up_at) <= new Date()
    ).length;
    
    return { total, byStatus, starred, hot, followUpsDue };
  }, [coaches]);

  // ============================================
  // RENDER
  // ============================================
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white border border-red-200 rounded-2xl p-8 text-center shadow-sm">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Error Loading CRM</h2>
            <p className="text-slate-600 mb-4">{error}</p>
            <button 
              onClick={fetchCoaches}
              className="px-6 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Colored Top Bar */}
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 text-white">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-2xl">
                🎯
              </div>
              <div>
                <h1 className="text-xl font-bold">Coach CRM</h1>
                <p className="text-emerald-100 text-sm">{stats.total} coaches • {stats.byStatus.customer || 0} customers</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* View Toggle */}
              <div className="flex items-center bg-white/10 rounded-xl p-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    viewMode === 'table' 
                      ? 'bg-white text-emerald-700 shadow-sm' 
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  )}
                >
                  📋 Table
                </button>
                <button
                  onClick={() => setViewMode('pipeline')}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    viewMode === 'pipeline' 
                      ? 'bg-white text-emerald-700 shadow-sm' 
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  )}
                >
                  📊 Pipeline
                </button>
              </div>
              
              <button
                onClick={exportToCSV}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
              >
                📥 Export
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
              >
                📤 Import
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 rounded-xl bg-white text-emerald-700 hover:bg-emerald-50 text-sm font-bold transition-colors shadow-sm"
              >
                + Add Coach
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Stats Bar */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-3">
          <div className="flex items-center gap-2">
            {(Object.keys(STATUS_CONFIG) as CoachStatus[]).map((status) => {
              const config = STATUS_CONFIG[status];
              const count = stats.byStatus[status] || 0;
              const isActive = filters.status === status;
              
              return (
                <button
                  key={status}
                  onClick={() => setFilters(f => ({ ...f, status: isActive ? 'all' : status }))}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                    isActive 
                      ? `${config.bgColor} ${config.color} ring-2 ${config.ringColor}` 
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <span>{config.icon}</span>
                  <span>{config.label}</span>
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-bold',
                    isActive ? 'bg-white/50' : 'bg-white'
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
            
            <div className="ml-auto flex items-center gap-2">
              {stats.hot > 0 && (
                <span className="flex items-center gap-1 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium">
                  🔥 {stats.hot} hot
                </span>
              )}
              {stats.followUpsDue > 0 && (
                <span className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium">
                  ⏰ {stats.followUpsDue} due
                </span>
              )}
              {stats.starred > 0 && (
                <span className="flex items-center gap-1 px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-medium">
                  ⭐ {stats.starred}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={cn(
        'max-w-[1600px] mx-auto transition-all duration-300',
        detailPanelOpen && selectedCoach ? 'mr-[420px]' : ''
      )}>
        <div className="p-6 space-y-4">
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

          {/* Content */}
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
