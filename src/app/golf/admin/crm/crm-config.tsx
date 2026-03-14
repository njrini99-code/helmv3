import {
  Inbox,
  PhoneOutgoing,
  Sparkles,
  FileCheck,
  Trophy,
  CircleX,
  Sprout,
  Zap,
  Target,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================
export type CoachStatus =
  | 'new_lead'
  | 'contacted'
  | 'engaged'
  | 'proposal'
  | 'won'
  | 'lost'
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
  email_status: 'valid' | 'bounced' | 'complained' | 'unknown';
  source: string | null;
  is_archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// PIPELINE STAGES — 4 visual columns from 7 DB statuses
// ============================================================================
export interface PipelineStage {
  id: string;
  label: string;
  emoji: string;
  statuses: CoachStatus[];
  color: string;
  bgColor: string;
  borderColor: string;
  gradient: string;
  description: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 'new',
    label: 'New',
    emoji: '🎯',
    statuses: ['new_lead'],
    color: 'text-warm-700',
    bgColor: 'bg-warm-50',
    borderColor: 'border-t-warm-400',
    gradient: 'from-warm-400 to-warm-500',
    description: 'Unworked prospects',
  },
  {
    id: 'active',
    label: 'Active',
    emoji: '💬',
    statuses: ['contacted', 'engaged'],
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-t-violet-400',
    gradient: 'from-blue-400 to-violet-500',
    description: 'Outreach & active conversations',
  },
  {
    id: 'closing',
    label: 'Closing',
    emoji: '🤝',
    statuses: ['proposal'],
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-t-amber-400',
    gradient: 'from-amber-400 to-orange-500',
    description: 'Proposals & negotiation',
  },
  {
    id: 'closed',
    label: 'Closed',
    emoji: '🏁',
    statuses: ['won', 'lost', 'nurture'],
    color: 'text-primary-700',
    bgColor: 'bg-primary-50',
    borderColor: 'border-t-primary-500',
    gradient: 'from-primary-400 to-primary-600',
    description: 'Terminal states',
  },
];

// ============================================================================
// CONFERENCE GROUPS — major D2/D3 conferences
// ============================================================================
export const CONFERENCE_GROUPS = [
  { label: 'Power Conferences', conferences: ['ACC', 'SEC', 'Big Ten', 'Big 12', 'Pac-12'] },
  { label: 'Mid-Major', conferences: ['American', 'Mountain West', 'WCC', 'A-10', 'MVC', 'Colonial Athletic', 'CAA', 'Southern'] },
  { label: 'D2 Conferences', conferences: [] }, // Catch-all for D2
  { label: 'D3 Conferences', conferences: [] }, // Catch-all for D3
] as const;

// ============================================================================
// STATUS CONFIG
// ============================================================================
export const STATUS_CONFIG: Record<CoachStatus, {
  label: string;
  color: string;
  bgColor: string;
  ringColor: string;
  icon: React.ReactNode;
  iconLabel: string;
  order: number;
  gradient: string;
  stage: string;
}> = {
  new_lead:  { label: 'New Lead',   color: 'text-warm-700',    bgColor: 'bg-warm-100',    ringColor: 'ring-warm-300',    icon: <Inbox size={14} />,         iconLabel: '📥', order: 1, gradient: 'from-warm-400 to-warm-500',       stage: 'new' },
  contacted: { label: 'Contacted',  color: 'text-blue-700',    bgColor: 'bg-blue-50',     ringColor: 'ring-blue-300',    icon: <PhoneOutgoing size={14} />, iconLabel: '📞', order: 2, gradient: 'from-blue-400 to-blue-500',       stage: 'active' },
  engaged:   { label: 'Engaged',    color: 'text-violet-700',  bgColor: 'bg-violet-50',   ringColor: 'ring-violet-300',  icon: <Sparkles size={14} />,      iconLabel: '✨', order: 3, gradient: 'from-violet-400 to-violet-500',   stage: 'active' },
  proposal:  { label: 'Proposal',   color: 'text-amber-700',   bgColor: 'bg-amber-50',    ringColor: 'ring-amber-300',   icon: <FileCheck size={14} />,     iconLabel: '📄', order: 4, gradient: 'from-amber-400 to-amber-500',     stage: 'closing' },
  won:       { label: 'Customer',   color: 'text-primary-700', bgColor: 'bg-primary-50',  ringColor: 'ring-primary-400', icon: <Trophy size={14} />,        iconLabel: '🏆', order: 5, gradient: 'from-primary-400 to-primary-500', stage: 'closed' },
  lost:      { label: 'Lost',       color: 'text-red-700',     bgColor: 'bg-red-50',      ringColor: 'ring-red-300',     icon: <CircleX size={14} />,       iconLabel: '✗',  order: 6, gradient: 'from-red-400 to-red-500',         stage: 'closed' },
  nurture:   { label: 'Nurture',    color: 'text-emerald-700', bgColor: 'bg-emerald-50',  ringColor: 'ring-emerald-300', icon: <Sprout size={14} />,        iconLabel: '🌱', order: 7, gradient: 'from-emerald-400 to-emerald-500', stage: 'closed' },
};

// ============================================================================
// AUTO FOLLOW-UP DAYS
// ============================================================================
export const AUTO_FOLLOWUP_DAYS: Partial<Record<CoachStatus, number>> = {
  contacted: 3,
  engaged: 7,
  proposal: 5,
  nurture: 30,
};

// ============================================================================
// PRIORITY CONFIG
// ============================================================================
export const PRIORITY_CONFIG: Record<number, { label: string; color: string; bgColor: string; icon: React.ReactNode; iconLabel: string }> = {
  0: { label: 'Normal', color: 'text-warm-500', bgColor: 'bg-warm-50', icon: null, iconLabel: '' },
  1: { label: 'High', color: 'text-amber-600', bgColor: 'bg-amber-50', icon: <Zap size={14} />, iconLabel: '⚡' },
  2: { label: 'Hot', color: 'text-orange-600', bgColor: 'bg-orange-50', icon: <Target size={14} />, iconLabel: '🔥' },
};
