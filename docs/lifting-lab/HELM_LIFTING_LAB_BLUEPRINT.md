# Helm Lifting Lab — Implementation Blueprint

> **Status:** DESIGN ONLY. No product code written, no migrations applied.
> **Author:** lift-lab-architect (design wave)
> **Date:** 2026-06-24
> **Decision:** UNIFY NOW — one cohesive `helm_lifting_*` lifting model (Option C),
> approved by the product owner. Baseball's existing lifting data is **copied** into it via
> an additive backfill, the baseball performance dashboard is **rewired** to the unified
> model, and `baseball_lift_*` is kept intact as read-only legacy.
> **Hard constraint:** the Supabase DB is SHARED with GolfHelm **production**. Every schema
> change is **purely additive** — NEW `helm_lifting_*` tables only, ZERO `ALTER`/`DROP` of
> any existing `golf_*` or `baseball_*` object. The backfill is a COPY (never a move). The
> single shared function (`handle_new_user`) is left **untouched** (§1.7 + §9).

---

## 0. Executive summary

The **Helm Lifting Lab** is a **Helm-level, cross-sport, org-scoped** strength &
conditioning portal at `/lifting`, mounted alongside `/golf` and `/baseball`. A lifting
coach is a portable identity tied to ONE organization, covering ALL its teams across
sports.

Three codebase facts shape the design:

1. **`organizations` is the shared cross-sport root.** Both `golf_teams.organization_id`
   and `baseball_teams.organization_id` FK to `public.organizations`
   (`src/lib/types/database.ts:16653` org def; `golf_teams.organization_id` ~db.ts L2/L62;
   `baseball_teams.organization_id` ~db.ts L1459). Golf + baseball coaches both root at
   `organizations.id`. The `golf_coaches → golf_organizations` FK was **dropped in prod**;
   golf uses the shared `organizations` table (`src/app/golf/actions/onboarding.ts:112-129`).
   **A lifting coach is correctly scoped to `organizations.id`.**

2. **Baseball already has a complete, premium V11 lifting model (26 tables)** —
   `baseball_lift_exercises`, `baseball_lift_programs → weeks → days → sections →
   prescriptions → program_assignments → sessions → session_exercises → set_results`,
   `baseball_readiness_checkins` + `baseball_soreness_maps`/`_bodyweight_entries`/
   `_availability_statuses`, `baseball_strength_maxes`/`_prs`, `baseball_strength_groups`/
   `_group_members`, lift imports — in
   `supabase/migrations/20260624000063_baseball_v11_premium_lifting.sql`, with hand-typed
   rows in `src/lib/types/baseball-lifting-v11.ts`, actions in
   `src/app/baseball/actions/lifting.ts` + `lifting-v11.ts`, components in
   `src/components/baseball/performance/*`. **The unified `helm_lifting_*` schema is
   structurally cloned from this** (it is excellent and battle-tested), and the existing
   data is **copied forward** by the backfill (§5).

3. **Golf has NO lifting model** (verified: zero `golf_lift*`/`golf_strength*` tables; the
   only grep hits in `src/components/golf/` are calendar coincidences). With the unified
   schema, golf needs **no new tables** — golf participation is just `helm_lifting_*` rows
   keyed `sport='golf'` over the existing golf roster.

**Central decision (§1.1): build ONE unified, cross-sport `helm_lifting_*` data model,
keyed `(organization_id, sport, athlete)`, structurally cloned from the V11 baseball
model. Backfill baseball's existing data into it; rewire the baseball performance surface
to it; keep `baseball_lift_*` as untouched read-only legacy.**

---

## 1. Data model

> **Decision log — UNIFY NOW (product-owner override, FINAL).** An earlier draft floated a
> "coexist / no back-fill" stance (the old §1.4a). The product owner has **explicitly
> overridden** that: unify now. The golf-safety concern is addressed by doing the
> unification as a pure **COPY** (additive — no `ALTER`/`DROP`/move of any `baseball_lift_*`
> object). The pieces the owner asked for live at: **the unified schema** → §1.1 + §1.5; the
> **backfill migration** → §5; the **baseball dashboard rewire** → §2.4 (= §6 here, the
> dedicated rewire section); the **build-wave task W2-G** → §8; the **golf-safety verdict
> for the added pieces** → §9.11–§9.14. (Section numbers were consolidated in this revision;
> the requested §1.8/§2.4 content is §5/§6 respectively — see the pointers above.)

### 1.1 RECOMMENDATION — ONE unified, cross-sport `helm_lifting_*` schema (Option C, APPROVED)

**Decision: a NEW unified `helm_lifting_*` data model keyed by `(organization_id, sport,
athlete)`, structurally cloned from the V11 baseball model, owned by the Lab.** Baseball's
existing `baseball_lift_*` data is **copied** into it (additive backfill, §5); the baseball
performance surface is **rewired** to read/write the unified model (§6). `baseball_lift_*`
stays intact as read-only legacy — a copy, not a move, so the change is purely additive.

| Option | Verdict |
|--------|---------|
| **A. Aggregate `baseball_lift_*` in place** | REJECT. Sport-locked (FKs to `baseball_teams`/`baseball_players`, RLS via `is_baseball_team_staff`); a golf athlete can never be a `player_id` there. Cross-sport use would require **altering** baseball objects. |
| **B. Per-sport silos (`golf_lift_*` + `baseball_lift_*`), federated** | REJECT. Doubles the surface, forks the model, makes the cross-sport coach a thin shell over two disjoint systems. |
| **C. ONE unified `helm_lifting_*` over existing athletes, backfilled from baseball** ✅ | **ADOPT (product-owner decision).** One cohesive lifting model. Cloned from the proven V11 shapes; baseball data copied forward; golf is just rows keyed `sport='golf'`; future sports plug in by `sport` value. ZERO alter/drop of existing objects (backfill is a copy). |

**Athlete identity — `helm_lifting_athletes` is a thin reference, not a new population.**
Athletes are NOT signed up into the Lab; they remain the existing `golf_players` /
`baseball_players`. `helm_lifting_athletes` is a per-org reference row that points back at
the existing player (for portability + a stable lifting-side key), seeded by the backfill +
on-roster-change:

```
helm_lifting_athletes
  id                 uuid pk
  organization_id    uuid  -- FK organizations(id)
  sport              text  check in ('baseball','golf')
  sport_player_id    uuid  -- baseball_players.id / golf_players.id (SOFT ref, cross-link only)
  user_id            uuid  -- FK users(id) nullable (the athlete's existing login)
  team_id            uuid  -- soft ref to the sport team (current roster team)
  first_name / last_name / position  text  -- denormalized snapshot for fast render
  is_active          boolean default true
  created_at / updated_at
  CONSTRAINT uq_helm_lifting_athlete UNIQUE (organization_id, sport, sport_player_id)
```

- `sport_player_id` is a SOFT ref (no hard cross-schema FK → no cascade into existing
  tables). The athlete's existing login (`*_players.user_id`) drives athlete-self RLS via
  `helm_lifting_is_my_athlete()` (§1.6), so a player logs sets through their EXISTING
  account — no Lab signup. (This is the only "athlete" identity; there is no lifter signup
  — §9.10.)

> **Reuse note:** every `helm_lifting_*` data table mirrors the V11 column vocabularies +
> CHECK constraints (`baseball_lift_exercises:117` → `helm_lifting_exercises`,
> `baseball_lift_sessions:310` → `helm_lifting_sessions`, etc.), so the rewired baseball
> components port over with an adapter layer (§6), not a rewrite.

### 1.2 Identity & access tables (the Lab's spine)

```
helm_lifting_coaches            -- the cross-sport lifting-coach identity
  id                uuid pk
  user_id           uuid  -- FK users(id)            (login identity)
  organization_id   uuid  -- FK organizations(id)    (school scope)
  full_name / title / email / phone / avatar_url  text
  status            text  default 'active' check in ('active','suspended','removed')
  onboarding_completed boolean default false
  created_at / updated_at
  CONSTRAINT uq_helm_lifting_coach_user_org UNIQUE (user_id, organization_id)
```

```
helm_lifting_coach_assignments  -- which org teams this lifting coach covers (multi-team, multi-sport)
  id                uuid pk
  coach_id          uuid  -- FK helm_lifting_coaches(id)
  organization_id   uuid  -- FK organizations(id)  (denormalized for fast org-scoped RLS)
  sport             text  check in ('baseball','golf')
  team_id           uuid  -- baseball_teams.id / golf_teams.id (SOFT ref)
  team_name_snapshot text
  is_active         boolean default true
  assigned_by_user_id uuid -- the head coach who linked this team (users.id), nullable
  created_at / updated_at
  CONSTRAINT uq_helm_lifting_coach_assignment UNIQUE (coach_id, sport, team_id)
```

> This is the access grant: coach → org's teams across sports. It validates `team_id`
> belongs to the org in-action + via an RLS-time EXISTS against the sport table. Soft ref
> (no FK) keeps the Lab decoupled from `golf_teams`/`baseball_teams`.

### 1.3 Cross-portal VIEW grant (head coach views the Lab)

```
helm_lifting_org_viewers        -- who (besides the lifting coach) may VIEW the Lab
  id                uuid pk
  organization_id   uuid  -- FK organizations(id)
  user_id           uuid  -- FK users(id)  (the head coach's login)
  sport             text  -- which sport's head coach this is ('baseball'|'golf')
  source_team_id    uuid  -- the team they head (soft ref)
  granted_by        text  default 'invite_accept'
  can_edit          boolean default false  -- TRUE in no-coach mode; FALSE once a lifting coach is active
  created_at
  CONSTRAINT uq_helm_lifting_org_viewer UNIQUE (organization_id, user_id, sport)
```

> **`can_edit` is the no-coach / coach-active switch.** No-coach mode (head coach answered
> "No"): viewer row with `can_edit=true` → lifting lives in the head coach's dashboard,
> full VIEW+EDIT against `helm_lifting_*`. When a lifting coach accepts: the accept RPC
> flips every head-coach viewer for the org to `can_edit=false` (VIEW-ONLY); the
> `helm_lifting_coaches` row is the sole editor. **Non-destructive UPDATE**, never a delete.

### 1.4 Invitations

```
helm_lifting_coach_invites      -- mirrors baseball_staff_invitations, but ORG-scoped
  id                uuid pk
  organization_id   uuid  -- FK organizations(id)
  email             text  -- invited address (lowercased)
  token             uuid  default gen_random_uuid()  -- DB-minted, never client-set
  invited_by_user_id uuid -- the head coach's users.id
  invited_by_sport  text  -- which portal sent it ('baseball'|'golf')
  source_team_id    uuid  -- the head coach's team (soft ref, context display)
  role_title        text
  status            text  default 'pending' check in ('pending','accepted','revoked','expired')
  expires_at        timestamptz default now() + interval '14 days'
  created_at / updated_at
```

> Token DB-defaulted, email-match enforced on accept, 14-day expiry, stage-and-swap refresh
> — 1:1 with the proven baseball staff-invite pattern (`src/app/baseball/actions/staff.ts`).

### 1.5 Unified lifting DATA tables (cloned from V11, with `legacy_baseball_id`)

Every `helm_lifting_*` data table mirrors its V11 baseball counterpart's columns + CHECK
vocabularies, re-keyed to `organization_id` + `sport` and to `helm_lifting_athletes.id`
(athlete-bearing) / a soft `(sport, team_id)` (team-bearing). **Every table additionally
carries a nullable `legacy_baseball_id uuid` column** — the original `baseball_lift_*` row
id — with a UNIQUE index, so the backfill is idempotent + re-runnable (`ON CONFLICT
(legacy_baseball_id) DO NOTHING`) and rows stay traceable to their source.

- **Exercise library:** `helm_lifting_exercises` (+ `_exercise_substitutions`) ← from
  `baseball_lift_exercises:117` / `_substitutions:164`.
- **Groups:** `helm_lifting_groups` (+ `_group_members`) ← `baseball_strength_groups:80` /
  `_group_members:96`.
- **Program model:** `helm_lifting_programs → _weeks → _days → _sections → _prescriptions`
  ← `baseball_lift_programs:181` down.
- **Assignment + materialized sessions:** `helm_lifting_program_assignments`,
  `helm_lifting_sessions` (the athlete read surface), `helm_lifting_session_exercises`,
  `helm_lifting_set_results` ← `baseball_lift_program_assignments:281` /
  `baseball_lift_sessions:310` etc. Sessions key to `helm_lifting_athletes.id`;
  materialize-at-publish (no on-the-fly template math) carries over.
- **Readiness:** `helm_lifting_readiness_checkins` (+ `_soreness_maps`,
  `_bodyweight_entries`, `_availability_statuses`) ← the V11 readiness family. Athlete-owned.
- **Progression:** `helm_lifting_maxes`, `helm_lifting_prs` ← `baseball_strength_maxes:452`
  / `_prs:471`.
- **Imports:** `helm_lifting_import_runs` (+ `_import_rows`) ← the V11 import family,
  org-scoped.

> The materialized `helm_lifting_sessions` keeps the athlete surface dumb & fast — the
> player UI reads it directly, exactly as `PlayerLiftToday.tsx` reads
> `baseball_lift_sessions` today (after rewire it reads `helm_lifting_sessions`).

### 1.6 RLS for EVERY new table

**Pattern:** RLS ENABLED on every table; all policies `TO authenticated`; `anon` REVOKEd;
`service_role` bypasses by design. The Lab gets its OWN SECURITY DEFINER helpers (new
names; they do NOT touch the baseball helpers):

```sql
public.helm_lifting_coach_for_org(p_org uuid) returns boolean
  -- auth.uid() is an ACTIVE helm_lifting_coaches row for p_org
public.helm_lifting_can_view_org(p_org uuid, p_sport text) returns boolean
  -- active lifting coach for org, OR a helm_lifting_org_viewers row for (org, auth.uid(), sport)
public.helm_lifting_can_edit_org(p_org uuid) returns boolean
  -- active lifting coach for org, OR a viewer row with can_edit=true (no-coach mode head coach)
public.helm_lifting_is_my_athlete(p_athlete uuid) returns boolean
  -- the helm_lifting_athletes row p_athlete resolves to the caller via its existing
  --   *_players.user_id = auth.uid()  [athlete-self; read-only EXISTS, additive]
```

Per-table policy summary (every table is NEW):

| Table(s) | SELECT | INSERT / UPDATE / DELETE |
|----------|--------|--------------------------|
| `helm_lifting_coaches` | self OR org viewer | self-update; insert via accept (definer); no client delete |
| `helm_lifting_coach_assignments` | `helm_lifting_can_view_org(org,sport)` | accept/assign RPC (definer); staff edit via `helm_lifting_can_edit_org` + EXISTS team in org |
| `helm_lifting_coach_invites` | invitee (email) OR active coach | insert/refresh by inviting head coach (authority checked in-action — §9); accept via definer RPC |
| `helm_lifting_org_viewers` | self OR active coach | accept/onboarding RPC (definer) only |
| `helm_lifting_athletes` | `helm_lifting_can_view_org` OR `helm_lifting_is_my_athlete` | `helm_lifting_can_edit_org` (backfill/roster-sync via definer) |
| `helm_lifting_exercises` / `_substitutions` / `_groups` / `_group_members` | `helm_lifting_can_view_org` (+ athlete-self for own group membership) | `helm_lifting_can_edit_org` |
| programs / weeks / days / sections / prescriptions / program_assignments | `helm_lifting_can_view_org` | `helm_lifting_can_edit_org` |
| `helm_lifting_sessions` / `_session_exercises` | athlete-self (`helm_lifting_is_my_athlete`) OR `helm_lifting_can_view_org` | athlete advances OWN lifecycle; staff via `helm_lifting_can_edit_org`; publish = edit-only |
| `helm_lifting_set_results` / readiness / soreness / bodyweight | athlete-self OR `helm_lifting_can_view_org` | athlete-self (own) OR `helm_lifting_can_edit_org` |
| availability / maxes / prs | athlete-self read OR `helm_lifting_can_view_org` | `helm_lifting_can_edit_org` (+ athlete-self PR claim if product wants) |
| import runs / rows | `helm_lifting_can_view_org` | `helm_lifting_can_edit_org` |

**The cross-portal VIEW grant** = `helm_lifting_can_view_org()` true for a head coach with a
`helm_lifting_org_viewers` row, but `helm_lifting_can_edit_org()` false → SELECT yes, every
write denied. No golf/baseball table or policy is touched to achieve it.

> **GOLF-SAFETY (critical):** no Lab policy references any `golf_*` table; no Lab helper is
> granted to `anon`. Creating a table in `public` auto-grants ALL to `anon`/`authenticated`
> via default privileges — so EVERY migration ends with `REVOKE ALL ON <table> FROM anon;`
> and ACLs are verified via `pg_class.relacl` (memory: matview/table recreate regrants
> anon). RLS `TO authenticated` on every policy.

### 1.7 `handle_new_user` — left UNTOUCHED (preferred)

The lifting-coach profile shell is seeded by the onboarding/accept server action
(idempotent upsert), exactly as golf coaches are today (`onboarding.ts:118`). **We do NOT
modify `handle_new_user`** — zero risk to golf signup. Fallback (only if a shell-at-signup
is ever required): the proven guarded `IF NEW.raw_user_meta_data->>'sport'='lifting'` block
wrapped in `BEGIN…EXCEPTION WHEN OTHERS…END` + `ON CONFLICT DO NOTHING`
(`20260624001500_baseball_signup_creates_profile_row.sql:42-118`) — provably non-regressing
because golf takes neither branch. Until proven necessary, **do not ship it.**

---

## 2. The Lab portal

### 2.1 Route group & path

New top-level route group **`src/app/lifting/`**, peer to `src/app/golf/` + `src/app/baseball/`:

```
src/app/lifting/
├── (auth)/            login, signup, forgot/reset-password
├── (onboarding)/coach/page.tsx        -- lifting-coach onboarding (org select + profile)
├── join/[token]/{page,join-client}.tsx -- INVITE ACCEPT (clone of baseball staff/join/[code])
├── (dashboard)/
│   ├── layout.tsx     -- auth-gate: resolve helm_lifting_coach OR org-viewer
│   └── dashboard/
│       ├── page.tsx           -- Lab home (org overview: sport tabs + covered teams)
│       ├── athletes/page.tsx  -- roster across sports (helm_lifting_athletes)
│       ├── programs/          -- program builder (cloned baseball ProgramEditor on helm_lifting_*)
│       ├── sessions/          -- live weight room (cloned LiveWeightRoom on helm_lifting_*)
│       ├── readiness/page.tsx -- readiness board (cloned PlayerReadiness staff view)
│       ├── groups/page.tsx    -- strength groups
│       └── settings/page.tsx  -- coach profile + team assignments
└── actions/           -- lifting-lab server actions (§7)
```

### 2.2 Separate signup/login alongside golf + baseball

- **Auth provider is shared** (one Supabase `auth.users`/`public.users`). No 4th auth
  system — the Lab issues `role='coach'` users with `sport:'lifting'` metadata.
- **The lifting coach is the ONLY new signup identity.** Athletes do NOT sign up into the
  Lab — they are the existing `golf_players`/`baseball_players`; their lifting access is via
  their EXISTING login (athlete-self RLS, §1.6).
- **The shared `user_role` enum (`coach|player|admin`) is NOT altered.** Lifting coach =
  generic `role='coach'` + additive `helm_lifting_coaches` profile — exactly as golf =
  `role='coach'` + `golf_coaches`. No new enum value (a golf-touching change). The portal is
  discriminated by route group + profile-row presence, not a role value.
- **Middleware integration is in the session helper, not the root `middleware.ts`.** Root
  `middleware.ts` only calls `updateSession()`. Portal routing/auth redirects live in
  `src/lib/supabase/middleware.ts`: `getSportFromPath()` (`:12`) + `checkRouteAuthorization()`
  + `STAFF_CAPABILITY_ROUTES` (`:86`). The Lab adds a `/lifting` arm: extend
  `getSportFromPath` to return `'lifting'` and add a Lab redirect branch. Root matcher
  already covers `/lifting/*`; additive, golf/baseball branches untouched.
- **Layout gate** (`src/app/lifting/(dashboard)/layout.tsx`): `auth.getUser()` → look up
  `helm_lifting_coaches`; if found → full Lab; else check `helm_lifting_org_viewers` →
  VIEW-ONLY mode; else → login.

### 2.3 How golf plugs in (with the unified schema, golf is just rows)

Because the model is unified + org-keyed, golf needs **no new tables**. A golf head coach
answers "Yes"; the same invite runs with `invited_by_sport='golf'`; on accept the Lab adds
`helm_lifting_coach_assignments` (`sport='golf'`) for the golf team(s) and seeds
`helm_lifting_athletes` for the golf roster (resolved through `golf_team_members →
golf_players`). The golf coach then builds `helm_lifting_*` programs/sessions keyed
`sport='golf'`, and golf players log via their EXISTING golf login. (A future golf player
"Today" card reads `helm_lifting_sessions` exactly as baseball's does post-rewire.)

### 2.4 Baseball performance dashboard rewire → see §6

The baseball performance dashboard rewire (repoint `src/components/baseball/performance/*`
+ `src/app/baseball/actions/lifting.ts` + `lifting-v11.ts` to read/write `helm_lifting_*`
via the Lab resolver, so baseball NO-COACH mode edits `helm_lifting_*` through a head-coach
`helm_lifting_org_viewers` row with `can_edit=true`; visual/UX preserved, only the data
layer swaps; `baseball_lift_*` becomes read-only legacy after cutover) is specified in full
in **§6 (Baseball performance dashboard rewire)** — including the adapter/mapping layer that
keeps component props stable. It lives in its own top-level section because it spans the
data layer (not just the portal); this pointer keeps the portal narrative complete.

---

## 3. Onboarding branch + invite flow

### 3.1 Where the Yes/No question lives

Baseball coach onboarding (`src/app/baseball/(onboarding)/coach-onboarding/page.tsx`) is
`type → program → account → plan → complete` (`page.tsx:36`). Insert the lifting question as
a new step after `plan`: **"Do you have a strength & conditioning coach you'd like to set
up?" — Yes / No / Decide later.** Same insertion in golf coach onboarding
(`src/app/golf/(onboarding)/coach/page.tsx`).

### 3.2 "No" → lifting lives in the head coach's dashboard
1. Insert `helm_lifting_org_viewers` for the head coach `(org, user_id, sport, can_edit=true)`.
2. Surface a "Lifting Lab" card in the head coach's own dashboard
   (`/baseball/dashboard/performance` after rewire, §6) — VIEW+EDIT against `helm_lifting_*`.
No invite, no separate login. They can flip to "Yes" later (sends invite, downgrades `can_edit`).

### 3.3 "Yes" → invite a lifting coach
1. Head coach enters the coach's **email** (+ optional title).
2. `inviteLiftingCoach(email, title)` inserts `helm_lifting_coach_invites` (org-scoped,
   DB-minted token, 14-day expiry), stage-and-swap if a pending invite exists.
3. Invite email via the existing Resend wrapper (`src/lib/email/resend-client.ts` /
   `src/lib/notifications/email.ts:sendEmailNotification`) → `/lifting/join/<token>`
   (no-op-safe without `RESEND_API_KEY`).
4. Interim: head coach keeps a `can_edit=true` viewer row until accept (lifting isn't blocked).

### 3.4 Accept flow
`src/app/lifting/join/[token]/page.tsx` clones `src/app/baseball/staff/join/[code]/page.tsx`:
unauthenticated → `/lifting/login?returnTo=…`; look up invite under RLS; re-validate
status/expiry/email server-side. On confirm → `acceptLiftingInvite(token)` (SECURITY DEFINER
`helm_lifting_accept_invite`):
1. re-validate token/status/expiry/email,
2. UPSERT `helm_lifting_coaches` for `(user_id, organization_id)` — stage-and-swap,
3. flip invite to `accepted`,
4. **downgrade every head-coach viewer for the org to `can_edit=false`** (coach-active),
5. seed `helm_lifting_coach_assignments` for the org's teams (or defer), and seed
   `helm_lifting_athletes` for those teams' rosters (idempotent on the UNIQUE).

### 3.5 Where the lifting coach lands
→ `/lifting/dashboard`. First-run card: confirm profile + which org teams to cover
(pre-checked from `helm_lifting_coach_assignments`).

---

## 4. Permission matrix

Roles: **L** = lifting coach, **HC** = head coach, **P** = player/athlete. All lifting data
is `helm_lifting_*` (after backfill + rewire).

### State A — no lifting coach ("No" / invite pending)
| Surface | L | HC | P |
|---------|---|----|----|
| Programs / exercises / groups / sessions | — | **edit** (`can_edit=true` viewer) | — |
| Own sessions / log sets / readiness | — | — | **edit (own)** |
| Readiness board (all athletes) | — | **view** | — |
| Invite a lifting coach | — | **yes** | — |

### State B — lifting coach active
| Surface | L | HC | P |
|---------|---|----|----|
| Programs / exercises / groups / sessions | **edit (owner)** | **view only** | — |
| Own sessions / log sets / readiness | view (all) | view only | **edit (own)** |
| Readiness board (all athletes) | **edit/manage** | **view only** | — |
| Invite/remove lifting coach | — | **yes** | — |
| Lab settings / team assignments | **edit** | view only | — |

> **All rows above are governed by the NEW `helm_lifting_*` RLS** (§1.6) — L edits as the
> active coach, HC views via an `org_viewers` row with `can_edit=false`, P edits own via
> `helm_lifting_is_my_athlete`. **Baseball no-coach mode edits `helm_lifting_*` through the
> head coach's `can_edit=true` viewer row** (this is what the §6 rewire enables — the
> baseball dashboard no longer needs the baseball `can_manage_lifting` capability to write
> lifting; it writes `helm_lifting_*` under the Lab grant). The legacy `baseball_lift_*`
> capability stays valid only for the (now read-only) legacy tables.

> **Per sport:** a baseball HC and a golf HC each get an `org_viewers` row scoped to their
> `sport`. L sees the whole org across sports.

> **Enforcement is dual:** Lab actions gate in-process; the NEW `helm_lifting_*` RLS
> backstops every path. View-only HC = write-no policies, not just hidden buttons.

---

## 5. ADDITIVE BACKFILL MIGRATION (baseball_lift_* → helm_lifting_*)

The LAST migration in the ordered list (after the schema + RPC migrations). It **COPIES**
baseball's existing lifting data into `helm_lifting_*`. `baseball_lift_*` is the untouched
SOURCE — **a copy, not a move; zero ALTER/DROP; purely additive + golf-safe.**

### 5.1 Order of operations (idempotent, re-runnable)

1. **Seed `helm_lifting_athletes`** for every `baseball_players` row on a team that has an
   org (resolve `organization_id` via `baseball_teams.organization_id`, through
   `baseball_team_members` for roster membership). Insert `(organization_id, sport='baseball',
   sport_player_id=baseball_players.id, user_id, team_id, name/position snapshot)`. Idempotent
   on `uq_helm_lifting_athlete (organization_id, sport, sport_player_id)` → `ON CONFLICT DO
   NOTHING`. Players on org-less teams are skipped (logged), never errored.
2. **Copy the V11 graph in dependency order**, each row carrying `legacy_baseball_id =
   <source row id>` and `ON CONFLICT (legacy_baseball_id) DO NOTHING`:
   - `baseball_lift_exercises` → `helm_lifting_exercises` (+ `_substitutions` after, remapping
     exercise ids via `legacy_baseball_id` lookup),
   - `baseball_strength_groups`/`_group_members` → `helm_lifting_groups`/`_group_members`
     (player → `helm_lifting_athletes.id` via the seed map),
   - `baseball_lift_programs → _weeks → _days → _sections → _prescriptions` → the
     `helm_lifting_*` program graph (parent ids remapped via `legacy_baseball_id`),
   - `baseball_lift_program_assignments` → `helm_lifting_program_assignments`,
   - `baseball_lift_sessions → _session_exercises → _set_results` → the `helm_lifting_*`
     session graph (player → athlete id; session/exercise parents remapped),
   - `baseball_readiness_checkins` (+ `_soreness_maps`, `_bodyweight_entries`,
     `_availability_statuses`) → the `helm_lifting_*` readiness family,
   - `baseball_strength_maxes`/`_prs` → `helm_lifting_maxes`/`_prs`.
   Every `team_id`/`player_id` ref is re-keyed to `organization_id` +
   `helm_lifting_athletes.id`. Every parent FK is remapped by joining on the parent's
   `legacy_baseball_id` (so a re-run finds the same target).
3. **No write back into `baseball_lift_*`** — the source is read-only throughout.

### 5.2 Defensive + golf-safe execution

- Wrap each copy block in its own `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING … END;`
  so one sport/team's bad row never aborts the whole backfill (and never touches golf).
- The migration reads ONLY `baseball_*` + writes ONLY `helm_lifting_*` — it **never
  references, locks, or writes any `golf_*` object**. (Golf-safety flag §9.12.)
- Idempotent: safe to re-run (e.g. to pick up rows created between schema-apply and
  cutover). `legacy_baseball_id` UNIQUE indexes make every insert a no-op on re-run.
- Batched (`LIMIT`/keyset) for the large session/set-result tables to avoid a long lock on
  the `helm_lifting_*` targets (the source is read-only, so no baseball lock is taken beyond
  a shared read).

### 5.3 Cutover semantics

After backfill: **new baseball lifting writes go to `helm_lifting_*`** (via the rewired
dashboard, §6); **`baseball_lift_*` becomes read-only legacy** — kept, not dropped, for
audit + rollback. A trailing one-shot re-run of the backfill at cutover captures any rows
written to `baseball_lift_*` between schema-apply and the rewire deploy (the `ON CONFLICT
(legacy_baseball_id)` guards make this safe). Optional later (out of scope): a read-only
verification query asserting row-count parity per table before flipping the dashboard.

---

## 6. BASEBALL PERFORMANCE DASHBOARD REWIRE

Repoint the baseball lifting surfaces from `baseball_lift_*` to `helm_lifting_*` via the
Lab's resolver, **preserving the visual/UX layer** (skeletons, palette, layout) — only the
DATA layer swaps.

### 6.1 What is rewired
- **Actions:** `src/app/baseball/actions/lifting.ts` + `src/app/baseball/actions/lifting-v11.ts`
  — every read/write swaps `baseball_lift_*` table names for `helm_lifting_*`, and resolves
  the active org + athlete (instead of team + baseball player) via a NEW
  `src/lib/lifting/resolve-baseball-context.ts` helper that maps the active baseball team →
  `organization_id` and a `baseball_players.id` → `helm_lifting_athletes.id`.
- **Components:** `src/components/baseball/performance/*` (ProgramEditorClient,
  LiveWeightRoom, PerformanceDashboardClient, PlayerLiftToday/Home/Session,
  PlayerReadinessClient, StrengthGroupsClient) — they keep their JSX/styling; only their data
  source (the action results / direct reads) changes.

### 6.2 Keeping component props stable — an ADAPTER layer
The existing components are typed against `BaseballLift*` row shapes
(`src/lib/types/baseball-lifting-v11.ts`). To minimize churn:
- Add `src/lib/lifting/adapters/baseball-view-adapter.ts` mapping a `helm_lifting_*` row
  back to the EXISTING `BaseballLift*Row` shape the components already consume (the
  `helm_lifting_*` shapes are structural clones, so the adapter is a near-identity field
  rename + the athlete↔player id swap). Components' prop types are **unchanged**.
- Where a component currently calls a baseball action, it now calls the same action — the
  action's INTERNALS changed (reads `helm_lifting_*`, adapts on the way out), its SIGNATURE +
  return shape stay the same. **No component file needs a prop-type edit.**

### 6.3 Read shapes that change (and how they stay stable)
| Surface | Was (read) | Now (read) | Stability |
|---------|-----------|-----------|-----------|
| Player Today card | `baseball_lift_sessions` by `player_id`+date | `helm_lifting_sessions` by `athlete_id`+date | adapter maps session row → `BaseballLiftSessionRow`; `getPlayerLiftTodaySummary` signature unchanged (`player-today-lift.ts`) |
| Program builder | `baseball_lift_programs` graph | `helm_lifting_*` program graph | adapter per node; `lifting-v11.ts` action shapes unchanged |
| Live weight room / sessions | `baseball_lift_sessions`/`_session_exercises`/`_set_results` | `helm_lifting_*` equivalents | adapter; quick-assign materialization bridge (`lifting.ts:186-347`) re-pointed to `helm_lifting_sessions` |
| Readiness board | `baseball_readiness_checkins` (+ soreness/bw/avail) | `helm_lifting_readiness_checkins` (+ family) | adapter; readiness summary shape unchanged |
| Strength groups | `baseball_strength_groups`/`_members` | `helm_lifting_groups`/`_group_members` | adapter |

### 6.4 Authority in no-coach mode (the key behavior the rewire unlocks)
The rewired baseball dashboard writes `helm_lifting_*`, so its authority is the NEW Lab
grant, NOT the baseball `can_manage_lifting` capability: a head coach in no-coach mode holds
a `helm_lifting_org_viewers` row with `can_edit=true` → `helm_lifting_can_edit_org()` true →
the existing baseball performance UI edits `helm_lifting_*`. When a lifting coach activates,
the head coach's `can_edit` flips false → the SAME UI becomes read-only (write-no RLS),
satisfying the permission matrix with no per-component gating.

> **The legacy baseball `can_manage_lifting` capability is NOT removed** (no alter to
> `baseball_team_coach_staff` / `baseball-staff-roles.ts`). It simply no longer gates the
> (now `helm_lifting_*`-backed) live surface; it remains meaningful for the read-only legacy
> `baseball_lift_*` tables. Additive, reversible.

---

## 7. Concrete file list

### NEW — database (migrations), ordered
1. `<ts+10>_helm_lifting_identity.sql` — `helm_lifting_coaches` / `_coach_invites` /
   `_coach_assignments` / `_org_viewers` / `_athletes` + the 4 Lab helpers + RLS + REVOKE anon.
2. `<ts+20>_helm_lifting_data_library_programs.sql` — exercises/substitutions, groups/members,
   programs/weeks/days/sections/prescriptions (+ `legacy_baseball_id` cols + UNIQUE) + RLS.
3. `<ts+30>_helm_lifting_data_sessions_readiness.sql` — program_assignments, sessions/
   session_exercises/set_results, readiness family, maxes/prs, imports (+ `legacy_baseball_id`)
   + RLS.
4. `<ts+40>_helm_lifting_accept_invite_rpc.sql` — `helm_lifting_accept_invite()` +
   `helm_lifting_assign_team()` + `helm_lifting_sync_org_athletes()` definer RPCs.
5. `<ts+50>_helm_lifting_backfill_from_baseball.sql` — the §5 additive COPY backfill
   (athletes seed → V11 graph copy, idempotent on `legacy_baseball_id`). **Runs LAST**,
   after the `helm_lifting_*` tables exist.

### NEW — types / lib
- `src/lib/types/helm-lifting.ts` — identity/access table Row/Insert/Update.
- `src/lib/types/helm-lifting-data.ts` — the lifting-data family Row/Insert/Update (ported
  shapes from `baseball-lifting-v11.ts` + `legacy_baseball_id`).
- `src/lib/lifting/access.ts` — `resolveLiftingAccess(orgId)` → `{ isCoach, canEdit, canView,
  assignments }`.
- `src/lib/lifting/with-lifting-action.ts` — action wrapper (auth + org-context + edit-gate
  + Sentry + sanitized errors), mirroring `with-baseball-action.ts`.
- `src/lib/lifting/resolve-baseball-context.ts` — active baseball team → org + player→athlete
  id map (used by the rewired baseball actions).
- `src/lib/lifting/adapters/baseball-view-adapter.ts` — `helm_lifting_*` row → `BaseballLift*Row`
  shape (keeps baseball components' props stable, §6.2).

### NEW — server actions (`src/app/lifting/actions/`)
- `invites.ts` (`inviteLiftingCoach`, `revoke/resend/acceptLiftingInvite`),
  `onboarding.ts` (`completeLiftingCoachOnboarding`, `setLiftingMode`),
  `assignments.ts`, `programs.ts`, `sessions.ts`, `readiness.ts`, `groups.ts`, `imports.ts`
  (the Lab's own `helm_lifting_*` CRUD).

### NEW — routes & components
- `src/app/lifting/**` (tree §2.1); `src/components/lifting/**` (Lab shell + cloned
  performance UIs on `helm_lifting_*`); `src/components/lifting/onboarding/LiftingCoachQuestion.tsx`;
  `src/app/lifting/join/[token]/{page,join-client}.tsx`; `src/lib/email/lifting-invite-template.ts`.

### MODIFIED (additive, golf-safe)
- `src/lib/supabase/middleware.ts` — `/lifting` arm in `getSportFromPath`/`checkRouteAuthorization`
  (root `middleware.ts` NOT edited).
- `src/app/baseball/actions/lifting.ts` + `lifting-v11.ts` — **REWIRE** to `helm_lifting_*`
  via the resolver + adapter (§6); signatures/return shapes unchanged.
- `src/app/baseball/actions/player-today-lift.ts` — read `helm_lifting_sessions` (adapter).
- `src/components/baseball/performance/**` — data source swap only; JSX/styling preserved (§6).
- `src/app/baseball/(onboarding)/coach-onboarding/page.tsx` + `src/app/golf/(onboarding)/coach/page.tsx`
  — insert the Yes/No step + wire `setLiftingMode`.
- `src/app/baseball/actions/onboarding.ts` + `src/app/golf/actions/onboarding.ts` — call
  `setLiftingMode` on complete.
- `src/lib/types/index.ts` — re-export the new `helm-lifting*` types (additive lines).

> `src/lib/types/database.ts` is NOT hand-edited — new tables land on the next `db:types`
> regen after apply; until then the hand-written `helm-lifting*.ts` types are the contract
> and actions use the `as any`/`fromUntyped` accessor pattern (as baseball lifting does —
> `lifting.ts:62` + `src/lib/supabase/untyped.ts`).

---

## 8. Build-wave plan (file-disjoint parallel agent tasks)

Two ordered waves. Wave 1 = foundation (schema + RPCs + types + helpers + adapter). Wave 2
fans out into 5 file-disjoint tasks, including the new **W2-G backfill + rewire**.

### WAVE 1 — Foundation (one agent, blocking)
- **Owns:** migrations 1–4 (identity + data + RPCs — NOT the backfill, that's W2-G),
  `src/lib/types/helm-lifting.ts`, `helm-lifting-data.ts`, `src/lib/lifting/access.ts`,
  `with-lifting-action.ts`, `resolve-baseball-context.ts`,
  `adapters/baseball-view-adapter.ts`, `src/lib/supabase/untyped.ts` (allowlist),
  `src/lib/types/index.ts` (barrel).
- **Deliverable:** the unified schema + RPCs + types + access resolver + the
  baseball-view adapter. Everyone imports these. (The adapter is here so W2-G's rewire and
  W2-C's Lab UIs share one mapping.)

### WAVE 2 — Parallel build (5 agents, file-disjoint)

| Task | Owns (exclusive) | Depends on |
|------|------------------|-----------|
| **W2-A Invites & accept** | `src/app/lifting/actions/{invites,onboarding,assignments}.ts`, `src/app/lifting/join/[token]/**`, `src/lib/email/lifting-invite-template.ts` | W1 (access, RPCs) |
| **W2-B Portal shell & auth** | `src/lib/supabase/middleware.ts` (lifting branch), `src/app/lifting/(auth)/**`, `(onboarding)/**`, `(dashboard)/layout.tsx`, `dashboard/page.tsx`, `settings/**`, `src/components/lifting/shell/**` | W1 (access) |
| **W2-C Lab program/session/readiness UIs** | `src/app/lifting/actions/{programs,sessions,readiness,groups,imports}.ts`, `src/app/lifting/(dashboard)/dashboard/{programs,sessions,readiness,groups}/**`, `src/components/lifting/{programs,sessions,readiness,groups}/**` | W1 (data types, adapter) |
| **W2-D Athletes & roster** | `src/app/lifting/(dashboard)/dashboard/athletes/**`, `src/components/lifting/athletes/**` | W1 (athlete types, sync RPC) |
| **W2-E Onboarding branch (both sports)** | `src/components/lifting/onboarding/LiftingCoachQuestion.tsx`, edits to the two sport onboarding pages + the `setLiftingMode` call-sites in the two sport `onboarding.ts` actions | `setLiftingMode` from W2-A (pin signature in W1) |
| **W2-G Baseball backfill + dashboard REWIRE** | migration 5 (`_helm_lifting_backfill_from_baseball.sql`), `src/app/baseball/actions/lifting.ts` + `lifting-v11.ts` + `player-today-lift.ts`, `src/components/baseball/performance/**` | **W1 (the `helm_lifting_*` tables must exist before the backfill runs)** + the W1 adapter/resolver |

**W2-G dependency note:** the backfill migration MUST be ordered after the Wave-1 schema
migrations (it copies INTO `helm_lifting_*`). It runs last in the migration sequence; the
rewire code deploys after the backfill has populated the tables (cutover, §5.3).

**Collision avoidance:** W2-A owns the Lab `onboarding.ts`; W2-E only EDITS the two SPORT
onboarding pages + adds the `setLiftingMode` call. W2-G is the ONLY task that touches
`src/app/baseball/actions/lifting*.ts` + `player-today-lift.ts` + `src/components/baseball/performance/**`
— no other task may edit baseball files, so the rewire is collision-free.
`src/lib/supabase/middleware.ts` → W2-B only; `src/lib/types/index.ts` → W1 only; the
adapter/resolver → W1 only (W2-G + W2-C import them).

---

## 9. GolfHelm production safety — explicit flags

1. **Shared `organizations`.** Lab FKs new tables to it. ✅ FK from a new table doesn't alter
   the target; no golf row read/written. **Do NOT add columns to `organizations`.**
2. **Shared `users`/`auth.users`.** Lab coaches = `role='coach'` + `sport:'lifting'` meta. ✅
   additive rows only.
3. **`handle_new_user` left unmodified** (§1.7). **FLAG: any PR editing it is reviewed
   against golf signup.**
4. **Soft refs to `*_teams`/`*_players`** (no hard FK). ✅ no cross-schema cascade.
5. **RLS cross-tenant.** `helm_lifting_can_view_org` is org-scoped, references no golf table.
   **FLAG: no Lab policy may use `USING (true)` or an anon grant** (the recurring
   GRANT-ALL-TO-anon regression — every Lab RPC REVOKEs anon; helpers are `authenticated`-only).
6. **Default-privilege regrant.** Every migration ends `REVOKE ALL ON <table> FROM anon;` +
   verify `pg_class.relacl`.
7. **Inviting-portal authority.** `inviteLiftingCoach` verifies the caller is a head coach of
   a team in that org (existing sport helper, read-only) before writing
   `helm_lifting_coach_invites`. **FLAG: confirm this check.**
8. **No destructive writes** (memory: golf no-delete-then-reinsert): viewer downgrade =
   UPDATE; invite refresh = stage-and-swap; session publish = upsert on UNIQUE; backfill =
   `ON CONFLICT DO NOTHING`. ✅
9. **`user_role` enum NOT altered.** **FLAG: reject any `ALTER TYPE user_role ADD VALUE`.**
10. **No new athlete/lifter signup population.** `helm_lifting_athletes` is a thin reference
    to existing `*_players` (athlete-self RLS via existing `*_players.user_id`); no Lab
    athlete login. **FLAG: reject any athlete signup into the Lab.**
11. **Backfill is a COPY, never a move.** `baseball_lift_*` is the read-only SOURCE; the
    migration reads `baseball_*` and writes only `helm_lifting_*`. **NO `ALTER`/`DROP`/`DELETE`
    of any `baseball_lift_*` object or row.** Idempotent on `legacy_baseball_id`. ✅ **FLAG:
    reject any backfill statement that writes back into `baseball_lift_*`.**
12. **Backfill never touches/locks golf.** It references ONLY `baseball_*` (read) +
    `helm_lifting_*` (write) + `organizations` (read). **FLAG: reject any `golf_*` reference
    in the backfill; confirm it takes no lock on a golf object (shared read only on
    `organizations`).**
13. **Dashboard rewire = baseball APP CODE only.** `src/app/baseball/actions/lifting*.ts` +
    `player-today-lift.ts` + `src/components/baseball/performance/**` change their data source
    to `helm_lifting_*`; NO golf file is touched, NO baseball SCHEMA object is altered. The
    legacy `can_manage_lifting` capability + `baseball_lift_*` tables are kept (reversible). ✅
    **FLAG: the rewire must not edit any `golf_*` code and must keep action signatures stable
    so non-lifting baseball callers are unaffected.**
14. **Cutover safety.** Until the rewire deploys, the live baseball surface still reads
    `baseball_lift_*`; the backfill (a copy) makes them consistent. A re-run at cutover
    captures interim writes via `ON CONFLICT (legacy_baseball_id)`. Rollback = revert the
    rewire deploy; `baseball_lift_*` is intact. ✅

---

## Appendix — key source references

- Org root: `src/lib/types/database.ts:16653` (`organizations`); `golf_teams.organization_id`
  (~db.ts L2/L62); `baseball_teams.organization_id` (~db.ts L1459). Shared-org confirmation:
  `src/app/golf/actions/onboarding.ts:112-129`.
- V11 lifting model cloned + backfilled FROM (baseball):
  `supabase/migrations/20260624000063_baseball_v11_premium_lifting.sql` (tables L80–531;
  helpers + RLS L534–end); types `src/lib/types/baseball-lifting-v11.ts`,
  `baseball-lifting.ts`; actions `src/app/baseball/actions/lifting.ts` (materialization bridge
  L186–347) + `lifting-v11.ts` + `player-today-lift.ts`; components
  `src/components/baseball/performance/*` (the rewire targets).
- Staff invite/accept/capability template: `src/app/baseball/actions/staff.ts` (invite L127,
  accept L303); `src/lib/baseball/capabilities.ts`; `src/lib/types/baseball-staff-roles.ts`
  (`strength_coach` preset L235). Invite-accept page: `src/app/baseball/staff/join/[code]/page.tsx`.
- Onboarding wizard to branch: `src/app/baseball/(onboarding)/coach-onboarding/page.tsx:36`;
  `src/app/golf/(onboarding)/coach/page.tsx`.
- `handle_new_user` safe-extension precedent:
  `supabase/migrations/20260624001500_baseball_signup_creates_profile_row.sql:42-118`.
- RLS helper precedent: `supabase/migrations/20260624000050_baseball_rls_helpers_and_policies.sql`
  (SECURITY DEFINER helpers L32–290).
- Portal routing/auth: root `middleware.ts` (updateSession only); per-portal logic in
  `src/lib/supabase/middleware.ts` (`getSportFromPath:12`, `STAFF_CAPABILITY_ROUTES:86`).
- Email: `src/lib/email/resend-client.ts`, `src/lib/notifications/email.ts`.
- anon-regrant gotcha + no-destructive-write rules: project memory.
</content>
