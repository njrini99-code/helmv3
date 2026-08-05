import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FEATURE_REGISTRY,
  TABLE_TO_FEATURE,
  featureForTable,
  rpcInput,
  type FeatureKey,
} from '@/lib/admin/feature-registry';

// The canonical key list per docs/superpowers/specs/helm-bridge/FEATURE_COVERAGE.md
// §1.1 (24) + §1.2 (13) + §1.3 (48) + §1.4 (1 excluded) = 86. Hard-coded here on purpose —
// the doc is canonical, this list is the tripwire that catches drift between
// the spec and the registry.
const EXPECTED_KEYS: FeatureKey[] = [
  // §1.1 GolfHelm (24)
  'round_tracking',
  'stats_analytics',
  'qualifiers',
  'my_qualifiers',
  'calendar_events',
  'academics_classes',
  'roster_management',
  'task_management',
  'messaging',
  'announcements',
  'documents',
  'travel',
  'team_info',
  'join_team_flow',
  'settings',
  'course_library',
  'recruiting_prospect_tracking',
  'player_hub',
  'coach_dashboard',
  'notifications',
  'auth_onboarding',
  'whats_new',
  'my_game_profile',
  'admin_dashboard',
  // §1.2 CoachHelm (13)
  'coachhelm_ai_engine',
  'alerts_system',
  'patterns_dashboard',
  'insights_management',
  'intelligence_dashboard',
  'coachhelm_analytics',
  'coaching_intelligence_settings',
  'player_coachhelm_dashboard',
  'round_review_ai',
  'development_plans_coach',
  'my_development',
  'drills_practice_rx',
  'coachhelm_v3_goals',
  // §1.3 BaseballHelm (48)
  'baseball_academics',
  'baseball_announcements',
  'baseball_auth',
  'baseball_calendar',
  'baseball_camps',
  'baseball_classes',
  'baseball_coach_command_center',
  'baseball_coachhelm',
  'baseball_command_center',
  'baseball_compare',
  'baseball_decision_room',
  'baseball_demo_access',
  'baseball_demo_tracking',
  'baseball_dev_plans',
  'baseball_discover',
  'baseball_documents',
  'baseball_games',
  'baseball_import',
  'baseball_insights',
  'baseball_interests',
  'baseball_lift_onboarding',
  'baseball_lifting',
  'baseball_lineups',
  'baseball_messages',
  'baseball_notes',
  'baseball_notifications',
  'baseball_onboarding',
  'baseball_philosophy',
  'baseball_player_actions',
  'baseball_player_peek',
  'baseball_player_today',
  'baseball_postgame',
  'baseball_practice',
  'baseball_profile',
  'baseball_recruiting',
  'baseball_recruiting_philosophy',
  'baseball_roster',
  'baseball_scout_packet',
  'baseball_settings',
  'baseball_signals',
  'baseball_staff',
  'baseball_stats',
  'baseball_tasks',
  'baseball_teams',
  'baseball_timeline',
  'baseball_travel',
  'baseball_video',
  'baseball_watchlist',
  // §1.4 Excluded (1)
  'crm_recruiting_pipeline',
];

// The full non-CRM 'use server' action-boundary file set the manifest must
// cover exactly — 76 files under src/app/golf/actions/** (verified against
// the tree on branch feat/helm-bridge-command-center, 2026-07-01) + the 10
// golf-named exports of the shared src/app/actions/messages.ts + the 1
// admin triage action. CRM files, non-'use server' helper/type/const files,
// and rollup-a.ts/rollup-b.ts (no 'use server' directive) are excluded by
// construction — they are simply not in this list.
const NON_CRM_ACTION_FILES = [
  'access-code.ts',
  'admin-bi-data.ts',
  'admin-data.ts',
  'admin-people-data.ts',
  'admin-system-data.ts',
  'admin-tracer-data.ts',
  'admin/rollup-c.ts',
  'alerts.ts',
  'announcements.ts',
  'attendance.ts',
  'auth.ts',
  'calendar-feeds.ts',
  'calendar-sync.ts',
  'causal-relationships.ts',
  'coach-notifications.ts',
  'coachhelm-analytics.ts',
  'coachhelm-data.ts',
  'coaching-philosophy.ts',
  'command-palette.ts',
  'communication.ts',
  'course-library.ts',
  'courses.ts',
  'dashboard-data.ts',
  'demo-access.ts',
  'demo-tracking.ts',
  'development.ts',
  'documents.ts',
  'drills.ts',
  'event-documents.ts',
  'golf.ts',
  'insight-celebration.ts',
  'insight-delivery.ts',
  'insight-evidence.ts',
  'insight-management.ts',
  'insights.ts',
  'intelligence-dashboard.ts',
  'message-attachments.ts',
  'onboarding.ts',
  'pattern-management.ts',
  'player-effectiveness.ts',
  'player-feedback.ts',
  'player-fingerprint.ts',
  'player-notifications.ts',
  'player-profile-stats.ts',
  'push-notifications.ts',
  'recruit-documents.ts',
  'recruiting.ts',
  'recurring-events.ts',
  'roster.ts',
  'round-drafts.ts',
  'round-recap.ts',
  'round-review-system.ts',
  'round-reviews.ts',
  'shot-analytics.ts',
  'signal-groups.ts',
  'stats-data.ts',
  'stats-intelligence.ts',
  'stats-leak-maps.ts',
  'stats.ts',
  'task-reminders.ts',
  'task-templates.ts',
  'tasks.ts',
  'team-category-insights.ts',
  'team-sg-baseline.ts',
  'team-switcher.ts',
  'teams.ts',
  'travel.ts',
  'v3/focus-area-progress.ts',
  'v3/goal-progress.ts',
  'v3/goals.ts',
  'v3/intent.ts',
  'v3/llm.ts',
  'v3/notification-prefs.ts',
  'v3/practice-rx.ts',
  'v3/qualifying.ts',
  'v3/team-practice-rx.ts',
  'whats-new.ts',
].map((f) => `src/app/golf/actions/${f}`);

const EXTRA_ACTION_FILES = [
  'src/app/actions/messages.ts',
  'src/app/admin/actions/triage.ts',
];

const ALL_ACTION_FILES = [...NON_CRM_ACTION_FILES, ...EXTRA_ACTION_FILES];

// The shared messages.ts file has generic + Baseball exports too — only
// these 10 golf-named exports are in scope (spec §2.1).
const MESSAGES_GOLF_EXPORTS = new Set([
  'sendGolfMessage',
  'createGolfConversation',
  'markGolfMessagesAsRead',
  'createGolfTeamBroadcast',
  'getGolfTeamPlayersForBroadcast',
  'updateGolfMessage',
  'deleteGolfMessage',
  'getGolfPlayerUserId',
  'searchGolfMessages',
  'getGolfActiveTeamConversationIds',
]);

/** Minimal export scan — the same `export async function` shape the Task 4
 * scanner uses, kept local here so feature-registry's own completeness test
 * has no dependency on the coverage-scanner test util. */
function scanExports(relPath: string): string[] {
  const absPath = join(process.cwd(), relPath);
  const source = readFileSync(absPath, 'utf8');
  const names: string[] = [];
  const re = /^export async function (\w+)/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const name = match[1];
    if (!name) continue;
    if (relPath.endsWith('src/app/actions/messages.ts') && !MESSAGES_GOLF_EXPORTS.has(name)) {
      continue;
    }
    names.push(name);
  }
  return names;
}

describe('FEATURE_REGISTRY completeness', () => {
  it('has exactly 86 entries with unique keys', () => {
    expect(FEATURE_REGISTRY).toHaveLength(86);
    const keys = FEATURE_REGISTRY.map((f) => f.key);
    expect(new Set(keys).size).toBe(86);
  });

  it('matches the FEATURE_COVERAGE.md §1 canonical key list exactly', () => {
    const registryKeys = [...FEATURE_REGISTRY.map((f) => f.key)].sort();
    const expected = [...EXPECTED_KEYS].sort();
    expect(registryKeys).toEqual(expected);
  });

  it('every non-CRM action-boundary export appears in EXACTLY ONE manifest', () => {
    // Build: exportName@file -> [featureKeys that claim it]
    const claims = new Map<string, FeatureKey[]>();
    for (const def of FEATURE_REGISTRY) {
      if (def.excluded) continue;
      for (const [file, manifest] of Object.entries(def.actions)) {
        if (manifest === 'ALL') continue; // resolved below via file exports
        for (const name of manifest) {
          const id = `${file}#${name}`;
          claims.set(id, [...(claims.get(id) ?? []), def.key]);
        }
      }
    }
    // For 'ALL' files, every export in the file is implicitly claimed once.
    const allFileOwner = new Map<string, FeatureKey>();
    for (const def of FEATURE_REGISTRY) {
      if (def.excluded) continue;
      for (const [file, manifest] of Object.entries(def.actions)) {
        if (manifest === 'ALL') {
          expect(allFileOwner.has(file)).toBe(false); // a file can be 'ALL' for only one feature
          allFileOwner.set(file, def.key);
        }
      }
    }

    const missing: string[] = [];
    const duplicated: string[] = [];

    for (const file of ALL_ACTION_FILES) {
      const exportsInFile = scanExports(file);
      const owner = allFileOwner.get(file);
      for (const name of exportsInFile) {
        const id = `${file}#${name}`;
        if (owner) {
          // Whole-file owner claims it, UNLESS an override elsewhere also
          // claims the same name (would be a duplicate — not expected here).
          if (claims.has(id)) duplicated.push(id);
          continue;
        }
        const owners = claims.get(id);
        if (!owners || owners.length === 0) {
          missing.push(id);
        } else if (owners.length > 1) {
          duplicated.push(id);
        }
      }
    }

    expect(missing, `unmapped exports:\n${missing.join('\n')}`).toEqual([]);
    expect(duplicated, `multiply-mapped exports:\n${duplicated.join('\n')}`).toEqual([]);
  });

  // 2026-07-09 security fix: -5 from 424. `getDetailedStatsAsAdmin`
  // (stats-data.ts, -1), `evaluateAndPersistGoals` + `runGoalProgressForPlayers`
  // (v3/goal-progress.ts, -2), and `runFocusAreaProgressForPlayers` +
  // `evaluateAndPersistFocusAreas` (v3/focus-area-progress.ts, -2) were
  // caller-supplied-player_id admin-bypass functions with zero auth, exported
  // from 'use server' files — making each a publicly-POSTable action per
  // Next.js's server-actions guidance. All four are now module-private
  // (goal-progress.ts/focus-area-progress.ts relocated whole to
  // src/lib/golf/progress-drivers.ts, a non-'use server' module; stats-data.ts
  // keeps its impl private and hands it to trusted callers via
  // src/lib/golf/detailed-stats-admin-bridge.ts) — these three 'ALL'-mapped
  // files now scan 5 fewer real exports. All non-'ALL' manifests (including
  // insights.ts's explicit array, which still lists the now-private
  // triggerPlayerInsightsAfterRound by name) are unaffected since this count
  // sums `manifest.length` for those, not a live export scan.
  // 2026-07-10 feature-flow sweep: +2 to 421. The qualifiers manifest gains
  // `updateGolfQualifierDetails` (the previously-missing edit-qualifier flow)
  // and `reconcileQualifierStatus` (view-time lifecycle self-heal) — both new
  // withAdminObserved-wrapped exports in golf.ts.
  // 2026-07-17 course-library-owner-gate fix (#913): +1 to 422. New read
  // action `getCourseTeeHoles` (course-library.ts) powers the course detail
  // sheet's read-only "Holes" summary. course-library.ts is already
  // 'ALL'-mapped to `course_library`, so this new withAdminObserved-wrapped
  // export is picked up by the live `scanExports` count with no manifest
  // edit required.
  it('total manifest size is exactly 429 (excludes the CRM row)', () => {
    let total = 0;
    for (const def of FEATURE_REGISTRY) {
      if (def.excluded || def.app === 'baseballhelm') continue;
      for (const [file, manifest] of Object.entries(def.actions)) {
        if (manifest === 'ALL') {
          total += scanExports(file).length;
        } else {
          total += manifest.length;
        }
      }
    }
    // 427 as of security fixes: added logServerError wrapper in crm-gmail-send.ts
    // 427 also covers recurring tasks (#1238): createRecurringTask (tasks.ts).
    // tasks.ts is already 'ALL'-mapped, so the live scanExports count picks it
    // up with no manifest edit needed.
    // 429: createStaffInvite + redeemStaffInvite — coach-issued staff
    // invitations, replacing a join-code path that let any player
    // grant themselves program-administrator.
    expect(total).toBe(429);
  });

  it('the CRM row lists no files (never a wrap target)', () => {
    const crm = FEATURE_REGISTRY.find((f) => f.key === 'crm_recruiting_pipeline');
    expect(crm?.excluded).toBe('crm');
    expect(Object.keys(crm?.actions ?? {})).toEqual([]);
  });

  it('resolves known tables to their canonical feature', () => {
    expect(featureForTable('golf_rounds')).toBe('round_tracking');
    expect(featureForTable('golf_player_stats_cache')).toBe('stats_analytics');
    expect(featureForTable('golf_coach_insights')).toBe('coachhelm_ai_engine');
    expect(featureForTable('golf_patterns_v2')).toBe('patterns_dashboard');
    expect(featureForTable('golf_player_focus_areas')).toBe('development_plans_coach');
    expect(featureForTable('admin_events')).toBe('admin_dashboard');
  });

  it('returns null for an unknown table', () => {
    expect(featureForTable('golf_this_table_does_not_exist')).toBeNull();
    expect(featureForTable('crm_coaches')).toBeNull();
  });

  it('never maps a crm_ or helm_lifting_ table', () => {
    const tables = Object.keys(TABLE_TO_FEATURE);
    for (const t of tables) {
      expect(t.startsWith('crm_')).toBe(false);
      expect(t.startsWith('helm_lifting_')).toBe(false);
    }
  });

  it('never lists a crm- action file in any manifest', () => {
    for (const def of FEATURE_REGISTRY) {
      for (const file of Object.keys(def.actions)) {
        const base = file.split('/').pop() ?? '';
        expect(base.startsWith('crm-')).toBe(false);
        expect(base).not.toBe('resend-activity.ts');
      }
    }
  });

  it('rpcInput() excludes the CRM row and carries heartbeat tables', () => {
    const input = rpcInput();
    expect(input).toHaveLength(85);
    expect(input.some((i) => i.key === 'crm_recruiting_pipeline')).toBe(false);
    const roundTracking = input.find((i) => i.key === 'round_tracking');
    expect(roundTracking?.heartbeat_table).toBe('golf_rounds');
  });
});
