# Mobile UI audit — dispositions

Findings closed without a code change, and the evidence that closed them.
A finding is only listed here once the check that would have justified the
change was actually run and came back negative.

## A05-007 — back-nine hole identity · NO_FIX (evidence)

The finding is a PROPOSAL whose own text makes the fix conditional: *"does
any metric ever compare 'this round's hole 5' against the same physical
course hole across rounds? … If no, no action needed."*

A metric that groups per physical course hole does exist —
`aggregateCourseHoles` (`src/lib/coachhelm/v2/mining/course-management.ts`)
keys on `${course_id}:${hole_number}`, and `hole_number` there is the
round's own 1..N numbering, which `FairwayNewRoundEntry.tsx` and
`FairwayHoleConfig.tsx` renumber to 1..9 for a back-nine selection. That is
the collision the finding describes.

The collision is not reachable with the data that exists. Queried against
production:

- every nine-hole round is at a course with no `golf_course_holes` rows at
  all, so `fetchCourseHoleYardages` has nothing to key against and the
  per-course-hole aggregate cannot mis-attribute one;
- comparing each nine-hole round's par sequence against its course's holes
  1-9 and 10-18 matched neither, in every case — there is no stored evidence
  that any round was played as a back nine.

The selection itself is client-only state (`nineSelection` in
`new-round-client.tsx`), used solely to slice hole configs. It is never
persisted: `golf_rounds.front_nine` / `back_nine` are score totals, not a
selector. So a durable fix means a schema change — a single nullable
`starting_nine` on `golf_rounds` is sufficient (the renumbering is a pure
offset, so round hole N maps back to course hole N+9), and is less schema
than the per-hole `course_hole_number` the audit proposed.

That migration is not written here. It would add a column no consumer reads
to fix a mis-attribution no row exhibits, and half-wiring a write path
against a column that does not yet exist breaks every round insert. If a
back-nine round is ever confirmed in the data, `starting_nine` is the fix.

## A02-004 — dashboard remount · NON_DEFECT

The finding states that `dashboard/template.tsx` "destroys local page state
on every dashboard navigation" and asks whether the reveal should move into
a persisting `layout.tsx`.

A page component unmounts on a route change regardless of whether a
`template.tsx` is present — that is the route change, not the template. A
`layout.tsx` preserves the *layout's own* subtree across navigations within
its segment, and that subtree is already a layout here: the shell, nav and
providers live in `(dashboard)/dashboard/layout.tsx`. The template wraps
`children` and holds no state of its own.

So moving the reveal into the layout would preserve nothing that is
currently lost, and would break the reveal: the template's per-navigation
remount is precisely the mechanism that makes it fire.

Checked every non-test page component under `(dashboard)/dashboard` for
local state that is not URL-synced. The largest holders — the round-entry
and continue-round clients — already persist their work through the draft
and emergency-save paths rather than relying on React state surviving a
navigation.

## Correction to commit c3b513ff0

That commit's body cites "A09-006 (and A09-005 for tasks)". A09-005 is the
foreground-push double-presentation finding (native banner + sound *and* an
in-app toast for one event), which that commit does not touch. The commit
implements A09-006 only. A09-005 remains open, with the owner's decided
policy — in-app toast only, suppressed during round entry — unimplemented;
its only verification path is the branch-gated iOS compile, so it is parked
with A01-001 rather than shipped blind from this branch.

## A02-005 — return-navigation replays the full skeleton · OWNER DECISION

Confirmed as filed. `/golf/dashboard`, `/dashboard/stats` and
`/dashboard/rounds` each declare `export const dynamic = 'force-dynamic'`,
and Next's client Router Cache gives dynamic segments a 0-second stale time
unless `experimental.staleTimes` overrides it. `next.config.mjs` sets no
`staleTimes`. Every one of those routes ships its own `loading.tsx`, so a
return-navigation is architecturally guaranteed to repaint the full-page
skeleton over content that was still valid.

Verified that the key is still accepted where the finding says it is:
`staleTimes: { dynamic, static }` is present under `experimental` in
`node_modules/next/dist/server/config-schema.js` for Next 16.3.4, so the
one-line fix would not be silently ignored.

Not landed, because the finding's own fix note reserves it: *"A global
`staleTimes` change affects every dynamic route in the app (not just golf)
and needs A00 sign-off; a per-route client cache is the narrower, safer
first step."* The two options, costed:

- **Global** — one line in `next.config.mjs` (`experimental.staleTimes.dynamic`,
  e.g. 30). Fixes golf, baseball, lifting and admin at once. The risk is the
  same breadth: every dynamic route in every sport may serve up to that many
  seconds of stale content on a back-navigation, including surfaces where
  freshness matters more than it does on a dashboard. `next.config.mjs` is
  also a config surface, so it is the owner's call, not an agent's.
- **Per-route** — a client-side cache keyed by scope (team/date/filter) on
  Home, Stats and Rounds only. Narrower blast radius and it can show the last
  good render instantly with a quiet background revalidate, which is what the
  C02 contract actually asks for. Materially more code, in three files that
  are already large.

Neither is blocked by anything technical; both need the owner to pick.

## A03-002 — radius drift · PARTIAL, by pixel-equality

The finding asks for all raw-Tailwind radii inside `src/components/fairway/**`
to move to the Fairway ramp. Done for the substitutions that are
pixel-identical, left for the ones that are not.

Two canonical utilities render exactly what a ramp step renders:
`rounded-md` === `rounded-fw-sm` (10px) and `rounded-2xl` === `rounded-card`
(20px). Those are the dangerous ones the finding actually describes — same
pixels, different token, silent divergence on any retune — and they carry zero
visual risk to change. 13 call sites converted, including both sites inside the
reference `Segmented` control.

The remaining 16 are `rounded-sm` (6px), `rounded-lg` (12px) and `rounded-xl`
(16px), and none has a Fairway equivalent: the ramp's smallest step is 10px.
Mapping them to "nearest" is a visual decision, not a token cleanup, and in
several cases a bad one — `AdoptionHeatGrid`'s 16px swatches, `SegmentBar` and
`FairwayRoundDetail`'s 10px legend dots, and the 18px data-table checkboxes
would all become circles or near-circles at a 10px radius. That wants a look on
a device before it lands.

`helm/no-duplicate-radius-in-fairway` (`eslint-rules/`) now blocks
re-introducing the two pixel-equal ones inside `src/components/fairway/**`,
verified to fire. It is deliberately NOT extended to `sm`/`lg`/`xl`, which
would red-light lint on 16 legitimate sites.

## A03-005 — two z-index ladders · PARTIAL, the safe half

Named the escape tier and left the sweep. `.z-dropdown` (globals.css) was a
hard-coded 1000 doing real work — a popover opened from inside a modal must
paint above it, and no tier in either ladder can express that, since
`--fw-z-dropdown` (30) sits below `--fw-z-modal` (50) by design. It is now
`--fw-z-popover-escape` in `design-tokens.css`, and globals.css reads the
token. Same number, so nothing moves; it is simply written down.

Not done: deleting the second ladder in `src/styles/tokens.css` and sweeping
~20 files onto the survivor. A stacking-order regression is invisible to lint,
typecheck and tests — the entire verification surface available here — and the
consequence is a menu behind a modal or a toast behind the nav bar, on any
sport. That sweep wants a device.

## A03-004 — asChild silently drops props · PARTIAL + a bigger finding

`busy` and `disabled` are now compile errors under `asChild` (a discriminated
union on `ButtonProps`), which is exactly what the finding proposed, and no
call site needed to move.

Restricting `leftIcon`/`rightIcon` the same way was attempted and reverted,
because the compile revealed the problem is much larger than filed: **37 call
sites across golf and baseball pass an icon to an `asChild` Button, and none of
those icons render.** A Slot takes one child, so the injected icon span has
nowhere to go. Affected files include `FairwayPlayerInsight` (6),
`FairwayPlayerProfile` (4), `GenomeDetailView` (4), `PerformanceCommandCenter`
(4), `CommandCenterFairway` (4), `FairwayPlayerDashboard` (3) and
`FairwayEffectiveness` (3).

The fix at each site is mechanical — move the icon inside the child element,
where it inherits the Button's flex/gap styling through the Slot. But it means
37 buttons across two sports start showing an icon they do not show today. That
is a real visual change and the owner should see it before it lands, so the
props stay permissive and documented in `button.tsx` rather than restricted.

Also landed from this finding: `--fw-dur-press` (60ms), applied on `:active`
only. Press states used to settle on the shared 180ms base, long enough to read
as lag rather than as touch; the release still eases back on the base duration.

## A12-004 — par-chip touch target · DONE, at 42x44 not 44x44

The chips paint at 36x36 and cannot simply grow: the row is
`grid-cols-[52px_1fr_104px]`, and three 44px chips plus two 6px gaps (144px)
plus the column's own `px-2` (16px) needs 316px of row width, which a 375px
phone does not have after page and surface padding. The target is expanded with
a pseudo-element instead, changing no layout: `-inset-y-1` gives 44px of height
(the row's `py-2` leaves 8px clearance, so it never reaches the row above or
below) and `-inset-x-[3px]` gives 42px of width, exactly consuming the 6px gap
with zero overlap between adjacent chips. 4px would have overlapped by 2px and
caused mis-taps, which is worse than 42px.

## A03-008 — three icon sets · RULE ONLY, as proposed

The finding's own fix is "require only NEW usage to prefer lucide-react, no
blanket migration". Recorded in `.claude/rules/design-system.md`. No code moved.
