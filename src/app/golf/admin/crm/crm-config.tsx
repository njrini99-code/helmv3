import {
  Inbox,
  Search,
  Send,
  PhoneOutgoing,
  RotateCcw,
  Sparkles,
  Calendar,
  CircleCheck,
  FileCheck,
  Handshake,
  Trophy,
  CircleX,
  ThumbsDown,
  Clock,
  Sprout,
  Zap,
  Target,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================
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

// ============================================================================
// PIPELINE STAGES — 5 visual columns from 15 DB statuses
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
    id: 'outreach',
    label: 'Outreach',
    emoji: '📤',
    statuses: ['researching', 'outreach_pending', 'initial_contact'],
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-t-blue-400',
    gradient: 'from-blue-400 to-indigo-500',
    description: 'Research & first contact',
  },
  {
    id: 'engaged',
    label: 'Engaged',
    emoji: '💬',
    statuses: ['follow_up', 'engaged', 'demo_scheduled', 'demo_completed'],
    color: 'text-violet-700',
    bgColor: 'bg-violet-50',
    borderColor: 'border-t-violet-400',
    gradient: 'from-violet-400 to-purple-500',
    description: 'Active conversations & demos',
  },
  {
    id: 'closing',
    label: 'Closing',
    emoji: '🤝',
    statuses: ['proposal_sent', 'negotiating'],
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
    statuses: ['closed_won', 'closed_lost', 'not_interested', 'bad_timing', 'nurture'],
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
  new_lead:         { label: 'New Lead',         color: 'text-warm-700',    bgColor: 'bg-warm-100',   ringColor: 'ring-warm-300',    icon: <Inbox size={14} />,         iconLabel: '📥', order: 1,  gradient: 'from-warm-400 to-warm-500',     stage: 'new' },
  researching:      { label: 'Researching',      color: 'text-blue-700',    bgColor: 'bg-blue-50',    ringColor: 'ring-blue-300',    icon: <Search size={14} />,        iconLabel: '🔍', order: 2,  gradient: 'from-blue-400 to-blue-500',     stage: 'outreach' },
  outreach_pending: { label: 'Outreach Pending', color: 'text-sky-700',     bgColor: 'bg-sky-50',     ringColor: 'ring-sky-300',     icon: <Send size={14} />,          iconLabel: '📤', order: 3,  gradient: 'from-sky-400 to-sky-500',       stage: 'outreach' },
  initial_contact:  { label: 'Initial Contact',  color: 'text-indigo-700',  bgColor: 'bg-indigo-50',  ringColor: 'ring-indigo-300',  icon: <PhoneOutgoing size={14} />, iconLabel: '📞', order: 4,  gradient: 'from-indigo-400 to-indigo-500', stage: 'outreach' },
  follow_up:        { label: 'Follow Up',        color: 'text-violet-700',  bgColor: 'bg-violet-50',  ringColor: 'ring-violet-300',  icon: <RotateCcw size={14} />,     iconLabel: '🔄', order: 5,  gradient: 'from-violet-400 to-violet-500', stage: 'engaged' },
  engaged:          { label: 'Engaged',          color: 'text-purple-700',  bgColor: 'bg-purple-50',  ringColor: 'ring-purple-300',  icon: <Sparkles size={14} />,      iconLabel: '✨', order: 6,  gradient: 'from-purple-400 to-purple-500', stage: 'engaged' },
  demo_scheduled:   { label: 'Demo Set',         color: 'text-cyan-700',    bgColor: 'bg-cyan-50',    ringColor: 'ring-cyan-300',    icon: <Calendar size={14} />,      iconLabel: '📅', order: 7,  gradient: 'from-cyan-400 to-cyan-500',     stage: 'engaged' },
  demo_completed:   { label: 'Demo Done',        color: 'text-teal-700',    bgColor: 'bg-teal-50',    ringColor: 'ring-teal-300',    icon: <CircleCheck size={14} />,   iconLabel: '✅', order: 8,  gradient: 'from-teal-400 to-teal-500',     stage: 'engaged' },
  proposal_sent:    { label: 'Proposal Sent',    color: 'text-amber-700',   bgColor: 'bg-amber-50',   ringColor: 'ring-amber-300',   icon: <FileCheck size={14} />,     iconLabel: '📄', order: 9,  gradient: 'from-amber-400 to-amber-500',   stage: 'closing' },
  negotiating:      { label: 'Negotiating',      color: 'text-orange-700',  bgColor: 'bg-orange-50',  ringColor: 'ring-orange-300',  icon: <Handshake size={14} />,     iconLabel: '🤝', order: 10, gradient: 'from-orange-400 to-orange-500', stage: 'closing' },
  closed_won:       { label: 'Customer',         color: 'text-primary-700', bgColor: 'bg-primary-50', ringColor: 'ring-primary-400', icon: <Trophy size={14} />,        iconLabel: '🏆', order: 11, gradient: 'from-primary-400 to-primary-500', stage: 'closed' },
  closed_lost:      { label: 'Lost',             color: 'text-red-700',     bgColor: 'bg-red-50',     ringColor: 'ring-red-300',     icon: <CircleX size={14} />,       iconLabel: '✗',  order: 12, gradient: 'from-red-400 to-red-500',       stage: 'closed' },
  not_interested:   { label: 'Not Interested',   color: 'text-warm-600',    bgColor: 'bg-warm-50',    ringColor: 'ring-warm-300',    icon: <ThumbsDown size={14} />,    iconLabel: '👎', order: 13, gradient: 'from-warm-400 to-warm-500',     stage: 'closed' },
  bad_timing:       { label: 'Bad Timing',       color: 'text-warm-600',    bgColor: 'bg-warm-50',    ringColor: 'ring-warm-300',    icon: <Clock size={14} />,         iconLabel: '⏳', order: 14, gradient: 'from-warm-400 to-warm-500',     stage: 'closed' },
  nurture:          { label: 'Nurture',          color: 'text-emerald-700', bgColor: 'bg-emerald-50', ringColor: 'ring-emerald-300', icon: <Sprout size={14} />,        iconLabel: '🌱', order: 15, gradient: 'from-emerald-400 to-emerald-500', stage: 'closed' },
};

export const PRIORITY_CONFIG: Record<number, { label: string; color: string; bgColor: string; icon: React.ReactNode; iconLabel: string }> = {
  0: { label: 'Normal', color: 'text-warm-500', bgColor: 'bg-warm-50', icon: null, iconLabel: '' },
  1: { label: 'High', color: 'text-amber-600', bgColor: 'bg-amber-50', icon: <Zap size={14} />, iconLabel: '⚡' },
  2: { label: 'Hot', color: 'text-orange-600', bgColor: 'bg-orange-50', icon: <Target size={14} />, iconLabel: '🔥' },
};
