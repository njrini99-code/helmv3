## Recruiting HQ [coach]

End-to-end audit of the Recruiting HQ tab — coach prospect tracker (board) plus
per-recruit documents (private storage bucket). Audited 2026-06-20.

### Routes audited
- `/golf/dashboard/recruiting` (page: `src/app/golf/(dashboard)/dashboard/recruiting/page.tsx`)

### How it is actually wired (end-to-end)

**Route / role gate.**
`page.tsx` is a server component, `export const dynamic = 'force-dynamic'`
(so the active-team cookie is honored per request). It resolves the session with
`getGolfSessionProfile()` (`src/lib/auth/session.ts:142`). Unauthenticated →
`redirect('/golf/login')` (`page.tsx:24`). Non-coach (`session.role !== 'coach'`
or no `session.coach`) → `redirect('/golf/dashboard')` (`page.tsx:25-28`). The
nav entry "Recruiting HQ" (`FairwayDashboardShell.tsx:127`) lives inside the
`if (role === 'coach')` block (`:96`), so the tab is also nav-gated — but the page
enforces its own gate regardless. Good defense-in-depth.

**Initial data.**
`page.tsx:30` calls `getRecruits()` (`src/app/golf/actions/recruiting.ts:124`).
That action → `resolveCoachAndTeam()` (`:101`) which: `auth.getUser()` →
`golf_coaches` by `user_id` → `resolveCoachTeamIdWithCookie()`
(`src/lib/golf/resolve-team-server.ts:35`, reads `golf_active_team` cookie) →
`golf_recruits.select('*').eq('team_id', teamId).order('updated_at', desc)`
(`:129-133`). Result passed as `initialRecruits` to the renderer.

**Renderer (flag fork).**
`NEXT_PUBLIC_REDESIGN=true` (`.env.local:45`) → `isRedesignEnabled()` true →
`FairwayRecruitingPage` (`src/components/fairway/pages/recruiting/FairwayRecruitingPage.tsx`).
Flag-off → legacy `RecruitingPageClient`
(`src/components/golf/recruiting/RecruitingPageClient.tsx`). Both are
functionally equivalent (derivation logic ported byte-for-byte) — only chrome
differs. The live (prod) path is Fairway.

**Board interactions (all wired).**
- 4 status filter plates (`FairwayRecruitingPage.tsx:147-177`) — `onClick` toggles
  `filter`. Counts derived client-side from `recruits` (`:62-72`).
- Search input (`:183-189`) — filters name/hometown/state/email/notes (`:74-87`).
- All-pill (`:192-199`) + sort Segmented updated/name/class (`:200-206`, sort at
  `:89-100`). `class` sort uses `?? 9999` so null-class sinks to the bottom — correct.
- "Add prospect" / "Add your first prospect" (`:134`, `:225`) → opens form sheet in
  create mode.
- Recruit cards (`FairwayRecruitCard.tsx:37`) → opens form sheet in edit mode.
- Empty state (`:212-231`): `variant='search'` when filtered, `'default'` otherwise,
  with primary CTA only on the truly-empty case. Loading uses `aria-busy={isPending}`
  on the grid during `router.refresh()`.

**Mutations.**
`FairwayRecruitFormSheet.tsx` calls `createRecruit` / `updateRecruit` /
`deleteRecruit` (`recruiting.ts:154/205/257`). All three: `auth.getUser()` →
coach+team resolve → write scoped by `.eq('team_id', ctx.teamId)` → `revalidatePath
('/golf/dashboard/recruiting')`. After save/delete the client calls
`onSaved()` → `router.refresh()` (server-truth refetch; no mutable local array).
`createRecruit` validates first_name required + per-field length + hs_class range
(`validateRecruitInput`, `:69-99`) — matching the DB CHECK constraints
(`golf_recruits_lengths`, `golf_recruits_status_check`) and the form's client clamps.

**Documents (per-recruit shelf).**
`FairwayRecruitDocuments` (`FairwayRecruitDocuments.tsx`) mounts inside the edit
drawer only (`FairwayRecruitFormSheet.tsx:283-287`, gated on `isEditing && recruit`).
On mount it `getRecruitDocuments(recruitId)` (`recruit-documents.ts:86`). Add flow:
pick file → stage (title/category) → `uploadRecruitDocument(recruitId, file, {title,
category})` (`:126`). The action derives `team_id` from the recruit's own row
(`:153-162`, never the cookie), uploads to private bucket `recruit-documents` at
`{teamId}/{recruitId}/{uuid}.ext` (`:163-167`), inserts `golf_recruit_documents`
(`:180-194`), and on insert failure rolls back the orphaned storage object
(`:197-204`). Download → `getRecruitDocumentUrl` returns a 1h signed URL (private
bucket, `:294-324`) → `openExternalUrl`. Delete → row-first then storage purge
(`:230-288`). `deleteRecruit` also collects + purges all doc storage paths before
deleting the recruit (`recruiting.ts:264-300`) since storage isn't FK-cascaded.

**Schema / RLS (verified against migrations).**
- `golf_recruits` (prod baseline `20260527000000:10506`): correct sport-prefixed
  columns; RLS `*_select/insert/update/delete_coach` all `is_golf_team_coach(team_id)`
  (`:19469-19481`) — no player policy. Indexes on `(team_id, status)` and
  `(team_id, hs_class)`.
- `golf_recruit_documents` (`20260614020000_recruit_documents.sql`): coach-only RLS
  (no player policy, `:81-100`), same-team trigger (`:41-62`), private bucket with
  25 MB `file_size_limit` + MIME allowlist (`:103-124`), 4 team-scoped storage.objects
  policies keyed on `foldername[1] = teamId` (`:128-162`).
- `is_golf_team_coach` (`:3953`) checks `golf_team_coach_staff` membership by
  `auth.uid()`, so head + assistant staff both pass — consistent with team resolution.

### Expected vs actual

There is **no Recruiting HQ section in `memory/context/golfhelm-features.md`** — the
doc enumerates features 1–28 ending at Admin Dashboard, and `golf_recruits` post-dates
it (migration 2026-04-29; docs predate it). So the "expected behavior" comparison is
made against the feature's own design docstrings (`recruiting.ts`,
`recruit-documents.ts`, migration headers) and codebase project-truth rules. Against
those: role-gating, RLS, sport-prefixed tables, auth-first server actions,
revalidatePath, no destructive delete-then-insert, signed-URL private downloads, and
storage-orphan cleanup are all implemented correctly. The one place actual diverges
from the documented design is the document upload size: the action + bucket advertise
25 MB but Next.js Server Actions cap the request body at 2 MB (see findings).

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| HIGH | incomplete-feature | src/app/golf/actions/recruit-documents.ts:24,126-167 + next.config.mjs:87-89 | `uploadRecruitDocument` receives the `File` as a Server Action argument, but `next.config.mjs` sets `serverActions.bodySizeLimit: '2mb'`. The action allows up to 25 MB (`MAX_FILE_BYTES`) and the bucket `file_size_limit` is also 25 MB, so any document between 2 MB and 25 MB is rejected by Next.js **before** the action runs — the action's own size check (`:133`) never executes. | Film/transcripts/large PDFs (the headline recruiting use case) fail. The client throws on the framework error and shows the generic "Upload failed / Try again in a moment" toast (`FairwayRecruitDocuments.tsx:127`), giving no hint that the file is too big. Effectively the 25 MB cap is fiction; the real cap is ~2 MB. | Either raise `serverActions.bodySizeLimit` to `'25mb'` (and confirm Vercel function body limits), or move uploads to a direct client-side `supabase.storage.from('recruit-documents').upload()` (RLS already gates the bucket) + a thin metadata-insert action, bypassing the Server Action body cap. Lower the client/action `MAX_FILE_BYTES` to match whatever real limit ships, and surface a clear "max N MB" message. |
| MEDIUM | ux-gap | src/components/fairway/pages/recruiting/FairwayRecruitDocuments.tsx:138-141 (also legacy src/components/golf/recruiting/RecruitDocuments.tsx:138-141) | `handleDownload` awaits `getRecruitDocumentUrl(doc.id)` and then calls `openExternalUrl(res.data.url)` → `window.open(url, '_blank')` (capacitor.ts:50). The `window.open` happens after an async gap, so it is no longer inside the user-gesture context — Safari (and strict popup blockers) will block the new tab. | On web Safari, "Open" on a recruit document can silently fail to open the file (popup blocked); no error toast fires because the action succeeded. Native iOS is fine (Browser.open). | Open a blank tab synchronously on click (`const w = window.open('', '_blank')`), then set `w.location = url` once the signed URL resolves; or render an `<a download href>` after fetching; keep the Capacitor `Browser.open` path for native. |
| LOW | revalidation | src/app/golf/actions/recruit-documents.ts:218,279 | `uploadRecruitDocument` / `deleteRecruitDocument` call `revalidatePath('/golf/dashboard/recruiting')`, but the document panel is a client component that re-fetches via `getRecruitDocuments` + local `load()` (FairwayRecruitDocuments.tsx:125,158). The revalidate has no observable effect (the page's recruit list doesn't show doc counts), so it is dead work. | None functional — purely a redundant revalidate. Worth noting in case a future "doc count" badge on the card relies on it (it would still be stale until the drawer re-fetches). | Harmless; leave it, or drop the revalidate from the two doc-mutation actions. If a per-recruit doc count is ever shown on the card, switch to refetching the recruit list instead. |
| INFO | dead-control | src/components/golf/recruiting/RecruitingPageClient.tsx (legacy, flag-off only) | Legacy path is fully wired and equivalent; not the live render path (NEXT_PUBLIC_REDESIGN=true). Documented for completeness — both paths import the same actions and the same `RecruitDocuments`, so the HIGH/MEDIUM findings above apply to the legacy path too (legacy RecruitDocuments.tsx:141 same popup issue, same 2 MB cap). | None — flag-off only. | n/a |

### Notes on what is correctly wired (no finding)
- Role gate: page redirects players; nav entry coach-only. No cross-role leak.
- Auth: every server action calls `auth.getUser()` before any read/write.
- Tables sport-prefixed (`golf_recruits`, `golf_recruit_documents`); columns match
  the migration. RLS coach-only on both tables + storage objects; no anon/over-broad
  grants in the recruit migrations.
- No destructive delete-then-insert in any save path. `updateRecruit` is a real
  `.update(patch)`. Recruit delete is a true delete (intended), with pre-collected
  storage-path purge to avoid orphans.
- Single non-paginated query for recruits — acceptable: one team's prospect list is
  small and team-scoped; no shots/holes 1000-row-cap concern here.
- Document upload: MIME allowlist enforced even when `file.type` is empty
  (extension fallback, `:140-144`); orphan rollback on insert failure; private bucket;
  signed-URL (never public) downloads.
- States: loading skeletons (not bare spinners), honest empty states (filtered vs
  empty), inline error notice on load failure, per-row busy state on doc actions,
  two-step confirm on both recruit-remove and doc-delete.
