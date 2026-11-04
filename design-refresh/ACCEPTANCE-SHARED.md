# Shared acceptance criteria (every lane, every PR)

Each lane's `08-ACCEPTANCE.md` refers to these as SHARED-1 to SHARED-12 and doesn't repeat them. A PR that fails any one of them is not done, whatever its own criteria say.

SHARED-1. **Green bar unchanged.** `--ch-frame` is #0a331f in light and #08150e in dark. The bar is 98pt tall, with the switcher and its champagne dot on the left and the bell or the page's own action on the right. Desktop keeps today's sidebar and glass top bar.
Check: today's phone-bar tests pass untouched, and a pixel diff of the bar band against main shows no changed pixels on every screen the PR touches.

SHARED-2. **Flat page.** The page is flat parchment with the 16px lip under the bar. On phone, the only text sitting directly on the page is the large title and its one context line. Section titles, counts, notes and captions sit inside a card or grouped list. Stats is the one agreed exception (Nick, 31 Oct: "Keep as drawn"). There are no gradients except the segmented chip's green top-to-bottom shade (Nick, 16 Oct), and no gradient text anywhere.
Check: a DOM test finds no text node whose nearest surface is the page, other than the large title and context line.

SHARED-3. **No accent left borders.** No card has a `border-left` wider than 1px in a colour that differs from its other borders, and no inset shadow that draws one.
Check: a lint test over the changed CSS, plus a look at every screenshot.

SHARED-4. **Contrast and legibility.**
- Every text/background pair is at least 4.9:1 in light and dark, and never under 4.5:1.
- Large text (24pt, or 19pt bold) and non-text marks (icons, chart marks, focus rings, switch tracks) are at least 3:1.
- Any pair under 4.9:1 is listed in the PR with its fix or reason.
- Numbers that line up use tabular figures. A missing value shows "—", never 0, NaN or a blank.

Check: the lane's contrast script over its 06 pairs, in both themes.

SHARED-5. **XXL Text Size unclipped.** Text follows iPhone Text Size. At XXL (`--ch-type-scale` 1.36), nothing clips, truncates mid-word or overlaps. Rows grow taller, and text wraps or ends in an ellipsis only where 06 says so.
Check: XXL screenshots of every screen ID in 05.

SHARED-6. **Reduce Motion: crossfades only, and motion stays honest.**
- Under Reduce Motion (Playwright `reducedMotion: 'reduce'`, and Settings > Animations off), nothing travels, scales or rotates.
- Transitions become an opacity crossfade of `CH_FADE_MS` from `lib/motion.ts`, and loops (skeleton pulse, typing dots, sweeps) stop. `CH_FADE_MS` is 180ms today, set by an owner decision on 24 Oct and pinned by `reduced-motion.test.tsx`. Where any lane file says "120ms crossfade" for Reduce Motion, read `CH_FADE_MS` and leave the test untouched.
- In every mode, motion never runs on re-render or data refresh.
- There are no count-ups, and no entrance staggers unless 07 lists one.
- Nothing blurs or casts an animated shadow on scroll.
- A tap or reverse mid-flight retargets from the current value without a jump.

Check: a Reduce Motion clip for each 07 row.

SHARED-7. **Phone edge 16 / 20.** The page edge is 16px at 390 wide and 20px at 430 wide and up.
Check: measure the left edge of the first card on the 390 and 430 screenshots.

SHARED-8. **Draft PRs only, behind a flag.** Nothing is merged by the agent. New UI sits behind its lane's flag, off in every environment, and with the flag off the app renders exactly as main. This overrides any plan that sets `preview: true` or `development: true` on a flag (N-00 `golf_practice_plans`, N-10 `golf_documents_library`). Every lane's flag is listed in START_HERE section 4 (completeness pass, 4 Nov).

SHARED-9. **No deploy, no flag flip, no migration applied.** Any migration is written as a held file and listed as held in the PR body. On the Mac, run one browser and one dev server at a time, with at most two subagents.

SHARED-10. **Shot tracking unchanged.** No PR changes what shot tracking collects, stores or sends.
Check: a zero diff under the shot-tracking capture and save code, and its tests pass untouched.

SHARED-11. **Players never see a teammate's figures.**
- Players never see a teammate's own scores, SG, averages, reads or goals, named or unnamed. Comparisons are against the team average and the PGA Tour only (Nick, 31 Oct).
- Coach-only items are absent from the player's DOM and network responses, not just hidden.
- Every figure traces to a field in the lane's 03-DATA-CHECKS.
- Practice rounds stay out of averages, leaders and team figures unless 03 says otherwise.
- Seasons turn over on 1 August.

Check: a test signed in as a demo player asserts that no other player's id or figures appear in the page or its responses.

SHARED-12. **Matches the design side by side.**
- For each screen ID the PR touches, `capture/capture.mjs` shoots the design page and the app at the same width, theme and Text Size. The pair goes in the PR, and 06's redline numbers match within 2pt.
- For each 07 row the PR touches, clips of the design and the app go in the PR. Duration, curve or spring, and what moves match within one frame at 60fps.
