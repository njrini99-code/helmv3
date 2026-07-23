import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanActionFile } from './coverage-scanner';
import { assertAreaFullyWrapped } from './coverage-contract.shared';

describe('coverage-scanner', () => {
  it('parses golf.ts and finds savePartialRound wrapped with feature round_tracking', () => {
    const scanned = scanActionFile(join(process.cwd(), 'src/app/golf/actions/golf.ts'));
    expect(scanned.exports).toContain('savePartialRound');
    expect(scanned.exports).toContain('invitePlayerToTeam');
    expect(scanned.wrapped.get('savePartialRound')).toEqual({ feature: 'round_tracking' });
    // invitePlayerToTeam is now wrapped (roster_management, W15 Batch 5) —
    // proves the scanner distinguishes wrapped from unwrapped exports within
    // the same file. golf.ts's LAST 4 exports (getPlayerSavedCourses et al.)
    // landed in Batch 6, so as of B6 the whole file is fully wrapped.
    expect(scanned.wrapped.get('invitePlayerToTeam')).toEqual({ feature: 'roster_management' });
    expect(scanned.wrapped.get('getPlayerSavedCourses')).toEqual({ feature: 'course_library' });
  });

  it('exports list matches a fresh regex scan (sanity: scanner is not hard-coded)', () => {
    // alerts.ts served as this scanner's stable fully-unwrapped fixture
    // through W15 Batch 6, then got wrapped itself in Batch 7 (alerts_system)
    // — by Task 16a every real golf action file is fully wrapped, so this
    // sanity check now uses a synthetic fixture that can never legitimately
    // get wrapped (see fixtures/unwrapped-actions.fixture.ts for the handoff
    // history: round-drafts.ts → course-library.ts → alerts.ts → fixture).
    const scanned = scanActionFile(
      join(process.cwd(), 'src/lib/admin/__tests__/fixtures/unwrapped-actions.fixture.ts'),
    );
    expect(scanned.exports.sort()).toEqual(
      ['unwrappedFixtureFnOne', 'unwrappedFixtureFnTwo'].sort(),
    );
    expect(scanned.wrapped.size).toBe(0);
  });

  it('flags a wrap whose export never calls the observed const (audit N4 — dead wrapper)', () => {
    // See fixtures/broken-delegation.fixture.ts: `withAdminObserved` textually
    // co-occurs with the export name (the pre-hardening scanner's only
    // check), but the export body calls the Impl directly instead of the
    // observed const, so the registration is dead code that would silently
    // never log. `wrapped` still records the (name, feature) pair — the new
    // `undelegatedWraps` set is what surfaces the gap.
    const scanned = scanActionFile(
      join(process.cwd(), 'src/lib/admin/__tests__/fixtures/broken-delegation.fixture.ts'),
    );
    expect(scanned.exports).toEqual(['brokenDelegationFn']);
    expect(scanned.wrapped.get('brokenDelegationFn')).toEqual({ feature: 'admin_dashboard' });
    expect(scanned.undelegatedWraps.has('brokenDelegationFn')).toBe(true);
  });
});

describe('assertAreaFullyWrapped — self-test (proves the harness detects gaps)', () => {
  it('does NOT throw for golf.ts — fully wrapped as of Batch 6', () => {
    // Batch 1 (round_tracking/qualifiers/my_qualifiers, 13 exports incl. the
    // pre-existing savePartialRound exemplar) + Batch 2 (calendar_events/
    // notifications, 18 exports) + Batch 4 (createAnnouncement) + Batch 5
    // (roster_management: invitePlayerToTeam, updatePlayerStatus,
    // getPendingInvitations) + Batch 6 (course_library: getPlayerSavedCourses,
    // savePlayerCourse, touchSavedCourse, getRecentCoursesForPlayer) cover all
    // 39 golf.ts exports — no exclusions needed anymore.
    expect(() =>
      assertAreaFullyWrapped(['src/app/golf/actions/golf.ts']),
    ).not.toThrow();
  });

  it('THROWS listing every unwrapped export in the synthetic fixture (W15 Task 16a)', () => {
    // See fixtures/unwrapped-actions.fixture.ts — a permanently-unwrapped
    // stand-in now that every real golf action file (alerts.ts included,
    // as of Batch 7) is fully wrapped.
    let thrown: Error | null = null;
    try {
      assertAreaFullyWrapped(['src/lib/admin/__tests__/fixtures/unwrapped-actions.fixture.ts']);
    } catch (err) {
      thrown = err instanceof Error ? err : new Error(String(err));
    }
    expect(thrown).not.toBeNull();
    const message = thrown?.message ?? '';
    expect(message).toContain('unwrappedFixtureFnOne');
    expect(message).toContain('unwrappedFixtureFnTwo');
    expect(message).toContain('2 coverage gap(s)');
  });

  it('throws when an export is not wrapped', () => {
    // The synthetic fixture is entirely unwrapped by design — asserting it
    // proves the harness surfaces a gap rather than a false pass.
    expect(() =>
      assertAreaFullyWrapped(['src/lib/admin/__tests__/fixtures/unwrapped-actions.fixture.ts']),
    ).toThrow(/NOT wrapped with withAdminObserved/);
  });

  it('THROWS for a wrap whose export never calls the observed const (audit N4)', () => {
    // See fixtures/broken-delegation.fixture.ts — proves the delegation
    // check is wired into the actual gap-reporting path, not just exposed
    // as an unused field on ScannedFile.
    expect(() =>
      assertAreaFullyWrapped(['src/lib/admin/__tests__/fixtures/broken-delegation.fixture.ts']),
    ).toThrow(/dead wrapper/);
  });
});

// Flipped ON in W15 Task 16a: every non-CRM 'use server' action file under
// src/app/golf/actions/** (minus the spec §1.3 exclusion manifest) + the 10
// golf exports of src/app/actions/messages.ts + src/app/admin/actions/
// triage.ts is fully wrapped with a valid FeatureKey. This is a permanent
// invariant, not a one-time batch check — the file list below is DISCOVERED
// by walking the directory tree (not hard-coded), so a future PR that adds a
// new action file to src/app/golf/actions/** without wrapping it fails this
// test automatically, with no manual list maintenance required.

// spec §1.3 "Also not wrapped" manifest — files that are NOT action
// boundaries (helpers/types/re-export shims) and are therefore excluded from
// the coverage math by design, not by omission.
const NOT_ACTION_BOUNDARY_FILES = new Set<string>([
  'src/app/golf/actions/messages.ts', // re-export shim, no 'use server' logic
  'src/app/golf/actions/insight-delivery-ranking.ts',
  'src/app/golf/actions/team-category-insights-helpers.ts',
  'src/app/golf/actions/player-fingerprint-types.ts',
  'src/app/golf/actions/stats-data-types.ts',
  'src/app/golf/actions/stats-leak-maps-types.ts',
  'src/app/golf/actions/recruit-documents-categories.ts',
  'src/app/golf/actions/team-switcher.constants.ts',
  'src/app/golf/actions/admin/rollup-a.ts',
  'src/app/golf/actions/admin/rollup-b.ts',
  'src/app/golf/actions/admin/rollup-c.shared.ts',
]);

// spec §1.3 CRM exclusion — owner directive: never touch CRM. Filename
// exclusion `crm-*.ts` PLUS the one CRM-adjacent file that misses the
// filename rule.
const CRM_PREFIX_RE = /^crm-/;
const CRM_ADJACENT_FILES = new Set<string>(['src/app/golf/actions/resend-activity.ts']);

/**
 * Discover every non-CRM, non-excluded `'use server'` action file under
 * `src/app/golf/actions/**` (recursing, skipping `__tests__`). A file only
 * needs to be added to `NOT_ACTION_BOUNDARY_FILES` above if it is a helper/
 * types/shim file that happens to live in this directory — genuine new
 * action files are picked up automatically and must be wrapped or this
 * test fails.
 *
 * Uses `readdirSync(dir, { withFileTypes: true })` so directory-vs-file is
 * read directly off the same listing (no separate `statSync` check-then-act
 * on the path — CodeQL js/file-system-race), and tolerates a file vanishing
 * between the listing and the read (ENOENT) instead of crashing the test on
 * a benign TOCTOU race with a concurrent build/editor write.
 */
function discoverGolfActionFiles(): string[] {
  const root = process.cwd();
  const actionsDir = join(root, 'src/app/golf/actions');
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;

      const rel = relative(root, abs).split('\\').join('/');
      if (CRM_PREFIX_RE.test(entry.name)) continue;
      if (CRM_ADJACENT_FILES.has(rel)) continue;
      if (NOT_ACTION_BOUNDARY_FILES.has(rel)) continue;

      let source: string;
      try {
        source = readFileSync(abs, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw err;
      }
      if (!source.includes("'use server'") && !source.includes('"use server"')) continue;

      found.push(rel);
    }
  };

  walk(actionsDir);
  return found.sort();
}

// The 10 golf-named exports of src/app/actions/messages.ts (spec §2.1) — the
// generic sport-branching exports (sendMessage, createConversation, etc.)
// and every `*Baseball*` export in that file stay UNTOUCHED (baseball hold)
// and must be excluded here so this test does not demand they be wrapped.
const MESSAGES_TS_NON_GOLF_EXPORTS = [
  'sendMessage',
  'createConversation',
  'markMessagesAsRead',
  'sendBaseballMessage',
  'createBaseballConversation',
  'markBaseballMessagesAsRead',
  'updateMessage',
  'deleteMessage',
  'updateBaseballMessage',
  'deleteBaseballMessage',
];

describe('global tripwire', () => {
  it('every non-CRM golf action export is wrapped with a valid FeatureKey (W15 Task 16)', () => {
    const golfActionFiles = discoverGolfActionFiles();

    // Sanity floor: fails loudly if directory discovery breaks (e.g. someone
    // reorganizes src/app/golf/actions/** so the walk finds nothing) rather
    // than silently passing an empty-file no-op.
    expect(golfActionFiles.length).toBeGreaterThanOrEqual(76);

    expect(() =>
      assertAreaFullyWrapped([
        ...golfActionFiles,
        'src/app/admin/actions/triage.ts',
      ]),
    ).not.toThrow();

    expect(() =>
      assertAreaFullyWrapped(['src/app/actions/messages.ts'], {
        exclude: { 'src/app/actions/messages.ts': MESSAGES_TS_NON_GOLF_EXPORTS },
      }),
    ).not.toThrow();
  });

  it('total wrapped-and-valid action count across the discovered area is exactly 419', () => {
    const golfActionFiles = discoverGolfActionFiles();
    let total = 0;

    for (const relFile of [...golfActionFiles, 'src/app/admin/actions/triage.ts']) {
      const scanned = scanActionFile(join(process.cwd(), relFile));
      total += scanned.exports.length;
    }

    const messagesScanned = scanActionFile(join(process.cwd(), 'src/app/actions/messages.ts'));
    const golfMessageExports = messagesScanned.exports.filter(
      (name) => !MESSAGES_TS_NON_GOLF_EXPORTS.includes(name),
    );
    total += golfMessageExports.length;

    expect(golfMessageExports.length).toBe(10);
    // 425 as of W2 (2026-07-09): +getPlayerHubSummaryData (player-hub-data.ts,
    // withAdminObserved-wrapped) — the Hub→Dashboard merge's extracted read.
    //
    // 419 as of the 2026-07-09 security fix (-6 from 425): this tripwire
    // live-scans every DISCOVERED file's real `export async function` list
    // (via scanActionFile), so it catches a superset of what
    // feature-registry.test.ts's manifest-length count does (-5 there — see
    // that file's comment). The same four functions are involved, but here
    // the drop is -6 because two whole files drop out of discovery, not just
    // two exports:
    //   - `getDetailedStatsAsAdmin` (stats-data.ts) is no longer exported —
    //     the file keeps its 'use server' directive and its other exports,
    //     so this is a straight -1 export.
    //   - `triggerPlayerInsightsAfterRound` (insights.ts) is no longer
    //     exported for the same reason — another straight -1 export. (Its
    //     name remains, unexported, in FEATURE_REGISTRY's explicit array for
    //     that file, which is why feature-registry.test.ts's count doesn't
    //     move for this one.)
    //   - `evaluateAndPersistGoals` + `runGoalProgressForPlayers`
    //     (v3/goal-progress.ts) and `runFocusAreaProgressForPlayers` +
    //     `evaluateAndPersistFocusAreas` (v3/focus-area-progress.ts) moved to
    //     src/lib/golf/progress-drivers.ts, a plain module with NO
    //     'use server' directive. Both source files lost their 'use server'
    //     directive entirely (now just `export {}`), so
    //     discoverGolfActionFiles() no longer picks them up at all —
    //     -2 exports per file, -4 total.
    // All four were caller-supplied-player_id admin-bypass functions with
    // zero auth in a 'use server' file — Next.js makes every such export a
    // public, directly-POSTable action regardless of who actually imports it.
    // 425 - 1 - 1 - 4 = 419.
    //
    // 421 as of the 2026-07-10 feature-flow sweep (+2): golf.ts gains
    // `updateGolfQualifierDetails` (the previously-missing qualifier edit
    // flow) and `reconcileQualifierStatus` (view-time lifecycle self-heal on
    // the qualifier detail page) — both withAdminObserved-wrapped and listed
    // in FEATURE_REGISTRY's qualifiers manifest.
    //
    // 422 as of the 2026-07-17 course-library-owner-gate fix (#913, +1):
    // course-library.ts (already 'ALL'-mapped to `course_library`) gains
    // `getCourseTeeHoles` — a new withAdminObserved-wrapped read that powers
    // the course detail sheet's read-only "Holes" summary. No manifest edit
    // was needed (the file is a whole-file 'ALL' owner), so this live scan
    // and feature-registry.test.ts's manifest-length count both move by
    // exactly +1.
    //
    // 425 as of the 2026-07-19 Triage Desk server layer (+3): NEW file
    // `signal-groups.ts` (discovered live by `discoverGolfActionFiles()`,
    // since it's under src/app/golf/actions/** with a 'use server'
    // directive) adds 3 withAdminObserved-wrapped exports — `getSignalGroups`,
    // `reviewSignal`, `dismissSignal` — all feature `intelligence_dashboard`
    // (the Triage Desk lives on the canonical Intelligence route).
    // 426 as of the completed Triage Desk wiring (+1):
    // refreshTeamAnalysisAsCoach is the authenticated, rate-limited manual
    // team scan. signal-groups.ts is now also represented in the canonical
    // feature manifest instead of relying on this live-tree tripwire alone.
    // 427 as of the player Stats bundle (+1):
    // getPlayerStatsDashboardBundle consolidates the Stats surface reads into
    // one bounded, withAdminObserved-wrapped server action.
    // 431 as of the unified notifications feed (+4): getUnifiedNotifications,
    // getNotificationsUnreadCount, markNotificationRead, markAllNotificationsRead
    // in src/app/golf/actions/unified-notifications.ts — the notifications
    // wave's bounded, withAdminObserved-wrapped server actions.
    expect(total).toBe(431);
  });
});
