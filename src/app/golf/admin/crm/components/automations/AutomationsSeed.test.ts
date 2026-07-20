import { describe, expect, it } from 'vitest';
import { ACTION_KINDS, AUTOMATIONS_SEED, TRIGGER_EVENTS } from './AutomationsSeed';

// ============================================================================
// Regression tests for two settings-automations defects:
//
// 1. The "add_tag" action's paramKey must stay 'value' — the webhook consumer
//    at src/app/api/webhooks/resend/route.ts reads
//    `(action.params as { value?: string }).value` for add_tag, mirroring
//    set_coach_status. If this drifts back to 'tag' (or the route reads a
//    different key than what the editor writes), "Add tag" automations
//    silently become a no-op again.
//
// 2. TRIGGER_EVENTS must only mark a trigger `wired: true` when a real
//    evaluator exists. evaluateAutomationsForEvent() has exactly one caller
//    in the repo (src/app/api/webhooks/resend/route.ts), reached only for
//    TRACKED_EVENTS: email.sent/delivered/delivery_delayed/opened/clicked/
//    bounced/complained/unsubscribed, and contact.updated. email.replied,
//    status_change.engaged, status_change.contacted, and no_contact_30d have
//    no evaluator anywhere and must stay `wired: false` so the "New
//    automation" dropdown (AutomationEditor.tsx) stops offering triggers
//    that can never fire.
// ============================================================================

describe('ACTION_KINDS — add_tag paramKey', () => {
  it('uses the same paramKey ("value") as set_coach_status, matching the webhook consumer', () => {
    const addTag = ACTION_KINDS.find((a) => a.value === 'add_tag');
    const setStatus = ACTION_KINDS.find((a) => a.value === 'set_coach_status');
    expect(addTag).toBeDefined();
    expect(setStatus).toBeDefined();
    expect(addTag?.paramKey).toBe('value');
    expect(addTag?.paramKey).toBe(setStatus?.paramKey);
  });
});

describe('TRIGGER_EVENTS — wired flag matches real evaluator coverage', () => {
  const WIRED_VALUES = [
    'email.opened',
    'email.clicked',
    'email.bounced',
    'email.complained',
    'email.unsubscribed',
  ];
  const UNWIRED_VALUES = [
    'email.replied',
    'status_change.engaged',
    'status_change.contacted',
    'no_contact_30d',
  ];

  it('marks every TRACKED_EVENTS-backed trigger as wired', () => {
    for (const value of WIRED_VALUES) {
      const trigger = TRIGGER_EVENTS.find((t) => t.value === value);
      expect(trigger, `expected TRIGGER_EVENTS to contain ${value}`).toBeDefined();
      expect(trigger?.wired, `expected ${value} to be wired`).toBe(true);
    }
  });

  it('marks every trigger with no evaluator call-site as not wired', () => {
    for (const value of UNWIRED_VALUES) {
      const trigger = TRIGGER_EVENTS.find((t) => t.value === value);
      expect(trigger, `expected TRIGGER_EVENTS to contain ${value}`).toBeDefined();
      expect(trigger?.wired, `expected ${value} to be unwired`).toBe(false);
    }
  });

  it('covers every seeded automation trigger as wired (seeds must always be creatable)', () => {
    for (const seed of AUTOMATIONS_SEED) {
      const trigger = TRIGGER_EVENTS.find((t) => t.value === seed.trigger_event);
      expect(trigger?.wired).toBe(true);
    }
  });
});
