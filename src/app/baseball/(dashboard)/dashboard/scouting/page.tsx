// =============================================================================
// src/app/baseball/(dashboard)/dashboard/scouting/page.tsx
//
// COHERENCE_RULING_2026-07-08 Ruling 2 — Recruiting hub's new "Scouting"
// landing.
//
// The Recruiting hub caps at 3 rendered subtabs (Pipeline · Discover ·
// Scouting), so Watchlist, Compare Players, Saved Comparisons, Scout
// Packets, and Camps — the evaluation/export tools, not the funnel itself —
// fold in here as a card grid. Every route keeps its existing URL and its own
// registry gating (nav-registry.ts); this page never re-declares that
// gating — it reads the SAME registry entries and reuses
// isBaseballNavEntryVisible so a coach without can_manage_roster, for
// example, simply doesn't see the Compare/Saved Comparisons cards.
//
// Server component, no hooks — the Living Annual kit's SectionMasthead /
// PaperCard / Eyebrow are all server-safe. Ink is `pursuit` (clay) — this is
// THE WAR ROOM lane (recruiting), never green.
// =============================================================================

import Link from 'next/link';

import { requireRecruitingCoachRoute } from '@/lib/baseball/server-route-guards';
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
  title: 'Scouting · BaseballHelm',
};

const SCOUTING_CARD_IDS: readonly {
  id: BaseballNavId;
  description: string;
}[] = [
  {
    id: 'watchlist',
    description: 'The saved shortlist — every prospect you’re actively tracking, in one place.',
  },
  {
    id: 'compare',
    description: 'Side-by-side player comparison across the metrics that matter to your program.',
  },
  {
    id: 'comparisons',
    description: 'Saved comparison sets you can return to without rebuilding the matchup.',
  },
  {
    id: 'scout-packets',
    description: 'Export a showcase event roster into a shareable scout packet.',
  },
  {
    id: 'camps',
    description: 'Create and manage your program’s camp listings.',
  },
];

export default async function ScoutingPage() {
  await requireRecruitingCoachRoute();

  const navContext = (await getBaseballNavContext()) ?? ({ role: 'coach', capabilities: {} } as BaseballNavContext);

  const cards = SCOUTING_CARD_IDS.map(({ id, description }) => {
    const entry = getBaseballNavEntry(id);
    return entry && isBaseballNavEntryVisible(entry, navContext) ? { entry, description } : null;
  }).filter((card): card is { entry: BaseballNavEntry; description: string } => Boolean(card));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <SectionMasthead eyebrow="THE WAR ROOM · SCOUTING" title="Scouting" ink="pursuit">
        <p className="max-w-2xl font-annual text-body text-text-secondary">
          The evaluation toolkit — shortlists, side-by-side comparisons, and exportable packets —
          once a prospect is worth a closer look.
        </p>
      </SectionMasthead>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {cards.map(({ entry, description }) => {
          const Icon = entry.icon;
          return (
            <Link
              key={entry.id}
              href={entry.href}
              className="group block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--pursuit-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)]"
            >
              <PaperCard className="flex h-full items-start gap-4 p-5 transition-transform duration-200 ease-out group-hover:-translate-y-0.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-fw-sm bg-pursuit/10 text-pursuit">
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
          <Eyebrow ink="pursuit">Nothing here yet</Eyebrow>
          <p className="mt-2 font-annual text-body text-text-secondary">
            Your current role doesn&apos;t have access to any of the Scouting surfaces yet. Ask a
            head coach to grant access from Management &gt; Settings.
          </p>
        </PaperCard>
      )}
    </div>
  );
}
