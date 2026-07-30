// ============================================================================
// CRM Phase 1 — Frozen Contract Types
// ============================================================================
//
// These types are shared by Streams A/B/C of the Phase 1 CRM build. They are
// considered FROZEN once committed: any change must be coordinated across all
// streams and surfaces consuming them.
//
// SegmentDefinition mirrors the Filters interface in CoachFilters.tsx and the
// definition JSONB column in crm_segments. If one moves the others must move
// in lockstep — see migration 20260428T4_crm_segments.sql.
//
// ============================================================================

import type { CoachStatus } from '../crm-config';

// ----------------------------------------------------------------------------
// Suppressions (T1)
// ----------------------------------------------------------------------------
export type SuppressionReason =
  | 'unsubscribed'
  | 'hard_bounce'
  | 'complained'
  | 'manual'
  | 'invalid';

export type SuppressionSource =
  | 'resend_webhook'
  | 'admin'
  | 'import'
  | 'system';

export interface EmailSuppression {
  id: string;
  email: string;
  reason: SuppressionReason;
  source: SuppressionSource;
  metadata: Record<string, unknown>;
  suppressed_at: string;
  suppressed_by: string | null;
}

// ----------------------------------------------------------------------------
// Notes (T2)
// ----------------------------------------------------------------------------
export type NoteKind = 'note' | 'call_log' | 'meeting_summary' | 'internal';

export interface CrmNote {
  id: string;
  coach_id: string;
  author_id: string;
  body: string;
  kind: NoteKind;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Tasks (T3)
// ----------------------------------------------------------------------------
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'canceled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskKind =
  | 'general'
  | 'follow_up'
  | 'call'
  | 'demo'
  | 'email'
  | 'research';
export type TaskSource = 'manual' | 'automation' | 'sequence' | 'ai_suggestion';

export interface CrmTask {
  id: string;
  coach_id: string;
  assignee_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  due_at: string | null;
  completed_at: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  kind: TaskKind;
  source: TaskSource;
  reminder_at: string | null;
  reminder_sent: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Segments (T4)
// ----------------------------------------------------------------------------
// Mirror of CoachFilters Filters interface — DO NOT diverge.
// If CoachFilters.tsx Filters changes, this MUST change in lockstep.
export interface SegmentDefinition {
  status: CoachStatus | 'all';
  division: 'all' | 'D1' | 'D2' | 'D3' | 'NAIA' | 'JUCO' | 'JUCO_D1' | 'JUCO_D2' | 'JUCO_D3' | 'CCCAA';
  queueStatus?: 'all' | 'queued' | 'sent' | 'done';
  conference: string;
  program: 'all' | 'mens' | 'womens' | 'both';
  priority: string;
  search: string;
  followUpDue: boolean;
  starred: boolean;
  hasNotes: boolean;
  noContact30Days: boolean;
  // Primary-contact filter: when true, only coaches with is_primary_contact=true are enrolled
  primaryOnly?: boolean;
  // Next-step follow-up tracking quick filters — mirrors CoachFilters.tsx
  // Filters in lockstep (see this file's header comment).
  overdueFollowUp?: boolean;
  noNextStep?: boolean;
}

export interface CrmSegment {
  id: string;
  name: string;
  description: string | null;
  definition: SegmentDefinition;
  created_by: string;
  is_shared: boolean;
  pin_order: number | null;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Engagement (T6 — owned by Stream B, contract lives here)
// ----------------------------------------------------------------------------
export type CoachTemperature = 'hot' | 'warm' | 'cold';

export interface CoachEngagement {
  coach_id: string;
  score: number; // 0-100
  temperature: CoachTemperature;
  opens_90d: number;
  clicks_90d: number;
  last_event_at: string | null;
}

// ----------------------------------------------------------------------------
// Timeline (Stream C contract — lives here so all streams import the shape)
// ----------------------------------------------------------------------------
export type TimelineSource =
  | 'contact_log'
  | 'email_event'
  | 'crm_event'
  | 'note'
  | 'task'
  // 2026-07-29: crm_replies was missing from the union, so what a coach actually
  // WROTE BACK — the single highest-signal event in the whole CRM — never
  // appeared on their timeline. Everything else here is outbound activity or our
  // own internal record-keeping.
  | 'reply';

export interface TimelineItem {
  id: string;
  source: TimelineSource;
  type: string; // sub-type within source (e.g. 'email.opened', 'follow_up')
  occurred_at: string;
  title: string;
  body: string | null;
  actor_id: string | null;
  metadata: Record<string, unknown>;
}
