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
