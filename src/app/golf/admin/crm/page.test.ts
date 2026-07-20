import { describe, expect, it } from 'vitest';
import {
  isSuppressedEmailStatus,
  TABS,
  OUTREACH_SUBTABS,
  MOBILE_BAR_TABS,
  MOBILE_MORE_TABS,
} from './page-contracts';

// ============================================================================
// Regression coverage for confirmed wiring defects fixed on the CRM shell page:
//  - isSuppressedEmailStatus: the email_status/suppression gate that must
//    protect the compose-tab Gmail send path (the only reachable channel
//    while direct-send is unconfigured).
//  - MOBILE_MORE_TABS must cover every TABS destination not already on the
//    mobile bottom bar, or that destination is unreachable on mobile.
//  - The Outreach "inbound" sub-tab must not be mislabeled "Replies" — it
//    renders demo_requests data (InboundLeadsView), not crm_replies.
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
});

describe('Outreach sub-tab labels', () => {
  it('does not label the demo_requests-backed "inbound" sub-tab as "Replies"', () => {
    const inbound = OUTREACH_SUBTABS.find((s) => s.id === 'inbound');
    expect(inbound).toBeDefined();
    expect(inbound?.label).not.toBe('Replies');
  });
});
