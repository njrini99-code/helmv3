# Baseball Public Player Page — UX Audit (2026-09-02)

**Route:** `/baseball/player/[id]`
(`src/app/baseball/(public)/player/[id]/page.tsx`), public/unauthenticated.
**Status:** Baseball is a newer, in-progress product next to the mature golf
product. This is the first audit pass to look at this specific page. **Bottom
line up front: this page is not demo-able today.** It 404s for every player ID,
for every logged-out visitor, unconditionally — the root cause is a database
grant, not a missing player. See Finding 1.

## Setup notes

- Browser profile creation is blocked at the gateway/node-proxy level (confirmed
  by a sibling audit earlier today). Used the existing `imported` profile per
  the task instruction; no collisions were hit since the route is public and
  required no login.
- No demo/seed player ID exists that is confirmed live in production. The
  closest candidate is the deterministic UUID generator in
  `scripts/seed-rini-baseball-demo.ts` (`detId('player:p1')`, namespace
  `rini-baseball-demo-v1`), which produces
  `5a6ff0b8-a5d3-5f1b-974a-8f514e8ee2ed` for the seeded player "Marcus
  Rodriguez." That ID was used for testing below, but — as Finding 1 shows — the
  result would have been identical for a real player ID from a real production
  row, because the page fails before it ever gets to checking whether the ID
  exists.
- Viewports tested: 390×844 (mobile), 768px width (tablet), 1440×900 (desktop).
  Screenshots in `docs/ui-audits/baseball-public-player-shots-2026-09-02/`.

## Finding 1 — CRITICAL (bug, not "unfinished"): the public player page is unreachable for every logged-out visitor, for any player ID

**This is the headline finding.** The entire point of this route is to be a
shareable, no-login-required recruiting profile. Right now, it cannot render
player content for anyone who isn't logged in — which is the only audience this
page has, since a logged-in coach/player would use the dashboard instead.

**Evidence chain:**

1. `resolvePublicProfileAccess()`
   (`src/lib/baseball/public-profile-access.ts:55`) does
   `supabase.from('baseball_players').select(...).eq('id',
   playerId).maybeSingle()` as its very first step, using the standard
   `createClient()` (`src/lib/supabase/server.ts`), which authenticates as
   Postgres role `anon` for any visitor without a session cookie.
2. Querying `baseball_players` directly against production with the app's own
   public anon key returns a hard grant error, not an empty result:

   ```
   $ curl .../rest/v1/baseball_players?select=id&limit=1  (anon key)
   {"code":"42501","details":null,"hint":null,"message":"permission denied for table baseball_players"}
   ```

3. `supabase/migrations/20260729000200_baseball_tenant_isolation_rls_a_additive.sql`
   / `..._b_policies.sql` (both applied to production 2026-07-29) confirm this
   isn't an accident: the `baseball_players_select` RLS policy is `FOR SELECT TO
   authenticated` only, and the migration's own comment states plainly — *"anon
   has no matching policy on any of these tables today (before or after this
   migration)."* The migration even executes `REVOKE ALL ON
   public.baseball_players FROM anon;` as an explicit (if redundant) hardening
   step.
4. Compare with golf, the mature sibling product: `GRANT ALL ON TABLE
   "public"."golf_players" TO "anon"` is present in the baseline migration and
   was never revoked. A live anon query against `golf_players` returns `[]`
   (empty result — RLS filtering working normally), not a permission error.
   Golf's public player page has the DB-side wiring baseball's never received.
5. End-to-end confirmation in the browser: navigating to
   `/baseball/player/5a6ff0b8-a5d3-5f1b-974a-8f514e8ee2ed` (the computed seed
   ID) renders the site's generic global 404 ("Page not found"), not a player
   profile. The same happens for a syntactically invalid ID
   (`/baseball/player/not-a-valid-uuid`) — no crash, no console error, just the
   same generic 404. Since the DB call fails identically regardless of whether
   the ID is real, this 404 is not evidence the specific test ID is wrong — it
   is evidence the whole page is unreachable.
6. The same root cause affects the sibling public routes: `baseball_teams` and
   `baseball_player_percentiles` return the identical `42501` for anon, and
   `/baseball/team/[id]` also renders the generic 404. `/baseball/program/[id]`
   was not independently checked but shares the same access-gate pattern and is
   very likely affected too.

**Why this matters:** `resolvePublicProfileAccess()` clearly was *written* to
support anonymous access — it has explicit branches for `viewerUserId` being
null, checks `recruiting_activated`, `profile_visibility`, and calls a SECURITY
DEFINER RPC (`get_baseball_public_player_stats`) specifically to work around
anon table grants for the stats portion. The application code's intent is
unambiguous. The database grant that would let the *first* query in that same
function run for an anonymous visitor was simply never added (or was dropped
along with a legitimate leak-closing migration and never restored). This reads
as a gap between an app-layer feature and its DB-layer prerequisite, not a
deliberate "not built yet" state — there's no landing/waitlist copy, no "coming
soon," just a bare 404 that looks identical to a broken link.

**Fix shape (for whoever picks this up):** `baseball_players` needs an anon-safe
SELECT path that mirrors what `resolvePublicProfileAccess()` already gates on in
application code (recruiting_activated, non-college player_type,
profile_visibility ≠ private) — either a narrow RLS policy for `TO anon` with
that predicate, or routing the public-profile read through a SECURITY DEFINER
RPC the way `get_baseball_public_player_stats` already does for stats. Given
`is_baseball_player_recruiting_discoverable()` in the 2026-07-29 migration
already encodes an almost-identical predicate (minus the self/staff bypass,
which doesn't apply to anon anyway), that function or a close variant looks like
the natural template.

## Finding 2 — Medium: the fallback state gives no signal that anything is wrong

Because of Finding 1, the *only* state a real visitor can ever reach is the
global Next.js-style 404 (screenshots below, all three breakpoints):

- Generic "404 / Page not found / Sorry, we couldn't find the page you're
  looking for."
- Three buttons: **Baseball Dashboard**, **Golf Dashboard**, **Go to Home** —
  all of which require login or send an anonymous recruiting contact into an
  unrelated marketing surface.
- A recruiter who was handed a shareable profile link (the entire purpose of
  this page) lands on a page offering them a login-gated dashboard for a product
  they may have no account on, with no path back to what they were trying to see
  and no indication whether the link is broken, expired, or private.

This is a reasonable *generic* 404 — clean, on-brand, consistent across
breakpoints, no layout breakage — but it's serving as the de facto "player not
found," "profile is private," and "recruiting not activated" states all at once,
none of which it was written for. `resolvePublicProfileAccess()` computes six
distinct denial reasons (`not_found`, `recruiting_off`, `college_player`,
`profile_private`, `program_disabled`, `coaches_only`) and the page code
discards all of that nuance by calling the same generic `notFound()` for every
one of them (`page.tsx:47-49`). Even once Finding 1 is fixed, a visitor hitting
a genuinely private or recruiting-inactive profile will see the identical
unhelpful 404. Worth deciding intentionally whether that's the desired product
behavior (hiding *why* is arguably a legitimate privacy choice) or whether at
least "recruiting_off"/"profile_private" deserve a softer, on-brand "this
profile isn't public" message instead of the same page used for mistyped URLs.

## Finding 3 — Low: unreachable states could not be evaluated

Because no player ID renders real content, the following could not be assessed
in this pass and should be re-checked once Finding 1 is fixed:

- The actual populated profile layout (`PlayerProfileClient.tsx`) at all three
  breakpoints — video tab, stats tab, achievements, recruiting-interest ("dream
  schools") list, contact-info opt-in gating, avatar/banner rendering.
- `loading.tsx`'s skeleton — present in the route but never observed rendering
  against real data since the page resolves to 404 quickly regardless.
- `error.tsx` — not triggered by any input tried; no server exceptions were
  observed (the access-denied path is handled gracefully via `notFound()`, not a
  thrown error, which is itself a small positive — no stack traces or 500s
  leaked to an anonymous visitor).
- Redaction behavior (GPA/SAT/contact/video-URL withholding per player settings)
  — the code in `page.tsx` shows real care here (explicit comments about a prior
  incident where this leaked via RSC payload), but it's unverifiable without a
  real, accessible row.

Not flagging these as defects — they're simply unverified, not confirmed broken,
and shouldn't be reported as bugs without evidence.

## Screenshots

All three show the identical generic 404 (only state reachable):

- `baseball-public-player-shots-2026-09-02/01-notfound-mobile-390x844.png`
- `baseball-public-player-shots-2026-09-02/02-notfound-tablet-768.png`
- `baseball-public-player-shots-2026-09-02/03-notfound-desktop-1440x900.png`

## Summary for prioritization

| # | Finding | Severity | Type |
| --- | --- | --- | --- |
| 1 | `baseball_players` has no anon SELECT grant in production → public player page 404s for every ID, always | **Critical** | Bug (DB/app-layer gap) |
| 2 | Six distinct access-denial reasons collapse into one generic, unhelpful 404 | Medium | UX gap (partly by-design ambiguity, worth an explicit decision) |
| 3 | Populated profile layout, loading skeleton, redaction behavior unverifiable | — | Unverified, not a defect |

**Is this realistically demo-able today? No.** Anyone shown this URL —
recruiter, investor, prospective customer — hits a bare "Page not found" with no
indication anything is wrong on Helm's end. This should be treated as a release
blocker for using this page in any demo or outbound link until Finding 1 is
fixed; it's a small, well-scoped DB change (the application code is already
written for it), not a redesign.
