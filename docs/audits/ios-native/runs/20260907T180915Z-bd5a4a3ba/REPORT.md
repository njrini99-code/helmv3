# Helm iOS Native Experience Audit

## Verdict and evidence limits

**INCOMPLETE**, deliberately. Static review, WebKit browser evidence and native
simulator evidence were all collected. Every physical-device check is unrun —
no iPhone was available — and roughly half the journey matrix is blocked
because the shell is hardcoded to production and this run had read-only
authorization.

Two confirmed P1 findings, one of which is a confirmed *symptom* with an
unproven cause. Two previously-reported findings verified fixed against the
compiled binary rather than the source. Nothing here required a redesign, and
none is proposed.

The honest one-line answer to "what makes it feel like a website in a phone":
this run did not get far enough to answer that. What it did find is that the
app is invisible to iOS's own accessibility layer, which is a more concrete
problem than the one that was asked about.

## Exact shell, web, backend, and device identities

| | |
|---|---|
| Checkout | `agent/ios-native-experience-audit` @ `bd5a4a3ba20d`, clean |
| Binary | `com.helmsportslabs.golfhelm` **2.0 (10)**, Release, simulator |
| Build product | `Helm Sports Labs.app` — *not* `App.app` |
| Web revision | **unknown** — see below |
| Backend | production. There is no staging copy |
| Device | iPhone 17 simulator, iOS 26.5, portrait |
| Account | coach, "Demo University Golf", session already present on the simulator |

The web revision is genuinely unknown and it matters. `capacitor.config.ts`
pins the shell to `https://www.helmsportslabs.com/golf/dashboard`, and 18
commits are merged to `main` but not shipped. So the binary is built from
`bd5a4a3ba20d` while the UI it renders is some older revision. Web-layer
findings here describe **what is live**, which is the right target for an
experience audit but is not what is in `main`.

No credential was typed. The simulator's WebView data store already held an
authenticated session from earlier owner work, which is itself consistent with
the documented contract that the launch-time cache clear touches disk and memory
caches only and never cookies.

## The visual walkthrough (added after the measurement passes)

The measurement passes above collected numbers, not judgement. The owner then
asked for the real app to be driven by hand and looked at. That happened, in the
shipped simulator build, on both accounts — and it produced the most important
finding in the audit (`F-SIGNOUT-01`) plus six visual ones the scripts could
never have seen. Full account with screenshots: **`VISUAL-WALKTHROUGH.md`**.

Two things worth stating up front. **The app has real strengths** — Courses,
the player Strokes Gained card, and the login screen are genuinely good and
should not be rebuilt. And **the walkthrough had to run on raw screen
coordinates**, because every tap command in the iOS automation toolchain needs
an element reference and this app exposes none. That is F-A11Y-NATIVE-01 costing
something concrete rather than hypothetically.

## Highest-impact findings

**1. F-SIGNOUT-01 (P1) — sign-out silently failed and left the session live.**
Tapping Sign out showed a "Signing out…" pending state, the sheet closed, and
**~29 seconds later the app was still fully signed in** on the coach dashboard
with all team data visible. No error, no toast, no retry. A second attempt
worked immediately.

Seen once, so the mechanism is unproven and the frequency unknown — but the
failure *mode* is what matters: the user is given a sign-out that completes its
animation and leaves them logged in. On a borrowed or shared phone that is a
privacy problem, not a polish one. Everything else in this audit is about how
the app feels; this one is about whether it does what it says. Reproducing it
under a console and network capture is the first thing to do.

**2. F-A11Y-NATIVE-01 (P1) — iOS UI automation cannot see anything inside the
WebView.** A coach dashboard visibly showing a title, a greeting, three sheet
CTAs and a bottom nav produces a runtime accessibility tree of 18 elements, all
full-screen unlabelled containers, with **zero interaction targets** — and no
on-screen string ("Dashboard", "Sign", "Players", "Schedule") resolves by text
predicate either. Two independent query paths, same answer. The control makes it
solid: the same harness against Apple's Settings app returns fourteen labelled
tappable targets and resolves "General" by text.

One confound had to be eliminated before this stood up. The first text probe
searched for "Dashboard", "Players" and "Schedule" — all of which happened to be
*behind* an open push-permission sheet. That component is built on Radix Dialog,
which `aria-hidden`s the background while open, so those strings being
unreachable was correct behaviour and proved nothing. Re-probing for
**foreground** text on the sheet itself — "Not now", "Stay in the loop",
"Enable Notifications" — also resolves nothing. The confound is gone and the
finding is stronger for it. Enabling accessibility on the
simulator changes nothing, and there is no accessibility code anywhere in the
Swift shell to explain it.

**What is proven is narrower than it sounds, and the distinction carries the
whole finding.** Both paths used sit in the same accessibility API family.
XCUITest — the path Xcode UI tests and Maestro drive, and the one that normally
*does* surface buttons and links inside a Capacitor WebView — was not exercised.
Neither was VoiceOver. So the claim this run supports is: *this automation
harness sees zero targets inside GolfHelm.* Whether VoiceOver sees them is
**open**, and the observed shape (18 elements, all role `other`, stopping at the
WebView container) is the textbook signature of a remote accessibility tree that
was never *requested* — WKWebView builds it lazily for an attaching assistive
client — at least as much as it is a signature of content being suppressed.

If Xcode's Accessibility Inspector can see the web content, this is a testability
problem: nothing can be automated, but users are fine. If the Inspector sees what
the harness saw, VoiceOver cannot drive GolfHelm at all. Those are two very
different products, and nothing collected this run distinguishes them. Resolving
it is the first item in the plan and it needs a person at a Mac with the
Inspector open.

**3. F-TAP-01 (P2) — 59 controls escape the design system's own 44pt floor.**
The encouraging part first: **the floor already exists and is honoured.** Of 432
visible interactive controls across eight signed-in screens, **373 (86%) are at
least 44pt tall, and the single most common height is exactly 44pt.** Whoever
set that got it right and it is applied widely.

The other **59 (14%)** fall below, and they cluster in a handful of shared
components rather than scattering at random: the section tab strip used on five
screens (38pt, inside a 39pt nav, so no slack for an off-centre thumb), the
filter chips (30–36pt), the insights CTAs (36–40pt), and worst, the roster's
per-player status toggle (76×24) and intent chip (88×20) — about a fingernail
tall, repeated once per player, roughly 2pt apart vertically.

Because the floor is already the norm, this is gap-closing against an
established convention, not a new one — which makes it markedly lower risk than
it first looks. The offending heights are explicit in the class names
(`min-h-[36px]`, `h-7`, tab padding `10px/14px/12px`), so each is a local
override or a component that predates the floor.

Seven calendar day cells measure 37pt wide and are **excluded**: a 7-column
month grid on a 390pt phone cannot give each column 44pt, and Apple's own
Calendar has the same constraint.

**4. F-SEARCH-HEIGHT-01 (P2) — the same search field is four different heights.**
40pt on messages, 32pt on rounds, 24pt on qualifiers, 20pt on roster — against a
system norm of 44. All four are wrong, by four different amounts. Nobody
consciously notices this, which is precisely why it reads as "website": native
apps are visually predictable, and a control that resizes as you move between
tabs quietly says these screens were built by different hands at different
times. On roster the tappable input is a 20pt strip inside a 36pt bordered box,
so the visual control and the actual target disagree too.

**5. F-CONTRAST-01 — RETRACTED. It was a measurement artifact, not a defect.**
An earlier pass of this audit reported the Sign in label at 3.52:1 light /
3.61:1 dark, below the 4.5:1 AA minimum. That was wrong. axe-core had run before
the login form finished its entrance transition, so it sampled a
partially-transparent button composited against the cream page — colours that
appear in no frame a user ever sees. Settled and measured directly, the label is
`#ffffff` on `#15803d` = **5.02:1**, which passes. The spec now waits for the
entrance transition to settle before calling axe, records whether settling
happened, and fails loudly if it did not; `await document.fonts.ready`, which it
relied on before, does not wait on CSS transitions.

One real item survives the retraction: axe now reports color-contrast
**incomplete** for twelve nodes on this page — gradient backgrounds and
image-bearing ancestors it cannot sample. Incomplete is not a pass. Those nodes
are unmeasured, and checking the gradient headings by hand is still outstanding.

**6. F-CONTRAST-PLAYER-01 (P2) — the player screens have real contrast failures,
and this time I checked twice.** Six of eight player screens carry serious
contrast violations; my-standing alone has 43. The measured ratios sit at
**4.03–4.06:1 where 4.5:1 is required** — brand green on cream (`#238d46` on
`#fff9ee`) and pale green on green (`#d7f4db` on `#248342`), at 12px and 15px.

Given that this audit already retracted one contrast finding, these were
verified by a second, independent in-page measurement that resolves the app's
`oklab()` colours through a canvas readback. It reproduced axe's numbers to
within rounding (4.06 vs 4.05; 4.03 vs 4.03). Two methods, same answer. The
margins are small, but they are real, they are on the screens players use most,
and this is an app read outdoors.

It is a token pair, not a component: the same combinations recur across
unrelated screens, so nudging the green in `design-tokens.css` clears all of
them at once.

**7. F-TITLE-01 (P3) — four player screens are titled "CoachHelm" to a player.**
`my-standing`, `my-development`, `my-game-profile` and `my-insights` all report
a document title of "CoachHelm | GolfHelm" — the name of the coach tool.
`my-qualifiers` gets it right, so the correct pattern is already in the tree.

**8. F-KBD-AUTOFOCUS-01 (P2) — autofocus is gated in six components and ungated
at most other sites.** The codebase already knows the right answer:
`autoFocus={finePointer}`, where `finePointer` is `useMediaQuery('(pointer: fine)')`.
It just is not shared — the hook is re-declared inline in six components, so the
pattern only spreads by copy-paste and every new surface starts ungated. On a
phone the ungated ones throw the keyboard up over half the sheet before the user
has decided to type. Messages, coach notes, log-progress, expenses and three
auth pages are among them.

**9. F-BRAND-01 (P3) — two brand marks in three seconds.** The splash carries
the ship's-wheel company mark; the login screen 0.5s later carries the
golf-ball-in-wheel product mark. Reported in August, unchanged, and still an
owner decision rather than a defect.

**10. F-PLIST-IPAD-01 (P3) — a dead `~ipad` orientation block still ships.**
The iPhone array is correctly portrait-only; the `~ipad` array still lists all
four orientations in an app whose device family is iPhone-only.

## What already works and must not be rebuilt

Verified this run **against the compiled binary**, not the source:

- **Portrait lock** — exactly one entry in `UISupportedInterfaceOrientations`.
  F-ORIENT-01 from August is fixed.
- **Dark and Tinted app icon variants** — `UIAppearanceDark` and
  `ISAppearanceTintable` are both present in the compiled `Assets.car`.
  F-ICON-01 from August is fixed.
- **Splash and hide-on-ready** — the cream splash holds for ~2.4s and gives way
  to real content at t+2.8s. No stuck splash, no white flash, no error state.
- **Session durability across reinstall** — the authenticated session survived
  installing a freshly built binary over the existing one.

Confirmed present in source and deliberately not re-litigated, because the
August audit already verified them and nothing this run contradicts them: the
semantic haptic grammar and its preference gate, the push park-then-flush state
machine, the status-bar theme sync, the WKWebView cache scoping, associated
domains, the bottom-nav/MoreNavSheet system, `fairway/overlays/Sheet.tsx`, and
the four-tier round-durability stack.

## Journey coverage: passed, failed, blocked, not run

Full table in `COVERAGE.md`. Summary: **1 passed** (cold launch), **1 pass** (signed-out login render and its axe scan, after the entrance-settle
fix; twelve contrast nodes remain unmeasurable by axe), **2 partial**, **4 blocked**, **5 not run**.

The owner supplied throwaway coach and player test accounts mid-run, which
unblocked a read-only sweep of eight signed-in coach screens — navigations,
scrolls and measurements only, nothing submitted, sent, edited or deleted. That
sweep produced F-TAP-01 and F-SEARCH-HEIGHT-01, the two findings most directly
about why the app feels like a website.

The player account was then swept the same way across eight player-only screens,
which produced F-CONTRAST-PLAYER-01 and F-TITLE-01 — neither visible from the
coach side at all.

Still unexercised: every write journey (J05-J08, J10) and every physical-device
check. The first is a deliberate authorization boundary; the second is a
hardware gap.

## Confirmed defects

F-TAP-01, F-SEARCH-HEIGHT-01, F-CONTRAST-PLAYER-01, F-TITLE-01,
F-KBD-AUTOFOCUS-01, F-BRAND-01, F-PLIST-IPAD-01, the seven walkthrough findings
(F-NUMERALS-01, F-SEGMENTED-01, F-NAVCLIP-01, F-TRUNCATE-01, F-RAWDATA-01,
F-SHEETFOOTER-01, and F-SIGNOUT-01 as CONFIRMED_ONCE), and the *symptom* of
F-A11Y-NATIVE-01. F-CONTRAST-01 is **retracted** — see above. See `FINDINGS.json` for reproduction steps,
evidence paths, and the separate `rootCauseStatus` on each.

## Suspected issues needing targeted reproduction

**A login flash on first launch after install.** On the very first launch, the
signed-out login screen appeared — keyboard already up — before the app reached
the dashboard. On every subsequent launch it went splash → dashboard directly.
The plausible mechanism is that server-side middleware bounced to `/golf/login`
before the client-side session restore completed. This was observed **once, by
accident**, during a measurement run whose timing was later found to be invalid.
It is a hypothesis. It is written down because it is worth ten minutes to
reproduce, not because it is a finding.

## Accepted design tradeoffs and dismissed scanner findings

HIG Doctor reported 959 concerns across 3258 files. Filtered to the surface the
iPhone shell can actually render, 344 remain — the rest are in `landing/`,
`tools/`, `public/` and BaseballHelm.

Of the 195 scoped `web/svg-without-a11y` findings marked *critical*, **128 are
false positives by construction**: they are in `src/components/icons/index.tsx`,
where each icon spreads `{...p}` and callers pass `aria-hidden` at the usage
site, which the scanner cannot see. A sampled call site among the remaining 67
sits inside a link that already carries an `aria-label`, so the unlabelled child
is inert. **One scoped rule produced a real finding** — `web/auto-focus`. A
scanner's "critical" is not a Helm P0, and 959 is not a defect count.

## Physical-device observations

None. No device was available. `DEVICE-CHECKS.md` lists the fifteen checks that
remain, ordered so that the one which changes this audit's verdict is first.

## Performance observations and measurement method

Cold launch on the simulator: flat splash to ~t+2.6s, first paint t+2.8s, full
paint t+3.0s, settled t+5.2s. Method: launch and screenshot capture inside a
single process, 0.2s intervals, change detected by frame-size delta.

This is a simulator on host wifi against production, cache-cleared at launch but
DNS and TLS warm, **n=2**. It is a baseline for comparing future runs on the
same setup and nothing more. §9's own rule is 30 comparable trials before a p95
is worth stating, and this is not a device number.

A first attempt at this measurement was discarded outright: the sleep targets
were computed against a timestamp captured in a previous shell invocation, so
every screenshot in the series fired at once and showed the same frame. The
`coldlaunch-t*.png` files are kept in the evidence directory marked invalid.

## Dependency and automation limitations

**Maestro was not installed, deliberately.** Its documented pilot flow asserts
on the login placeholder text being visible in the native accessibility tree.
F-A11Y-NATIVE-01 establishes that tree is empty, so the pilot could not have
passed. Installing a second JDK and a Homebrew tap to discover that would have
been waste. Once T1 answers why the tree is empty, this decision should be
revisited — not before.

**The two skill repositories were not cloned.** The audit reached its findings
through the scanner, the simulator, the accessibility harness and the WebKit
lane. Adding review guidance would have produced opinions, and this run was
short of evidence rather than short of opinions.

**No XCTest/XCUITest target exists**, so `performAccessibilityAudit` was not and
could not be run. That remains true from the August audit.

## Recommended implementation order

1. **T0** — reproduce the sign-out failure under a console and network capture.
   The only correctness bug in the audit; everything else is craft.
2. **T1** — isolate the accessibility cause. An experiment, not a patch. Nothing
   else about accessibility should be touched until it answers.
3. **T2** — raise the 59 stragglers to the 44pt floor the system already uses.
   Gap-closing against an existing norm, not a new convention.
4. **T3** — nudge the player-side green/cream token pairs over 4.5:1, and
   measure the twelve login nodes axe cannot sample.
5. **T4** — retitle the four player pages. Trivial.
6. **T5** — extract `useFinePointer()`, then decide the ungated sites one by
   one, then add the lint rule that stops the next one.
7. **T6** — delete the `~ipad` block whenever a binary is next built.

Full task shapes, non-goals and rollbacks in `IMPLEMENTATION-PLAN.md`.

## Files created or changed by this audit

`playwright/native-audit.config.ts`, `playwright/native-audit/login-audit.spec.ts`,
`docs/audits/ios-native/README.md`, and this run directory. No application
source, native configuration, CI, migration, or production setting was modified.
No deploy, promote, upload or merge occurred.

## Evidence index

`EVIDENCE-INDEX.md`. Raw evidence is outside the repository at
`~/Library/Logs/HelmNativeAudit/` and is not committed — it contains captures of
an authenticated production account.
