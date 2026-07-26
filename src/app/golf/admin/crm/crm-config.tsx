import {
  IconSparkles,
  IconZap,
  IconTarget,
  IconMail as Inbox,
  IconPhone as PhoneOutgoing,
  IconFileText as FileCheck,
  IconTrophy as Trophy,
  IconXCircle as CircleX,
  IconActivity as Sprout,
  IconCrosshair,
  IconMessageSquare,
  IconFlag,
  IconFlame,
} from '@/components/icons';

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

export type Division = 'D1' | 'D2' | 'D3' | 'NAIA' | 'JUCO';
export type ProgramType = 'mens' | 'womens' | 'both';

// Manual work-division labels (one shared CRM login — these are tags, NOT auth users).
// Lets the team split the book (Nick/Ben/Leah) without separate accounts; the server-side
// frequency cap is what actually prevents double-touch.
export const CRM_ASSIGNEES = ['Nick', 'Ben', 'Leah'] as const;
export type CrmAssignee = (typeof CRM_ASSIGNEES)[number];

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
  email_status: 'valid' | 'bounced' | 'complained' | 'unknown' | 'unsubscribed';
  source: string | null;
  is_archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
  athletics_url: string | null;
  role_level: string | null;
  is_primary_contact: boolean;
  // Optional: present on list rows (fetched), absent on the partial Coach literals
  // some modals build for preview. Reads treat absent as null.
  assigned_to?: string | null;
}

// ============================================================================
// PIPELINE STAGES — 4 visual columns from 7 DB statuses
// ============================================================================
// TYPE CHANGE: `emoji: string` → `icon: React.ReactNode` (Lucide icon components replace emoji strings)
// Downstream consumers (PipelineView, PipelineStats) that rendered `stage.emoji` in <span> elements
// should now render `stage.icon` — works identically in JSX.
export interface PipelineStage {
  id: string;
  label: string;
  icon: React.ReactNode;
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
    icon: <IconCrosshair size={16} className="text-warm-600" />,
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
    icon: <IconMessageSquare size={16} className="text-accent-600" />,
    statuses: ['contacted', 'engaged'],
    color: 'text-accent-700',
    bgColor: 'bg-accent-50',
    borderColor: 'border-t-accent-400',
    gradient: 'from-accent-400 to-accent-600',
    description: 'Outreach & active conversations',
  },
  {
    id: 'closing',
    label: 'Closing',
    icon: <IconTarget size={16} className="text-fw-warning-ink" />,
    statuses: ['proposal'],
    color: 'text-fw-warning-ink',
    bgColor: 'bg-fw-warning-bg',
    borderColor: 'border-t-fw-warning',
    gradient: 'from-fw-warning to-warm-500',
    description: 'Proposals & negotiation',
  },
  {
    id: 'closed',
    label: 'Closed',
    icon: <IconFlag size={16} className="text-primary-600" />,
    statuses: ['won', 'lost', 'nurture'],
    color: 'text-primary-700',
    bgColor: 'bg-primary-50',
    borderColor: 'border-t-primary-500',
    gradient: 'from-accent-500 to-accent-700',
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
// TYPE CHANGE: `iconLabel: string` → `iconLabel: React.ReactNode` (Lucide icon components replace emoji strings)
// Downstream consumers rendering iconLabel in <option> elements will need to switch to using the `label` field
// or render iconLabel only in JSX contexts that accept ReactNode (not <option> text content).
export const STATUS_CONFIG: Record<CoachStatus, {
  label: string;
  color: string;
  bgColor: string;
  ringColor: string;
  icon: React.ReactNode;
  iconLabel: React.ReactNode;
  order: number;
  gradient: string;
  stage: string;
}> = {
  new_lead:  { label: 'New Lead',   color: 'text-warm-700',    bgColor: 'bg-warm-100',    ringColor: 'ring-warm-300',    icon: <Inbox size={14} />,         iconLabel: <Inbox size={14} className="text-warm-600" />, order: 1, gradient: 'from-warm-400 to-warm-500',       stage: 'new' },
  contacted: { label: 'Contacted',  color: 'text-accent-700',  bgColor: 'bg-accent-50',   ringColor: 'ring-accent-200',  icon: <PhoneOutgoing size={14} />, iconLabel: <PhoneOutgoing size={14} className="text-accent-600" />, order: 2, gradient: 'from-accent-300 to-accent-500', stage: 'active' },
  engaged:   { label: 'Engaged',    color: 'text-accent-800',  bgColor: 'bg-accent-100',  ringColor: 'ring-accent-300',  icon: <IconSparkles size={14} />,  iconLabel: <IconSparkles size={14} className="text-accent-700" />, order: 3, gradient: 'from-accent-500 to-accent-700', stage: 'active' },
  proposal:  { label: 'Proposal',   color: 'text-fw-warning-ink', bgColor: 'bg-fw-warning-bg', ringColor: 'ring-fw-warning-ring', icon: <FileCheck size={14} />, iconLabel: <FileCheck size={14} className="text-fw-warning-ink" />, order: 4, gradient: 'from-fw-warning to-warm-500', stage: 'closing' },
  won:       { label: 'Customer',   color: 'text-primary-700', bgColor: 'bg-primary-50',  ringColor: 'ring-primary-400', icon: <Trophy size={14} />,        iconLabel: <Trophy size={14} className="text-primary-600" />, order: 5, gradient: 'from-primary-400 to-primary-500', stage: 'closed' },
  lost:      { label: 'Lost',       color: 'text-fw-danger-ink', bgColor: 'bg-fw-danger-bg', ringColor: 'ring-fw-danger', icon: <CircleX size={14} />, iconLabel: <CircleX size={14} className="text-fw-danger-ink" />, order: 6, gradient: 'from-fw-danger to-warm-600', stage: 'closed' },
  // Deeper primary tint than `won` (not a second green hue) — keeps the two
  // "closed" stages visually distinct while staying inside the primary family.
  nurture:   { label: 'Nurture',    color: 'text-primary-900', bgColor: 'bg-primary-100', ringColor: 'ring-primary-600', icon: <Sprout size={14} />,        iconLabel: <Sprout size={14} className="text-primary-700" />, order: 7, gradient: 'from-primary-600 to-primary-700', stage: 'closed' },
};

// ============================================================================
// STATUS COLORS — consistent Tailwind color classes for each status
// ============================================================================
export const STATUS_COLORS: Record<CoachStatus, { bg: string; text: string; border: string; dot: string }> = {
  new_lead:  { bg: 'bg-warm-50',    text: 'text-warm-700',    border: 'border-warm-200',    dot: 'bg-warm-400' },
  contacted: { bg: 'bg-accent-50',  text: 'text-accent-700',  border: 'border-accent-200',  dot: 'bg-accent-400' },
  engaged:   { bg: 'bg-accent-100', text: 'text-accent-800',  border: 'border-accent-300',  dot: 'bg-accent-600' },
  proposal:  { bg: 'bg-fw-warning-bg', text: 'text-fw-warning-ink', border: 'border-fw-warning-ring', dot: 'bg-fw-warning' },
  won:       { bg: 'bg-primary-50', text: 'text-primary-700', border: 'border-primary-200', dot: 'bg-primary-500' },
  lost:      { bg: 'bg-fw-danger-bg', text: 'text-fw-danger-ink', border: 'border-fw-danger', dot: 'bg-fw-danger' },
  nurture:   { bg: 'bg-primary-100', text: 'text-primary-900', border: 'border-primary-300', dot: 'bg-primary-700' },
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
// TYPE CHANGE: `iconLabel: string` → `iconLabel: React.ReactNode` (Lucide icon components replace emoji strings)
export const PRIORITY_CONFIG: Record<number, { label: string; color: string; bgColor: string; icon: React.ReactNode; iconLabel: React.ReactNode }> = {
  0: { label: 'Normal', color: 'text-warm-500', bgColor: 'bg-warm-50', icon: null, iconLabel: null },
  1: { label: 'High', color: 'text-amber-600', bgColor: 'bg-amber-50', icon: <IconZap size={14} className="text-amber-500" />, iconLabel: <IconZap size={14} className="text-amber-500" /> },
  2: { label: 'Hot', color: 'text-orange-600', bgColor: 'bg-orange-50', icon: <IconFlame size={14} className="text-orange-500" />, iconLabel: <IconFlame size={14} className="text-orange-500" /> },
};
