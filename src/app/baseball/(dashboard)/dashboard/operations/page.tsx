// =============================================================================
// src/app/baseball/(dashboard)/dashboard/operations/page.tsx
//
// COHERENCE_RULING_2026-07-08 Ruling 2 — Team hub's new "Operations" landing.
//
// The Team hub caps at 3 rendered subtabs (Roster · Calendar · Operations),
// so Documents, Travel, Practice Planner, and Practice Effectiveness — all
// team-logistics surfaces, not stats — fold in here as a card grid instead of
// each keeping its own subtab slot. Every route the grid links to keeps its
// existing URL and its own registry gating (nav-registry.ts); this page never
// re-declares that gating — it reads the SAME registry entries and reuses
// isBaseballNavEntryVisible so a coach without can_manage_practice, for
// example, simply doesn't see the Practice Effectiveness card, exactly like
// they wouldn't see it in the sidebar.
//
// Server component, no hooks — the Living Annual kit's SectionMasthead /
// PaperCard / Eyebrow are all server-safe.
// =============================================================================

import Link from 'next/link';

import { requireBaseballCoachRoute } from '@/lib/baseball/server-route-guards';
import { getBaseballNavContext } from '@/lib/baseball/nav-context';
import {
  getBaseballNavEntry,
  isBaseballNavEntryVisible,
  type BaseballNavContext,
  type BaseballNavEntry,
  type BaseballNavId,
} from '@/lib/baseball/nav-registry';
import { SectionMasthead, PaperCard, Eyebrow } from '@/components/baseball/living-annual';
import { IconChevronRight } from '@/components/icons';

export const metadata = {
  title: 'Operations · BaseballHelm',
};

const OPERATIONS_CARD_IDS: readonly {
  id: BaseballNavId;
  description: string;
}[] = [
  {
    id: 'documents',
    description: 'The team file library — playbooks, forms, and anything the roster needs on hand.',
  },
  {
    id: 'travel',
    description: 'Trip itineraries for every away game or showcase — lodging, transport, and timing.',
  },
  {
    id: 'practice-planner',
    description: 'Build and publish the practice schedule the roster sees on their own Practice tab.',
  },
  {
    id: 'practice-effectiveness',
    description: 'Did practice transfer to performance? The staff-only read on what actually worked.',
  },
];

export default async function OperationsPage() {
  await requireBaseballCoachRoute();

  const navContext = (await getBaseballNavContext()) ?? ({ role: 'coach', capabilities: {} } as BaseballNavContext);

  const cards = OPERATIONS_CARD_IDS.map(({ id, description }) => {
    const entry = getBaseballNavEntry(id);
    return entry && isBaseballNavEntryVisible(entry, navContext) ? { entry, description } : null;
  }).filter((card): card is { entry: BaseballNavEntry; description: string } => Boolean(card));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <SectionMasthead eyebrow="TEAM · OPERATIONS" title="Operations" ink="team">
        <p className="max-w-2xl font-annual text-body text-text-secondary">
          Everything that keeps the program running between games — files, travel, and practice —
          lives here in one place instead of four separate tabs.
        </p>
      </SectionMasthead>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {cards.map(({ entry, description }) => {
          const Icon = entry.icon;
          return (
            <Link
              key={entry.id}
              href={entry.href}
              className="group block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--team-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)]"
            >
              <PaperCard className="flex h-full items-start gap-4 p-5 transition-transform duration-200 ease-out group-hover:-translate-y-0.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-fw-sm bg-grade-plus/10 text-grade-plus">
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-annual text-body-lg font-semibold text-text-primary">{entry.label}</h3>
                  <p className="mt-1 text-body-sm text-text-secondary">{description}</p>
                </div>
                <IconChevronRight
                  size={18}
                  className="mt-1 shrink-0 text-text-tertiary transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </PaperCard>
            </Link>
          );
        })}
      </div>

      {cards.length === 0 && (
        <PaperCard className="mt-8 p-6">
          <Eyebrow ink="team">Nothing here yet</Eyebrow>
          <p className="mt-2 font-annual text-body text-text-secondary">
            Your current role doesn&apos;t have access to any of the Operations surfaces yet. Ask a
            head coach to grant access from Management &gt; Settings.
          </p>
        </PaperCard>
      )}
    </div>
  );
}
