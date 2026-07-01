# Fairway UI Migration Plan — BaseballHelm

> **Status:** PLAN / NOT STARTED. Authored 2026-06-30.
> **Companion docs:** `docs/audits/HELMV3_STATE_SYNTHESIS_2026-06-30.md` (current state + OLD→NEW route map, §6),
> `docs/audits/BASEBALLHELM_SHELL_ROUTE_POSTMORTEM_2026-06-30.md` (why the last build drifted),
> `docs/audits/HELMV3_ISSUE_LEDGER_2026-06-30.md` (validated open-issue set).

---

## 0. TL;DR

Migrate BaseballHelm's bespoke shell + pages onto the existing **Fairway design system** (`src/components/fairway/*`, already stable on `main`). **Do not start the full migration yet** — two preconditions first (§2). When it does start, copy the **proven golf playbook**: adopt the Fairway `AppShell` behind a feature flag, keep all data/providers verbatim, and migrate **one surface per small PR**. The hard rule, learned the expensive way: **no mega-PRs.** PR #344 (1,009 files / +223K lines) bundling new+old surfaces past review is exactly what produced the shell/route drift we are now cleaning up.

---

## 1. Why a plan (not just "go")

The last BaseballHelm build campaign created duplicate/competing surfaces (old dashboard + new Command Center, legacy nav arrays + nav registry, `baseball_lift_*` + `helm_lifting_*`) because huge, unreviewable PRs merged new and old code atomically. A UI migration is *intrinsically* large and cross-cutting — the highest-risk shape for repeating that mistake. This plan exists to force the migration into **small, isolated, reversible** units and to point every change at **one** canonical surface set.

---

## 2. Precondition — a CLEAN SLATE first (DO NOT START the migration until this is met)

**Decision (repo owner, 2026-06-30): all feature work and all real issues are fixed BEFORE the Fairway migration begins, so the migration starts from a clean slate.** Rationale: migrating UI on top of unfinished features and a live bug backlog means every fix afterward re-touches Fairway-migrated files, re-introduces conflicts, and re-opens the door to old/new drift. Finish the product logic first; restyle once.

The clean slate = all four of:

1. **PR #421 is merged.** It rewrites ~255 files across `src/app/baseball` + `src/components/baseball` — the exact files a UI migration touches. It also closes ~50 issues. Starting the migration in parallel guarantees massive conflicts. Wait for it.
2. **All verified-real open issues are fixed.** Per `docs/audits/HELMV3_ISSUE_LEDGER_2026-06-30.md`: the `CONFIRMED_OPEN` set is resolved, `FALSE_POSITIVE`/`DUPLICATE`/already-fixed issues are closed, and the tracker reflects reality. (Verification of all 145 is in progress; the ledger is the source of truth for "what's actually left.")
3. **Feature work is complete.** No half-built surfaces, no "writes to one table, reads from another" splits (e.g. the Lift Lab `baseball_lift_*` ↔ `helm_lifting_*` split, issue #486) — the coach→athlete and stats read/write loops work end-to-end.
4. **Canonical surfaces are locked.** `sidebar.tsx` legacy fallback nav arrays deleted (#383), dead/duplicate routes removed or confirmed-as-redirect-stubs, OLD→NEW map (§5) ratified. The migration must have **one** target per surface.
5. **Net-new defects swept.** The auto-filed 145-issue backlog is known-incomplete — real bugs exist that were never filed (e.g. the `focus-imports.ts` wrong-columns Decision Room crash). After items 1–3 settle the codebase, run **one comprehensive, verified bug-discovery sweep against the stable post-#421 tree** (not another 90-second auto-burst like #424) and fix its real findings. Deferred deliberately so findings aren't filed against soon-rewritten code.

**What is safe to do now (zero conflict):** this document and any further read-only mapping. Hold all migration code — even a pilot — until the clean slate is reached.

---

## 3. The proven playbook to copy (golf already did this)

Reference: `src/app/golf/(dashboard)/FairwayDashboardShell.tsx`. Golf adopted Fairway with these exact moves — replicate them for baseball:

1. **Flag-gate the shell swap.** Golf mounts `FairwayDashboardShell` only behind `isRedesignEnabled()` (`FAIRWAY_SCOPE` in `src/lib/redesign/flag.ts`); flag OFF renders the legacy shell byte-for-byte. → Build a `BaseballFairwayShell` gated the same way. The whole migration ships dark and is reversible at any moment.
2. **Keep the provider stack verbatim.** Golf's Fairway shell mirrors the legacy provider stack exactly (sidebar context, user context, notification badges, offline, presence) and only swaps the *visual* frame. → Baseball keeps `useBaseballAuth`, its shell context, notification/badge providers, etc. unchanged. **UI in, logic frozen.**
3. **Render `AppShell` with data, not hardcoded nav.** `<AppShell>` takes `NavSection[]`, `Breadcrumb[]`, `ShellUser`, and a `linkComponent` (inject `next/link`). → Feed it nav built from the **#383 nav-manifest** (single source of truth, capability-gated). No new hardcoded nav arrays.
4. **Bridge the mobile drawer.** Golf bridges `AppShell`'s `mobileOpen` to the existing `SidebarContext` so a not-yet-migrated page's own menu button opens the *same* drawer — "one nav surface, no dead buttons, no double drawers." → Do the identical bridge for baseball's shell context. This is what makes incremental page migration safe.
5. **Migrate pages one at a time, behind the flag.** With the shell adopted, each page swaps its bespoke components for Fairway ones independently. Unmigrated pages still render correctly inside the new frame.

---

## 4. Fairway component inventory (what you migrate ONTO)

On `main`, `src/components/fairway/*` provides (file counts):

| Group | Files | Use for |
|---|---:|---|
| `app-shell` | 8 | `AppShell`, `FairwaySidebar`, `FairwayTopBar`, `FairwayBottomNav`, `RouteTransition`, `PageContainer` — the structural frame |
| `pages` | 164 | Golf reference page templates — **pattern reference only**, not drop-in for baseball |
| `charts` | 23 | stats, performance, readiness, season trends |
| `controls` | 14 | buttons, toggles, selectors, segmented controls |
| `forms` | 12 | settings, onboarding, import, academics, profile editors |
| `cards-insight` | 9 | Command Center, CoachHelm insights, decision-room |
| `feedback` | 9 | empty states, toasts, loading/skeletons, error states |
| `overlays` | 6 | modals, drawers, sheets |
| `data-table` | 6 | roster, pipeline, box scores, watchlists |
| `instrument` | 5 | dense metric instruments (dials/gauges) for stats & lift |
| `command` | 5 | command palette |
| `calendar` | 5 | calendar/events |
| `surfaces` | 4 | glass panels / containers |
| `view-header` | 3 | page headers / breadcrumb trails |

**Rule:** import these; never copy them into `src/components/baseball/`. If a baseball variant is needed, extend via props.

---

## 5. OLD → NEW surface adoption map

Canonical baseball surfaces to migrate, and the Fairway primitives they map onto. (Canonical/legacy status per state-synthesis §6.)

### Migrate (canonical surfaces)

| Baseball surface (canonical) | Current impl | Fairway target |
|---|---|---|
| **Shell / nav** — `BaseballShellLayout` / `BaseballDashboardShell` + `sidebar.tsx` | bespoke sidebar | `AppShell` + `FairwaySidebar`/`TopBar`/`BottomNav`; nav from #383 manifest |
| **Command Center** (`(dashboard)/dashboard/command-center`) | bespoke cards | `cards-insight` + `charts` + `surfaces` |
| **Player Today** (`/baseball/player/today`) | bespoke | `cards-insight` + `feedback` + one primary CTA (issue #484) |
| **Players / passport / scout-packet / profile** (`players/[id]/*`) | bespoke | `view-header` + `data-table` + `cards-insight` |
| **Performance** (coach lift authoring: `performance/{live,players,programs,builder,groups}`) | bespoke | `forms` + `data-table` + `instrument` |
| **Lift / readiness / my-stats** (player) | bespoke | `charts` + `instrument` + `cards-insight` |
| **Decision Room / postgame / practice-effectiveness** (CoachHelm) | bespoke | `cards-insight` + `feedback` |
| **Calendar / events** | bespoke | `calendar` |
| **Messages** | bespoke | `overlays` + `feedback` |
| **Roster / pipeline / watchlists / discover / colleges** | bespoke | `data-table` + `cards-insight` |
| **Academics / documents / announcements / travel / camps** | bespoke | `forms` + `data-table` + `cards-insight` |
| **Settings/** | bespoke | `forms` + `controls` |
| **Auth** (`(auth)/*`) | bespoke | `forms` (separate, lowest priority) |

### Do NOT migrate (legacy — delete or leave as redirect)

| Legacy surface | Status | Action |
|---|---|---|
| `(coach-dashboard)/coach/{college,high-school,juco,showcase}` | redirect stubs | leave as redirect; never build a Fairway version |
| `(player-dashboard)/player/{...}` | redirect stubs | leave as redirect |
| `(dashboard)/dashboard/page.tsx` (old read-model) | redirects to command-center | leave as redirect |
| `dashboard/team`, `team/high-school` | dead (middleware-intercepted) | delete during precondition-2 cleanup |
| `sidebar.tsx` legacy nav arrays | live capability bug (#383) | **delete** (replaced by manifest-driven `FairwaySidebar`) |

---

## 6. Agent brief — paste this to any migration agent

> 1. **Scope = presentation only.** Swap shell, components, styling. **Do not touch** server actions, read-models, RLS, migrations, or data paths — those carry the #421/#423 fixes. UI in, logic frozen.
> 2. **Base off `main` AFTER #421 merges** (or rebase onto it). Never branch from a stale snapshot. One owner for the base.
> 3. **Migrate only canonical surfaces** (per §5). Legacy/redirect-stub routes: leave as redirects or delete — **never build a Fairway version of an old surface.**
> 4. **Hard size cap: one surface per PR, ≤ ~400 lines / ≤ ~15 files.** No mega-PRs, no squash-snapshot dumps. Each PR independently reviewable and revertible.
> 5. **Reuse, don't fork.** Import from `src/components/fairway/*`; never copy Fairway components into `src/components/baseball/` (that recreates the dual-component problem — e.g. the two `ProgramEditorClient`s). Extend via props if a baseball variant is needed.
> 6. **Nav reads the #383 manifest.** The Fairway sidebar sources nav from the manifest, capability-gated. No new hardcoded nav arrays, no fallback path.
> 7. **Flag-gate everything.** Follow `FairwayDashboardShell`'s pattern: mount behind the redesign flag, legacy shell stays the OFF path, bridge the mobile drawer to baseball's shell context. Migration ships dark and reversible.
> 8. **No reverted WIP.** Build on the stable Fairway `app-shell` only; do **not** resurrect the reverted "Fairway stats cockpit / first-class IA" Cursor experiment.
> 9. **Every PR green** on typecheck + lint-ratchet + baseball smoke tests + visual parity check. No direct-to-`main` pushes.
> 10. **Don't touch files owned by open work** (#421, #423, test-hardening stack, batch12). Check `git log -5 -- <file>` before editing.

---

## 7. Migration sequence (phased, each phase = small PRs)

- **Phase 0 — Prep (safe now):** this doc; ratify the §5 map; confirm the #383 manifest exposes everything the sidebar needs.
- **Phase A — Shell adoption (1 PR, behind flag):** build `BaseballFairwayShell` (mirror `FairwayDashboardShell`): `AppShell` + manifest-driven nav + provider stack verbatim + drawer bridge, mounted behind the redesign flag. Flag OFF = current shell unchanged. Nothing user-visible yet.
- **Phase B — Leaf pages in waves (many small PRs):** migrate page-by-page to Fairway components, in dependency order — high-traffic canonical surfaces first (Command Center, Player Today, Roster, Players profile), then long-tail. One surface per PR. Coach and player surfaces separately.
- **Phase C — Cutover + cleanup:** once all canonical surfaces are migrated and verified, flip the flag ON by default, then delete the legacy baseball shell components and any remaining dead routes. Final PR removes the flag.

---

## 8. Guardrails / do-nots (summary)

- ❌ No PR over ~15 files / ~400 lines. ❌ No squash-snapshot commits. ❌ No new nav arrays. ❌ No copying Fairway components into baseball. ❌ No logic/RLS/migration changes inside a UI PR. ❌ No direct-to-`main`. ❌ No resurrecting reverted Fairway cockpit WIP. ❌ No starting before #421 merges.
- ✅ Flag-gated. ✅ One surface per PR. ✅ Providers verbatim. ✅ Nav from manifest. ✅ Reuse Fairway primitives. ✅ Green CI + visual parity per PR.
