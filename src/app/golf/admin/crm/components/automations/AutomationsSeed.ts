// ============================================================================
// AUTOMATIONS SEED — UI-side mirror of the SQL seed
// ============================================================================
//
// This is the source-of-truth list of seeded automation rules that mirror the
// hardcoded webhook side-effects in src/app/api/webhooks/resend/route.ts:103-140
// (open/click → status='engaged' when status='contacted').
//
// The SQL migration (20260429T2_crm_automations.sql) inserts these on apply.
// The UI uses this constant to:
//   1. Show "seeded" badges on rules that match this set (so admins know
//      which rules came from the migration vs. which they created).
//   2. Power the "Restore defaults" button (AutomationsList.tsx) that
//      re-creates any seeded rule (by name) an admin has deleted.
//
// Keep this in sync with the INSERT statements at the bottom of
// 20260429T2_crm_automations.sql.
// ============================================================================

import type {
  CrmAutomationAction,
  CrmAutomationCondition,
  CrmAutomationTrigger,
} from '@/lib/crm/automations-engine';

export interface SeededAutomation {
  name: string;
  description: string;
  trigger_event: CrmAutomationTrigger;
  conditions: CrmAutomationCondition[];
  actions: CrmAutomationAction[];
  priority: number;
}

export const AUTOMATIONS_SEED: SeededAutomation[] = [
  {
    name: 'Auto-engage on email open',
    description: 'Move coach from contacted → engaged when they open an email.',
    trigger_event: 'email.opened',
    conditions: [
      { field: 'coach.status', op: 'eq', value: 'contacted' },
    ],
    actions: [
      { kind: 'set_coach_status', params: { value: 'engaged' } },
    ],
    priority: 100,
  },
  {
    name: 'Auto-engage on email click',
    description: 'Move coach from contacted → engaged when they click any link.',
    trigger_event: 'email.clicked',
    conditions: [
      { field: 'coach.status', op: 'eq', value: 'contacted' },
    ],
    actions: [
      { kind: 'set_coach_status', params: { value: 'engaged' } },
    ],
    priority: 100,
  },
];

// Lookup helper — used by AutomationsList to render the "Seeded" badge.
export function isSeededAutomation(name: string): boolean {
  return AUTOMATIONS_SEED.some((s) => s.name === name);
}

// ----------------------------------------------------------------------------
// Trigger event metadata — for the AutomationEditor select.
// ----------------------------------------------------------------------------
export const TRIGGER_EVENTS: ReadonlyArray<{
  value: CrmAutomationTrigger;
  label: string;
  description: string;
  // Whether a real call site evaluates this trigger today. The only caller
  // of evaluateAutomationsForEvent() is src/app/api/webhooks/resend/route.ts,
  // which only reaches it for TRACKED_EVENTS (email.sent/delivered/
  // delivery_delayed/opened/clicked/bounced/complained/unsubscribed,
  // contact.updated). email.replied has no evaluator wired in
  // resend-inbound/route.ts, and status_change.*/no_contact_30d have no
  // evaluator at all (no scheduler, no status-change hook). Keep `wired:
  // false` entries here (rather than deleting them) so any legacy row saved
  // against one of these triggers still renders correctly in AutomationsList
  // and AutomationEditor's edit mode — just exclude them from the
  // "New automation" create dropdown until a real evaluator exists.
  wired: boolean;
}> = [
  {
    value: 'email.opened',
    label: 'Email opened',
    description: 'Fires when a coach opens an outbound email.',
    wired: true,
  },
  {
    value: 'email.clicked',
    label: 'Email clicked',
    description: 'Fires when a coach clicks any link in an outbound email.',
    wired: true,
  },
  {
    value: 'email.bounced',
    label: 'Email bounced',
    description: 'Fires on hard or soft bounce from Resend.',
    wired: true,
  },
  {
    value: 'email.complained',
    label: 'Email complained',
    description: 'Fires when a coach marks an email as spam.',
    wired: true,
  },
  {
    value: 'email.unsubscribed',
    label: 'Email unsubscribed',
    description: 'Fires when a coach unsubscribes via the Resend list-unsubscribe header.',
    wired: true,
  },
  {
    value: 'email.replied',
    label: 'Email replied',
    description:
      'Not yet available — /api/webhooks/resend-inbound does not evaluate automations yet.',
    wired: false,
  },
  {
    value: 'status_change.engaged',
    label: 'Status changed to engaged',
    description: 'Not yet available — no status-change evaluator is wired up yet.',
    wired: false,
  },
  {
    value: 'status_change.contacted',
    label: 'Status changed to contacted',
    description: 'Not yet available — no status-change evaluator is wired up yet.',
    wired: false,
  },
  {
    value: 'no_contact_30d',
    label: 'No contact for 30 days',
    description: 'Not yet available — no scheduler evaluates this trigger yet.',
    wired: false,
  },
];

// ----------------------------------------------------------------------------
// Action kind metadata — for the AutomationEditor builder rows.
// ----------------------------------------------------------------------------
export const ACTION_KINDS: ReadonlyArray<{
  value: CrmAutomationAction['kind'];
  label: string;
  description: string;
  paramLabel: string;
  paramKey: string;
  paramPlaceholder: string;
}> = [
  {
    value: 'set_coach_status',
    label: 'Set coach status',
    description: 'Change the coach’s pipeline status.',
    paramLabel: 'New status',
    paramKey: 'value',
    paramPlaceholder: 'e.g. engaged',
  },
  {
    value: 'add_tag',
    label: 'Add tag',
    description: 'Append a tag to the coach record.',
    paramLabel: 'Tag',
    paramKey: 'value',
    paramPlaceholder: 'e.g. high-intent',
  },
  {
    value: 'create_task',
    label: 'Create task',
    description: 'Create a CRM task assigned to the coach owner.',
    paramLabel: 'Task title',
    paramKey: 'title',
    paramPlaceholder: 'e.g. Send follow-up',
  },
  {
    value: 'enroll_in_sequence',
    label: 'Enroll in sequence',
    description: 'Enroll the coach in an email sequence (Phase 2).',
    paramLabel: 'Sequence ID',
    paramKey: 'sequence_id',
    paramPlaceholder: 'uuid',
  },
];
