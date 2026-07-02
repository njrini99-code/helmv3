// =============================================================================
// src/app/baseball/(dashboard)/dashboard/import/page.tsx
//
// Wave 6 / packet: source-registry. Import Center route.
//
// SERVER-GATED: this page resolves the active baseball context and the
// can_manage_imports capability on the server. It is NOT protected by sidebar
// hiding alone (per the nav/route-bypass risk) — a coach without the import
// capability is redirected before any import UI or data is rendered. The server
// actions the wizard calls re-enforce the same capability independently.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import { getImportRuns } from '@/app/baseball/actions/imports';
import { listImportSources } from '@/app/baseball/actions/program-settings';
import { ImportCenterShell } from '@/components/baseball/import-center/ImportCenterShell';
import { CONCRETE_EVENT_ADAPTERS } from '@/lib/baseball/adapters';
import { getSourceRegistryEntry } from '@/lib/baseball/stat-import-adapters';
import { BASEBALL_IMPORT_SOURCES } from '@/lib/baseball/import-matching';
import { isImportSourceEnabled } from '@/lib/baseball/import-source-enabled';
import { fairwayScope } from '@/lib/redesign/flag';
import type { BaseballImportRunRow } from '@/lib/types/baseball-imports';
import type { BaseballImportSourceConfig } from '@/lib/types/baseball-settings';
import type { BaseballSourceKey } from '@/lib/types/baseball-stat-events';
import type { RegisteredSourceOption } from '@/components/baseball/import-center/ImportCenterShell';

/**
 * Build the file-input accept list from the source's REAL supported formats so the
 * picker only offers what the adapter can actually parse — XML providers accept .xml,
 * tracking/swing sources accept .csv/.tsv AND .xlsx (the workbook formats Blast,
 * Diamond Kinetics and spreadsheet exports ship in), now that the XLSX reader exists.
 */
const ACCEPT_BY_FORMAT: Record<string, string> = {
  xml: '.xml,text/xml,application/xml',
  csv: '.csv,.tsv,text/csv,text/tab-separated-values',
  xlsx: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: '.pdf,application/pdf',
};

function acceptFor(formats: readonly string[]): string {
  const parts = formats
    .map((f) => ACCEPT_BY_FORMAT[f])
    .filter((v): v is string => !!v);
  // Dedupe while preserving order; fall back to CSV if a source declared nothing usable.
  const seen = new Set<string>();
  const tokens = parts
    .join(',')
    .split(',')
    .filter((t) => t && !seen.has(t) && seen.add(t));
  return tokens.length > 0 ? tokens.join(',') : ACCEPT_BY_FORMAT.csv!;
}

/** Event-grain sources (those with a concrete adapter), for the advanced wizard. */
const EVENT_SOURCES = (Object.keys(CONCRETE_EVENT_ADAPTERS) as BaseballSourceKey[]).map((key) => {
  const entry = getSourceRegistryEntry(key);
  return {
    key,
    label: entry?.label ?? key,
    accept: acceptFor(entry?.supportedFormats ?? ['csv']),
  };
});

export default async function ImportCenterPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/baseball/login');

  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/dashboard/command-center');

  const teamId = context.activeTeamId;

  // SERVER-SIDE capability gate (not just nav hiding).
  const canImport = await hasBaseballCapability(teamId, 'can_manage_imports');
  if (!canImport) redirect('/baseball/dashboard/command-center');

  // Team name for the header.
  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('id', teamId)
    .maybeSingle();

  // Roster players for matching. Loads the tier-3 disambiguation signals
  // (player_matching_v2.md): jersey_number (per-team, on the membership) plus
  // grad_year + primary_position (on the player), so the matcher can break
  // same-name ties and the manual-match dropdown can show jersey/class/position.
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select(
      `player_id,
       jersey_number,
       baseball_players!inner ( id, first_name, last_name, grad_year, primary_position )`
    )
    .eq('team_id', teamId);

  const players = (members ?? []).map((m) => {
    const p = m.baseball_players as unknown as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      grad_year: number | null;
      primary_position: string | null;
    };
    const member = m as unknown as { jersey_number: number | null };
    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      jersey_number: member.jersey_number,
      grad_year: p.grad_year,
      primary_position: p.primary_position,
    };
  });

  // Recent runs (capability-checked again inside the action).
  let recentRuns: BaseballImportRunRow[] = [];
  try {
    recentRuns = await getImportRuns({ teamId, limit: 20 });
  } catch {
    recentRuns = [];
  }

  // Registered sources from the team's import-source registry. These MERGE OVER
  // the hardcoded adapter defaults so the wizard offers (and governs by) what the
  // coach actually registered — the fix that makes the registry load-bearing in
  // the picker, not just write-only settings config.
  let registered: BaseballImportSourceConfig[] = [];
  try {
    registered = await listImportSources();
  } catch {
    registered = [];
  }
  const registeredSources = mergeRegisteredSources(registered);

  return (
    <div className={fairwayScope('min-h-full')}>
      <ImportCenterShell
        teamId={teamId}
        teamName={team?.name ?? 'Your Team'}
        players={players}
        recentRuns={recentRuns}
        eventSources={EVENT_SOURCES}
        registeredSources={registeredSources}
      />
    </div>
  );
}

/**
 * Build the box-score source picker options by MERGING the team's registered
 * sources over the hardcoded adapter defaults (BASEBALL_IMPORT_SOURCES):
 *   * a registered row whose source_type matches a hardcoded adapter key
 *     annotates that option with the registry id + policy badges;
 *   * a registered row with a custom source_type adds a NEW option, keyed by its
 *     source_type so the commit path resolves the same registry row;
 *   * adapter defaults with no registry row remain available (unregistered ->
 *     adapter-default policy at commit, surfaced as "Not configured").
 * The picker `value` is always the key the commit path resolves on (source_type).
 */
function mergeRegisteredSources(
  registered: BaseballImportSourceConfig[]
): RegisteredSourceOption[] {
  const byType = new Map<string, BaseballImportSourceConfig>();
  for (const r of registered) {
    if (!isImportSourceEnabled(r)) continue;
    // First enabled registration per source_type wins as the policy annotation.
    if (!byType.has(r.source_type)) byType.set(r.source_type, r);
  }

  const options: RegisteredSourceOption[] = BASEBALL_IMPORT_SOURCES.map((s) => {
    const reg = byType.get(s.id);
    return {
      value: s.id,
      label: reg ? `${reg.source_name}` : s.label,
      registered: Boolean(reg),
      trustLevel: reg?.trust_level ?? null,
      requiredReview: reg?.required_review ?? null,
    };
  });

  // Add registered sources whose source_type is NOT a hardcoded adapter key.
  const adapterKeys = new Set(BASEBALL_IMPORT_SOURCES.map((s) => s.id));
  for (const [type, reg] of byType) {
    if (adapterKeys.has(type)) continue;
    options.push({
      value: type,
      label: reg.source_name,
      registered: true,
      trustLevel: reg.trust_level,
      requiredReview: reg.required_review,
    });
  }

  return options;
}
