// =============================================================================
// The three places Bridge shows an incident count must show the SAME number.
//
// Reported 2026-07-29: "I'm confused with the errors. They don't match from the
// page that loads in, to the errors tab."
//
// They didn't match because all three counted different things off one dataset.
// Measured against production the same hour — unresolved `admin_events` in the
// trailing 24h, 29 info / 23 warning / 4 error rows:
//
//   bottom-nav badge      raw ROWS, severity in (critical, error)      -> 4
//   Overview KPI strip    fingerprint GROUPS, same severities          -> 3
//   Errors tab list       fingerprint GROUPS, everything but info,
//                         then narrowed to kind=actionable             -> up to 9
//
// Rows vs groups, and two different severity sets, and only one of the three had
// heard of the kind classifier that #1087 introduced. A number sitting in
// permanent chrome that disagrees with the screen it links to is worse than no
// number at all.
//
// All three now read `IncidentFeedCounts.actionableGroups`. This suite pins the
// invariant that makes that number trustworthy — it must equal what the Errors
// tab actually LISTS — plus source guards on the call sites, because the
// arithmetic being right does not stop someone rendering a different field.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIncidentFeedFromSources, summarizeIncidentFeed } from '@/lib/admin/data/incident-feed';
import { applyKindFilter } from '@/lib/admin/data/errors';
import type { AppTriageEventRow } from '@/lib/admin/data/triage';

const ROOT = join(__dirname, '../../../../..');

const appEvent = (over: Partial<AppTriageEventRow>): AppTriageEventRow => ({
  id: 'e1',
  title: 'save failed',
  message: 'insert failed',
  severity: 'error',
  sport: 'baseball',
  fingerprint: 'fp-1',
  user_id: 'u1',
  url: '/baseball/dashboard',
  created_at: new Date().toISOString(),
  ...over,
});

/** A spread with both real defects and known non-actionable noise. */
function mixedRows(): AppTriageEventRow[] {
  return [
    // Real defects — unmatched titles default to a VISIBLE defect by design.
    appEvent({ id: 'a1', fingerprint: 'fp-defect-1', title: 'TypeError: cannot read x of undefined' }),
    appEvent({ id: 'a2', fingerprint: 'fp-defect-1', title: 'TypeError: cannot read x of undefined' }),
    appEvent({ id: 'a3', fingerprint: 'fp-defect-2', title: 'insert into golf_rounds failed', severity: 'critical' }),
    // Routine telemetry / expected outcomes — the noise #1087 exists to demote.
    appEvent({ id: 'b1', fingerprint: 'fp-noise-1', title: 'gateMetrics', severity: 'warning' }),
    appEvent({ id: 'b2', fingerprint: 'fp-noise-2', title: 'Invalid email or password', severity: 'warning' }),
  ];
}

describe('Bridge incident counts — one number across three surfaces', () => {
  it('actionableGroups equals exactly what the Errors tab lists by default', () => {
    // THE invariant. The tab's default view is `applyKindFilter(incidents,
    // undefined)`; the badge and the KPI strip render `counts.actionableGroups`.
    // If these two ever diverge, the chrome is lying about the screen it links
    // to — which is the whole bug this file exists for.
    const { incidents, counts } = buildIncidentFeedFromSources(mixedRows(), [], 24);
    const listedByDefault = applyKindFilter(incidents, undefined);

    expect(counts.actionableGroups).toBe(listedByDefault.length);
  });

  it('counts groups, not rows — the badge/KPI unit mismatch', () => {
    // fp-defect-1 has TWO rows. A row-based count reports 2 for it; a
    // group-based count reports 1. The old badge counted rows, which is how 4
    // and 9 ended up on adjacent screens.
    const { incidents, counts } = buildIncidentFeedFromSources(mixedRows(), [], 24);
    expect(incidents.length).toBeLessThan(mixedRows().length);
    expect(counts.totalGroups).toBe(incidents.length);
  });

  it('is not vacuous — the fixture really does contain both kinds', () => {
    // Everything above would pass trivially if the classifier called all five
    // rows actionable, or none of them.
    const { counts } = buildIncidentFeedFromSources(mixedRows(), [], 24);
    expect(counts.actionableGroups).toBeGreaterThan(0);
    expect(counts.actionableGroups).toBeLessThan(counts.totalGroups);
  });

  it('summarize reports actionableGroups consistently with the item flags', () => {
    const { incidents, counts } = buildIncidentFeedFromSources(mixedRows(), [], 24);
    expect(summarizeIncidentFeed(incidents).actionableGroups).toBe(counts.actionableGroups);
    expect(counts.actionableGroups).toBe(incidents.filter((i) => i.actionable).length);
  });
});

describe('Bridge incident counts — the call sites read the shared field', () => {
  // The arithmetic being right does not stop a surface rendering a different
  // field. These are the three screens the report named.
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

  it('the nav badge counts actionable groups, not raw high-severity rows', () => {
    const src = read('src/lib/admin/data/overview.ts');
    expect(src).toContain('counts.actionableGroups');
    expect(
      src,
      'fetchBridgeErrorBadge is back to a raw row COUNT. It must report the same ' +
        'number the Errors tab lists, or the chrome contradicts the screen it links to.',
    ).not.toMatch(/\.eq\('event_type',\s*'error'\)[\s\S]{0,200}?\.in\('severity'/);
  });

  it('resolving busts the badge cache, so it cannot show a stale count', () => {
    // The badge is cached for 60s. revalidatePath does not reach unstable_cache,
    // so without an explicit tag update a just-resolved incident keeps its badge
    // for up to a minute — indistinguishable from "resolve did nothing".
    const src = read('src/app/admin/actions/triage.ts');
    expect(src).toContain('BRIDGE_INCIDENT_CACHE_TAG');
    expect(src).toMatch(/updateTag\(/);
  });

  it('Overview and the Errors tab both render actionableGroups', () => {
    expect(read('src/app/admin/page.tsx')).toContain('counts.actionableGroups');
    expect(read('src/app/admin/errors/page.tsx')).toContain('counts.actionableGroups');
  });
});
