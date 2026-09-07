# Implementation plan

Ordered by what the evidence supports, not by severity label. The first item is
an experiment, because the largest finding has an unproven cause and writing a
patch for it now would be guessing.

---

## T0 — Reproduce the sign-out failure

**Findings:** F-SIGNOUT-01
**Current state:** observed once. Sign out showed a pending state, the sheet
dismissed, and the session was still live ~29 seconds later. A second attempt
worked. This is the only correctness bug in the audit; everything else is craft,
which is why it goes first even though it was found last.

**This is a reproduction task, not a patch.** Attach a console and network
capture to the simulator, sign in and out repeatedly, and record whether the
signOut call rejects, times out, or resolves while the session survives. Only
then decide the fix.

**Regardless of cause, two invariants are already known to be wrong:** the sheet
must not dismiss on an unconfirmed sign-out, and a failed sign-out must surface
a visible error. Those can be specified now.

**Acceptance:** a reproduction with a captured cause, or a documented failure to
reproduce over N attempts. **Verification:** simulator, then device.
**Binary:** none — web layer. **Rollback:** n/a, nothing is changed here.

---

## T1 — Isolate why the accessibility tree is empty

**Findings:** F-A11Y-NATIVE-01
**Current state:** `snapshot-ui` on a populated coach dashboard returns 18
elements, 0 interaction targets, 1 scroll area, and `wait-for-ui --predicate
textContains` resolves none of four visible on-screen strings. The same harness
returns 14 labelled targets from Settings and resolves "General" by text, so the
harness is sound. Enabling `ApplicationAccessibilityEnabled` changes nothing.
There is no accessibility code in `ios/App/App/*.swift`. Both paths tried sit in
the same API family; XCUITest and VoiceOver are untried.

**This is a bounded experiment, not a fix.** Three candidate causes, in the
order they should be tested:

1. Attach Xcode's Accessibility Inspector to the running simulator app. If it
   enumerates web content, WKWebView's remote tree only materialises for a real
   assistive client and the finding is about testability, not users.
2. If the Inspector also sees nothing, build a throwaway WKWebView host that
   loads the same URL with default configuration. If that one exposes content,
   the cause is in Helm's Capacitor/WebView configuration and is findable.
3. If neither exposes content, the cause is upstream of Helm and the question
   becomes what Apple's WebView does on this OS version.

**Non-goals:** do not add `accessibility*` attributes to Swift, and do not touch
web ARIA, until step 1 has answered the question. Both would be changes made
against an unknown cause.

**Acceptance:** a written answer to "can VoiceOver reach the bottom nav" backed
by an Inspector session or a device.
**Verification:** device required. **Binary:** unknown until the cause is known.
**Rollback:** nothing is changed by this task.

---

## T1b — The seven visual defects from the walkthrough

**Findings:** F-NAVCLIP-01, F-SEGMENTED-01, F-NUMERALS-01, F-TRUNCATE-01,
F-SHEETFOOTER-01, F-RAWDATA-01
**Why grouped:** five of the six are one-line fixes in a *shared* component or
token, and each is visible on multiple screens. Fixing them per screen is the
failure mode to avoid.

1. **Bottom-nav clearance** (F-NAVCLIP-01, seven screens) — add it in the shared
   shell. `AGENTS.md` already requires the shell to provide it, so this is an
   unmet existing contract, not a new rule.
2. **Segmented-control inset** (F-SEGMENTED-01, three instances) — the active
   pill needs inset padding and the status dot needs to sit inside it.
3. **Display numerals** (F-NUMERALS-01) — keep Fragment Mono for small tabular
   columns if wanted; set display-size figures in the sans face with
   `font-variant-numeric: tabular-nums`. Then settle the Stats/Rounds
   inconsistency in one direction.
4. **Sheet footer clearance** (F-SHEETFOOTER-01) — same shape as item 1, and give
   the disabled CTA a real disabled treatment.
5. **Truncation** (F-TRUNCATE-01) — the invite link is the functional one; let it
   wrap or scroll. Let the roster column flex.
6. **Display formatters** (F-RAWDATA-01) — a relative-time formatter and a
   category label map.

**Non-goals:** do not touch Courses, the Strokes Gained card, or the login
screen. They are the strongest work in the app and nothing here implicates them.
**Verification:** screenshot review on the affected screens; a device pass for
the numerals. **Binary:** none. **Rollback:** per item.

---

## T2 — Raise the 59 stragglers to the 44pt floor the system already uses

**Findings:** F-TAP-01, F-SEARCH-HEIGHT-01
**Current state:** 373 of 432 controls (86%) are already at least 44pt and the
modal height is exactly 44pt, so the floor exists and is honoured. 59 controls
(14%) fall below it, clustered in the tab strip (38pt), chips (30-36pt),
insights CTAs (36-40pt), the search field (20-40pt) and two roster row controls
(20-24pt). Their heights are explicit in their class names, so each is a local
override or a component predating the floor.

**Close the gap; do not invent a convention.** The norm already exists — raise
the offending shared components to it. Patching the roster, then insights, then
rounds screen-by-screen would manufacture exactly the competing vocabularies
this work exists to end. Consider naming the existing 44pt norm as a token so
the next component inherits it rather than rediscovering it.

**Steps:**
1. Add the token; raise the shared tab strip, chip, field and button components.
2. Where a design genuinely needs a smaller *visual* control, keep the visual
   size and extend the hit area with padding or a pseudo-element. This is the
   standard technique and it satisfies 44pt without redrawing anything.
3. Converge the four search-field call sites (F-SEARCH-HEIGHT-01) onto the
   shared field component. Read the four call sites first — whether this is four
   components or one with four overrides is unresolved and changes the fix.
4. Re-run the signed-in sweep and turn `smallTapTargets.length` into an
   assertion.

**Non-goals:** the seven calendar day cells. A 7-column grid on a 390pt phone
cannot reach 44pt per column and Apple's Calendar has the same constraint.
**Verification:** the sweep is the gate; a real thumb on a device is the actual
test. **Binary:** none — web deploy only. **Rollback:** revert the token.

---

## T3 — Close the player-side contrast gap, then measure what axe cannot reach

**Findings:** F-CONTRAST-PLAYER-01, plus the F-CONTRAST-01 residual
**Current state:** six of eight player screens carry serious contrast
violations, worst on my-standing (43 nodes), measured at 4.03-4.06:1 against a
4.5:1 requirement. Confirmed by axe and by an independent canvas-readback
measurement that agree to within rounding.

**Extend, do not add:** the failing combinations are token pairs (`#238d46` on
`#fff9ee`, `#d7f4db` on `#248342`) recurring across unrelated screens. Fix them
in `src/styles/design-tokens.css`, never per screen. The margins are small, so a
modest darkening of the green clears every instance.

**Cross-sport scope:** the green tokens are shared, so BaseballHelm inherits the
change. Desirable, but the visual diff is wide — check both products.

**Then, separately:** the login page still returns twelve `color-contrast`
*incomplete* nodes (gradient backgrounds, image-bearing ancestors). Incomplete
is not a pass. Sample the actual rendered pixels for those twelve and compute
real ratios against both ends of each gradient; worst case governs.

**Non-goals:** do not change a token on an unverified number. The first version
of this audit did exactly that and had to retract it.
**Verification:** player sweep reports zero serious color-contrast violations.
**Binary:** none. **Rollback:** revert the token values.

---

## T4 — Retitle the four player pages (trivial)

**Findings:** F-TITLE-01
`my-standing`, `my-development`, `my-game-profile` and `my-insights` report
document titles of "CoachHelm | GolfHelm". `my-qualifiers` already does it
correctly — copy that. **Verification:** assert `document.title` per route in
`journeys.spec.ts`. **Rollback:** revert the metadata.

---

## T5 — Make autofocus a decision instead of a default

**Findings:** F-KBD-AUTOFOCUS-01
**Current state:** `useMediaQuery('(pointer: fine)')` is re-declared inline in
six components; the other `autoFocus` sites in the golf/fairway tree have no
gate. The confirmed ones are enumerated in `FINDINGS.json`'s `sourceLocations`;
a raw grep total is deliberately not quoted, because it mixes in sites gated on
unrelated conditions and one non-JSX `autoFocus: true` in an options object.
**Before/after:** opening a sheet on a phone stops throwing the keyboard over
half of it.

**Steps:**
1. Extract `useFinePointer()` into `src/hooks`; repoint the six existing sites.
   Pure refactor, no behaviour change — land it on its own.
2. Walk the enumerated ungated sites and decide each. Some should keep focusing: a
   dedicated full-page "log progress" form is not a sheet. Record the decisions.
3. Add an ESLint rule forbidding bare `autoFocus` under `src/app/golf/**` and
   `src/components/fairway/**`, with the gated form as the allowed spelling —
   the same shape as the existing `helm/*` rules.

**Non-goals:** not a sweep. Step 2 is a judgement call per site, and step 3's rule
is what stops the next one starting ungated.
**Verification:** the ESLint rule proves the rule; the *feel* needs a device
pass over the changed surfaces.
**Binary:** none. **Rollback:** per-site.

---

## T6 — Delete the dead `~ipad` orientation block

**Findings:** F-PLIST-IPAD-01. One key, one line, ships in the next binary
whenever one is built. Not worth a build of its own.

---

## Deliberately not planned

- **A native UI test suite.** Until T1 answers, there is nothing to select and
  no suite to write. Maestro was not installed for this reason; its documented
  pilot flow depends on placeholder text being visible in the native tree, and
  it is not.
- **The 67 non-barrel `svg-without-a11y` sites.** Real work, but low value
  against the two P1s, and a sample suggests most sit inside already-labelled
  links.
- **Anything in the round-entry, messaging, or durability journeys.** Those are
  BLOCKED on production-write authorization, not on engineering effort.
