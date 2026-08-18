# Golf Team Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the Golf course/qualifier paths and deliver a clearer player Team workspace, trustworthy coach signal context, and usable centered search without changing Baseball.

**Architecture:** Navigation remains declarative in the Golf registry. Team Hub consumes its existing page-loaded operational data and adds a compact overview rather than a new persistence or permission layer. Stats freshness is derived server-side from existing cache/snapshot timestamps, while route-specific chat access prevents the global fixed launcher from covering signals. The dashboard shell exposes rail geometry so both the header and active legacy command palette center inside content rather than the full viewport.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind/Fairway design tokens, Vitest/Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-golf-team-operations-design.md`

## Global Constraints

- Golf only; do not modify Baseball surfaces or behavior.
- Use existing Fairway `--fw-*` token-backed components and responsive shell conventions.
- Preserve role access: player Team content is read/operate-on-assigned-data; coach recruiting remains coach-only.
- Do not invent data, weaken citations, or label cached/snapshot data as live.
- Keep primary course reads fatal and supplementary tee/hole reads non-fatal.
- No production secret/configuration change is included; Inngest key alignment is an external follow-up.
- Preserve existing user work in the root checkout; implement only in this isolated worktree.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/golf/nav-registry.ts` | Ordered player Team tabs and derived Team rail landing href. |
| `src/lib/golf/nav-registry.test.ts` | Role-specific Team navigation contract. |
| `src/components/fairway/pages/team-hub/FairwayTeamHub.tsx` | Player operations overview and detailed operational tabs. |
| `src/components/fairway/pages/team-hub/FairwayTeamHub.logic.test.ts` | Default overview, direct tab navigation, and no redundant teammates tab. |
| `src/app/golf/(dashboard)/dashboard/team-hub/page.tsx` | Existing server-side operational data mapped to the overview contract, only if props are insufficient. |
| `src/components/fairway/app-shell/FairwayTopBar.tsx` | Content-centered desktop search layout. |
| `src/components/fairway/app-shell/FairwayTopBar.test.tsx` | Header search structural accessibility/layout contract. |
| `src/components/fairway/app-shell/AppShell.tsx` | Rail-width CSS variable shared with portal-like dashboard overlays. |
| `src/components/golf/CommandPalette.tsx` | Content-centered palette and explicit Close control. |
| `src/components/golf/CommandPalette.test.tsx` | Open, Close, Escape, and rail-aware palette positioning contract. |
| `src/app/golf/(dashboard)/dashboard/stats/team/page.tsx` | Server-side stats freshness derivation and route-level chat action. |
| `src/components/golf/stats/team-board/TeamStatsBoard.tsx` | Freshness copy and minimum-round eligibility explanation. |
| `src/components/golf/stats/team-board/__tests__/buildTeamBoardViewModel.test.ts` | Existing minimum-round model contract. |
| `src/components/golf/coachhelm/chat/CoachHelmDrawer.tsx` | Suppress the fixed launcher only on team stats while preserving chat access elsewhere. |
| `src/lib/__tests__/server-error-logger-bridge.test.ts` | Error serialization regression only if the observed malformed error is reproducible. |
| `src/lib/server-error-logger.ts` | Minimal error-description repair backed by that regression. |
| `memory/registry.yml` | Map the current `dashboard/team-hub/**` route to team operations. |
| `memory/context/golfhelm-features.md` | Record the new player Team navigation and Team Hub overview behavior. |

## Task 1: Lock down player Team navigation

**Files:**
- Modify: `src/lib/golf/nav-registry.ts: PLAYER_TEAM_TABS`
- Test: `src/lib/golf/nav-registry.test.ts`
- Modify: `memory/context/golfhelm-features.md: Player Hub and Team Info sections`

**Interfaces:**
- Consumes: `GOLF_PLAYER_HUBS` and `resolveActiveGolfHub(pathname, role)`.
- Produces: `PLAYER_TEAM_TABS` ordered as `team-hub`, `my-qualifiers`, `roster`, `team`; `buildPlayerRailSections()` uses the first tab as the Team rail href.

- [ ] **Step 1: Write the failing navigation test**

```ts
it('puts the player team workspace in operational order', () => {
  const team = GOLF_PLAYER_HUBS.find((hub) => hub.id === 'team');

  expect(team?.tabs?.map(({ label, href }) => [label, href])).toEqual([
    ['Team Hub', '/golf/dashboard/team-hub'],
    ['My Qualifiers', '/golf/dashboard/my-qualifiers'],
    ['Roster', '/golf/dashboard/roster'],
    ['Team Info', '/golf/dashboard/team'],
  ]);
  expect(buildPlayerRailSections().flatMap((section) => section.items)
    .find((item) => item.label === 'Team')?.href).toBe('/golf/dashboard/team-hub');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/lib/golf/nav-registry.test.ts`

Expected: FAIL because the current first tab is Roster and the order differs.

- [ ] **Step 3: Reorder only the existing player Team tab entries**

```ts
const PLAYER_TEAM_TABS = [
  { label: 'Team Hub', href: '/golf/dashboard/team-hub', icon: LayoutGrid },
  { label: 'My Qualifiers', href: '/golf/dashboard/my-qualifiers', icon: Trophy },
  { label: 'Roster', href: '/golf/dashboard/roster', icon: Users },
  { label: 'Team Info', href: '/golf/dashboard/team', icon: UsersRound },
] as const;
```

Keep the current imported icons and exact icon choices if their identifiers differ; this is a reordering change, not a new navigation model.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- --run src/lib/golf/nav-registry.test.ts`

Expected: PASS, including existing coach/player role and active-hub tests.

- [ ] **Step 5: Update the current-state documentation**

Add the player Team ordering and explain that Team Hub is the Team rail landing destination while coach-only surfaces stay role-gated.

- [ ] **Step 6: Commit the independently testable navigation change**

```bash
git add src/lib/golf/nav-registry.ts src/lib/golf/nav-registry.test.ts memory/context/golfhelm-features.md
git commit -m "fix(golf): prioritize player team operations"
```

## Task 2: Redesign player Team Hub as an operational overview

**Files:**
- Modify: `src/components/fairway/pages/team-hub/FairwayTeamHub.tsx`
- Modify if necessary: `src/app/golf/(dashboard)/dashboard/team-hub/page.tsx`
- Test: `src/components/fairway/pages/team-hub/FairwayTeamHub.logic.test.ts`
- Test: `src/components/fairway/pages/team-hub/FairwayTeamHub.announcements-parity.test.tsx`

**Interfaces:**
- Consumes: the existing `FairwayTeamHub` task, announcement, itinerary, class, and team props from the server page.
- Produces: `TabId = 'overview' | 'tasks' | 'announcements' | 'travel' | 'classes'`; no `teammates` tab; direct overview controls update the same local tab state.

- [ ] **Step 1: Write failing overview tests**

```tsx
it('opens on an operational overview with direct access to each team workflow', () => {
  render(<FairwayTeamHub {...fixture} />);

  expect(screen.getByRole('heading', { name: /team hub/i })).toBeVisible();
  expect(screen.getByRole('heading', { name: /tasks/i })).toBeVisible();
  expect(screen.getByRole('heading', { name: /announcements/i })).toBeVisible();
  expect(screen.getByRole('heading', { name: /travel/i })).toBeVisible();
  expect(screen.getByRole('heading', { name: /class schedule/i })).toBeVisible();
  expect(screen.queryByRole('tab', { name: /teammates/i })).not.toBeInTheDocument();
});

it('switches from an overview action to the corresponding detail tab', async () => {
  const user = userEvent.setup();
  render(<FairwayTeamHub {...fixture} />);

  await user.click(screen.getByRole('button', { name: /view all tasks/i }));
  expect(screen.getByRole('tab', { name: /^tasks$/i })).toHaveAttribute('aria-selected', 'true');
});
```

- [ ] **Step 2: Run the Team Hub tests to verify failure**

Run: `npm test -- --run src/components/fairway/pages/team-hub/FairwayTeamHub.logic.test.ts src/components/fairway/pages/team-hub/FairwayTeamHub.announcements-parity.test.tsx`

Expected: FAIL because the current default is Tasks and the Teammates tab exists.

- [ ] **Step 3: Add the minimal Overview panel using existing data**

```tsx
const [activeTab, setActiveTab] = useState<TabId>('overview');

{activeTab === 'overview' ? (
  <TeamOperationsOverview
    tasks={tasks}
    announcements={announcements}
    itineraries={itineraries}
    classes={classes}
    onOpenTab={setActiveTab}
  />
) : null}
```

Each overview card must render an honest empty/no-upcoming state from its existing array, and its action must call `onOpenTab('tasks' | 'announcements' | 'travel' | 'classes')`. Reuse existing Fairway cards/buttons and data display helpers. Do not move task completion or other mutation code out of its existing detailed view.

- [ ] **Step 4: Remove the redundant Teammates inner tab**

Keep teammate data only if a current overview card genuinely needs a small roster count; do not add a second player roster. The top-level **Roster** destination remains canonical.

- [ ] **Step 5: Run the focused Team Hub tests**

Run: `npm test -- --run src/components/fairway/pages/team-hub/FairwayTeamHub.logic.test.ts src/components/fairway/pages/team-hub/FairwayTeamHub.announcements-parity.test.tsx`

Expected: PASS and no existing announcement parity regression.

- [ ] **Step 6: Commit the independently testable Team Hub change**

```bash
git add src/components/fairway/pages/team-hub/FairwayTeamHub.tsx 'src/app/golf/(dashboard)/dashboard/team-hub/page.tsx' src/components/fairway/pages/team-hub/FairwayTeamHub.logic.test.ts src/components/fairway/pages/team-hub/FairwayTeamHub.announcements-parity.test.tsx
git commit -m "feat(golf): make team hub operational"
```

## Task 3: Center header search and make the active command palette dismissible

**Files:**
- Modify: `src/components/fairway/app-shell/FairwayTopBar.tsx`
- Modify: `src/components/fairway/app-shell/AppShell.tsx`
- Modify: `src/components/golf/CommandPalette.tsx`
- Test: `src/components/fairway/app-shell/FairwayTopBar.test.tsx`
- Create: `src/components/golf/CommandPalette.test.tsx`

**Interfaces:**
- Consumes: `collapsed` rail state in `AppShell` and `onSearchOpen` in `FairwayTopBar`.
- Produces: `--fw-rail-width` on the dashboard shell; a semantic dialog with a `Close command palette` button; desktop search in the center grid column.

- [ ] **Step 1: Write failing header and palette tests**

```tsx
it('keeps desktop search in a dedicated center region', () => {
  render(<FairwayTopBar {...fixture} />);
  expect(screen.getByRole('searchbox')).toHaveAttribute('data-layout-region', 'center');
});

it('closes the command palette with its visible close control', async () => {
  const user = userEvent.setup();
  render(<CommandPalette isCoach />);
  window.dispatchEvent(new Event('helm:open-command-palette'));

  await user.click(await screen.findByRole('button', { name: /close command palette/i }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('uses the dashboard rail CSS variable to center within content', async () => {
  render(<CommandPalette isCoach />);
  window.dispatchEvent(new Event('helm:open-command-palette'));

  expect(await screen.findByRole('dialog')).toHaveClass('left-[calc(50%+var(--fw-rail-width,0px)/2)]');
});
```

- [ ] **Step 2: Run those tests to verify failure**

Run: `npm test -- --run src/components/fairway/app-shell/FairwayTopBar.test.tsx src/components/golf/CommandPalette.test.tsx`

Expected: FAIL because header uses a trailing flex search region and the palette has no visible close control or rail-aware positioning.

- [ ] **Step 3: Implement the shell geometry and centered desktop header**

```tsx
<div
  className={cn('fairway-ds min-h-dvh', railClass)}
  style={{ '--fw-rail-width': collapsed ? '76px' : '260px' } as CSSProperties}
>
```

At the desktop breakpoint where actions and breadcrumbs have room, use a three-column CSS grid in `FairwayTopBar`: flexible breadcrumbs, fixed-width center search, flexible right-side actions. At narrower widths retain the existing responsive behavior rather than allowing a compressed overlap. Mark the search input/wrapper with `data-layout-region="center"` for the structural test.

- [ ] **Step 4: Implement a content-centered, vertically centered palette**

```tsx
<section
  role="dialog"
  aria-modal="true"
  aria-label="Command palette"
  className="fixed left-[calc(50%+var(--fw-rail-width,0px)/2)] top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 ..."
>
  <IconButton aria-label="Close command palette" onClick={closePalette} ... />
</section>
```

Keep Escape and backdrop close behavior. The visible control must be focusable, use an existing close icon/button idiom, and be outside any nested interactive element.

- [ ] **Step 5: Run the focused search/palette tests**

Run: `npm test -- --run src/components/fairway/app-shell/FairwayTopBar.test.tsx src/components/golf/CommandPalette.test.tsx`

Expected: PASS, including keyboard dismissal behavior.

- [ ] **Step 6: Commit the independently testable search change**

```bash
git add src/components/fairway/app-shell/FairwayTopBar.tsx src/components/fairway/app-shell/FairwayTopBar.test.tsx src/components/fairway/app-shell/AppShell.tsx src/components/golf/CommandPalette.tsx src/components/golf/CommandPalette.test.tsx
git commit -m "fix(golf): center and close command search"
```

## Task 4: Make team-stat signals explain eligibility and freshness without launcher overlap

**Files:**
- Modify: `src/app/golf/(dashboard)/dashboard/stats/team/page.tsx`
- Modify: `src/components/golf/stats/team-board/TeamStatsBoard.tsx`
- Modify: `src/components/golf/coachhelm/chat/CoachHelmDrawer.tsx`
- Test: `src/components/golf/stats/team-board/__tests__/buildTeamBoardViewModel.test.ts`
- Create or extend: `src/components/golf/stats/team-board/TeamStatsBoard.test.tsx`
- Create or extend: `src/components/golf/coachhelm/chat/CoachHelmDrawer.test.tsx`

**Interfaces:**
- Consumes: completed-round counts, the existing `TREND_SIGNAL_MIN_ROUNDS`, cache/standing/insight timestamps, and `usePathname()` in the client launcher.
- Produces: a page-level `freshness` value accepted by `TeamStatsBoard`, visible signal eligibility copy, and a page action linking to `/golf/dashboard/coachhelm/chat`.

- [ ] **Step 1: Write failing stats/UI tests**

```tsx
it('explains when a player needs more completed rounds for a trend', () => {
  render(<TeamStatsBoard {...fixtureWith({ roundsCompleted: 3, minRoundsForTrend: 8 })} />);
  expect(screen.getByText('5 rounds to trend')).toBeVisible();
  expect(screen.getByText(/trends begin after 8 completed rounds/i)).toBeVisible();
});

it('renders source freshness rather than claiming that snapshots are live', () => {
  render(<TeamStatsBoard {...fixtureWith({ freshnessLabel: 'Round data refreshed 3 min ago · insights as of 10:17 AM' })} />);
  expect(screen.getByText(/round data refreshed 3 min ago/i)).toBeVisible();
  expect(screen.queryByText(/^live$/i)).not.toBeInTheDocument();
});

it('does not render the fixed CoachHelm launcher on Team Stats', () => {
  mockPathname('/golf/dashboard/stats/team');
  render(<CoachHelmDrawer {...fixture} />);
  expect(screen.queryByRole('button', { name: /^ask coachhelm$/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/components/golf/stats/team-board/__tests__/buildTeamBoardViewModel.test.ts src/components/golf/stats/team-board/TeamStatsBoard.test.tsx src/components/golf/coachhelm/chat/CoachHelmDrawer.test.tsx`

Expected: FAIL because source freshness is not exposed and the fixed launcher remains mounted on Team Stats.

- [ ] **Step 3: Derive accurate freshness server-side**

Use the route’s existing `revalidate = 300` and the actual source timestamps already returned by standing/insight loaders. Construct copy from the oldest available source; if a snapshot timestamp is absent, say only `Round data refreshes within five minutes` and do not fabricate an as-of time. Pass a typed `freshness` object/label to `TeamStatsBoard`.

- [ ] **Step 4: Expose eligibility and replace the obstructing launcher access**

Render concise helper text tied to the board’s existing minimum-round calculation. Add a visible page action `<Link href="/golf/dashboard/coachhelm/chat">Ask CoachHelm</Link>` in the Team Stats header. In `CoachHelmDrawer`, use `usePathname()` to omit only the fixed trigger on `/golf/dashboard/stats/team`; do not disable the drawer/chat on other pages.

- [ ] **Step 5: Run focused stats and drawer tests**

Run: `npm test -- --run src/components/golf/stats/team-board/__tests__/buildTeamBoardViewModel.test.ts src/components/golf/stats/team-board/TeamStatsBoard.test.tsx src/components/golf/coachhelm/chat/CoachHelmDrawer.test.tsx src/app/golf/actions/__tests__/stats-data.test.ts`

Expected: PASS with the model’s existing thresholds unchanged and route-specific launcher behavior covered.

- [ ] **Step 6: Commit the independently testable team-stats change**

```bash
git add 'src/app/golf/(dashboard)/dashboard/stats/team/page.tsx' src/components/golf/stats/team-board/TeamStatsBoard.tsx src/components/golf/stats/team-board/__tests__/buildTeamBoardViewModel.test.ts src/components/golf/stats/team-board/TeamStatsBoard.test.tsx src/components/golf/coachhelm/chat/CoachHelmDrawer.tsx src/components/golf/coachhelm/chat/CoachHelmDrawer.test.tsx
git commit -m "fix(golf): clarify team signals and prevent overlap"
```

## Task 5: Apply the prepared course and qualifier repairs

**Files:**
- Integrate commits: `0ace5157c`, `f646e6b87`, `ecaa6d184`, `50e3aa575` only if not already contained by the branch base.
- Test: corresponding course action/drawer and qualifier unit/E2E suites.

**Interfaces:**
- Consumes: course action results, `CourseDetailDrawer` loading/error state, and qualifier create href.
- Produces: retryable course snapshot/error UI and working coach qualifier document navigation.

- [ ] **Step 1: Verify whether each prepared commit is already in `origin/main`**

Run: `git merge-base --is-ancestor <commit> HEAD; echo $?` for each commit.

Expected: the commits have been squash-merged as `e7a354eff`; no duplicate cherry-pick is required.

- [ ] **Step 2: Run focused course and qualifier regressions**

Run: `npm test -- --run src/app/golf/actions/__tests__/courses.test.ts src/components/golf/courses/CourseDetailDrawer.test.tsx src/components/fairway/pages/qualifiers/FairwayQualifiers.test.tsx`

Run: `npx playwright test e2e/golf-qualifier.spec.ts`

Expected: fatal course-read errors render a retry state, supplementary reads do not destroy a valid snapshot, and clicking Create qualifier lands on its builder.

- [ ] **Step 3: Commit only if branch base lacks a prepared repair**

```bash
git add <only-files-missing-from-origin-main>
git commit -m "fix(golf): restore course and qualifier flows"
```

Otherwise record that `origin/main` already contains the changes and make no duplicate commit.

## Task 6: Triage the incident export with evidence, not speculative fixes

**Files:**
- Read: `/Users/ricknini/.codex/attachments/60912222-522d-45d9-bee0-9fa469e31714/pasted-text.txt`
- Test/modify conditionally: `src/lib/__tests__/server-error-logger-bridge.test.ts`, `src/lib/server-error-logger.ts`
- Investigate: `src/components/fairway/pages/coachhelm/GenomeDetailView.tsx`, `src/app/golf/(dashboard)/dashboard/players/[playerId]/game/PlayerDeepDiveTabs.tsx`, `src/components/fairway/pages/coachhelm/FairwayPlayerInsight.tsx`
- Test: existing Genome/DeepDive component tests and a targeted incident-reproduction test only when the failing render path is isolated.

**Interfaces:**
- Consumes: incident stack/fingerprint data and existing runtime error serializer.
- Produces: a written incident disposition and, only where a red test proves it, the smallest source repair.

- [ ] **Step 1: Classify every incident by evidence**

Create a checked matrix in the implementation PR description or final delivery note: fixed by source, needs a reproducible source fix, production configuration, intentional fallback, or monitor. Keep the Inngest signing mismatch distinct from code behavior.

- [ ] **Step 2: Write a failing serializer test only for the reproducible bridge error**

```ts
it('preserves an Error message when bridge logging is disabled', () => {
  expect(describeError(new Error('database unavailable'))).toContain('database unavailable');
});
```

Run: `npm test -- --run src/lib/__tests__/server-error-logger-bridge.test.ts src/test/lib/server-error-logger.test.ts`

Expected: fail only if the current implementation loses the Error message. If it passes, make no source change and classify #1 as already protected/not reproduced.

- [ ] **Step 3: Use systematic debugging for the hook-order incidents**

First establish a reproduction or source-mapped stack using the exact affected routes and user role. Trace every hook in `GenomeDetailView`, `PlayerDeepDiveTabs`, and `FairwayPlayerInsight`; compare conditional returns and conditional hook calls across loading/error/data states. Add a regression test for the first proven divergent render path before changing source. Do not alter hook order merely because a minified #310 incident exists.

- [ ] **Step 4: Fix only a proved defect and run its focused suite**

Run the exact component test plus `npm run typecheck` after any code repair. If no source reproduction is established, leave code unchanged and report the evidence needed to continue.

- [ ] **Step 5: Commit only a proved incident repair**

```bash
git add src/lib/server-error-logger.ts src/lib/__tests__/server-error-logger-bridge.test.ts <proved-hook-files-and-tests>
git commit -m "fix(golf): preserve actionable error diagnostics"
```

Do not commit an incident-classification note as a code-only change.

## Task 7: Repair the feature-aware routing map and verify end-to-end

**Files:**
- Modify: `memory/registry.yml`
- Modify: `memory/context/golfhelm-features.md`
- Validate: all touched component/action tests and `e2e/golf-qualifier.spec.ts`

**Interfaces:**
- Consumes: path mappings in `memory/registry.yml`.
- Produces: `dashboard/team-hub/**` maps to the team operations/roster feature documentation; feature docs describe the current UI behavior.

- [ ] **Step 1: Write the feature map update**

Replace or augment the stale team-operations `dashboard/hub/**` mapping with `src/app/golf/(dashboard)/dashboard/team-hub/**` and `src/components/fairway/pages/team-hub/**`. Preserve all existing map entries for the retired redirect route if it remains intentionally documented.

- [ ] **Step 2: Verify the map reports the changed Team Hub files**

Run: `npm run knowledge:map -- --files 'src/app/golf/(dashboard)/dashboard/team-hub/page.tsx' src/components/fairway/pages/team-hub/FairwayTeamHub.tsx`

Expected: a team operations/roster feature appears, replacing the previously reported feature-awareness gap.

- [ ] **Step 3: Run the complete focused verification set**

Run:

```bash
npm test -- --run \
  src/lib/golf/nav-registry.test.ts \
  src/components/fairway/pages/team-hub/FairwayTeamHub.logic.test.ts \
  src/components/fairway/pages/team-hub/FairwayTeamHub.announcements-parity.test.tsx \
  src/components/fairway/app-shell/FairwayTopBar.test.tsx \
  src/components/golf/CommandPalette.test.tsx \
  src/components/golf/stats/team-board/__tests__/buildTeamBoardViewModel.test.ts \
  src/components/golf/stats/team-board/TeamStatsBoard.test.tsx \
  src/components/golf/coachhelm/chat/CoachHelmDrawer.test.tsx
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits 0. If `npm run build` fails outside changed scope, capture the exact failure and do not present it as green.

- [ ] **Step 4: Run browser verification at desktop width**

With the authenticated Golf account, verify:

1. Course click opens a populated snapshot or clear retry/error state, never a blank permanent loader.
2. Player Team lands on Team Hub and shows tabs in the approved order.
3. Team Hub overview shows real operational cards and their controls open detail tabs.
4. Coach Team Stats exposes threshold/freshness context and has no fixed launcher overlap with rightmost signal chips.
5. Header search and command palette are centered in the dashboard content region; Close visibly dismisses the palette.
6. Coach Create qualifier opens the builder.

- [ ] **Step 5: Commit map/docs and final integration**

```bash
git add memory/registry.yml memory/context/golfhelm-features.md docs/superpowers/specs/2026-08-18-golf-team-operations-design.md docs/superpowers/plans/2026-08-18-golf-team-operations.md
git commit -m "docs(golf): map team operations behavior"
```

## Self-review

| Approved requirement | Plan coverage |
| --- | --- |
| Player Team order: Hub, Qualifiers, Roster, Info | Task 1 |
| Better, visible player Team operations | Task 2 |
| Signal threshold, freshness, and overflow | Task 4 |
| Centered search and explicit exit | Task 3 |
| Course click blank screen | Task 5 |
| Qualifier navigation | Task 5 |
| Incident report disposition/fixes | Task 6 |
| Feature mapping/docs | Tasks 1 and 7 |
| No Baseball work | Global constraints |

Placeholder scan: no unresolved implementation placeholders remain. Conditional incident work is deliberately bounded by a red test/reproduction, preventing speculative source changes.
