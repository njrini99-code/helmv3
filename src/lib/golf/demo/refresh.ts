/**
 * One refresh of the demo team: generate it for today, check it, and (only
 * with `apply`) write the difference and check what the database now shows.
 * Used by the daily cron (`/api/cron/golf-demo-refresh`) and by
 * `scripts/seed/golf-demo-refresh.ts`. The demo team only: anything else is
 * refused before a query is sent.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { DEMO_TEAM_ID } from '@/lib/demo/config';
import type { Database } from '@/lib/types/database';
import { checkDemoCoverage, formatCoverage, type CoverageReport } from './coverage';
import { generateDemoTeam, type DemoDataset } from './generate';
import { readDemoSnapshot } from './snapshot';
import { DEFAULT_SEED } from './story';
import { summarizeDataset } from './summary';
import {
  applyDemoWrite,
  assertDemoTeam,
  describePlan,
  planDemoWrite,
  supabaseDemoPort,
  type DemoRpcClient,
  type DemoWritePlan,
  type DemoWriteResult,
} from './writer';

type Client = SupabaseClient<Database>;

export interface DemoContext {
  teamId: string;
  timeZone: string;
  /** The coach's login: messages, plans and tournaments name it. */
  coachUserId: string;
  /** The coach's record (golf_coaches.id): events, qualifiers, tasks and announcements name it. */
  coachId: string;
  /** The team channel the generated messages go to; none means no messages. */
  teamChannelId: string | null;
}

/** Today's date (YYYY-MM-DD) in a zone. */
export function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * The team's zone, its coach and its team channel. The coach is the shared
 * demo login when `demoCoachEmail` names a coach on the team (what a
 * prospect signs in as), else the team's primary coach.
 */
export async function loadDemoContext(client: Client, teamId: string, demoCoachEmail?: string | null): Promise<DemoContext> {
  assertDemoTeam(teamId);
  const settings = await client.from('golf_team_settings').select('timezone').eq('team_id', teamId).maybeSingle();
  if (settings.error) throw new Error(`Reading the demo team's settings: ${settings.error.message}`);
  const timeZone = getValidTimezone(settings.data?.timezone ?? null);

  const staff = await client.from('golf_team_coach_staff').select('coach_id, is_primary').eq('team_id', teamId);
  if (staff.error) throw new Error(`Reading the demo team's coaches: ${staff.error.message}`);
  const coachIds = (staff.data ?? []).map((s) => s.coach_id);
  if (!coachIds.length) throw new Error('The demo team has no coach to write as.');
  const coaches = await client.from('golf_coaches').select('id, user_id, email').in('id', coachIds);
  if (coaches.error) throw new Error(`Reading the demo team's coaches: ${coaches.error.message}`);
  const email = demoCoachEmail?.trim().toLowerCase() || null;
  const primaryId = (staff.data ?? []).find((s) => s.is_primary)?.coach_id;
  const pick =
    (email && (coaches.data ?? []).find((c) => c.email?.toLowerCase() === email)) ||
    (coaches.data ?? []).find((c) => c.id === primaryId) ||
    [...(coaches.data ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (!pick?.user_id) throw new Error('The demo team has no coach with a login to write as.');

  const channel = await client
    .from('golf_conversations')
    .select('id')
    .eq('team_id', teamId)
    .eq('is_team_channel', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (channel.error) throw new Error(`Reading the demo team's channel: ${channel.error.message}`);

  return { teamId, timeZone, coachUserId: pick.user_id, coachId: pick.id, teamChannelId: channel.data?.id ?? null };
}

export interface DemoRefreshOptions {
  /** Defaults to now. */
  now?: Date;
  /** Write. Without it nothing is written: the ledger is read, not pruned. */
  apply?: boolean;
  /** Re-send every row, not just new and changed ones. */
  full?: boolean;
  seed?: string;
  demoCoachEmail?: string | null;
  log?: (line: string) => void;
}

export interface DemoRefreshReport {
  today: string;
  applied: boolean;
  dataset: DemoDataset;
  /** The generated team's own check. A failing check stops the write. */
  generated: CoverageReport;
  plan: DemoWritePlan;
  result: DemoWriteResult | null;
  /** What the database shows after the write (apply only). */
  written: CoverageReport | null;
  /** The whole account, for logs and the PR. */
  text: string;
}

export async function refreshDemoTeam(client: Client, opts: DemoRefreshOptions = {}): Promise<DemoRefreshReport> {
  const log = opts.log ?? (() => {});
  const teamId = DEMO_TEAM_ID;
  const ctx = await loadDemoContext(client, teamId, opts.demoCoachEmail);
  const today = localDate(opts.now ?? new Date(), ctx.timeZone);
  const dataset = generateDemoTeam({
    teamId,
    today,
    timeZone: ctx.timeZone,
    coachUserId: ctx.coachUserId,
    coachId: ctx.coachId,
    teamChannelId: ctx.teamChannelId ?? undefined,
    seed: opts.seed ?? DEFAULT_SEED,
  });
  const generated = checkDemoCoverage({ today, tables: dataset.tables });
  if (!generated.ok) {
    throw new Error(`The generated team fails its own check, so nothing was written:\n${formatCoverage(generated)}`);
  }

  const port = supabaseDemoPort(client as unknown as DemoRpcClient);
  const apply = opts.apply === true;
  const { pruned, ledger } = await port.begin(teamId, { prune: apply });
  if (pruned) log(`dropped ${pruned} ledger rows whose table row is gone`);
  const plan = planDemoWrite(dataset, ledger, { full: opts.full });

  let result: DemoWriteResult | null = null;
  let written: CoverageReport | null = null;
  if (apply) {
    result = await applyDemoWrite(port, plan, log);
    written = checkDemoCoverage(await readDemoSnapshot(client, teamId, today));
  }

  const skipped = result ? result.tables.flatMap((t) => t.skipped.map((k) => `${t.table} ${k}`)) : [];
  const text = [
    summarizeDataset(dataset),
    '',
    apply ? 'Written:' : 'Would write (dry run, nothing sent):',
    describePlan(plan),
    ...(skipped.length ? ['', `Skipped ${skipped.length} rows that exist but were not written by the generator:`, ...skipped.slice(0, 20)] : []),
    '',
    'Generated team check:',
    formatCoverage(generated),
    ...(written ? ['', 'What the database shows now:', formatCoverage(written)] : []),
  ].join('\n');
  return { today, applied: apply, dataset, generated, plan, result, written, text };
}
