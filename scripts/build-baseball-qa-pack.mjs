#!/usr/bin/env node
/**
 * Build labeled BaseballHelm QA artifact pack from /tmp audit output.
 * Usage: node scripts/build-baseball-qa-pack.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { globSync } from 'glob';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = process.env.QA_SRC || '/tmp/baseball-qa-full';
const OUT = join(ROOT, 'docs/qa/baseball-fairway-visual-audit-2026-07-04');

const ROUTE_DB_HINTS = {
  'command-center': ['baseball_teams', 'baseball_team_members', 'baseball_players', 'baseball_events', 'baseball_coach_insights', 'baseball_daily_contracts'],
  signals: ['baseball_operational_signals', 'baseball_coach_insights'],
  roster: ['baseball_players', 'baseball_team_members', 'baseball_player_aggregates', 'baseball_player_season_stats'],
  calendar: ['baseball_events', 'baseball_event_attendance'],
  announcements: ['baseball_announcements', 'baseball_announcement_acknowledgements'],
  documents: ['baseball_documents'],
  travel: ['baseball_travel_itineraries', 'baseball_travel_expenses'],
  'stats-center': ['baseball_player_season_stats', 'baseball_box_score_batting', 'baseball_box_score_pitching', 'baseball_games', 'baseball_player_aggregates'],
  'stats/games': ['baseball_games', 'baseball_box_score_batting', 'baseball_box_score_pitching'],
  'stats/season': ['baseball_player_season_stats', 'baseball_team_season_stats'],
  'stats/upload': ['baseball_stat_imports', 'baseball_stat_facts'],
  import: ['baseball_stat_imports', 'baseball_stat_import_rows', 'baseball_player_season_stats', 'baseball_box_score_batting'],
  practice: ['baseball_practices', 'baseball_practice_segments', 'baseball_practice_attendance'],
  'practice-effectiveness': ['baseball_practice_effectiveness_reviews', 'baseball_games'],
  postgame: ['baseball_postgame_reviews', 'baseball_games', 'baseball_box_score_batting'],
  performance: ['baseball_lift_programs', 'baseball_lift_assignments', 'baseball_lift_results', 'baseball_readiness_checkins'],
  'performance/live': ['baseball_lift_assignments', 'baseball_lift_results'],
  'performance/programs': ['baseball_lift_programs'],
  'performance/groups': ['baseball_lift_groups'],
  'performance/builder': ['baseball_lift_exercises', 'baseball_lift_programs'],
  'dev-plans': ['baseball_developmental_plans', 'baseball_dev_plan_goals'],
  'dev-plan': ['baseball_developmental_plans', 'baseball_dev_plan_goals'],
  videos: ['baseball_videos', 'baseball_video_annotations'],
  pipeline: ['baseball_recruits', 'baseball_pipeline_entries'],
  discover: ['baseball_players', 'baseball_recruiting_profiles'],
  watchlist: ['baseball_watchlist_entries'],
  compare: ['baseball_players', 'baseball_player_aggregates'],
  comparisons: ['baseball_player_comparisons'],
  'scout-packets': ['baseball_scout_packets'],
  camps: ['baseball_camps', 'baseball_camp_registrations'],
  'decision-room': ['baseball_decision_room_items', 'baseball_coach_insights', 'baseball_tasks'],
  program: ['baseball_teams', 'baseball_organizations', 'baseball_program_settings'],
  organization: ['baseball_organizations', 'baseball_teams'],
  teams: ['baseball_teams', 'baseball_team_members'],
  events: ['baseball_events'],
  settings: ['users', 'baseball_coaches'],
  'settings/program': ['baseball_program_settings', 'baseball_teams'],
  'settings/staff': ['baseball_team_coach_staff', 'baseball_coaches'],
  'settings/imports': ['baseball_import_sources'],
  'settings/integrations': ['baseball_program_settings'],
  'settings/audit': ['baseball_settings_audit_log'],
  'settings/privacy': ['baseball_player_settings'],
  academics: ['baseball_player_academics', 'baseball_players'],
  messages: ['baseball_messages', 'baseball_message_threads'],
  tasks: ['baseball_tasks'],
  'my-stats': ['baseball_player_season_stats', 'baseball_player_aggregates', 'baseball_games'],
  profile: ['baseball_players', 'users'],
  journey: ['baseball_recruiting_journey_schools'],
  'college-interest': ['baseball_recruiting_engagement_events'],
  colleges: ['baseball_colleges', 'baseball_recruiting_journey_schools'],
  analytics: ['baseball_recruiting_engagement_events'],
  activate: ['baseball_players'],
  lift: ['baseball_lift_assignments', 'baseball_lift_results'],
  readiness: ['baseball_readiness_checkins'],
  'player/today': ['baseball_events', 'baseball_tasks', 'baseball_lift_assignments', 'baseball_daily_contracts', 'baseball_announcements'],
  'player/practice': ['baseball_practices', 'baseball_practice_segments'],
  'player/passport': ['baseball_players', 'baseball_player_season_stats', 'baseball_player_passport_settings'],
  'player/timeline': ['baseball_player_timeline_events'],
};

const ROUTE_ACTIONS = {
  'command-center': 'read-models/command-center.ts, read-models/coach-daily-contracts.ts',
  roster: 'actions/roster.ts, read-models/roster.ts',
  'stats-center': 'read-models/stats-center.ts, read-models/stat-visuals.ts',
  import: 'actions/imports.ts, actions/stat-event-imports.ts',
  pipeline: 'actions/pipeline.ts',
  'decision-room': 'actions/decision-room.ts, read-models/decision-room/*',
  'dev-plan': 'actions/dev-plans.ts',
  'dev-plans': 'actions/dev-plans.ts',
  messages: 'actions/messages.ts',
  camps: 'actions/camps.ts',
  practice: 'actions/practice.ts',
  performance: 'actions/lifting-v11.ts, read-models/performance-command.ts',
};

const COACH_REDIRECT_NOTES = {
  '/baseball/dashboard/activate': 'Player-only recruiting activation. Coach → command-center (`activate/page.tsx`).',
  '/baseball/dashboard/analytics': 'Player recruiting analytics. Coach → command-center (`analytics/page.tsx`).',
  '/baseball/dashboard/profile': 'Player profile editor. Coach client redirect → command-center (`profile/page.tsx`).',
  '/baseball/dashboard/events': 'Showcase org only. College coach → command-center (`requireShowcaseOrgRoute`).',
  '/baseball/dashboard/organization': 'Showcase org only (`requireShowcaseOrgRoute`).',
  '/baseball/dashboard/teams': 'Showcase org only (`requireShowcaseOrgRoute`).',
  '/baseball/dashboard/team': 'Legacy alias → command-center (`middleware.ts` LEGACY_TEAM_ROUTES).',
  '/baseball/dashboard/lift': 'Player route → performance hub redirect.',
  '/baseball/dashboard/readiness': 'Player route → performance hub redirect.',
  '/baseball/dashboard/my-stats': 'Player stats → stats-center redirect.',
  '/baseball/dashboard/stats': 'Legacy → stats-center redirect.',
  '/baseball/dashboard/dev-plan': 'Player-only → coach-onboarding if no player record.',
  '/baseball/dashboard/settings/privacy': 'Player-only privacy form.',
  '/baseball/dashboard/settings/notifications': 'Alias → settings/program#notifications.',
  '/baseball/dashboard/settings/ai': 'Alias → settings/program#ai.',
  '/baseball/dashboard/settings/appearance': 'Alias → settings/program#appearance.',
  '/baseball/dashboard/page.tsx': 'INVALID AUDIT PATH — use /baseball/dashboard (redirects to command-center).',
};

const PLAYER_REDIRECT_NOTES = {
  '/baseball/dashboard/college-interest': 'Middleware RECRUITING_ROUTES requires coach record → player/today. Nav tab still visible for college players — should gate or hide.',
  '/baseball/dashboard/dev-plan': 'Hard navigation can bounce to today (navContext race in dashboard layout). In-app sidebar link works.',
  '/baseball/dashboard/settings/notifications': 'Coach-only settings alias → program#notifications; player lands on today.',
};

function slugRoute(route) {
  return route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 100);
}

function routeKey(route) {
  return route.replace(/^\/baseball\/(dashboard|player)\//, '').replace(/^\/baseball\/player\//, 'player/');
}

function extractTablesFromFile(relPath) {
  if (!relPath || !existsSync(join(ROOT, relPath))) return [];
  const text = readFileSync(join(ROOT, relPath), 'utf8');
  const tables = [...text.matchAll(/baseball_[a-z0-9_]+/g)].map((m) => m[0]);
  return [...new Set(tables)].sort();
}

function inferDb(route) {
  const key = routeKey(route);
  if (ROUTE_DB_HINTS[key]) return ROUTE_DB_HINTS[key];
  for (const [k, v] of Object.entries(ROUTE_DB_HINTS)) {
    if (key.startsWith(k)) return v;
  }
  return [];
}

function inferActions(route) {
  const key = routeKey(route);
  return ROUTE_ACTIONS[key] || null;
}

function parseNavRegistry() {
  const text = readFileSync(join(ROOT, 'src/lib/baseball/nav-registry.ts'), 'utf8');
  const entries = [];
  const blocks = text.split(/\n  \{/).slice(1);
  for (const block of blocks) {
    const id = block.match(/id: '([^']+)'/)?.[1];
    const href = block.match(/href: '([^']+)'/)?.[1];
    const hub = block.match(/hub: '([^']+)'/)?.[1];
    const cap = block.match(/requiredCapability: '([^']+)'/)?.[1];
    if (href?.startsWith('/baseball/dashboard')) {
      entries.push({ id, href, hub, requiredCapability: cap || null });
    }
  }
  return entries;
}

function screenshotPath(role, route, viewport) {
  const slug = slugRoute(route);
  const dir = viewport === 'mobile' ? 'mobile' : '';
  const base = join(SRC, role, 'screenshots', dir);
  const candidates = [
    join(base, `${slug}.png`),
    join(base, `${slug}-mobile.png`),
    join(base, `${slug}-fail.png`),
  ];
  if (route === '/baseball/dashboard/page.tsx') {
    candidates.unshift(join(base, 'baseball-dashboard-page-tsx.png'));
  }
  if (route === '/baseball/dashboard/camps') {
    candidates.push(join(SRC, role, 'screenshots', 'baseball-dashboard-camps-retry.png'));
  }
  return candidates.find((p) => existsSync(p)) || null;
}

function buildRolePack(role) {
  const auditPath = join(SRC, role, 'audit-results.json');
  if (!existsSync(auditPath)) {
    console.warn(`Missing ${auditPath}`);
    return;
  }
  const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
  const nav = parseNavRegistry();
  const roleOut = join(OUT, role);
  const desktopOut = join(roleOut, 'desktop');
  const mobileOut = join(roleOut, 'mobile');
  mkdirSync(desktopOut, { recursive: true });
  mkdirSync(mobileOut, { recursive: true });

  const manifest = [];
  let desktopIdx = 0;
  let mobileIdx = 0;

  const desktopEntries = audit.filter((r) => r.route && r.viewport === 'desktop');
  for (const entry of desktopEntries) {
    desktopIdx++;
    const navEntry = nav.find((n) => n.href === entry.route);
    const pageFile = entry.pageFile || null;
    const scannedTables = pageFile ? extractTablesFromFile(pageFile) : [];
    const hintTables = inferDb(entry.route);
    const tables = [...new Set([...hintTables, ...scannedTables])].sort();
    const actions = inferActions(entry.route);
    const redirectNote = role === 'coach' ? COACH_REDIRECT_NOTES[entry.route] : PLAYER_REDIRECT_NOTES[entry.route];
    const redirected = entry.finalUrl && !entry.finalUrl.includes(entry.route.replace(/\/$/, ''));

    const label = `${String(desktopIdx).padStart(2, '0')}-${role}-${slugRoute(entry.route)}`;
    const srcShot = screenshotPath(role, entry.route, 'desktop');
    const destFile = `${label}.png`;
    const destPath = join(desktopOut, destFile);
    if (srcShot) copyFileSync(srcShot, destPath);

    const notes = [];
    if (entry.status !== 'ok') notes.push(`Status: ${entry.status}`);
    if (entry.issues?.length) notes.push(`Issues: ${entry.issues.join(', ')}`);
    if (entry.signals?.isEmptyState) notes.push('Empty state rendered');
    if (entry.signals?.redirected || redirected) notes.push(`Redirect: ${entry.route} → ${entry.finalUrl || 'unknown'}`);
    if (redirectNote) notes.push(redirectNote);
    if (entry.consoleErrors?.length) notes.push(`Console: ${entry.consoleErrors.slice(0, 2).join('; ')}`);
    if (entry.error) notes.push(`Error: ${entry.error.slice(0, 200)}`);

    manifest.push({
      role,
      viewport: 'desktop',
      index: desktopIdx,
      label,
      screenshot: srcShot ? `${role}/desktop/${destFile}` : null,
      route: entry.route,
      finalUrl: entry.finalUrl || null,
      status: entry.status,
      headline: entry.headline || null,
      hub: navEntry?.hub || null,
      navRegistryId: navEntry?.id || null,
      requiredCapability: navEntry?.requiredCapability || null,
      pageFile,
      actions: actions ? `src/app/baseball/${actions}` : null,
      readModels: pageFile ? inferReadModels(pageFile) : [],
      databaseTables: tables,
      notes,
      rendering: entry.status === 'ok' && !redirected ? 'pass' : redirected ? 'redirect' : entry.status,
    });
  }

  const mobileEntries = audit.filter((r) => r.route && r.viewport === 'mobile');
  for (const entry of mobileEntries) {
    mobileIdx++;
    const label = `${String(mobileIdx).padStart(2, '0')}-${role}-mobile-${slugRoute(entry.route)}`;
    const srcShot = screenshotPath(role, entry.route, 'mobile');
    const destFile = `${label}.png`;
    const destPath = join(mobileOut, destFile);
    if (srcShot) copyFileSync(srcShot, destPath);

    manifest.push({
      role,
      viewport: 'mobile',
      index: mobileIdx,
      label,
      screenshot: srcShot ? `${role}/mobile/${destFile}` : null,
      route: entry.route,
      finalUrl: entry.finalUrl || null,
      status: entry.status,
      headline: entry.headline || null,
      notes: entry.status !== 'ok' ? [`Status: ${entry.status}`] : [],
      rendering: entry.status === 'ok' ? 'pass' : entry.status,
    });
  }

  writeFileSync(join(roleOut, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(roleOut, 'INDEX.md'), renderIndex(role, manifest));
  writeFileSync(join(roleOut, 'ERRORS.md'), renderErrors(role, manifest));
  console.log(`[${role}] ${manifest.filter((m) => m.viewport === 'desktop').length} desktop, ${manifest.filter((m) => m.viewport === 'mobile').length} mobile, ${manifest.filter((m) => m.screenshot).length} screenshots copied`);
}

function inferReadModels(pageFile) {
  const text = readFileSync(join(ROOT, pageFile), 'utf8');
  const imports = [...text.matchAll(/@\/lib\/baseball\/read-models\/([a-z0-9-_./*]+)/g)].map((m) => m[1].replace(/\*/g, ''));
  return [...new Set(imports)].map((m) => `src/lib/baseball/read-models/${m}`).sort();
}

function renderIndex(role, manifest) {
  const account = role === 'coach' ? 'njrini99@gmail.com (Nick Rini, Rini University Baseball)' : 'rinin376@gmail.com (Marcus Rodriguez #7, Rini University Baseball)';
  const lines = [
    `# BaseballHelm QA — ${role.toUpperCase()}`,
    '',
    `**Account:** ${account}`,
    `**Audit date:** 2026-07-04`,
    `**Shell:** Fairway (BaseballFairwayShell)`,
    '',
    '## Desktop routes',
    '',
    '| # | Screenshot | Route | Render | Page | DB tables | Notes |',
    '|---|------------|-------|--------|------|-----------|-------|',
  ];

  for (const m of manifest.filter((x) => x.viewport === 'desktop')) {
    const shot = m.screenshot ? `[${m.label}](${m.screenshot.replace(`${role}/`, '')})` : '—';
    const dbs = m.databaseTables?.slice(0, 4).join(', ') + (m.databaseTables?.length > 4 ? '…' : '') || '—';
    const notes = m.notes?.length ? m.notes.join('; ') : '—';
    lines.push(`| ${m.index} | ${shot} | \`${m.route}\` | ${m.rendering} | \`${m.pageFile || '—'}\` | ${dbs || '—'} | ${notes} |`);
  }

  lines.push('', '## Mobile spot-checks', '');
  for (const m of manifest.filter((x) => x.viewport === 'mobile')) {
    lines.push(`- **${m.label}** — \`${m.route}\` — ${m.rendering}${m.screenshot ? ` ([screenshot](${m.screenshot.replace(`${role}/`, '')}))` : ''}`);
  }

  lines.push('', '## Code references (shared)', '');
  lines.push('- Nav registry: `src/lib/baseball/nav-registry.ts`');
  lines.push('- Hub tabs: `src/app/baseball/(dashboard)/_components/hub-definitions.ts`');
  lines.push('- Fairway shell: `src/app/baseball/(dashboard)/BaseballFairwayShell.tsx`');
  lines.push('- Route guards: `src/lib/baseball/server-route-guards.ts`, `src/lib/supabase/middleware.ts`');
  lines.push('- Feature docs: `memory/context/baseballhelm-features.md`');
  lines.push('- Schema: `memory/context/baseballhelm-database.md`');
  lines.push('', '## manifest.json', '', 'Machine-readable copy of this index with full table lists and action paths.');

  return lines.join('\n');
}

function renderErrors(role, manifest) {
  const issues = manifest.filter((m) => m.notes?.length || m.rendering !== 'pass');
  const lines = [
    `# ${role.toUpperCase()} — Errors & Notes`,
    '',
    `Issues and non-pass renders from the 2026-07-04 audit.`,
    '',
  ];
  if (!issues.length) {
    lines.push('No issues recorded.');
    return lines.join('\n');
  }
  for (const m of issues) {
    lines.push(`## ${m.index}. \`${m.route}\``, '');
    lines.push(`- **Render:** ${m.rendering}`);
    if (m.pageFile) lines.push(`- **Page:** \`${m.pageFile}\``);
    if (m.actions) lines.push(`- **Actions/read-models:** \`${m.actions}\``);
    if (m.databaseTables?.length) lines.push(`- **DB tables:** ${m.databaseTables.map((t) => `\`${t}\``).join(', ')}`);
    for (const n of m.notes || []) lines.push(`- ${n}`);
    if (m.screenshot) lines.push(`- **Screenshot:** [${m.label}](${m.screenshot.replace(`${role}/`, '')})`);
    lines.push('');
  }
  return lines.join('\n');
}

mkdirSync(OUT, { recursive: true });
buildRolePack('coach');
buildRolePack('player');

const readme = `# BaseballHelm Fairway Visual QA Pack

**Generated:** 2026-07-04  
**Purpose:** Labeled screenshots from coach + player click-through audits, cross-referenced to code and database dependencies.

## Structure

\`\`\`
docs/qa/baseball-fairway-visual-audit-2026-07-04/
├── README.md          ← this file
├── coach/
│   ├── INDEX.md       ← human index (routes, code, DB, notes)
│   ├── manifest.json  ← machine-readable metadata
│   ├── desktop/       ← labeled PNGs (01-coach-…)
│   └── mobile/
└── player/
    ├── INDEX.md
    ├── manifest.json
    ├── desktop/
    └── mobile/
\`\`\`

## Accounts (demo seed)

| Role | User | Team |
|------|------|------|
| Coach | Nick Rini | Rini University Baseball |
| Player | Marcus Rodriguez (#7) | Rini University Baseball |

## Summary

- **Coach:** 72 desktop routes + 7 mobile spot-checks. Fairway shell renders correctly on all coach-intended routes. Several player-only or showcase-only routes redirect as designed.
- **Player:** 22 desktop routes + 7 mobile spot-checks. Player Today hub, stats, profile, development, team, and recruiting surfaces render correctly. College-player gates on Activate; Interest tab + cold dev-plan URL need follow-up.

## Known issues (both roles)

1. SLG / OPS / exit velo columns show \`—\` despite AVG/OBP populated (seed/compute gap).
2. Stats Center charts empty while tables have data (event-level visuals not seeded).
3. Coach pipeline/discover empty (no recruits in demo seed — empty states OK).

## Player-specific follow-ups

1. \`/dashboard/college-interest\` — middleware redirects college players to Today; nav still shows Interest tab.
2. \`/dashboard/dev-plan\` — cold URL can bounce before navContext resolves; sidebar navigation works.

## Regenerate

\`\`\`bash
# Run audits (requires local dev + credentials via env)
E2E_ROLE=coach E2E_EMAIL=... E2E_PASSWORD=... OUT_DIR=/tmp/baseball-qa-full node scripts/tmp-baseball-route-audit.mjs
E2E_ROLE=player E2E_EMAIL=... E2E_PASSWORD=... OUT_DIR=/tmp/baseball-qa-full node scripts/tmp-baseball-route-audit.mjs
node scripts/build-baseball-qa-pack.mjs
\`\`\`
`;

writeFileSync(join(OUT, 'README.md'), readme);
console.log(`\nWrote QA pack to ${OUT}`);
