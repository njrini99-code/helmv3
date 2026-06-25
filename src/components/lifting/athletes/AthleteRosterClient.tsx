'use client';

// =============================================================================
// src/components/lifting/athletes/AthleteRosterClient.tsx
//
// Coach-facing tabbed roster view. Sport-filter tabs + glass-card list + a
// "Sync athletes" button that calls the helm_lifting_sync_org_athletes RPC via
// a server action.
//
// Reads helm_lifting_athletes rows passed from the server page (no client-side
// Supabase query — data is fresh at render; sync action triggers a router
// refresh to re-fetch).
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconUsers,
  IconRefresh,
  IconDumbbell,
  IconCheckCircle2,
  IconAlertCircle,
} from '@/components/icons';
import { AthleteProfileCard } from './AthleteProfileCard';
import type { HelmLiftingAthleteRow, HelmLiftingCoachAssignmentRow, HelmLiftingSport } from '@/lib/types';
import { syncOrgAthletes } from '@/app/lifting/actions/athletes';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  athletes: HelmLiftingAthleteRow[];
  assignments: HelmLiftingCoachAssignmentRow[];
  orgId: string;
  canEdit: boolean;
}

type Tab = 'all' | HelmLiftingSport;

const SPORT_LABELS: Record<HelmLiftingSport, string> = {
  baseball: 'Baseball',
  golf: 'Golf',
};

export function AthleteRosterClient({ athletes, assignments, orgId, canEdit }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [, startTransition] = useTransition();

  // Determine which sports actually have athletes (or assignments)
  const activeSports = Array.from(
    new Set([
      ...athletes.map((a) => a.sport),
      ...assignments.map((a) => a.sport),
    ]),
  ).sort() as HelmLiftingSport[];

  const filtered =
    activeTab === 'all'
      ? athletes
      : athletes.filter((a) => a.sport === activeTab);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    const res = await syncOrgAthletes(orgId);
    setSyncing(false);
    setSyncMsg(
      res.success
        ? { ok: true, msg: 'Athletes synced.' }
        : { ok: false, msg: res.error ?? 'Sync failed.' },
    );
    if (res.success) {
      startTransition(() => {
        router.refresh();
      });
      setTimeout(() => setSyncMsg(null), 4000);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-eyebrow uppercase tracking-wide text-primary-700">Lifting Lab</p>
          <h1 className="mt-0.5 text-3xl font-semibold tracking-tight text-warm-900">Athletes</h1>
          <p className="mt-1 text-sm text-warm-500">
            {athletes.length} active athlete{athletes.length !== 1 ? 's' : ''} across{' '}
            {activeSports.length} sport{activeSports.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            <IconRefresh size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync athletes'}
          </button>
        )}
      </div>

      {/* Sync feedback */}
      {syncMsg && (
        <div
          role="alert"
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            syncMsg.ok
              ? 'border-primary-200 bg-primary-50 text-primary-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {syncMsg.ok ? (
            <IconCheckCircle2 size={16} className="shrink-0" />
          ) : (
            <IconAlertCircle size={16} className="shrink-0" />
          )}
          {syncMsg.msg}
        </div>
      )}

      {/* Sport filter tabs */}
      {activeSports.length > 1 && (
        <div className="flex gap-2">
          {(['all', ...activeSports] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
                activeTab === tab
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white/70 text-warm-600 hover:bg-white/90 hover:text-warm-900'
              }`}
            >
              {tab === 'all' ? 'All' : SPORT_LABELS[tab as HelmLiftingSport]}
            </button>
          ))}
        </div>
      )}

      {/* Roster list */}
      {syncing && filtered.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card variant="glass">
          <CardContent className="py-12">
            <EmptyState
              icon={<IconUsers size={28} />}
              title="No athletes"
              description={
                activeTab === 'all'
                  ? 'Use "Sync athletes" to pull your roster into the Lab, or invite players through their sport dashboard.'
                  : `No ${SPORT_LABELS[activeTab as HelmLiftingSport]} athletes found. Sync your roster to populate this sport.`
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((athlete) => (
            <AthleteProfileCard key={athlete.id} athlete={athlete} latestCheckin={null} />
          ))}
        </div>
      )}

      {/* Empty sport coverage notice */}
      {athletes.length > 0 && activeSports.length === 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconDumbbell size={18} className="text-primary-600" />
              <h2 className="font-semibold text-warm-900">No team assignments yet</h2>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-warm-500">
              You have athletes but no active team assignments. Go to Settings to assign sports and teams.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
