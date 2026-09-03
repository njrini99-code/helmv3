# Mobile Viewport Audit — Follow-up (2026-09-02)

Closes the one gap left open by the two prior mobile-viewport audits (`MOBILE_VIEWPORT_AUDIT_2026-09-02.md`, `MOBILE_VIEWPORT_AUDIT_2026-09-02-COACH.md`). Scope: (1) error-state styling across both accounts, (2) shot-tracking entry polish assessment. Run solo, 390×844 viewport, default `openclaw` browser profile.

Screenshots: `mobile-viewport-shots-2026-09-02/followup/`

---

## 1. Error-state styling

**Verdict: consistently clean and on-brand.** Every error I could trigger — auth failures, invalid deep links, and a genuine client-side validation bug I found along the way — renders through the same design system: rounded cards, the site's cream/green palette, a clear headline + supporting copy, and (where relevant) an actionable button. Nothing raw, no browser-default alerts, no stack traces, no generic "Something went wrong."

### What I tested and found

**Login — empty submit** (`01-login-empty-submit.png`)
Submitting with both fields blank produces a styled pink/red banner inside the card: "Enter your email and password to sign in." Icon, rounded corners, correct copy — no native HTML5 validation bubble, no layout shift.

**Login — invalid credentials** (`02-login-invalid-credentials.png`)
Wrong email/password produces the same banner style with "Invalid email or password." Consistent with the empty-field case; doesn't leak whether the email exists (good practice).

**Invalid URL / bad resource ID** (`04-invalid-player-id-url.png`)
Navigating to `/golf/dashboard/roster/not-a-real-uuid-12345` (a non-existent player ID) renders a dedicated "Failed to load player details" card — icon in a soft rose circle, headline, one-line explanation, and two clear actions ("Go Home" / "Try Again"). This is the strongest error state in the app — genuinely well designed, not a generic fallback.

**404 for unknown routes** (`00-404-page-styled.png`)
`/login` (wrong route — real one is `/golf/login`) renders a branded 404 page with three clear recovery links and a support email. Fully styled, on-brand.

**Calendar — New Event with empty/whitespace-only title** (`03-new-event-whitespace-title.png`)
The "Create event" button stays correctly disabled until a non-whitespace title is entered — I confirmed via the DOM (`[disabled]` attribute) that a whitespace-only string does **not** enable submission, despite the button rendering in a lighter green that could be mistaken for "enabled" at a glance. No error state is ever reached because submission is prevented at the source — this is good design, though the disabled-button color contrast is soft enough that a user might not immediately register it as inactive (minor, not a defect).

**Messages — whitespace-only compose** 
Typing only spaces into the message box keeps "Send message" disabled (confirmed via DOM inspection), including pressing Enter. Same pattern as above — proactive prevention rather than a post-submit error.

**Round setup — out-of-range hole yardage (real bug found)** (`07-hole-yardage-out-of-range.png`)
This is the one gap in an otherwise excellent error-handling story. In the "configure holes" step of New Round, the yardage `spinbutton` per hole has **no bounds validation**. Entering `99999` for Hole 1 is accepted silently — no red border, no inline message — and the value propagates straight into the visible "Total Yards" summary card, which then reads **106,409** total yards for an 18-hole course. This isn't an ugly error message; it's an *absent* one, in a spot where the numeric input clearly should have a sane upper bound (yardages don't exceed ~700 for a single hole). Reset to 380 before continuing so it didn't corrupt the rest of the test round.

**Shot entry — out-of-range distance remaining (validation works correctly here)** (`10-distance-out-of-range.png`)
By contrast, the "Distance remaining (yds)" field *during* live shot tracking does validate: entering `9999` (further than the hole's yardage) produces a clean inline message — "Distance remaining must be 1000 yards or less" — directly above the (correctly disabled) "Next shot" button. Good typography, correct color, no layout jank. This is the pattern the hole-setup screen should also use.

### Net assessment
Error messaging is a genuine strength of this app — consistent visual language, sensible copy, no leaked internals. The one real defect is the missing yardage bounds check in round setup; everything else I tried either showed a well-styled message or correctly prevented the invalid state from ever surfacing.

---

## 2. Shot-tracking entry — polish assessment

**Verdict: this flow is polished and intentional, not vibe-coded.** I ran the full New Round → hole setup → live hole-by-hole shot entry flow as Cole Bennett (player), completing Hole 1 (tee shot → approach → putt) and starting Hole 2, then discarded the test round.

### Specific evidence of polish

- **Consistent control language throughout.** Every choice — club (Driver/Non-Driver), shot result (Fairway/Rough/Sand/Green/Hole/Other), putt break (L→R/Straight/R→L/Mult.), putt slope (Uphill/Level/Down/Severe), putt result — uses the same pill-button radiogroup pattern with a solid dark-green fill for the selected state. No control looks like it came from a different design pass. (`08-shot-entry-hole1.png`, `14-shot3-putting.png`)

- **Semantically correct, accessible markup.** Club/shot-result/putt-break/putt-slope/putt-result are all real ARIA `radiogroup`/`radio` elements, not divs styled to look like buttons — confirmed via the accessibility snapshot, not just visually.

- **Live, contextual feedback.** A status line directly above the primary action button changes based on state — "Select a shot result" → "Enter the distance remaining" → once valid, the button itself relabels dynamically (e.g. "Complete hole · Score 3" once a hole-ending putt result is chosen, computed live from the shots entered). (`15-hole-1-complete.png`)

- **A genuinely thoughtful visual touch:** the "yards to pin" hole graphic isn't static — after the first shot, it renders a dotted trail connecting the tee position to the new ball position, giving a lightweight visual sense of progress down the hole without needing a full course map. (`12-shot2-approach.png`)

- **Contextual field relabeling, not copy-paste forms.** Shot 1 (tee) shows "Club off tee" + "Shot result" with distance-remaining in yards. A green-side shot swaps to "Proximity to hole (ft)" in feet. A putt swaps to a dedicated "Putting details" section (break + slope) plus a putt-specific result set (Hole/Green/Rough (rolled off)/Sand (rolled off)) — the copy changes to match golf reality at every step, e.g. "Hole (ace!)" only appears as an option on the tee shot. (`13-shot2-green-selected.png`)

- **Clear progress affordances.** The hole strip at the top shows par/yardage per hole, and a completed hole gets a green checkmark and its score inline — no need to scroll or tap through to see how the round is going. Previously-disabled shot-number chips light up as shots are recorded. (`17-hole2-top-nav.png`)

- **Destructive actions are handled carefully.** Exiting mid-round opens a dialog offering "Save for later" vs. "Delete round," and Delete requires a second "Tap again to confirm" tap with red styling and "This cannot be undone" — proper double-confirmation on a destructive, irreversible action, not a plain browser `confirm()`. (`18-exit-round-delete-confirm.png`)

### Minor observations (not blockers)
- The visual difference between a *disabled* primary button (light green fill) and an *enabled* one (solid dark green) is real but subtle — someone glancing quickly could plausibly misread "disabled" as "just a lighter brand color." Not a functional issue since the disabled state is correctly enforced; a purely cosmetic nit.
- The course-selection screen (`05-new-round-start.png`) and hole-setup scorecard grid (`06-round-setup-details.png`) share the same visual quality — worth noting since they're the on-ramp into the flow being assessed and reinforce the same design system.

### Net assessment
This flow does not read as rushed or inconsistent. Spacing, button styles, selection states, and copy are coherent from course selection through hole completion, and several details (the shot trail, dynamic score-aware button labels, contextual field sets per shot type) reflect actual product thought rather than a generic form generator.

---

## Summary

| Area | Verdict |
|---|---|
| Error-state styling | Strong overall; one real bug (unbounded hole yardage in round setup accepts nonsensical values with zero validation or messaging) |
| Shot-tracking entry polish | High — consistent, accessible, contextually intelligent, well-crafted micro-details |
