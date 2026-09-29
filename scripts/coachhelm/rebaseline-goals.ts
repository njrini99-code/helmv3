/**
 * Recompute baselines, progress and snapshots for existing golf_goals (audit
 * row 20, 2026-09-28). NOT RUN — the owner decides when.
 *
 * Dry run by default: prints what would change and writes nothing.
 *   npx tsx scripts/coachhelm/rebaseline-goals.ts            # dry run, all goals
 *   npx tsx scripts/coachhelm/rebaseline-goals.ts --active   # active/paused only
 *   npx tsx scripts/coachhelm/rebaseline-goals.ts --apply    # write
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * Per goal:
 *   - Non-windowed metric (per-par scoring, putts by band, approach proximity,
 *     rough scrambling): progress was the all-time standing, so the stored
 *     series is meaningless. Reported as `not_windowed`; with --apply an
 *     ACTIVE/PAUSED one is set to `abandoned` (terminal ones are left as
 *     recorded history; there is no coach-side reason column to stamp).
 *   - Windowed metric: baseline = windowed aggregate over the player's
 *     countable rounds in the 90 days before started_at (the same rule
 *     createGoal now uses); snapshots are rebuilt as the running in-window
 *     aggregate after each round date; current_value = the last one.
 *   - Target on the wrong side of the recomputed baseline: reported as
 *     `target_wrong_side`. Not auto-fixed (the target is a coach/player
 *     choice); an ACHIEVED goal in this state was achieved by construction.
 *
 * State is never flipped to achieved/missed here; the nightly evaluator does
 * that from the corrected current_value.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMetricId } from '../../src/lib/coachhelm/v3/metrics/registry';
import { isWindowedMetric } from '../../src/lib/coachhelm/v3/goals/window-metric-ids';
import {
  aggregateWindowMetric,
  loadPlayerWindowRounds,
  type WindowRound,
} from '../../src/lib/coachhelm/v3/goals/window-metric';
import {
  PRE_START_BASELINE_DAYS,
  checkGoalTarget,
  preStartBaseline,
} from '../../src/lib/coachhelm/v3/goals/goal-rules';
import { getMetricRenderConfig } from '../../src/lib/coachhelm/v3/standing/metric-config';

interface GoalRow {
  id: string;
  player_id: string;
  metric_id: string;
  state: string;
  started_at: string;
  ends_at: string;
  baseline_value: number | null;
  current_value: number | null;
  target_value: number | null;
  snapshots: unknown;
}

/** Running in-window aggregate after each round date, one snapshot per date. */
function rebuildSnapshots(
  metricId: Parameters<typeof aggregateWindowMetric>[0],
  inWindow: WindowRound[],
): Array<{ date: string; value: number }> {
  const dates = [...new Set(inWindow.map((r) => r.round_date))].sort();
  const out: Array<{ date: string; value: number }> = [];
  for (const d of dates) {
    const v = aggregateWindowMetric(metricId, inWindow.filter((r) => r.round_date <= d));
    if (v != null) out.push({ date: d, value: Math.round(v * 10_000) / 10_000 });
  }
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const activeOnly = process.argv.includes('--active');
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing SUPABASE env vars');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let q = supabase
    .from('golf_goals')
    .select('id, player_id, metric_id, state, started_at, ends_at, baseline_value, current_value, target_value, snapshots')
    .order('created_at', { ascending: true });
  if (activeOnly) q = q.in('state', ['active', 'paused']);
  const { data, error } = await q;
  if (error) throw error;
  const goals = (data ?? []) as GoalRow[];

  const tally: Record<string, number> = {};
  const bump = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);

  for (const g of goals) {
    if (!isMetricId(g.metric_id) || !isWindowedMetric(g.metric_id)) {
      bump('not_windowed');
      const live = g.state === 'active' || g.state === 'paused';
      console.log(`${g.id} ${g.metric_id} [${g.state}] not_windowed${live ? ' -> abandon' : ''}`);
      if (apply && live) {
        const { error: e } = await supabase
          .from('golf_goals')
          .update({ state: 'abandoned', updated_at: new Date().toISOString() })
          .eq('id', g.id);
        if (e) console.warn(`  update failed: ${e.message}`);
      }
      continue;
    }

    const since = new Date(Date.parse(g.started_at) - PRE_START_BASELINE_DAYS * 86_400_000).toISOString();
    // Upper bound: the goal end (or today) — rounds after the window say nothing.
    const until = g.ends_at < new Date().toISOString() ? g.ends_at : undefined;
    const rounds = await loadPlayerWindowRounds(supabase, g.player_id, since, until);
    const baseline = preStartBaseline(g.metric_id, rounds, g.started_at);
    const startDay = g.started_at.slice(0, 10);
    const inWindow = rounds.filter((r) => r.round_date >= startDay);
    const snapshots = rebuildSnapshots(g.metric_id, inWindow);
    const current = snapshots.length > 0 ? snapshots[snapshots.length - 1]!.value : null;

    const direction = getMetricRenderConfig(g.metric_id)?.direction ?? 'higher_better';
    const wrongSide = checkGoalTarget({ baseline, target: g.target_value, direction }) !== null;
    if (wrongSide) bump('target_wrong_side');
    bump('windowed');

    console.log(
      `${g.id} ${g.metric_id} [${g.state}] baseline ${g.baseline_value} -> ${baseline}, ` +
        `current ${g.current_value} -> ${current}, snapshots ${Array.isArray(g.snapshots) ? g.snapshots.length : 0} -> ${snapshots.length}` +
        (wrongSide ? `, TARGET ${g.target_value} WRONG SIDE` : ''),
    );

    if (apply) {
      const { error: e } = await supabase
        .from('golf_goals')
        .update({
          baseline_value: baseline,
          current_value: current ?? baseline,
          snapshots,
          updated_at: new Date().toISOString(),
        })
        .eq('id', g.id);
      if (e) console.warn(`  update failed: ${e.message}`);
    }
  }

  console.log(`${apply ? 'APPLIED' : 'DRY RUN'}: ${goals.length} goals`, tally);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
