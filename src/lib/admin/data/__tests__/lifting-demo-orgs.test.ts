import { describe, it, expect } from 'vitest';
import { computeAllSessionsAreDemoOrgs } from '@/lib/admin/data/lifting';
import { DEMO_ORGANIZATION_IDS, isDemoOrganizationId } from '@/lib/admin/data/lifting-demo-orgs';

/**
 * Bridge audit 2026-08-21: every helm_lifting_sessions row that has ever
 * existed belongs to Rini University or Demo University (56 + 32 = 88 of
 * 88, verified live) — /admin/lifting's own header says "every number
 * below is platform-wide," true but currently meaning "100% test data,"
 * with nothing on the page saying so.
 */
describe('DEMO_ORGANIZATION_IDS / isDemoOrganizationId', () => {
  it('matches the two live seed org ids verified 2026-08-21', () => {
    expect(DEMO_ORGANIZATION_IDS.has('6ce2c0bd-fb7d-4cae-a536-387f6aea8ff7')).toBe(true); // Rini University
    expect(DEMO_ORGANIZATION_IDS.has('b3fac6a0-1410-5e7c-8082-15a7db570935')).toBe(true); // Demo University
    expect(DEMO_ORGANIZATION_IDS.size).toBe(2);
  });

  it('isDemoOrganizationId is false for null and for a real org id', () => {
    expect(isDemoOrganizationId(null)).toBe(false);
    expect(isDemoOrganizationId('11111111-1111-1111-1111-111111111111')).toBe(false);
  });
});

describe('computeAllSessionsAreDemoOrgs', () => {
  it('is true when every session belongs to a demo org (the audited state)', () => {
    expect(computeAllSessionsAreDemoOrgs(88, 88)).toBe(true);
  });

  it('is false as soon as even one session is not a demo org', () => {
    expect(computeAllSessionsAreDemoOrgs(89, 88)).toBe(false);
  });

  it('is false for an empty platform — "no data" is not "100% demo data"', () => {
    expect(computeAllSessionsAreDemoOrgs(0, 0)).toBe(false);
  });
});
