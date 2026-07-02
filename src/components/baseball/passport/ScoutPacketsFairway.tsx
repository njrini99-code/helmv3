'use client';

// =============================================================================
// ScoutPacketsFairway — the coach Scout Packets hub, composed from the
// "Living Annual" kit (spec: docs/baseball/design-system-living-annual.md;
// plan: docs/baseball/ui-migration-execution-plan.md §3.2 scout-packets row).
// -----------------------------------------------------------------------------
// PRESENTATION ONLY (P4.18). `getScoutPacketRoster()` still runs server-side in
// page.tsx (export-rights gated, RLS-scoped) — this component only receives its
// exact `{ exportEnabled, entries[] }` shape and re-skins the chrome:
//   • masthead → `<SectionMasthead ink="pursuit">` (clay, War Room lane)
//   • the program-level export guardrail — a loud warning-tone box before —
//     is now an `<EditorsLetter ink="pursuit">` (the empty-state doctrine's
//     one composed voice, never a loud warning-tone box)
//   • the roster list itself is reused as `<ScoutPacketRosterList>`, which owns
//     its own re-skin (kit rows, honest 3-state chip, `<PacketSeal>` only on
//     genuinely-live entries).
// =============================================================================

import Link from 'next/link';
import { Button } from '@/components/fairway';
import { SectionMasthead, EditorsLetter } from '@/components/baseball/living-annual';
import type { ScoutPacketRoster } from '@/app/baseball/actions/scout-packet';
import { ScoutPacketRosterList } from './ScoutPacketRosterList';

export interface ScoutPacketsFairwayProps {
  roster: ScoutPacketRoster;
}

export function ScoutPacketsFairway({ roster }: ScoutPacketsFairwayProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <SectionMasthead eyebrow="Recruiting" title="Scout Packets" ink="pursuit" className="mb-8">
        <p className="max-w-prose font-annual text-body-lg leading-relaxed text-text-secondary">
          Share source-backed packets with college coaches. Each link shows only
          verified, scout-exposed fields — never internal notes.
        </p>
      </SectionMasthead>

      {!roster.exportEnabled ? (
        <EditorsLetter
          ink="pursuit"
          title="Scout packet export is off for this program."
          body="Turn on scout access and export in Settings before sharing links with college coaches."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/baseball/dashboard/settings/program">Open Settings</Link>
            </Button>
          }
          className="mb-6"
        />
      ) : null}

      <ScoutPacketRosterList entries={roster.entries} />
    </div>
  );
}

export default ScoutPacketsFairway;
