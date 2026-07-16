// =============================================================================
// src/app/baseball/(dashboard)/dashboard/stats-center/page.tsx
//
// Wave 7 / packet P7.1 — Stats Center hub, server component.
//
// The staff-facing, team-wide stats browser. This server component:
//
//   1. Resolves the current user's server-validated active baseball context
//      (cookie re-validated against real membership rows — never trusted raw).
//   2. Reads the Wave-7 read model getStatsCenter(teamId, options), which is
//      itself STAFF-ONLY (it resolves the viewer from the session and returns an
//      honest authorized:false / error envelope; RLS backs every query).
//   3. Seeds the initial filter state from the URL search params (season /
//      positions / side / date window) so a shared/bookmarked Stats Center URL
//      reproduces the same view, then hands a serializable view-model to the
//      client which owns all subsequent filtering, export, and re-fetching.
//
// The page never accepts a team id from the URL — the team is always the
// server-validated active team. Season/filters are display-scoping only and are
// re-enforced inside the read model + RLS.
// =============================================================================

import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import {
  getStatsCenter,
  type StatSide,
  type StatsCenterOptions,
} from '@/lib/baseball/read-models/stats-center';
import { getStatVisualsPayload } from '@/lib/baseball/read-models/stat-visuals';
import { StatsCenterClient } from '@/components/baseball/stats-center/StatsCenterClient';

export const metadata = {
  title: 'Stats Center · BaseballHelm',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Parse the URL search params into validated read-model options. */
function parseFilters(
  params: Record<string, string | string[] | undefined>,
): StatsCenterOptions {
  const options: StatsCenterOptions = {};

  const seasonRaw = first(params.season);
  if (seasonRaw) {
    const season = Number.parseInt(seasonRaw, 10);
    if (Number.isFinite(season) && season >= 2000 && season <= 2100) {
      options.seasonYear = season;
    }
  }

  const positionsRaw = params.positions ?? params.position;
  if (positionsRaw) {
    const list = (Array.isArray(positionsRaw) ? positionsRaw : positionsRaw.split(','))
      .map((p) => p.trim())
      .filter(Boolean);
    if (list.length > 0) options.positions = list;
  }

  const sideRaw = first(params.side);
  if (sideRaw === 'batting' || sideRaw === 'pitching') {
    options.side = sideRaw as StatSide;
  }

  const fromRaw = first(params.from);
  if (fromRaw && ISO_DATE.test(fromRaw)) options.fromDate = fromRaw;

  const toRaw = first(params.to);
  if (toRaw && ISO_DATE.test(toRaw)) options.toDate = toRaw;

  return options;
}

export default async function StatsCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 1. Resolve the active baseball context (server-validated against memberships).
  const context = await getActiveBaseballContext();
  if (!context) {
    redirect('/baseball/login');
  }

  // Stats Center is a coaching surface; players are routed to their own views.
  if (context.activeRole !== 'coach') {
    redirect('/baseball/dashboard/my-stats');
  }

  // 2. Seed filters from the URL (display-scoping only; re-enforced downstream).
  const resolvedParams = await searchParams;
  const options = parseFilters(resolvedParams);

  // 3. Read the STAFF-ONLY read models for the active team. Both are honest
  //    envelopes (no throw): the box-score season grid + the elite stat-EVENT
  //    read model that feeds the V10 chart gallery (chase/whiff/EV-LA/spray/
  //    pitch-shape/velo-decay). The event read model is itself can_manage_stats-
  //    gated and returns empty visuals when no granular events are captured.
  const [model, visualsPayload, canManageImports, canManageStats] = await Promise.all([
    getStatsCenter(context.activeTeamId, options),
    getStatVisualsPayload(context.activeTeamId, {
      fromDate: options.fromDate ?? null,
      toDate: options.toDate ?? null,
    }),
    // Decides where the client's import entry points route: straight to the
    // full Import Center for import-capable staff, or through the
    // capability-aware /stats/upload shim for everyone else. Same helper the
    // shim itself branches on, so the two stay in agreement.
    hasBaseballCapability(context.activeTeamId, 'can_manage_imports'),
    // Whether the shim destination (/stats/upload, middleware-gated on
    // can_manage_stats) is even reachable for this viewer. Staff holding
    // NEITHER capability get no import entry point at all — routing them to
    // either destination would just bounce them off that destination's own
    // middleware gate.
    hasBaseballCapability(context.activeTeamId, 'can_manage_stats'),
  ]);

  // The full V10 chart payload (every visual family). Undefined ONLY when the
  // viewer lacks can_manage_stats — the gallery then shows its honest empty frames.
  const statVisualsData = visualsPayload.authorized ? visualsPayload.data : undefined;

  return (
    <StatsCenterClient
      model={model}
      canManageImports={canManageImports}
      canManageStats={canManageStats}
      statVisualsData={statVisualsData}
      initialFilters={{
        seasonYear: model.seasonYear,
        positions: options.positions ?? [],
        side: options.side ?? null,
        fromDate: options.fromDate ?? null,
        toDate: options.toDate ?? null,
      }}
    />
  );
}
