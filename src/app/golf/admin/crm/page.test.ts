import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isSuppressedEmailStatus,
  TABS,
  OUTREACH_SUBTABS,
  COACH_VIEWS,
  INBOX_SECTIONS,
  LEGACY_TAB_ALIASES,
  MOBILE_BAR_TABS,
  MOBILE_MORE_TABS,
  CRM_PRIMARY_ACTION_CLASS,
  CRM_SECONDARY_ACTION_CLASS,
  CRM_RADIX_TAB_CLASS,
  SEGMENTED_TABLIST_CLASS,
  segmentedTabClass,
} from './page-contracts';

// ============================================================================
// Regression coverage for the CRM shell contracts:
//  - isSuppressedEmailStatus: the email_status/suppression gate that must
//    protect the compose-tab Gmail send path (the only reachable channel
//    while direct-send is unconfigured).
//  - MOBILE_MORE_TABS must cover every TABS destination not already on the
//    mobile bottom bar, or that destination is unreachable on mobile.
//  - 2026-07-20 nav consolidation: the coach list is ONE destination with
//    internal views; demo requests live in Inbox; every pre-consolidation
//    tab id must still deep-link somewhere real via LEGACY_TAB_ALIASES.
// ============================================================================

describe('isSuppressedEmailStatus', () => {
  it('suppresses bounced, complained, and unsubscribed coaches', () => {
    expect(isSuppressedEmailStatus('bounced')).toBe(true);
    expect(isSuppressedEmailStatus('complained')).toBe(true);
    expect(isSuppressedEmailStatus('unsubscribed')).toBe(true);
  });

  it('does not suppress valid, unknown, null, or undefined statuses', () => {
    expect(isSuppressedEmailStatus('valid')).toBe(false);
    expect(isSuppressedEmailStatus('unknown')).toBe(false);
    expect(isSuppressedEmailStatus(null)).toBe(false);
    expect(isSuppressedEmailStatus(undefined)).toBe(false);
  });
});

describe('mobile navigation coverage', () => {
  it('every TABS destination is reachable via MOBILE_BAR_TABS or MOBILE_MORE_TABS', () => {
    const reachable = new Set<string>([...MOBILE_BAR_TABS, ...MOBILE_MORE_TABS]);
    const missing = TABS.map((t) => t.id).filter((id) => !reachable.has(id));
    expect(missing).toEqual([]);
  });

  it('specifically includes templates in the mobile More sheet', () => {
    expect(MOBILE_MORE_TABS).toContain('templates');
  });

  it('2026-07-20: mobile bar surfaces the daily loop (today/list/outreach/inbox) — Sequences moved to More', () => {
    expect(MOBILE_BAR_TABS).toEqual(['today', 'list', 'outreach', 'inbox']);
    expect(MOBILE_BAR_TABS).not.toContain('sequences');
    expect(MOBILE_MORE_TABS).toContain('sequences');
  });
});

// ============================================================================
// 2026-07-29 — the Calendar destination.
//
// crm_events was a write-only table. ScheduleEventModal and EventDetailModal
// were both mounted in page.tsx, so an admin could schedule a demo and it landed
// in the table — but CalendarView, the only component that LISTS events, was
// never rendered anywhere. Its sole importers pulled the CRMEvent/CRMEventType
// TYPES out of it, which is why every "is it used?" grep came back positive and
// the orphan survived.
//
// Two halves, because a contract test cannot see the actual defect: the ids and
// mobile reachability below, plus a source-text assertion that the component is
// really rendered. The second one is the one that would have caught this.
// ============================================================================
describe('calendar destination (2026-07-29)', () => {
  it('exists as a top-level destination', () => {
    const calendar = TABS.find((t) => t.id === 'calendar');
    expect(calendar, 'crm_events has no read surface without this tab').toBeDefined();
    expect(calendar!.section).toBe('work');
  });

  it('is reachable on mobile', () => {
    const reachable = new Set<string>([...MOBILE_BAR_TABS, ...MOBILE_MORE_TABS]);
    expect(reachable.has('calendar')).toBe(true);
  });

  /**
   * The shortcut is 'C', not '6'. Inserting Calendar into the digit run would
   * have meant renumbering Sequences 6→7 and Templates 7→8, silently re-pointing
   * two keys — the exact failure the "shortcuts are bound to ids, not array
   * position" rule in page-contracts.ts exists to prevent.
   */
  it('takes a new shortcut instead of renumbering the existing digits', () => {
    expect(TABS.find((t) => t.id === 'calendar')!.shortcut).toBe('C');
    expect(TABS.find((t) => t.id === 'sequences')!.shortcut).toBe('6');
    expect(TABS.find((t) => t.id === 'templates')!.shortcut).toBe('7');
  });

  /**
   * The orphan itself. page.tsx is a ~2400-line client component that pulls in
   * the whole CRM surface, so rendering it in a unit test is not viable — this
   * reads the source instead and asserts the component is imported as a VALUE
   * and actually rendered. A type-only import is what the bug looked like, so
   * `import type { CRMEvent }` must not satisfy it.
   */
  it('renders CalendarView — not just its types', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/golf/admin/crm/page.tsx'), 'utf8');

    const importsComponent = /import\s*\{[^}]*\bCalendarView\b[^}]*\}\s*from\s*'\.\/components\/CalendarView'/.test(src);
    expect(importsComponent, 'CalendarView must be imported as a value').toBe(true);
    expect(
      /import\s+type\s*\{[^}]*\}\s*from\s*'\.\/components\/CalendarView'/.test(src),
      'a type-only import is the bug, not the fix',
    ).toBe(false);
    expect(/<CalendarView\b/.test(src), 'CalendarView must be rendered').toBe(true);
    expect(/activeTab === 'calendar'/.test(src), 'gated on the calendar tab').toBe(true);
  });
});

describe('nav consolidation (2026-07-20)', () => {
  it('the coach list is ONE destination — no pipeline/conferences top-level tabs', () => {
    const ids = TABS.map((t) => t.id) as string[];
    expect(ids).toContain('list');
    expect(ids).not.toContain('pipeline');
    expect(ids).not.toContain('conferences');
  });

  it('COACH_VIEWS covers table, board, and conferences', () => {
    expect(COACH_VIEWS.map((v) => v.id)).toEqual(['table', 'board', 'conferences']);
  });

  it('demo requests moved out of Outreach into Inbox', () => {
    expect(OUTREACH_SUBTABS.map((s) => s.id as string)).not.toContain('inbound');
    expect(INBOX_SECTIONS.map((s) => s.id)).toContain('demos');
  });

  it('every legacy tab id aliases to a live destination', () => {
    const liveIds = new Set<string>(TABS.map((t) => t.id));
    for (const [legacyId, target] of Object.entries(LEGACY_TAB_ALIASES)) {
      expect(liveIds.has(legacyId), `'${legacyId}' should be legacy-only, not a live tab`).toBe(false);
      expect(liveIds.has(target.tab), `alias '${legacyId}' points at dead tab '${target.tab}'`).toBe(true);
      if (target.view) {
        expect(COACH_VIEWS.some((v) => v.id === target.view)).toBe(true);
      }
      if (target.outreach) {
        expect(OUTREACH_SUBTABS.some((s) => s.id === target.outreach)).toBe(true);
      }
    }
  });

  it('covers every pre-consolidation id that ever appeared in a ?tab= URL', () => {
    for (const legacyId of ['pipeline', 'conferences', 'email', 'resend', 'insights', 'inbound']) {
      expect(LEGACY_TAB_ALIASES[legacyId]).toBeDefined();
    }
  });

  it('keyboard shortcuts are unique across destinations', () => {
    const shortcuts = TABS.map((t) => t.shortcut.toLowerCase());
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });
});

describe('Fairway CRM control contract', () => {
  it('gives tabs and primary actions mobile-safe touch targets', () => {
    expect(segmentedTabClass(true)).toContain('min-h-11');
    expect(CRM_RADIX_TAB_CLASS).toContain('min-h-11');
    expect(CRM_PRIMARY_ACTION_CLASS).toContain('min-h-11');
    expect(CRM_SECONDARY_ACTION_CLASS).toContain('min-h-11');
  });

  it('uses one accent language instead of destination-specific rainbow colors', () => {
    const contract = [
      SEGMENTED_TABLIST_CLASS,
      segmentedTabClass(true),
      segmentedTabClass(false),
      CRM_RADIX_TAB_CLASS,
      CRM_PRIMARY_ACTION_CLASS,
      CRM_SECONDARY_ACTION_CLASS,
    ].join(' ');

    expect(contract).toContain('accent-');
    expect(contract).not.toMatch(/\b(?:blue|violet|purple|sky|indigo)-/);
  });
});
