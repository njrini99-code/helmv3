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
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';

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

// 2026-08-25 reconciliation: these are literal fields selected by shipped
// Baseball actions/read models. Checking only the old #651 subset gave a false
// green while PostgREST rejected the acknowledgement, CoachHelm telemetry, and
// workload reads in production. Keep this list limited to active query shapes,
// not every optional field from the newer local event model.
const REQUIRED_ACTIVE_BASEBALL_QUERY_COLUMNS = [
  ['baseball_timeline_event_acks', 'team_id'],
  ['baseball_timeline_event_acks', 'player_id'],
  ['baseball_timeline_event_acks', 'acked_by'],
  ['baseball_timeline_event_acks', 'acked_at'],
  ['baseball_timeline_event_acks', 'user_id'],
  ['baseball_timeline_event_acks', 'acknowledged_at'],
  ['baseball_pitch_events', 'batter_id'],
  ['baseball_pitch_events', 'player_id'],
  ['baseball_pitch_events', 'pitch_type_classified'],
  ['baseball_pitch_events', 'is_called_strike'],
  ['baseball_pitch_events', 'count_state'],
  ['baseball_workload_events', 'count'],
  ['baseball_workload_events', 'high_intent_count'],
  ['baseball_camp_registrations', 'registered_at'],
  ['baseball_camp_registrations', 'attended_at'],
  ['crm_coaches', 'role_level'],
  ['crm_coaches', 'is_primary_contact'],
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
    name: 'active Baseball acknowledgement, CoachHelm, and workload query columns exist',
    async run(sql) {
      const rows = await sql`
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
      `;
      const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
      const missing = REQUIRED_ACTIVE_BASEBALL_QUERY_COLUMNS
        .map(([t, c]) => `${t}.${c}`)
        .filter((k) => !present.has(k));
      return missing.length === 0
        ? { ok: true, detail: `all ${REQUIRED_ACTIVE_BASEBALL_QUERY_COLUMNS.length} active-query columns present` }
        : {
            ok: false,
            detail: `missing active-query columns: ${missing.join(', ')}. These fields are selected by timeline acknowledgements, CoachHelm telemetry, or the workload view.`,
          };
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
    name: '#728/#887: recalculate_baseball_season_stats matches the canonical alias contract',
    async run(sql) {
      const rows = await sql`
        select pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'recalculate_baseball_season_stats'
      `;
      if (rows.length === 0) return { ok: false, detail: 'function does not exist' };
      const executable = stripLineComments(rows[0].def);
      const requiredFragments = [
        'FROM baseball_box_score_batting bsb',
        'COALESCE(SUM(bsb.h), 0)',
        'FROM baseball_box_score_pitching bsp',
        'COALESCE(SUM(bsp.h), 0)',
      ];
      const missing = requiredFragments.filter((fragment) => !executable.includes(fragment));
      const staleAliasReferences = [...executable.matchAll(/\bb\.(?:so|hits)\b/g)].map(
        (match) => match[0],
      );
      const problems = [
        ...missing.map((fragment) => `missing canonical fragment: ${fragment}`),
        ...staleAliasReferences.map((reference) => `stale alias reference: ${reference}`),
      ];
      return problems.length === 0
        ? {
            ok: true,
            detail: 'canonical bsb/bsp aliases and hit aggregations are present; no stale b.so/b.hits references',
          }
        : { ok: false, detail: problems.join('; ') };
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
        where n.nspname = 'public'
          and p.prokind = 'f'
          and pg_get_functiondef(p.oid) ilike '%public.rate_limits%'
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
        .filter((r) => {
          const executable = stripLineComments(r.def);
          return !executable.includes('is_super_admin') && !executable.includes('__admin_rollup_b_gate');
        })
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
    name: 'every users.role=admin account is in admin_allowlist (is_super_admin is the gate)',
    async run(sql) {
      // Two gates, one source of truth: `admin_allowlist` (via is_super_admin())
      // is what authorizes admin RPCs; `users.role` only drives routing and
      // per-app UI. The dangerous divergence is an account that LOOKS like an
      // admin (role = 'admin') but is absent from the allowlist — that is the
      // 2026-07-29 shape, where every Bridge Resolve raised Forbidden. The
      // reverse — an allowlisted account whose role is coach/player — is a
      // deliberate dual-role account (the founder's test-coach login) and is
      // reported, not failed.
      const rows = await sql`
        select
          (select count(*) from public.admin_allowlist) as allowlist_count,
          (select count(*) from public.users where role = 'admin') as role_admin_count,
          (
            select count(*) from public.users u
            where u.role = 'admin'
              and not exists (select 1 from public.admin_allowlist a where a.user_id = u.id)
          ) as role_admin_not_allowlisted,
          (
            select count(*) from public.admin_allowlist a
            join public.users u on u.id = a.user_id
            where u.role <> 'admin'
          ) as allowlisted_non_admin
      `;
      const row = rows[0];
      if (Number(row.role_admin_not_allowlisted) > 0) {
        return {
          ok: false,
          detail: `${row.role_admin_not_allowlisted} users.role='admin' account(s) are not in admin_allowlist — is_super_admin() is false for them, so admin RPCs and Bridge Resolve return Forbidden; add the allowlist row or clear the role`,
        };
      }
      return {
        ok: true,
        detail: `admin_allowlist=${row.allowlist_count}, users.role='admin'=${row.role_admin_count}, allowlisted non-admin (deliberate dual-role) accounts=${row.allowlisted_non_admin}`,
      };
    },
  },
];

/**
 * Serialize an interpolated value as a SQL literal for the Management API
 * transport.
 *
 * The `postgres` driver sends `${…}` as a bind parameter; the Management API
 * takes one SQL string, so interpolations must become literals. That is only
 * safe because of what this script actually interpolates: two call sites, both
 * passing `ADMIN_ROLLUP_FUNCTIONS`, a module constant of hardcoded function
 * names. Nothing here is caller-supplied.
 *
 * It is still validated rather than trusted — a future edit that interpolates
 * something dynamic should fail loudly here instead of silently building a
 * concatenated query.
 */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function toSqlLiteral(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== 'string' || !SAFE_IDENTIFIER.test(item)) {
        throw new Error(
          `drift guard: refusing to inline a non-identifier array value (${String(item)}). ` +
            'The Management API transport only supports interpolating hardcoded identifiers.'
        );
      }
    }
    return `array[${value.map((v) => `'${v}'`).join(', ')}]`;
  }
  throw new Error(
    `drift guard: unsupported interpolation type ${typeof value} for the Management API transport.`
  );
}

/** Only read-only statements may cross this transport. */
const READ_ONLY_START = /^\s*(select|with)\b/i;

/**
 * A `postgres`-shaped tagged-template handle backed by the Supabase Management
 * API, so this guard can run wherever a Management access token exists even
 * though no database password does.
 *
 * WHY THIS TRANSPORT EXISTS. Reaching production Postgres directly needs
 * DATABASE_URL or SUPABASE_DB_PASSWORD. Neither is a repo secret (checked
 * 2026-08-27: Actions holds ACCESS_TOKEN, SERVICE_ROLE_KEY, PROJECT_ID and
 * ANON_KEY). SUPABASE_ACCESS_TOKEN authenticates the Management API, which can
 * run SQL — so the credential to gate production drift in CI already exists; it
 * simply was not a transport this script knew how to speak.
 *
 * The direct connection stays PREFERRED when available: it is a real Postgres
 * session, and this path should never be the reason a genuine connection issue
 * goes unnoticed.
 *
 * Every statement is asserted read-only before it is sent. This script only
 * ever SELECTs, and the Management API executes with elevated privileges — so
 * the assertion is what keeps a future edit from turning a drift guard into a
 * production write path.
 */
function createManagementApiSql(projectId, accessToken) {
  const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectId)}/database/query`;

  const sql = async (strings, ...values) => {
    const query = strings.reduce(
      (acc, part, i) => acc + part + (i < values.length ? toSqlLiteral(values[i]) : ''),
      ''
    );
    if (!READ_ONLY_START.test(query)) {
      throw new Error('drift guard: refusing to send a non-SELECT statement over the Management API.');
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      // Never the body verbatim — an auth failure echoes the request back.
      throw new Error(`Management API returned ${response.status} ${response.statusText}`);
    }
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  };

  // The direct driver exposes .end(); keep the shape so main() needs no branch.
  sql.end = async () => {};
  return sql;
}

async function main() {
  const connectionString = buildConnectionString();
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectId = process.env.SUPABASE_PROJECT_ID;
  const useManagementApi = !connectionString && Boolean(accessToken && projectId);

  if (!connectionString && !useManagementApi) {
    console.error(
      'Missing DATABASE_URL (or SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD), and no ' +
        'SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_ID to fall back on. ' +
        'This script only performs read-only SELECTs.'
    );
    process.exit(2);
  }

  // Supabase production poolers require TLS. The local Docker/Postgres port
  // intentionally does not, and forcing TLS there makes every read-only
  // invariant look like a database failure before the first query executes.
  const isLocalConnection = connectionString
    ? /(?:localhost|127\.0\.0\.1|\[::1\])/.test(connectionString)
    : false;
  const sql = useManagementApi
    ? createManagementApiSql(projectId, accessToken)
    : postgres(connectionString, {
        ssl: isLocalConnection ? false : 'require',
        max: 1,
        prepare: false,
      });
  let failures = 0;

  // Say which database was actually reached. "All checks passed" against the
  // wrong target is the failure mode this line exists to prevent — a local
  // rebuild proves the migrations are sound, not that production is.
  const target = useManagementApi
    ? `production via Management API (project ${projectId})`
    : isLocalConnection
      ? 'local stack (migrations rebuild)'
      : 'remote database via direct connection';
  console.log(`Supabase drift guard — read-only checks\ntarget: ${target}\n` + '='.repeat(60));
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

// Run only when invoked directly. Without this guard, importing the module to
// test its helpers would execute every check (and call process.exit) as a side
// effect of the import — which is why the Management API transport and its
// read-only assertion had no test until now.
const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (invokedDirectly) {
  main();
}

// Exported for scripts/__tests__/check-supabase-drift-transport.test.mjs. The
// read-only assertion below is the only thing standing between a drift GUARD
// and a production WRITE path, so it is tested rather than assumed.
export { toSqlLiteral, createManagementApiSql, buildConnectionString };
