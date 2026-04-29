// ============================================================================
// CRM Automations — Pure Evaluator
// ============================================================================
//
// Lives in src/lib/crm so both the admin server actions
// (src/app/golf/actions/crm-automations.ts) and the Resend webhook route
// (src/app/api/webhooks/resend/route.ts — the orchestrator wires this up)
// can import the same evaluator. The evaluator is intentionally pure —
// it knows nothing about Supabase or Next.js — so the caller is responsible
// for fetching rules and applying the resolved actions.
//
// Shapes are mirrored in supabase/migrations/20260429T2_crm_automations.sql
// (see SEED rows for canonical examples) and rendered by the
// AutomationEditor builder UI.
// ============================================================================

// ----------------------------------------------------------------------------
// Trigger events — must match CHECK constraint in 20260429T2_crm_automations.sql
// ----------------------------------------------------------------------------
export type CrmAutomationTrigger =
  | 'email.opened'
  | 'email.clicked'
  | 'email.bounced'
  | 'email.complained'
  | 'email.unsubscribed'
  | 'email.replied'
  | 'status_change.engaged'
  | 'status_change.contacted'
  | 'no_contact_30d';

// ----------------------------------------------------------------------------
// Conditions — list of {field, op, value}. AND-combined. JSON-shaped so the
// builder UI can round-trip the rule without losing fidelity.
// ----------------------------------------------------------------------------
export type CrmAutomationConditionOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'is_null'
  | 'is_not_null';

export interface CrmAutomationCondition {
  field: string; // e.g. 'coach.status', 'metadata.event_type'
  op: CrmAutomationConditionOp;
  value?: unknown;
}

// ----------------------------------------------------------------------------
// Actions — list of {kind, params}. The webhook (or whatever caller drives
// this) is responsible for executing them.
// ----------------------------------------------------------------------------
export type CrmAutomationActionKind =
  | 'set_coach_status'
  | 'add_tag'
  | 'create_task'
  | 'enroll_in_sequence';

export interface CrmAutomationAction {
  kind: CrmAutomationActionKind;
  params: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Rule shape — matches the crm_automations row, minus DB-only columns.
// ----------------------------------------------------------------------------
export interface CrmAutomation {
  id: string;
  name: string;
  description: string | null;
  trigger_event: CrmAutomationTrigger;
  conditions: CrmAutomationCondition[];
  actions: CrmAutomationAction[];
  is_active: boolean;
  priority: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Event shape — what the webhook hands the evaluator. `coach` is whatever
// snapshot the caller has (we only read shallowly). `metadata` is free-form.
// ----------------------------------------------------------------------------
export interface CrmAutomationEvent {
  trigger_event: CrmAutomationTrigger;
  coach: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Helpers
// ============================================================================
function getByPath(source: unknown, path: string): unknown {
  if (!source || typeof source !== 'object') return undefined;
  const segments = path.split('.');
  let cursor: unknown = source;
  for (const seg of segments) {
    if (cursor && typeof cursor === 'object' && seg in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function resolveField(event: CrmAutomationEvent, field: string): unknown {
  // Field references are expected to start with `coach.` or `metadata.` —
  // anything else is treated as a metadata key for forward-compat.
  if (field.startsWith('coach.')) {
    return getByPath(event.coach, field.slice('coach.'.length));
  }
  if (field.startsWith('metadata.')) {
    return getByPath(event.metadata, field.slice('metadata.'.length));
  }
  return getByPath(event.metadata, field);
}

function evalCondition(event: CrmAutomationEvent, cond: CrmAutomationCondition): boolean {
  const actual = resolveField(event, cond.field);
  const expected = cond.value;

  switch (cond.op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual);
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.includes(expected);
      }
      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }
      return false;
    case 'is_null':
      return actual === null || actual === undefined;
    case 'is_not_null':
      return actual !== null && actual !== undefined;
    default:
      return false;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Pure evaluator: given an event and a list of rules, return the actions
 * that should run. Rules are filtered to:
 *   - is_active = true
 *   - trigger_event matches event.trigger_event
 *   - all conditions pass (AND)
 * then sorted by priority ascending (lower = earlier).
 *
 * Caller is responsible for executing the returned actions.
 */
export function evaluateAutomationsForEvent(
  event: CrmAutomationEvent,
  rules: CrmAutomation[],
): { actions: CrmAutomationAction[]; matchedRules: CrmAutomation[] } {
  const matched = rules
    .filter((r) => r.is_active)
    .filter((r) => r.trigger_event === event.trigger_event)
    .filter((r) => {
      const conds = Array.isArray(r.conditions) ? r.conditions : [];
      return conds.every((c) => evalCondition(event, c));
    })
    .sort((a, b) => a.priority - b.priority);

  const actions: CrmAutomationAction[] = [];
  for (const rule of matched) {
    const ruleActions = Array.isArray(rule.actions) ? rule.actions : [];
    for (const a of ruleActions) {
      actions.push(a);
    }
  }

  return { actions, matchedRules: matched };
}
