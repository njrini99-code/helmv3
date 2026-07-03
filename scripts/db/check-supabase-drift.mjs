#!/usr/bin/env node
/**
 * check-supabase-drift.mjs — read-only Supabase/Baseball/Bridge drift guard.
 *
 * Connects directly to Postgres (never through the app, never through
 * schema_migrations bookkeeping — see docs/audits/SUPABASE_DRIFT_REPORT_2026-07-03.md
 * for why the migration ledger cannot be trusted alone on this project) and
 * asserts a fixed list of production-correctness invariants discovered
 * during the 2026-07 stabilization pass. Every check is a plain SELECT;
 * this script never writes.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/db/check-supabase-drift.mjs
 * or:
 *   SUPABASE_DB_PASSWORD=... SUPABASE_PROJECT_ID=qmnssrrolpinvwjjnufo \
 *     node scripts/db/check-supabase-drift.mjs
 *
 * Exit 0: all checks passed.
 * Exit 1: one or more checks failed — see printed report.
 * Exit 2: could not connect (missing/invalid credentials).
 */
import postgres from 'postgres';
import { config as loadEnv } from 'dotenv';

const POOLER_HOST = 'aws-0-us-east-1.pooler.supabase.com';

loadEnv({ path: '.env.local', quiet: true });

function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (projectId && password) {
    return `postgresql://postgres.${projectId}:${encodeURIComponent(password)}@${POOLER_HOST}:6543/postgres`;
  }
  return null;
}

/** @typedef {{ name: string, run: (sql: import('postgres').Sql) => Promise<{ ok: boolean, detail: string }> }} Check */

function stripLineComments(sqlText) {
  return sqlText
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

// #651 — Baseball schema drift (issue #651). Each of these columns was
// found missing in production despite being expected by application code.
const REQUIRED_651_COLUMNS = [
  ['baseball_teams', 'program_type'],
  ['baseball_practice_effectiveness_reviews', 'disposition'],
  ['baseball_practice_effectiveness_reviews', 'focus_area'],
  ['baseball_stat_sources', 'source_name'],
  ['baseball_fielding_events', 'measured_at'],
  ['baseball_fielding_events', 'chance_difficulty'],
  ['baseball_baserunning_events', 'measured_at'],
  ['baseball_baserunning_events', 'runner_id'],
  ['baseball_catching_events', 'measured_at'],
  ['baseball_catching_events', 'catcher_id'],
  ['baseball_plate_appearances', 'data_context'],
  ['baseball_decision_log', 'detail'],
];

// Historical golf drift (pre-2026-07 sessions) — kept as a framework
// extension point per the drift report's recommendation, not because any
// of these are currently suspected broken.
const GOLF_EXPECTED_COLUMNS = [
  ['golf_rounds', 'status'],
  ['golf_documents', 'is_public'],
];
const GOLF_REMOVED_COLUMNS = [
  ['golf_rounds', 'round_status'],
  ['golf_players', 'team_id'],
  ['golf_documents', 'player_visible'],
];
const GOLF_REMOVED_TABLES = ['golf_event_rsvps'];

// Admin rollup RPCs Helm Bridge depends on (see
// docs/audits/SUPABASE_DRIFT_REPORT_2026-07-03.md and the
// admin_rollup_consistent_super_admin_gate migration).
const ADMIN_ROLLUP_FUNCTIONS = [
  'get_admin_analytics_rollup',
  'get_admin_baseball_rollup',
  'get_admin_coachhelm_rollup',
  'get_admin_dashboard_rollup',
  'get_admin_errors_rollup',
  'get_admin_event_summary',
  'get_admin_feature_adoption_rollup',
  'get_admin_platform_stat_averages',
  'get_admin_rounds_rollup',
  'get_admin_teams_scoring_rollup',
  'get_admin_users_rollup',
];

/** @type {Check[]} */
const CHECKS = [
  {
    name: '#651: required Baseball columns exist',
    async run(sql) {
      const rows = await sql`
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
      `;
      const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
      const missing = REQUIRED_651_COLUMNS
        .map(([t, c]) => `${t}.${c}`)
        .filter((k) => !present.has(k));
      return missing.length === 0
        ? { ok: true, detail: `all ${REQUIRED_651_COLUMNS.length} columns present` }
        : { ok: false, detail: `missing: ${missing.join(', ')}` };
    },
  },
  {
    name: 'golf: expected columns present, historically-dropped columns/tables stay dropped',
    async run(sql) {
      const cols = await sql`
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
      `;
      const present = new Set(cols.map((r) => `${r.table_name}.${r.column_name}`));
      const missingExpected = GOLF_EXPECTED_COLUMNS
        .map(([t, c]) => `${t}.${c}`)
        .filter((k) => !present.has(k));
      const resurrectedColumns = GOLF_REMOVED_COLUMNS
        .map(([t, c]) => `${t}.${c}`)
        .filter((k) => present.has(k));
      const tables = await sql`
        select table_name from information_schema.tables where table_schema = 'public'
      `;
      const tableSet = new Set(tables.map((r) => r.table_name));
      const resurrectedTables = GOLF_REMOVED_TABLES.filter((t) => tableSet.has(t));
      const problems = [
        ...missingExpected.map((k) => `missing expected column ${k}`),
        ...resurrectedColumns.map((k) => `unexpectedly resurrected column ${k}`),
        ...resurrectedTables.map((t) => `unexpectedly resurrected table ${t}`),
      ];
      return problems.length === 0
        ? { ok: true, detail: 'golf schema matches expected post-drift shape' }
        : { ok: false, detail: problems.join('; ') };
    },
  },
  {
    name: '#728: recalculate_baseball_season_stats has no b.so reference',
    async run(sql) {
      const rows = await sql`
        select pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'recalculate_baseball_season_stats'
      `;
      if (rows.length === 0) return { ok: false, detail: 'function does not exist' };
      const hasBso = rows.some((r) => /\bb\.so\b/.test(r.def));
      return hasBso
        ? { ok: false, detail: 'live function body still references b.so' }
        : { ok: true, detail: 'no b.so reference in live body' };
    },
  },
  {
    name: '#772: can_manage_baseball_lift_group does not reference baseball_strength_groups',
    async run(sql) {
      const rows = await sql`
        select pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'can_manage_baseball_lift_group'
      `;
      if (rows.length === 0) return { ok: false, detail: 'function does not exist' };
      // Comments referencing the graveyarded table are fine (they document
      // history); only flag it if it appears in executable SQL, i.e.
      // outside a `-- ` line comment.
      const executableSql = stripLineComments(rows[0].def);
      const stale = executableSql.includes('baseball_strength_groups');
      return stale
        ? { ok: false, detail: 'live function body references baseball_strength_groups outside a comment' }
        : { ok: true, detail: 'no executable reference to baseball_strength_groups' };
    },
  },
  {
    name: '#772: baseball_accept_staff_invite does not reference v_invitation.invitee_email',
    async run(sql) {
      const rows = await sql`
        select pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'baseball_accept_staff_invite'
      `;
      if (rows.length === 0) return { ok: false, detail: 'function does not exist' };
      const stale = rows[0].def.includes('v_invitation.invitee_email');
      return stale
        ? { ok: false, detail: 'live function body still references v_invitation.invitee_email' }
        : { ok: true, detail: 'no stale invitee_email reference' };
    },
  },
  {
    name: 'baseball_staff_invitations has a canonical email column',
    async run(sql) {
      const rows = await sql`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'baseball_staff_invitations'
          and column_name in ('email', 'invitee_email')
      `;
      const cols = new Set(rows.map((r) => r.column_name));
      if (cols.has('email')) return { ok: true, detail: 'email column present' };
      if (cols.has('invitee_email')) {
        return { ok: false, detail: 'table only has invitee_email, not email — check function/column alignment' };
      }
      return { ok: false, detail: 'neither email nor invitee_email column found' };
    },
  },
  {
    name: '#732: no live function references a phantom public.rate_limits table',
    async run(sql) {
      const tables = await sql`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_name = 'rate_limits'
      `;
      if (tables.length > 0) {
        return { ok: false, detail: 'public.rate_limits now exists — re-check #732 assumptions' };
      }
      const rows = await sql`
        select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and pg_get_functiondef(p.oid) ilike '%public.rate_limits%'
      `;
      return rows.length === 0
        ? { ok: true, detail: 'no function references public.rate_limits; public.rate_limits does not exist' }
        : { ok: false, detail: `functions referencing public.rate_limits: ${rows.map((r) => r.proname).join(', ')}` };
    },
  },
  {
    name: 'admin rollup RPCs used by Helm Bridge exist',
    async run(sql) {
      const rows = await sql`
        select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and proname = any(${ADMIN_ROLLUP_FUNCTIONS})
      `;
      const present = new Set(rows.map((r) => r.proname));
      const missing = ADMIN_ROLLUP_FUNCTIONS.filter((f) => !present.has(f));
      return missing.length === 0
        ? { ok: true, detail: `all ${ADMIN_ROLLUP_FUNCTIONS.length} admin rollup RPCs exist` }
        : { ok: false, detail: `missing RPCs: ${missing.join(', ')}` };
    },
  },
  {
    name: 'admin rollup RPCs use a consistent super-admin gate (is_super_admin), not just users.role',
    async run(sql) {
      const rows = await sql`
        select proname, pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (proname = any(${ADMIN_ROLLUP_FUNCTIONS}) or proname = '__admin_rollup_b_gate')
      `;
      const inconsistent = rows
        .filter((r) => !stripLineComments(r.def).includes('is_super_admin'))
        .map((r) => r.proname);
      return inconsistent.length === 0
        ? { ok: true, detail: 'every rollup gate (directly or via __admin_rollup_b_gate) checks is_super_admin()' }
        : {
            ok: false,
            detail: `RPCs still gated ONLY on users.role, not is_super_admin() — a role demotion (e.g. #736's baseball-onboarding incident) will 42501 them even though requireSuperAdmin() passes: ${inconsistent.join(', ')}`,
          };
    },
  },
  {
    name: 'guard_users_role_self_change blocks self-demotion away from admin for allowlisted super admins',
    async run(sql) {
      const rows = await sql`
        select pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'guard_users_role_self_change'
      `;
      if (rows.length === 0) return { ok: false, detail: 'trigger function does not exist' };
      const def = rows[0].def;
      const blocksDemotion = /OLD\.role\s*=\s*'admin'::user_role\s+AND\s+public\.is_super_admin\(\)/.test(def);
      return blocksDemotion
        ? { ok: true, detail: 'trigger blocks admin -> coach/player self-demotion for allowlisted super admins' }
        : {
            ok: false,
            detail: 'trigger only blocks self-escalation, not self-demotion from admin — the #736 incident (baseball onboarding clobbered admin -> coach) is reproducible again',
          };
    },
  },
  {
    name: 'admin_allowlist and users.role=admin stay in sync (no silent divergence)',
    async run(sql) {
      const rows = await sql`
        select
          (select count(*) from public.admin_allowlist) as allowlist_count,
          (select count(*) from public.users where role = 'admin') as role_admin_count,
          (
            select count(*) from public.admin_allowlist a
            left join public.users u on u.id = a.user_id and u.role = 'admin'
            where u.id is null
          ) as allowlisted_but_not_role_admin
      `;
      const row = rows[0];
      if (Number(row.allowlisted_but_not_role_admin) > 0) {
        return {
          ok: false,
          detail: `${row.allowlisted_but_not_role_admin} admin_allowlist user(s) no longer have users.role='admin' — likely demoted; admin RPCs still work via is_super_admin() but investigate the divergence`,
        };
      }
      return {
        ok: true,
        detail: `admin_allowlist=${row.allowlist_count}, users.role='admin'=${row.role_admin_count}, no divergence`,
      };
    },
  },
];

async function main() {
  const connectionString = buildConnectionString();
  if (!connectionString) {
    console.error(
      'Missing DATABASE_URL (or SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD). This script only performs read-only SELECTs.'
    );
    process.exit(2);
  }

  const sql = postgres(connectionString, { ssl: 'require', max: 1, prepare: false });
  let failures = 0;

  console.log('Supabase drift guard — read-only checks\n' + '='.repeat(60));
  try {
    for (const check of CHECKS) {
      try {
        const { ok, detail } = await check.run(sql);
        console.log(`${ok ? '✅' : '❌'} ${check.name}\n   ${detail}`);
        if (!ok) failures += 1;
      } catch (err) {
        console.log(`❌ ${check.name}\n   ERROR: ${err instanceof Error ? err.message : String(err)}`);
        failures += 1;
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log('='.repeat(60));
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main();
