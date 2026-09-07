# Implementation plan

Ordered by what the evidence supports, not by severity label. The first item is
an experiment, because the largest finding has an unproven cause and writing a
patch for it now would be guessing.

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

## T3 — Measure the twelve contrast nodes axe cannot reach

**Findings:** F-CONTRAST-01 (retracted), residual open item
**Current state:** the original contrast finding was withdrawn — the Sign in
label measures 5.02:1 and passes. But axe returns `color-contrast` as
**incomplete** for twelve nodes on the login page: the gradient-backed headings
(`h1 > span`, `h2`, `.z-20`) whose background it cannot resolve, and several
nodes whose ancestors contain an image. Incomplete is not a pass; those twelve
are simply unmeasured.

**Steps:** for each of the twelve, sample the actual rendered pixel behind the
text (canvas readback of a screenshot, or `getComputedStyle` up the chain where
the gradient stops are known) and compute the true ratio against both ends of
the gradient. Worst case governs.

**Non-goals:** do not change any token before a real number exists. The first
version of this task changed a token on a number that turned out to be an
artifact; that is the mistake this task exists to avoid repeating.

**Verification:** a table of twelve measured ratios in the run directory.
**Binary:** none. **Rollback:** nothing is changed by this task.

---

## T4 — Make autofocus a decision instead of a default

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

## T5 — Delete the dead `~ipad` orientation block

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
