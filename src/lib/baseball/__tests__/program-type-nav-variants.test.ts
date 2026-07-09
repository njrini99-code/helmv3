// =============================================================================
// Regression test for the "Program-type variant engine is dead code" fix.
//
// THE BUG: the variant engine (program-type-variants.ts) defined per-mode nav
// priority, terminology, and default landing — but NOTHING at runtime consumed
// orderCoachNav / orderPlayerNav / getTerminology. nav-registry.ts filtered
// strictly by role+capability and never read program_type, so switching program
// mode was a settings-defaults swap only (the v4 explicit failure condition:
// "settings control features instead of hard-coded copies" / program types are
// "NOT hard-coded forks").
//
// THE FIX: BaseballNavContext now carries `programType`; getVisibleBaseballNav /
// getPrimaryBaseballNav re-order by the mode's surface priority; the sidebar
// reads the mode terminology pack; getBaseballDefaultLandingHref derives the
// mode's landing. These tests lock that nav ORDER + terminology + default
// landing actually DIFFER across modes (and that an absent programType is the
// neutral, declaration-order fallback).
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  getPrimaryBaseballNav,
  getVisibleBaseballNav,
  getBaseballDefaultLandingHref,
  getBaseballTerminology,
  BASEBALL_NAV_REGISTRY,
  type BaseballNavContext,
} from '../nav-registry';
import {
  BASEBALL_CAPABILITY_KEYS,
  type BaseballCapabilityMap,
} from '../capabilities';
import type { BaseballProgramType } from '@/lib/types/baseball-settings';

function allCaps(value: boolean): BaseballCapabilityMap {
  return BASEBALL_CAPABILITY_KEYS.reduce((acc, key) => {
    acc[key] = value;
    return acc;
  }, {} as BaseballCapabilityMap);
}

function coachCtx(programType: BaseballProgramType | null): BaseballNavContext {
  return { role: 'coach', capabilities: allCaps(true), programType };
}
function playerCtx(programType: BaseballProgramType | null): BaseballNavContext {
  return { role: 'player', capabilities: {}, programType };
}

function primaryIds(ctx: BaseballNavContext): string[] {
  return getPrimaryBaseballNav(ctx).map((e) => e.id);
}

describe('program-type variant engine — live runtime behavior', () => {
  it('coach nav ORDER differs between College and Showcase', () => {
    const college = primaryIds(coachCtx('college'));
    const showcase = primaryIds(coachCtx('showcase'));
    // Events is a Management-hub, org-level surface gated to
    // SHOWCASE_ORG_PROGRAM_TYPES (nav-registry.ts's allowedProgramTypes) — it is
    // genuinely absent for College, not just reordered, so the two sets are
    // equal only once that one showcase-only id is excluded from both sides.
    const SHOWCASE_ONLY_IDS = new Set(['events']);
    // postgame-review is college/JUCO-only (its page hard-redirects other
    // program types), so it's genuinely absent for Showcase — exclude it too
    // when comparing the otherwise-shared set.
    const COLLEGE_JUCO_ONLY_IDS = new Set(['postgame-review']);
    const excluded = (id: string) => SHOWCASE_ONLY_IDS.has(id) || COLLEGE_JUCO_ONLY_IDS.has(id);
    const collegeSet = new Set(college.filter((id) => !excluded(id)));
    const showcaseSet = new Set(showcase.filter((id) => !excluded(id)));
    expect(collegeSet).toEqual(showcaseSet);
    expect(college).not.toEqual(showcase);
  });

  it('College surfaces Practice/Performance above Stats; Showcase surfaces Roster/Stats earlier', () => {
    const college = primaryIds(coachCtx('college'));
    const showcase = primaryIds(coachCtx('showcase'));
    // College priority: command, decision-room, roster, practice, performance, stats...
    expect(college.indexOf('practice-planner')).toBeLessThan(
      college.indexOf('stats-center'),
    );
    // Showcase priority: command, roster, stats, import — stats ranks before practice.
    expect(showcase.indexOf('stats-center')).toBeLessThan(
      showcase.indexOf('practice-planner'),
    );
  });

  it('player nav ORDER differs between College and High School', () => {
    const college = primaryIds(playerCtx('college'));
    const hs = primaryIds(playerCtx('high_school'));
    expect(new Set(college)).toEqual(new Set(hs));
    expect(college).not.toEqual(hs);
    // College player: today, practice, performance, stats, profile → practice early.
    expect(college.indexOf('practice-planner')).toBeLessThan(
      college.indexOf('stats-center'),
    );
    // HS player: today, stats, profile → stats ranks before practice (unlisted).
    expect(hs.indexOf('stats-center')).toBeLessThan(
      hs.indexOf('practice-planner'),
    );
  });

  it('absent programType falls back to declaration (college-neutral) order', () => {
    const neutral = primaryIds(coachCtx(null));
    // Entries carrying allowedProgramTypes (e.g. `events`, gated to
    // SHOWCASE_ORG_PROGRAM_TYPES) are never visible without a resolved
    // programType (isBaseballNavEntryVisible's program-type gate), so the
    // "declaration order" baseline must exclude them too, or this test would
    // expect a route the real visibility filter never shows.
    const registryOrder = BASEBALL_NAV_REGISTRY.filter(
      (e) => e.section === 'primary' && e.role !== 'player' && !e.allowedProgramTypes?.length,
    ).map((e) => e.id);
    expect(neutral).toEqual(registryOrder);
  });

  it('re-ordering never adds or drops entries beyond intentional program-type gating (set is conserved)', () => {
    // The null-programType baseline hides every allowedProgramTypes-gated entry
    // (organization/teams/events — SHOWCASE_ORG_PROGRAM_TYPES). Re-ordering by
    // mode must conserve the neutral set PLUS exactly the entries that mode's
    // programType unlocks — never anything beyond that (and never less).
    const neutralIds = new Set(getVisibleBaseballNav(coachCtx(null)).map((e) => e.id));
    for (const pt of [
      'college',
      'high_school',
      'showcase',
      'juco',
      'academy',
      'club',
    ] as const) {
      const ordered = getVisibleBaseballNav(coachCtx(pt)).map((e) => e.id);
      const programGatedIds = BASEBALL_NAV_REGISTRY.filter((e) => e.allowedProgramTypes?.includes(pt)).map(
        (e) => e.id,
      );
      const expected = new Set([...neutralIds, ...programGatedIds]);
      expect(new Set(ordered)).toEqual(expected);
      expect(ordered.length).toBe(expected.size);
    }
  });

  it('secondary entries always stay after primary entries regardless of mode', () => {
    for (const pt of ['college', 'showcase', 'club'] as const) {
      const ordered = getVisibleBaseballNav(coachCtx(pt));
      const firstSecondary = ordered.findIndex((e) => e.section === 'secondary');
      const lastPrimary = ordered.reduce(
        (acc, e, i) => (e.section === 'primary' ? i : acc),
        -1,
      );
      if (firstSecondary !== -1) {
        expect(lastPrimary).toBeLessThan(firstSecondary);
      }
    }
  });

  it('terminology pack DIFFERS across modes (eventNoun / programNoun)', () => {
    expect(getBaseballTerminology(coachCtx('college')).eventNoun).toBe('Game');
    expect(getBaseballTerminology(coachCtx('showcase')).eventNoun).toBe('Showcase');
    expect(getBaseballTerminology(coachCtx('academy')).eventNoun).toBe('Session');

    expect(getBaseballTerminology(coachCtx('college')).programNoun).toBe('Program');
    expect(getBaseballTerminology(coachCtx('showcase')).programNoun).toBe('Organization');
    expect(getBaseballTerminology(coachCtx('academy')).programNoun).toBe('Academy');
    expect(getBaseballTerminology(coachCtx('club')).programNoun).toBe('Club');

    // Showcase uses an event-oriented roster noun; academy uses "Athletes".
    expect(getBaseballTerminology(coachCtx('showcase')).rosterNoun).toBe('Event Roster');
    expect(getBaseballTerminology(coachCtx('academy')).rosterNoun).toBe('Athletes');
  });

  it('default landing resolves per role and only to a VISIBLE route', () => {
    // Coach default landing = command-center (visible to every coach).
    expect(getBaseballDefaultLandingHref(coachCtx('college'))).toBe(
      '/baseball/dashboard/command-center',
    );
    // Player default landing = today.
    expect(getBaseballDefaultLandingHref(playerCtx('high_school'))).toBe(
      '/baseball/player/today',
    );
  });

  it('default landing falls back when the variant landing id is not visible', () => {
    // A coach with NO capabilities still lands on an always-visible primary
    // surface (command-center is requiredCapability:null), never a gated route.
    const noCapCoach: BaseballNavContext = {
      role: 'coach',
      capabilities: {},
      programType: 'showcase',
    };
    const href = getBaseballDefaultLandingHref(noCapCoach);
    const visibleHrefs = new Set(
      getVisibleBaseballNav(noCapCoach).map((e) => e.href),
    );
    expect(visibleHrefs.has(href)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Player-landing CONSOLIDATION (post-build review, high / completeness).
  //
  // The player surface was previously selected by hard-forking on the PLAYER
  // record's own player_type into FOUR fixed route files
  // (/baseball/player/{college|high-school|juco|showcase}). The fix funnels the
  // player landing through THIS engine instead: the program's mode (program_type)
  // governs the surface, and the engine never resolves a player to one of the
  // legacy type-keyed routes. These lock that in at the engine boundary the
  // routing layer (resolveBaseballLandingHref) delegates to.
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Calendar / Team Ops nav-entry presence (post-build review, medium /
  // completeness).
  //
  // THE BUG: the /baseball/dashboard/calendar route existed but had NO entry in
  // BASEBALL_NAV_REGISTRY, so it was an orphan — unreachable from the registry-
  // driven nav for both coaches and players. The 07_tab_architecture_v2 spec
  // lists "Calendar / Team Ops" as coach primary nav item #3 and "Schedule" as
  // player nav item #2, and 12_phase_plan_v2 lists "Calendar/Team Ops basics" as
  // a Phase-1 deliverable. These lock the entry in so it can never silently
  // re-orphan, and that the mode-aware order places it near the spec position.
  // ---------------------------------------------------------------------------
  it('Calendar / Team Ops is a registered, reachable primary surface for BOTH roles', () => {
    const entry = BASEBALL_NAV_REGISTRY.find((e) => e.id === 'calendar');
    expect(entry, 'calendar nav entry must exist in BASEBALL_NAV_REGISTRY').toBeDefined();
    expect(entry!.href).toBe('/baseball/dashboard/calendar');
    expect(entry!.role).toBe('both');
    expect(entry!.section).toBe('primary');
    // Calendar is a shared team-ops surface — never capability-gated for visibility
    // (the page's read model + RLS are the real gate; staff-only rows never leak to
    // players). A requiredCapability here would re-hide it from non-staff.
    expect(entry!.requiredCapability).toBeNull();

    // Reachable in the actual visible nav for a coach AND a player.
    expect(primaryIds(coachCtx('college'))).toContain('calendar');
    expect(primaryIds(playerCtx('college'))).toContain('calendar');
  });

  it('Calendar ranks high (near roster/today) under each mode, not dumped at the end', () => {
    // Coach: spec item #3 — should land in the early primary surfaces, before the
    // import/secondary group. Player: spec "Schedule" #2 — right after Today.
    for (const pt of ['college', 'high_school', 'showcase', 'juco', 'academy', 'club'] as const) {
      const coach = primaryIds(coachCtx(pt));
      expect(coach.indexOf('calendar')).toBeGreaterThanOrEqual(0);
      expect(coach.indexOf('calendar')).toBeLessThan(coach.indexOf('import-center'));

      const player = primaryIds(playerCtx(pt));
      expect(player.indexOf('calendar')).toBeGreaterThanOrEqual(0);
      // Calendar sits immediately after Today in every player mode.
      expect(player.indexOf('calendar')).toBe(player.indexOf('player-today') + 1);
    }
  });

  // ---------------------------------------------------------------------------
  // Player nav 5-item spec coverage (post-build review, medium / completeness).
  //
  // THE BUG: 07_tab_architecture_v2/recommended_final_navigation.md defines the
  // player nav as exactly: Today, Schedule, Tasks, Performance, My Profile. The
  // registry surfaced Today / My Profile + shared 'both' entries, but had NO
  // dedicated player entries for "Schedule" or "Tasks" — even though BOTH routes
  // (/baseball/dashboard/calendar, /baseball/dashboard/tasks) existed and were
  // player-reachable. Players therefore could not navigate to their schedule or
  // tasks from the sidebar / mobile nav (orphaned routes).
  //
  // THE FIX: (1) Calendar carries a playerLabel "Schedule" so the player sees the
  // spec label on the shared route; (2) a dedicated player-tasks entry points at
  // the existing tasks route. These lock both in so they can never re-orphan and
  // so the player sees the spec's labels + spec position.
  // ---------------------------------------------------------------------------
  it('player sees "Schedule" (not "Calendar") on the shared calendar surface', () => {
    const calendar = BASEBALL_NAV_REGISTRY.find((e) => e.id === 'calendar')!;
    // Coach label stays "Calendar"; the player-facing override is "Schedule".
    expect(calendar.label).toBe('Calendar');
    expect(calendar.playerLabel).toBe('Schedule');

    // The player's RESOLVED nav substitutes the playerLabel; the coach's does not.
    const playerCalendar = getPrimaryBaseballNav(playerCtx('college')).find(
      (e) => e.id === 'calendar',
    )!;
    const coachCalendar = getPrimaryBaseballNav(coachCtx('college')).find(
      (e) => e.id === 'calendar',
    )!;
    expect(playerCalendar.label).toBe('Schedule');
    expect(coachCalendar.label).toBe('Calendar');
  });

  it('Tasks is a registered, player-reachable primary surface (spec item #3)', () => {
    const tasks = BASEBALL_NAV_REGISTRY.find((e) => e.id === 'player-tasks');
    expect(tasks, 'player-tasks nav entry must exist').toBeDefined();
    expect(tasks!.href).toBe('/baseball/dashboard/tasks');
    expect(tasks!.label).toBe('Tasks');
    expect(tasks!.role).toBe('player');
    expect(tasks!.section).toBe('primary');
    // Every member-role player can reach it; visibility is never capability-gated
    // (the page read model + RLS scope a player to their OWN assignments).
    expect(tasks!.requiredCapability).toBeNull();

    // Reachable in the player's visible nav in every program mode — and NEVER in
    // the coach's (coaches reach tasks through Calendar / Team Ops + command).
    for (const pt of ['college', 'high_school', 'showcase', 'juco', 'academy', 'club'] as const) {
      expect(primaryIds(playerCtx(pt))).toContain('player-tasks');
      expect(primaryIds(coachCtx(pt))).not.toContain('player-tasks');
    }
  });

  it('player nav order follows the spec sequence: Today → Schedule → Tasks', () => {
    for (const pt of ['college', 'high_school', 'showcase', 'juco', 'academy', 'club'] as const) {
      const player = primaryIds(playerCtx(pt));
      const today = player.indexOf('player-today');
      const schedule = player.indexOf('calendar');
      const tasks = player.indexOf('player-tasks');
      expect(today).toBeGreaterThanOrEqual(0);
      expect(schedule).toBe(today + 1);
      expect(tasks).toBe(schedule + 1);
    }
  });

  it('every spec player nav surface (Today, Schedule, Tasks, Performance, My Profile) is reachable', () => {
    // The five spec ids: player-today, calendar(=Schedule), player-tasks,
    // player-lift(=Performance), player-profile. All present in the resolved
    // player nav. The player Performance slot must point at the player lift
    // home, not the coach-only /dashboard/performance page.
    const SPEC_PLAYER_IDS = [
      'player-today',
      'calendar',
      'player-tasks',
      'player-lift',
      'player-profile',
    ];
    const player = primaryIds(playerCtx('college'));
    for (const id of SPEC_PLAYER_IDS) {
      expect(player, `player nav must surface spec item "${id}"`).toContain(id);
    }

    const performance = getPrimaryBaseballNav(playerCtx('college')).find(
      (e) => e.id === 'player-lift',
    );
    expect(performance?.label).toBe('Performance');
    expect(performance?.href).toBe('/baseball/dashboard/lift');
  });

  it('player landing is the single consolidated home for EVERY program_type', () => {
    const LEGACY_TYPE_KEYED = new Set([
      '/baseball/player/college',
      '/baseball/player/high-school',
      '/baseball/player/juco',
      '/baseball/player/showcase',
    ]);
    const modes: (BaseballProgramType | null)[] = [
      null,
      'college',
      'high_school',
      'juco',
      'showcase',
      'academy',
      'club',
    ];
    for (const mode of modes) {
      const href = getBaseballDefaultLandingHref(playerCtx(mode));
      // The program's mode drives the player to the one canonical home — never to
      // a per-player-type hard-coded copy (the v4 "hard-coded copies" failure).
      expect(href).toBe('/baseball/player/today');
      expect(LEGACY_TYPE_KEYED.has(href)).toBe(false);
    }
  });
});
