# CoachHelm practice plans: fidelity spec

The design page is the drawing: `redesign/coachhelm-practice.html`, published at https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5. This file maps what the page draws to where it lives in the app, lists the colour tokens and every measured contrast pair, and names the places where the build differs from the page on purpose.

The build contract is 05 to 08, under `../../redesign-package-src/ACCEPTANCE-SHARED.md` (SHARED-1 to 12). When this file disagrees with 05, 06, 07 or 08, those four win. When it disagrees with `COACHHELM_PRACTICE_PLAN.md` (the 31 Oct plan), this file wins.

Prep only. Nothing here deploys, applies a migration or flips a flag.

## 1. Where to look

- Every screen and state: `05-SCREENS.md`, with a page link for each (`#cap-<state>` lands on it, `-dark`, `-xxl` and `-rm` add theme, XXL Text Size and Reduce Motion).
- Every size, gap, type role and colour: `06-SCREEN-SPECS.md`, starting with its measured redlines by component.
- Every motion: `07-MOTION.md` (M-ASK-01 to 31, M-FMT-01 to 05, M-BLD-01 to 04, M-PLY-01 and 02).
- Pass or fail: `08-ACCEPTANCE.md`.
- Screenshots of the page, light and dark, for every drawn state: `screenshots/design/<ID>__<state>__design__<theme>.png`. `capture/capture.mjs` takes the matching app shots and puts them side by side.

## 2. Colour tokens: page name to app name

Light, then dark. "(new)" means the token does not exist in `tokens.css` today and PP0 adds it under `.ch-cp-` scope in `styles/coachhelm-plan.css`. Everything else already exists; use it and don't copy the hex.

| Page | App | Light | Dark | Use |
|---|---|---|---|---|
| `--bg` | `--ch-grouped-bg` | #F2F0E9 | #0E120F | page under the cards |
| `--card` | `--ch-card-bg` | #FFFEFB | #191E1A | the one card style |
| `--well` | `--ch-well-bg-flat` | #F6F4EE | #141815 | read pictures, Why panel, evidence, wells |
| `--ink` | `--ch-text-primary` | #1C1B18 | #F1ECDF | primary text |
| `--ink-2` | `--ch-text-secondary` | #46433D | #D0C9B8 | secondary text, fact lines |
| `--ink-3` | `--ch-text-tertiary` | #5F5C55 | #ADA697 | times, captions, labels |
| `--accent` | `--ch-accent` | #155A39 | #7CC79B | links, Done, selected chips' fill (light) |
| `--gain` | `--ch-gain` | #14613D | #7CC79B | strokes gained above zero |
| `--loss` | `--ch-loss` | #9A5700 | #E7AE57 | losses and gaps only (the only amber) |
| `--frame` | `--ch-frame` | #0A331F | #08150E | the green bar (SHARED-1) |
| `--on-green` | `--ch-on-frame` | #F4EEDD | #F4EEDD | bar title |
| `--champ` | `--ch-champagne` | #D8C79B | #D8C79B | Back, the news dot, badge |
| `--seg-well`, `--seg-on-*` | `.ch-seg` (unchanged) | #E7E2D6 | #141815 | segmented control: use today's component |
| `--btn`, `--btn-ink` | `--ch-btn-primary-bg`, `--ch-btn-primary-ink` | #155A39 on #F6F1E4 | #1F6B45 on #F6F1E4 | primary buttons |
| `--sw-*` | `.ch-switch` (unchanged) | track #D3CDBF, on #155A39, thumb #FFFFFF | track #3A423B, on #2E8459, thumb #F4EEDD | audience switches |
| `--f-bg`, `--f-ink`, `--f-ink-2` | `--ch-feature-bg`, `--ch-feature-ink`, `--ch-feature-ink-2` | #0B3A25, #F4F1E8, #D3D9CB | #123D29, same inks | the builder's one feature card |
| `--skill` | `--ch-cp-skill` (new) | #3D6787 | #6E9BC0 | kind tag tint, day strip, mix bar |
| `--random` | `--ch-cp-random` (new) | #6E5487 | #B49ACB | the same, for random practice |
| `--pressure` | `--ch-cp-pressure` (new) | #1F6B45 | #4FA877 | the same, for pressure games |
| `--track` | `--ch-cp-track` (new) | #EBE5D8 | #2C322D | strip and mix bar track |
| `--ghost`, `--ghost-ring` | `--ch-cp-ghost` (new) | #F6F4EE, ring accent at 32% | #141815, ring at 36% | builder ghost blocks |
| `--gA`, `--gB`, `--gC` | same names under `.ch-cp-sheet` (new, 02 §2.6) | #1F6B45, #2F5B7E, #654A7E with white letters | #4FA877, #6E9BC0, #B49ACB with #0E120F letters | group discs |
| `--gA-t`, `--gB-t`, `--gC-t` | same names under `.ch-cp-sheet` (new) | #E4EEE7, #E3EAF2, #ECE7F1 | #1E3326, #1D2A35, #2B2433 | printed group cards, rotation cells |
| `--gain-tint`, `--loss-tint`, `--flat-tint` | existing tints | #E8EEE8, #F5EDE2, #EFEDE7 | #1E3326, #3A2D1A, #232825 | Now / Next tags, pills |

Group C and the random kind were ochre until this pass. In dark mode the ochre read as the loss amber, which breaks "amber is for losses only", so both are now plum. Groups and kinds share three hues (green, blue, plum) on purpose: they never carry status.

Curves and durations are in 07: `--ch-ease`, `--ch-ease-spring`, `--ch-ease-spring-smooth`, and press 110 / quick 180 / base 260ms. Reduce Motion is `CH_FADE_MS` (180ms), opacity only, linear. The push moves the page behind 24% (`CH_UNDERLAY_SHIFT` 0.24) and dims it to brightness(0.9) over 462ms on `--ch-ease-spring-smooth`.

## 3. Contrast: every measured pair

Measured from the page's computed colours over every capture state (`capture/extract.js`), composited over the real background. Target 4.9:1 for text, 3:1 for large text and non-text marks (SHARED-4). Every pair passes. The lowest pair for each text and background combination is listed with the element where it occurs. The same table is in `capture/contrast-table.md`.

| Theme | Text or mark | Background | Lowest ratio | Where |
|---|---|---|---|---|
| light | `--ch-seg-on-ink` #F6F1E4 | segmented chip, #1d6b45 top to #145635 bottom | 5.7 at the top edge, 6.6 at the label centre | `button < seg` selected. The label sits on the chip, a sibling element, so the script reads the well behind it |
| dark | `--ch-seg-on-ink` #F6F1E4 | segmented chip, #2a7d53 top to #1d613f bottom | 4.5 at the top edge, 5.4 at the label centre | the same. The build uses today's `.ch-seg` (9.6:1 in DESIGN_LANGUAGE), so this page-only shade is not built |
| light | `--ch-loss` #9A5700 | `--ch-well-bg-flat` #F6F4EE | 5.1 | `span.v.lo` |
| light | `--ch-loss` #9A5700 | `--ch-card-bg` #FFFEFB | 5.6 | `span.neg` |
| light | `--ch-text-tertiary` #5F5C55 | `--ch-grouped-bg` #F2F0E9 | 5.8 | `span.ts` |
| light | `--ch-text-secondary` #46433D | `#CBCFC4` | 6.2 | `span` |
| light | `--ch-gain` #14613D | `--ch-gain-tint` #E8EEE8 | 6.3 | `svg` |
| light | white #FFFFFF | `--ch-cp-pressure (new)` #1F6B45 | 6.5 | `i.gd.g-A` |
| light | `--ch-text-tertiary` #5F5C55 | `--ch-card-bg` #FFFEFB | 6.6 | `svg.chev` |
| light | white #FFFFFF | `#2F5B7E` | 7.2 | `i.gd.g-B` |
| light | `--ch-accent` #155A39 | `--ch-grouped-bg` #F2F0E9 | 7.2 | `svg` |
| light | `--ch-seg-on-ink` #F6F1E4 | `--ch-accent` #155A39 | 7.3 | `div.msg-me` |
| light | white #FFFFFF | `#654A7E` | 7.4 | `i.gd.g-C` |
| light | `--ch-accent` #155A39 | `--ch-well-bg-flat` #F6F4EE | 7.5 | `button.btn-s` |
| light | `--ch-text-secondary` #46433D | `--ch-seg-well` #E7E2D6 | 7.6 | `button` |
| light | `--ch-seg-on-ink` #F6F1E4 | `--seg-on-bot` #145635 | 7.7 | `span.on` |
| light | `--ch-accent` #155A39 | `--ch-card-bg` #FFFEFB | 8.2 | `svg` |
| light | `--ch-card-bg` #FFFEFB | `--ch-accent` #155A39 | 8.2 | `svg` |
| light | white #FFFFFF | `--ch-accent` #155A39 | 8.2 | `em.tagr` |
| light | `--ch-champagne` #D8C79B | `--ch-frame` #0A331F | 8.3 | `button.back` |
| light | `--ch-frame` #0A331F | `--ch-champagne` #D8C79B | 8.3 | `i` |
| light | `--ch-text-secondary` #46433D | `--ch-flat-tint` #EFEDE7 | 8.4 | `span.nx` |
| light | `--ch-on-frame` #F4EEDD | `#264936` | 8.6 | `a.on` |
| light | `--ch-text-secondary` #46433D | `--ch-grouped-bg` #F2F0E9 | 8.6 | `span` |
| light | `--ch-feature-ink-2` #D3D9CB | `--ch-feature-bg` #0B3A25 | 8.8 | `div.m` |
| light | `#D0D0BC` | `--ch-frame` #0A331F | 8.9 | `svg` |
| light | `--ch-text-secondary` #46433D | `--ch-well-bg-flat` #F6F4EE | 9.0 | `div.vh` |
| light | `--ch-text-secondary` #46433D | `#FBF9F4` | 9.3 | `svg` |
| light | `sidebar ink 2` #CFD6C8 | `--ch-frame` #0A331F | 9.4 | `a` |
| light | `#47443D` | `--ch-card-bg` #FFFEFB | 9.6 | `span` |
| light | `--ch-text-secondary` #46433D | `--ch-card-bg` #FFFEFB | 9.8 | `div.field` |
| light | `--ch-text-primary` #1C1B18 | `--ch-champagne` #D8C79B | 10.3 | `span.badge` |
| light | `--ch-text-primary` #1C1B18 | `#CBCFC4` | 10.8 | `div.top` |
| light | `--ch-on-frame` #F4EEDD | `--ch-feature-bg` #0B3A25 | 11.0 | `span.pp-mark` |
| light | `--ch-feature-ink` #F4F1E8 | `--ch-feature-bg` #0B3A25 | 11.3 | `div.t` |
| light | `--ch-feature-bg` #0B3A25 | `--ch-feature-ink` #F4F1E8 | 11.3 | `button.btn-p` |
| light | `--ch-on-frame` #F4EEDD | `--ch-frame` #0A331F | 12.0 | `span` |
| light | `--ch-text-primary` #1C1B18 | `#E4EEE7` | 14.5 | `div.gh` |
| light | `--ch-text-primary` #1C1B18 | `--ch-flat-tint` #EFEDE7 | 14.7 | `i.c` |
| light | `--ch-text-primary` #1C1B18 | `#F1EEE6` | 14.8 | `span.all` |
| light | `--ch-text-primary` #1C1B18 | `--ch-grouped-bg` #F2F0E9 | 15.1 | `div.who` |
| light | `--ch-text-primary` #1C1B18 | `--ch-well-bg-flat` #F6F4EE | 15.7 | `button.qo` |
| light | `--ch-on-frame` #F4EEDD | `#0D1611` | 15.9 | `div.tm` |
| light | `--ch-text-primary` #1C1B18 | `#FBF9F4` | 16.3 | `span.tt` |
| light | `--ch-text-primary` #1C1B18 | `--ch-card-bg` #FFFEFB | 17.1 | `span.t.tl` |
| dark | `#9A5700` | `#FFFEFB` | 5.6 | `span.neg` |
| dark | `--ch-seg-on-ink` #F6F1E4 | `--ch-btn-primary-bg` #1F6B45 | 5.7 | `div.msg-me` |
| dark | `#46433D` | `#CAC9C1` | 6.0 | `span` |
| dark | `#14613D` | `#E8EEE8` | 6.3 | `span.changed` |
| dark | `--ch-grouped-bg` #0E120F | `--ch-cp-skill (new)` #6E9BC0 | 6.4 | `i.gd.g-B` |
| dark | `--ch-grouped-bg` #0E120F | `--ch-cp-pressure (new)` #4FA877 | 6.5 | `i.gd.g-A` |
| dark | `#FFFFFF` | `--ch-btn-primary-bg` #1F6B45 | 6.5 | `i.gd.g-A` |
| dark | `--ch-seg-on-ink` #F6F1E4 | `--seg-on-bot` #1D613F | 6.6 | `span.on` |
| dark | `--ch-gain` #7CC79B | `--ch-gain-tint` #1E3326 | 6.7 | `svg` |
| dark | `--ch-text-tertiary` #ADA697 | `--ch-card-bg` #191E1A | 7.0 | `svg.chev` |
| dark | `#FFFFFF` | `#2F5B7E` | 7.2 | `i.gd.g-B` |
| dark | `#FFFFFF` | `#654A7E` | 7.4 | `i.gd.g-C` |
| dark | `--ch-grouped-bg` #0E120F | `--gC` #B49ACB | 7.6 | `i.gd.g-C` |
| dark | `--ch-text-tertiary` #ADA697 | `--ch-grouped-bg` #0E120F | 7.8 | `span.ts` |
| dark | `#155A39` | `#FFFEFB` | 8.2 | `b` |
| dark | `#FFFFFF` | `#155A39` | 8.2 | `em.tagr` |
| dark | `#0A331F` | `--ch-champagne` #D8C79B | 8.3 | `i` |
| dark | `--ch-feature-ink-2` #D3D9CB | `--ch-feature-bg` #123D29 | 8.4 | `div.m` |
| dark | `--ch-gain` #7CC79B | `--ch-card-bg` #191E1A | 8.4 | `svg` |
| dark | `--ch-card-bg` #191E1A | `--ch-gain` #7CC79B | 8.4 | `svg` |
| dark | `--ch-loss` #E7AE57 | `--ch-card-bg` #191E1A | 8.5 | `span.neg` |
| dark | `--ch-gain` #7CC79B | `--ch-well-bg-flat` #141815 | 9.0 | `button.btn-s` |
| dark | `--ch-loss` #E7AE57 | `--ch-well-bg-flat` #141815 | 9.0 | `span.v.lo` |
| dark | `--ch-text-secondary` #D0C9B8 | `--ch-flat-tint` #232825 | 9.1 | `span.nx` |
| dark | `--ch-gain` #7CC79B | `--ch-grouped-bg` #0E120F | 9.4 | `svg` |
| dark | `#47443D` | `#FFFEFB` | 9.6 | `span` |
| dark | `--ch-text-secondary` #D0C9B8 | `--ch-card-bg` #191E1A | 10.2 | `div.field` |
| dark | `#1C1B18` | `--ch-champagne` #D8C79B | 10.3 | `span.badge` |
| dark | `#1C1B18` | `#CAC9C1` | 10.4 | `div.top` |
| dark | `--ch-feature-ink` #F4F1E8 | `--ch-feature-bg` #123D29 | 10.8 | `div.t` |
| dark | `--ch-feature-bg` #123D29 | `--ch-feature-ink` #F4F1E8 | 10.8 | `button.btn-p` |
| dark | `--ch-text-secondary` #D0C9B8 | `#141915` | 10.8 | `svg` |
| dark | `--ch-text-secondary` #D0C9B8 | `--ch-well-bg-flat` #141815 | 10.9 | `button` |
| dark | `--ch-on-frame` #F4EEDD | `#0B3A25` | 11.0 | `span.pp-mark` |
| dark | `--ch-champagne` #D8C79B | `--ch-frame` #08150E | 11.2 | `button.back` |
| dark | `--ch-text-secondary` #D0C9B8 | `--ch-grouped-bg` #0E120F | 11.4 | `span` |
| dark | `#D0CBBA` | `--ch-frame` #08150E | 11.5 | `svg` |
| dark | `--ch-on-frame` #F4EEDD | `#0A331F` | 12.0 | `svg` |
| dark | `sidebar ink 2` #CFD6C8 | `--ch-frame` #08150E | 12.6 | `a` |
| dark | `--ch-text-primary` #F1ECDF | `--ch-flat-tint` #232825 | 12.7 | `i.c` |
| dark | `--ch-on-frame` #F4EEDD | `#202B23` | 12.7 | `a.on` |
| dark | `--ch-text-primary` #F1ECDF | `--ch-card-bg` #191E1A | 14.3 | `span.t.tl` |
| dark | `#1C1B18` | `#E4EEE7` | 14.5 | `div.gh` |
| dark | `#1C1B18` | `#F1EEE6` | 14.8 | `span.all` |
| dark | `--ch-text-primary` #F1ECDF | `#141915` | 15.1 | `span.tt` |
| dark | `--ch-text-primary` #F1ECDF | `--ch-well-bg-flat` #141815 | 15.2 | `button.qo` |
| dark | `--ch-seg-on-ink` #F6F1E4 | `--ch-well-bg-flat` #141815 | 15.9 | `button` |
| dark | `--ch-on-frame` #F4EEDD | `#0D1611` | 15.9 | `div.tm` |
| dark | `--ch-text-primary` #F1ECDF | `--ch-grouped-bg` #0E120F | 16.0 | `div.who` |
| dark | `--ch-on-frame` #F4EEDD | `--ch-frame` #08150E | 16.1 | `span` |
| dark | `#1C1B18` | `#FFFEFB` | 17.1 | `b` |

Non-text marks (day strip and mix bar segments, chart bars, ticks, switch tracks, focus rings) are checked at 3:1 in the page's live contrast table (the Contrast section of the design page), which reads the same tokens. The lowest is the random strip mark, 5.1:1 on its track in light.

## 4. Components: page part to app home

| Page part | App home | PR | Reuse or new |
|---|---|---|---|
| Green bar, sheet lip, segmented | `ui/PhoneBar.tsx`, `shell/phone-chrome.tsx`, `.ch-seg` | all | reuse, unchanged (SHARED-1) |
| Ask thread, coach bubble, composer | `screens/coachhelm/chat/Thread.tsx` | PP1 | reuse |
| Steps list with check, fact line, fold | `parts/Steps.tsx` | PP1 | reuse; new labels only |
| Read pictures (calendar, strokes gained, putting bands, class times, drills) | `screens/coachhelm/chat/plan/ReadPicture.tsx` | PP1 | new |
| Ask first card | `parts/AskFirst.tsx` filled by `chat/plan/PlanIntake.tsx` | PP2 | reuse AskFirst; new filler |
| Plan card, block rows, day strip, Why panel, source chips | `chat/plan/PlanCard.tsx`, `PlanBlockRow.tsx`, `WhyPanel.tsx` | PP3 | new |
| Block sheet, swap list, evidence sheet | `BlockSheet.tsx` on `ui/FormSheet.tsx`, `SwapList.tsx` | PP3 | new on the existing sheet |
| Full plan page and the Mac pane | `PracticePlanSheet` (`screens/coachhelm/plan/sheet/`), `plan/PlanScreen.tsx`, `plan/PlanPane.tsx` | PP0, PP3 | new; one sheet component for pane, phone and print |
| Save to row, folder list, receipt, Undo | `plan/SaveToRow.tsx`, `plan/PlanReceipt.tsx`, `ui/Toast.tsx` | PP4 | new on existing toast |
| Proposal card, audience switches, Told and Seen | `parts/ConfirmCard.tsx`, `plan/PublishConfirm.tsx`, `ui/Switch.tsx` | PP5 | reuse the confirm card and switch |
| Print and Share PDF | `plan/PrintPlan.tsx` (`@media print`) | PP6 | new |
| Plan format (upload, scan, found) | `screens/coachhelm/plan/format/PlanFormat.tsx` | PP7 | new |
| Builder helper, ghost blocks, Keep all | `screens/practice/builder/HelperPanel.tsx` | PP8 | new, blocked on N-00 |
| Player notification, Practice page, stops | N-00's player Practice home and `PlanPage.tsx` with `PracticePlanSheet copy="player"` | PP9 | new, blocked on N-00 |

02 names every file and test; this table is only the map.

## 5. Where the build differs from the page on purpose

- **Segmented control.** Build today's `.ch-seg`. The page's dark chip is a little lighter than the app's (its top edge reads 4.5:1); the app's is 9.6:1.
- **Reduce Motion.** The page fades for 180ms, the app's `CH_FADE_MS`. Read the constant; don't hard-code 180.
- **Ask composer.** Today's component, with its 12pt side padding. Not new UI in this lane.
- **Sample data.** Every figure on the page is a sample for Demo University Golf. 03 says where each real figure comes from and what to show when it's missing ("—", never 0). The putting bands and Tour anchors on the page now match the app's (3 to 5, 5 to 10, 10 to 15, 15 to 25 ft). The three-putt Tour value is still unread (03 §3).
- **Touch areas.** The page grows small phone controls to 44pt with an invisible `::after`. In the app, use the button's own hit slop. Never draw the control bigger.
- **Lock screen and notification.** The page draws an iPhone lock screen to show the push. The app only sends the push (copy in 02 §0.1 default 5). The in-app bell banner is the app's.
- **Mac scale.** The page shows the Ask desktop at 0.9. 06 gives every Mac value at 1:1.
- **Not drawn.** States marked "not drawn" in 05 (stopped, failed, undone, cancelled, the Mac intake and publish, the player's copy of the sheet, print pages) are built from 05's rules and the components of their parent screen. 08 has a criterion for each.

## 6. Calls settled

Nick's four (31 Oct, settled):

1. Ships with the Practice tab, after its slices 1 to 5.
2. Players don't see Why lines.
3. A draft shows as coaches only in Documents.
4. Drills come only from the team bank and the GolfHelm library.

Defaults picked in this pass, each one Nick can flip (02 §0.1 has the reasons):

1. Folders use today's `golf_documents.folder` text column; no folders table.
2. PDF is a browser print of `PracticePlanSheet`.
3. The 8s publish Undo is a timer on the receipt, and the server sends nothing until it closes.
4. The team chat post is plain text with a link.
5. Notification: "Practice plan for Thursday" / "2:00 PM · You start on the putting green with Group B".
6. The format sample is a Documents row; its parsed sections wait on a held table.
7. Players see the focus, their group and their stops. No Aim, no Why.
8. Tools are `draft_practice_plan` and `ask_practice_brief`.
9. Save draft writes at once; Undo deletes it.
10. A player who can't make it is in no group and isn't told.
11. The sheet component lives under `screens/coachhelm/plan/sheet/` until the Practice tab exists.
12. Two flags: `golf_practice_plans` for the tab, `coachhelm_practice_plans_v1` for CoachHelm writing plans.
13. Selected chips show no check mark, just the fill crossfade (same as the Ask lane).
14. The class timeline arrives whole, with no stagger.
15. Group C and the random kind are plum, not ochre (section 2).

Not settled, and not picked here: anything that pushes, posts, deploys, applies a migration or flips a flag. Those wait for Nick.

## 7. Fidelity check

For every screen ID in 05, `node capture/capture.mjs --id <ID>` writes the design and app shots, light and dark, then a side by side. A screen passes when the app matches the design shot at the sizes in 06 (within 1pt), with the same colours, the same type roles and the same states. For every row in 07, `--motion <ID>` writes the design and app clips, with and without Reduce Motion. 08 Part 3 has the steps and what to attach to the PR.
