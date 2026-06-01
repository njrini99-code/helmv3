# Fairway redesign plan — Recruiting HQ

_Status: PLAN ONLY (not built). Locked 2026-05-31._
_Source: read-only architecture+UX survey._

## TL;DR

Recruiting HQ is a **real, fully-wired, golf-only, coach-only** prospect tracker — NOT a
stub, and completely separate from the larger Baseball recruiting system (no shared code).
It is the **smallest coach feature in the app**: 5 source files (~1,070 lines), one table
(`golf_recruits`), one action file. A Fairway redesign here is **low-risk, low-effort,
backend zero-change** — comparable in size to the existing FairwayCoachRoster pair. Worth
doing to remove a legacy surface, but correctly low priority given how small it is.

Pipeline has **4 statuses** (golf): `watched · recruiting · offered · committed`. (Do NOT
conflate with baseball's 5.)

## The page (single-page, no tabs / sub-routes / detail page)

`recruiting/page.tsx` — coach-gated, `LargeTitleHeader` "Recruiting HQ", renders
`RecruitingPageClient`. `revalidate = 60`.

1. **Funnel snapshot strip** — 4 stat plates (one per status) w/ count; clicking toggles a
   status filter.
2. **Toolbar** — free-text search (name/hometown/state/email/notes), "All (n)" reset, sort
   select (Recently updated / Name A–Z / Class year), "Add prospect" button.
3. **Card grid** — responsive 1/2/3-col `RecruitCard`s; click → edit drawer.
4. **Empty states** — "No prospects match" (filtered) vs "Start your prospect list" (empty).
5. **Add/Edit drawer** (`RecruitFormSheet`, vaul) — status picker, first/last name, HS class,
   hometown, 2-char state, email, phone, notes; footer Cancel/Save + two-step inline
   Remove→Confirm delete (edit mode).

## Component inventory (`src/components/golf/recruiting/`)

| File | Role | Lines |
|---|---|---|
| `RecruitingPageClient.tsx` | Orchestrator: filter/search/sort/counts/grid/empty + hosts sheet | 280 |
| `RecruitCard.tsx` | Read-only prospect card | 118 |
| `RecruitStatusChip.tsx` | `RECRUIT_STATUSES` source of truth + StatusPill wrapper | 111 |
| `RecruitFormSheet.tsx` | Add/edit drawer; create/update/delete; toasts | 398 |
| `page.tsx` / `error.tsx` / `loading.tsx` | Route entry + boundaries | 44 + |

## Data + actions (reuse VERBATIM)

- **Table `golf_recruits`** — `id, team_id, created_by, first_name, last_name, hs_class,
  email, phone, hometown, state, notes, status, created_at, updated_at`. RLS gated on
  `is_golf_team_coach(team_id)`.
- **Actions** `src/app/golf/actions/recruiting.ts`: `getRecruits`, `createRecruit`,
  `updateRecruit`, `deleteRecruit`, all via `resolveCoachAndTeam`. **Destructive-write
  check: CLEAN** — pure insert / true UPDATE / explicit single-row delete behind confirm.
- Types `Recruit`/`RecruitInput`/`RecruitStatus` + `RECRUIT_STATUSES` array — port values,
  restyle rendering.
- **State model**: server-truth + `router.refresh()` after save (no mutable local array).
  Filter/search/sort are client-side `useMemo` over the fetched list. Keep as-is.

## Phasing

- **Phase 0 (prep, optional, anytime):** drop the now-stale `(supabase as any)` casts in
  `recruiting.ts` (types exist at `database.ts:8881`); add a minimal action/RLS test
  (recruiting has ZERO tests today).
- **Phase 1:** `FairwayRecruitCard` + `FairwayRecruitingPage` (funnel→filter-pill, toolbar,
  grid, empty). Reuse the ported derivation logic byte-for-byte. Add the flag branch in
  `page.tsx` (pattern: `roster/page.tsx`).
- **Phase 2:** `FairwayRecruitFormSheet` on `fairway/overlays` + `fairway/forms` — the only
  write surface. Wire create/update/delete unchanged. Faithfully reproduce the two-step
  delete, the upper-cased 2-char state field, and the `hs_class` number coercion.
- **Phase 3:** visual pass + a Fairway render/interaction test.

## Reuse map / risks

- Map legacy per-status tones (amber/primary/violet/blue) → Fairway `FwStatusTone`.
- Align the `hs_class` validation mismatch (form 2024–2032 vs server 2020–2040) during the
  rebuild — harmless today.
- Backend is **zero-change**. ~4 new Fairway files (~500–650 lines) + ~15-line flag branch.

## Recommendation

A single focused session/PR (Phases 1–2) closes it; Phase 0 cleanup + Phase 3 tests are
small adjacent commits. Lowest-risk of the remaining redesigns.
