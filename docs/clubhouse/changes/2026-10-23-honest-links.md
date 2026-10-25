# 2026-10-23 — Links that tell the truth (Clubhouse A+ WP-4)

## 2026-10-23 — Navigation links are silent (A14)

```text
Design package: none (Clubhouse A+ handoff, section 5, A14)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Fifteen links lost their `haptic('select')`: Stats' previous and next
  player, the roster profile's View stats, CoachHelm's Development chip, Deep
  dive's round, hole, plan and message links, Keep reading, Open the read, the
  board's player names, Home's day-card Nudge and Message and its quick-event
  chips, and the Rounds library cards. Primary actions keep `haptic('press')`.
- A `no-restricted-syntax` rule in the Clubhouse ESLint block rejects
  `haptic('select')` inside a `<Link>`'s attributes.

### Why

- D-70: every other tap is silent, and iOS does not tick on navigation.

### Verification

- New `silent-links.test.ts`: a line-based scan finds no `<Link>` that ticks
  'select', and the Rounds start link still ticks 'press'. `npx eslint
  src/clubhouse` is clean under the new rule.

## 2026-10-23 — Controls that do what they say (A16)

```text
Design package: none (Clubhouse A+ handoff, section 5, A16)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The command palette's New message opens Messages with New message open
  (`?compose=1`), Post announcement opens Team Hub's composer
  (`?tab=ann&compose=1`, coaches only), and Add class opens the add form
  (`?new=1`). Each screen opens it once and cleans the address.
- Home's join-request line opens the roster on its requests (`?tab=requests`).

### Why

- Three palette actions named a form but only opened a page, and the join-
  request line opened the roster without the requests.

### Verification

- `commands.test.ts`: the three hrefs. `messages.test.tsx`, `hub.test.tsx`,
  `classes.test.tsx`: each address opens its form and cleans itself. `home-
  coach-parity.test.tsx`: the joins href.
- Not changed: a coach's round still says "‹ Stats" (to that player's rounds),
  as the owner set in D-53; from the Rounds list it already says Rounds. A16
  part 3 waits on the owner.

## 2026-10-23 — Old player links reach Stats (A30)

```text
Design package: none (Clubhouse A+ handoff, section 5, A30)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The players alias covers everything under `/golf/dashboard/players/<id>`,
  which is where next.config sends an old player or genome link before any
  layout runs, so the coach's redirect to Stats fires instead of the not-
  rebuilt page.
- `coachhelm/genome/[playerId]/layout.tsx` is marked as never reached (G2) and
  kept as a guard.

### Why

- An old link to a player (a push, an email, a bookmark) ended on "Players
  hasn't been rebuilt yet".

### Verification

- New `alias-served-urls.test.ts` reads next.config's redirects and checks
  each dashboard destination is rebuilt or aliased for a coach, with the four
  player addresses named. `alias.test.ts` now checks the served genome
  address.
- Not run: the dev-server check as a signed-in coach. G3 (a coach on classes,
  rounds/new, rounds/recover) waits on the owner.
