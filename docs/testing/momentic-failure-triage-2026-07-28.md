# Momentic run triage — 18 failed / 72 (run group `f05cb9fe`)

**Date:** 2026-07-28
**Source run:** `https://app.momentic.ai/run-groups/f05cb9fe-d296-40c6-a368-ed3f1bed3472`
**Branch under test:** `agent/fairway-crm-ui` (the `momentic/tests/**` suite is not on `main`)

Every failure below was traced to a cause in this repository. Each is labelled
**APP** (a real product defect — fixed or filed here), **TEST** (the test asserts
something the product does not and should not do, or uses a check that cannot
pass), or **NEEDS TRACE** (not resolvable without the run artifacts).

The run also reported `Machine was under pressure during this run (CPU saturated
2x)`. Treat every duration-sensitive verdict below as provisional — but none of
the causes found here are timing-related.

---

## Summary

| # | Test | Verdict | Cause |
|---|------|---------|-------|
| 3, 5, 8, 17 | `player-legacy-hub-redirect`, `coach-legacy-routes-redirect`, `products-hero-and-intro`, `player-classes-reachable` | **TEST** | `checkPageDoesNotContain: "404"` can never pass on any Helm page |
| 6, 7, 9 | `landing-scroll-sections`, `products-deep-sections`, `products-pillar-anchors` | **APP — fixed** | Anchor deep links never scrolled to the section |
| 14 | `player-standing-coherence` | **APP — fixed** | Standing card labelled the player's biggest leak as their "Best" |
| 2 | `idle-timeout-forces-reauth` | **TEST** | Malformed `cookie` value, and the scenario is unreachable by design |
| 16 | `coach-roster-player-profile` | **TEST** | Roster cards navigate via their "View player" CTA, not the card body |
| 18 | `player-notifications-mark-read` | **TEST** | Clicking a notification closes the panel and navigates away |
| 1, 4 | `coach-password-login`, `player-password-login` | **NEEDS TRACE** | Likely locator ambiguity on the password field; mitigation below |
| 10, 11, 12, 13, 15 | rounds + stats + team `act`/`extract` failures | **NEEDS TRACE** | Most likely seed-data dependent; see per-test notes |

---

## APP defects (fixed on this branch)

### 14 — Standing card announced the biggest leak as the "Best"

`src/components/golf/stats/spine-stage/StatsBento.tsx` gated the Standing
cell's chip on `strengths[0]` while its headline rendered `weaknesses[0]`:

```tsx
chip={bestCategory ? { tone: 'strength', text: 'Best' } : undefined}
headline={worstCategory ? { value: worstCategory.label } : undefined}
```

A player whose worst category was SG Putting therefore saw a green **Best**
chip sitting directly above the words **SG Putting**, while the sentence
underneath said "leaking most in putting". The card contradicted itself, and
the glanceable part (chip + headline) was the half that was wrong.

This is exactly what the test asserted, so the test was right and the product
was wrong. Chip and headline are now resolved together: lead with the leak
(reusing the `Leak` chip the other four category cells already use), and fall
back to the strongest category only when there is no weakness to report.

Regression coverage added in
`src/components/golf/stats/spine-stage/__tests__/StatsBento.test.tsx`
(both new cases fail against the previous component).

### 6, 7, 9 — Anchor deep links landed at the top of the page

`src/lib/motion/gsap/MarketingScrollProvider.tsx` routed anchor **clicks**
through Lenis but never looked at a hash that was already in the URL. So
`/products#stats`, `/products#products` and `/#golfhelm` — exactly what these
three tests navigate to — left the visitor in the hero.

Two things defeat the browser's own hash jump on these pages:

1. it runs before the scroll-driven scenes hydrate, so the target is not at its
   final offset yet; and
2. the `ScrollTrigger.refresh()` a frame later inserts pin spacers that move
   the target again.

Meanwhile Lenis has been constructed and owns the scroll position, and nothing
ever tells it a section was requested.

The provider now re-issues the jump after `refresh()` (immediately, so a deep
link still feels like a page load rather than a long auto-scroll from the
hero), and honours later `hashchange` events including back/forward between
anchors. The reduced-motion path gets the same correction natively, since it
has the same post-refresh layout shift without Lenis.

This is a user-facing bug beyond the test suite: every shared or bookmarked
link to a marketing section was broken.

> Note for test 7: the assertion looks for "85 measured stats". The product
> currently claims **87** (`src/app/products/page.tsx` metadata and the stats
> section copy). Re-check the expected number after the anchor fix lands, so a
> genuine copy drift is not masked by the scroll failure.

---

## TEST defects

### 3, 5, 8, 17 — `checkPageDoesNotContain: "404"` cannot pass on any Helm page

This is the single highest-yield finding: four failures, one cause, and the
check is a guaranteed false positive.

Next.js App Router serialises the root `not-found.tsx` boundary into the RSC
flight payload that is inlined into **every** page. Verified against live
production:

```console
$ curl -s https://helmsportslabs.com/products | grep -c '404'
1
$ curl -s https://helmsportslabs.com/products | grep -o '.\{60\}404.\{40\}'
sName\":\"text-8xl font-bold text-warm-200\",\"children\":\"404\"}],[\"$\",\"h2\",null,...
```

`/products` returns HTTP 200 and renders correctly, yet its HTML contains
`404`. The match comes from `src/app/not-found.tsx`'s `<h1>404</h1>`, not from
anything the visitor sees.

`"Page not found"` is inlined by the same payload and is equally unusable:

```console
$ curl -s https://helmsportslabs.com/products | grep -c 'Page not found'
1
```

**Fix the tests, not the app.** `scripts/fix-momentic-tests.mjs` does this
mechanically across the whole suite — run it from the branch that carries
`momentic/tests/`:

```bash
node scripts/fix-momentic-tests.mjs          # dry run, prints the plan
node scripts/fix-momentic-tests.mjs --write  # apply
```

It replaces each unusable check with a browser-side read of the **rendered
DOM**, which the flight payload cannot contaminate:

```yaml
- javascript:
    environment: browser
    code: |-
      const heading = document.querySelector('h1');
      const title = (heading?.textContent ?? '').trim();
      if (title === '404' || /^page not found$/i.test(title)) {
        throw new Error('Rendered the not-found page: ' + location.pathname);
      }
```

Replacement is one-for-one rather than de-duplicated, because one of these
checks can be the only step inside an `if.then` block and deleting it would
leave `then:` empty. The script is idempotent and also applies fixes 2, 16 and
the cookie half of 2 below. `checkPageDoesNotContain: "Application error"` is
left alone — that string is a Next.js runtime message, not serialized component
copy, and does **not** appear in a healthy page's HTML (verified: `grep -c` → 0).

If you would rather hand-write the replacement, these also work:

* Assert the status out of band, which is what these tests actually mean:

```yaml
- request:
    url: "{{ env.BASE_URL }}/products"
    saveAs: PRODUCTS_RESPONSE
- javascript:
    code: |-
      if (env.PRODUCTS_RESPONSE.status !== 200) {
        throw new Error(`Expected 200, got ${env.PRODUCTS_RESPONSE.status}`)
      }
```

* Or assert on real content, which is the more durable check anyway:

```yaml
- checkElementVisible: The GolfHelm intro heading in the products pillar section
```

* Or, if a negative check is genuinely wanted, use the AI assertion (it reasons
  over the rendered page, not the inlined script payload):

```yaml
- assert: The page shows real product content, not a not-found or error page
```

Audit the whole suite for `checkPageDoesNotContain: "404"` and
`checkPageDoesNotContain: "Page not found"` — every occurrence is a latent
false positive, including in the 54 tests that passed for unrelated reasons.

### 2 — `idle-timeout-forces-reauth`

Two independent problems.

**The `cookie` step is malformed.** Momentic's `cookie` command takes a bare
`name=value` string. The test passes cookie *attributes* inside the value:

```yaml
- javascript:
    code: return 'sb_last_activity=' + (Date.now() - 9 * 60 * 60 * 1000) + '; Path=/'
    saveAs: STALE_ACTIVITY_COOKIE
- cookie: "{{ env.STALE_ACTIVITY_COOKIE }}"
```

The `; Path=/` suffix ends up in the cookie value. Drop it:

```yaml
- javascript:
    code: return String(Date.now() - 9 * 60 * 60 * 1000)
    saveAs: STALE_ACTIVITY_MS
- cookie: "sb_last_activity={{ env.STALE_ACTIVITY_MS }}"
```

The cookie name and the epoch-ms format are correct — see
`SESSION_IDLE_COOKIE` and `parseLastActivity` in
`src/lib/auth/session-idle-shared.ts`.

**But the scenario is still unreachable**, and deliberately so. `updateSession`
refuses to idle-expire a session that is younger than the idle window
(`src/lib/supabase/middleware.ts`):

```ts
const sessionYoungerThanWindow =
  Number.isFinite(lastSignInMs) && now - lastSignInMs < idleTimeoutMs;

if (!sessionYoungerThanWindow && isSessionIdleExpired(lastActivity, now, idleTimeoutMs)) {
```

That guard exists because of a real 2026-07-20 incident where a stale marker
from a previous session logged users out minutes after a fresh sign-in. A
Momentic test that logs in and then back-dates the cookie can never trip the
timeout: `last_sign_in_at` is seconds old, and the standard window is 8 hours.

Idle timeout is already covered deterministically by
`src/lib/supabase/__tests__/middleware-idle-timeout-public-routes.test.ts` and
`middleware-admin-idle-timeout.test.ts`. Delete the browser test rather than
weakening the guard to make it pass.

### 16 — `coach-roster-player-profile`

The step is `click: the first player card or player name on the roster`, then
`waitForUrl: /golf/dashboard/roster/`. Neither the card body nor the player
name is a navigation target. `FairwayPlayerCard` exposes exactly one route
into the profile, a full-width primary CTA:

```tsx
<Button asChild variant="primary" size="md" className="w-full" ...>
  <Link href={`/golf/dashboard/roster/${player.id}`}>View player</Link>
</Button>
```

The card also carries a status badge, an intent control and an actions menu, so
making the whole card one click target would nest interactive elements inside a
button — the hydration-crash class that `CLAUDE.md` explicitly calls out. The
route the test expects is correct; only the affordance is wrong:

```yaml
- click: the "View player" button on the first roster card
```

### 18 — `player-notifications-mark-read`

The test marks a notification read and then asserts the row shows as read and
the badge decreased. Neither is observable, because `handleItemClick` in
`src/components/fairway/notifications/NotificationBell.tsx` closes the panel and
navigates away in the same gesture:

```ts
setItems(/* optimistic read */);
setOpen(false);
if (item.action_url) router.push(item.action_url);
if (wasUnread) void markNotificationRead(...).then(() => badges.refetch());
```

There is no per-row "mark read" affordance that keeps the panel open — the only
one is **Mark all read**. Rewrite the test against what exists:

```yaml
- click: the notifications bell
- if:
    assert: The Mark all read button is enabled
    then:
      - click: Mark all read
      - assert: The notification list no longer shows any unread indicator
```

Assert the bell badge separately, after the panel closes, rather than in the
same step as the click.

> Worth a product conversation, not a bug: a per-row mark-read control that
> does not navigate is a reasonable gap to close. Filed as an observation only —
> nothing here is broken.

---

## Needs the run trace

### 1, 4 — `coach-password-login` / `player-password-login`

Both fail on the **password** `type` step, immediately after the email step
succeeded on the same form. Nothing in `golf-sign-in-form.tsx` unmounts the
form between those two steps: the auth probe in
`src/app/golf/(auth)/login/page.tsx` resolves once, before the form renders,
and only swaps it out when a session already exists (which would have failed
the email step first).

The most likely cause is locator ambiguity. `src/components/ui/input.tsx`
renders a show/hide toggle for every `type="password"` field with
`aria-label="Show password"`, so an AI locator resolving "Password input" sees
two candidates: the textbox (accessible name "Password") and that button.
Typing into the button is an action failure of exactly this shape.

Both ids are stable and server-rendered, so pin the targets and remove the
ambiguity entirely:

```yaml
- type:
    text: "{{ email }}"
    css: "#golf-signin-email"
    clear: inputs
- type:
    text: "{{ password }}"
    css: "#golf-signin-password"
    clear: inputs
```

If it still fails with pinned selectors, the run video will show whether the
form was replaced by the "You're already signed in" panel — which would mean
the cached auth module leaked a session into a test whose whole purpose is to
exercise a cold login. In that case give these two tests their own cache key,
or clear state before the `before` section.

### 10, 11 — `save-and-exit-in-progress`, `start-round-shot-ui`

Both fail at the first interaction on `/golf/dashboard/rounds/new` — clicking
"the first recent course card". A player with no round history has no recent
courses, so there is nothing to click and the step fails rather than falling
through to an empty state.

This is the golf seed gap already documented in
`docs/research/feature-scan-2026-07-26/helm-test-personas-and-seed-data.md`
(§1: "Golf lacks first-class CI seed parity with baseball — blocker for
reliable golf E2E"). Confirm the persona has completed rounds against a seeded
course before treating either as a product defect. If the picker really is
empty, the honest test is an empty-state assertion plus a course-search path,
not a click on a card that may not exist.

### 12, 15 — `coach-create-qualifier`, `coach-recurring-practice-count`

Both fail inside a multi-step `act` that fills a form. `act` failures are the
hardest to attribute without the trace: a missing required field, a disabled
submit, or a validation message the agent did not resolve all look the same
from the summary. Note that 15 reported "Unknown error" rather than an action
failure, which points at the runner rather than the page.

**Ruled out — label association.** The obvious suspect was that Fairway forms
render unlabelled inputs: `FormField` documents a `control` render-prop that it
does not implement (it renders `{children}` directly), which would leave Base
UI's `Field.Label` with nothing to associate to and every field without an
accessible name. That is not what happens. `src/components/fairway/forms/Input.tsx`
renders Base UI's own `<Input>`, which consumes the surrounding `Field` context
and wires the id/aria itself, and `TextArea` goes through `Field.Control`. The
qualifier name field is properly labelled. Do not re-investigate this.

What is left as the likely cause is scope: `/golf/dashboard/qualifiers/new`
(`FairwayNewQualifier`) is not a flat form. It requires a name, a `min={today}`
native date input, a per-round course assignment through the multi-stage
`FairwayCoursePicker` (course shelf → tee), and player selection — which renders
an `EmptyState` ("No active players on your roster") when the coach's team has
no active `golf_team_members`. A single `act` covering all of that has many ways
to stall.

Per Momentic's own guidance on writing effective AI actions, split these into
explicit `type`/`select`/`click` steps for the fields that are known and stable
(title, dates) and keep `act` only for the genuinely dynamic part. That will
also make the next failure point at a specific field.

### 13 — `cross-surface-coherence`

Fails on the second `extract` — the scoring average for the player pulled by
the first extract. Most likely the team stats table does not expose a scoring
average column for that player (or shows an em dash for a player without
enough rounds), in which case the extract has nothing to return.

Same seed dependency as 10/11. Guard the extract with a precondition:

```yaml
- if:
    assert: The team stats table shows a numeric scoring average for at least one player
    then:
      - extract: ...
```

---

## Recommended order

1. Run `node scripts/fix-momentic-tests.mjs --write` on the suite branch. That
   clears four failures outright (the unusable `404` checks), unblocks the login
   pair and the roster click, and removes the malformed cookie step — zero
   product risk, and it also repairs the same useless check wherever else it
   appears in the 54 currently-passing tests.
2. Pin the login form selectors (`#golf-signin-email` / `#golf-signin-password`)
   and re-run 1 and 4. Two tests, and they gate the cold-login path.
3. Re-run 6, 7, 9 and 14 against this branch to confirm the two app fixes.
4. Retarget 16 and 18 at the affordances that exist; delete 2.
5. Seed a golf persona with completed rounds, then re-run 10–13 and 15 before
   attributing any of them to the product.
