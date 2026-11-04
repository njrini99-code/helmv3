# 06 · Screen specs: CoachHelm practice plans (lane 6)

> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 54 rows).

Generated from the design page's computed styles (`capture/extract.js` over every capture state, light and dark, at the drawn size: phone 390 × 844, Ask desktop 1280 × 800, builder desktop 1148 × 718), then checked by hand. Values are CSS px = pt at 1x. Text Size is the default (k = 1); every type size scales by `--ch-type-scale` (SHARED-5).

How to read a row: Box is width × height, padding top right bottom left, gap, radius. A width that equals its container is "fill" in the build. Type is size/line-height and weight, with the app role token where one exists. Colour gives the app token and the hex, light then dark (the hex is composited over its real background). Contrast is the measured ratio, light / dark; bold means under target (4.9:1 text, 3:1 large text and glyphs), listed with its fix in the closing list. Hit is the touch area for a control. An element already listed in an earlier section is not repeated; its section is named.

Data: every figure points to `03-DATA-CHECKS.md` (calendar §1, strokes gained §2, putting §3, class times §4, drills §5, audience and Told §6 onward). Missing data shows "—" for a figure and drops the line that needed it; a read with too little data is a lean read (03 hide rules).

## Measured redlines by component

Read these first. They are the numbers a reviewer checks side by side, measured on the design page at 390 × 844 (phone) and 1:1 (desktop), and they apply wherever the component appears. The generated per-screen tables after this section list every element with its box, type, colour and contrast.

**Green bar** (every phone screen, SHARED-1). 390 × 98, padding 52 6 0 16. Title button 18/18 w600 `--ch-on-frame`, 12.0:1 light and 16.1:1 dark. Chevron 14 stroke, champagne dot 6. Bell `.ib` 44 × 44 with a 17 × 17 badge (11/17 w700, radius 9). On a pushed page the title becomes the centred `.ctr` (17/18.7 w600) and the left side is Back (17/17 w400 champagne, 8.3:1) with its chevron and a 2px gap.

**Sheet under the bar.** 390 wide, top radius 16, background `--ch-grouped-bg`. Page edge 16 (20 at 430 and up, SHARED-7). The segmented control sits first: well 358 × 36, padding 2, radius 10; each half 177 × 32, radius 8, 15/18 w500 unselected and w600 selected; the green chip thumb slides 360ms `--ch-ease-spring`. Use today's `.ch-seg` unchanged.

**Ask thread.** Coach bubble `.msg-me` max 286 wide, padding 10 14, radius 18 18 6 18, 16/21.6 w400 on `--ch-accent`. CoachHelm line `.who` 22 tall: 22 × 22 mark (radius 7), name 15 w600, time 13 w400 tertiary. Composer 390 × 79, padding 10 12 28 12 (today's Ask composer, unchanged), field 318 × 40 radius 20, Send 40 × 40 drawn with a 44 touch area.

**Steps list.** Each step row: 22 × 22 status icon at x 32, label at x 66 (16/20.8 w500), fact line under it 15/20.3 w400 secondary, row padding 10 16, gap 12. Hairline inset 50 from the card edge. The check draws its stroke in 240ms; the running dot breathes scale 1 → .6 over 1.2s. Folded header reads "6 steps · 9s".

**Read pictures** (`.vz`). 292 wide, padding 10 12, radius 12, on `--ch-well-bg-flat`. Calendar days 40 wide (64 for Thursday, 80 for the event day), 76.7 tall, padding 6 6 7, radius 9. Strokes gained bars 8 tall, radius 4, zero line 1.5 × 14. Putting bands: label column, two 22-tall pill boxes (12/12 w600, padding 0 7, radius 7). Drill cards 96 × 57.8, padding 8 9, radius 10, fanned.

**Intake card.** 358 wide, radius 16. Question label 13/15.6 w600 tertiary. Answer chips 36 tall, padding 0 13, fully round, 14/16.8 w500; selected fills `--ch-accent` with ivory text and shows no check mark. Build the plan: full width 326 × 36.5, radius 12, 15/16.5 w600.

**Plan card.** 358 wide, radius 16. Header padding 14 16, gap 10, title 17/21.3 w600. Day strip 326 × 8, radius 4, 2px gaps, one segment per block coloured by kind. Block row padding 12 16, gap 12; time column 54 wide (15/18 w600 tabular); block title 16/20.8 w500; line 15/20.3 w400. Hairline inset 16. Why panel 260 wide, padding 8 10, gap 6, radius 10, on the well. Source chip 22.9 tall, padding 3 8, radius 7, 13/16.9 w600, 44-tall touch area. Kind tag 20.9 tall, padding 2 7, radius 7, 13 w600. Group disc 20 × 20, radius 6, 12/12 w700 (19 × 19, radius 5, 11 inside the printed sheet). Mix bar 326 × 6, radius 3. Save to row 326 × 39, padding 10 12, radius 12. Actions: Publish… and Open the full plan, 36.5 tall, radius 12.

**Refine chips.** 36 tall, padding 0 13, fully round, 14/15.4 w500, in a row that scrolls sideways, starting at the page edge 16.

**Sheets** (block, swap, evidence, upload, new block). Width 390, top radius 20, hug the content up to 84% of the screen. Grabber 36 × 5, radius 3. Header 48 tall, padding 6 16 10, Cancel and Done 16 w600 accent with 44-tall touch areas. Drill options padding 12 14, hairline inset 14. The ask field at the foot: 358 × 35.5, padding 8 8 8 12, radius 12. Up 462ms smooth spring, down 280ms.

**Full plan (pushed page).** The printed sheet `.paper` 358 wide, padding 22 20 14, radius 5. Mark 36 × 36 radius 9, title 30/31.5 w600, focus 15.5/22. Meta grid dt 12/14.4 w500, dd 13.5/17.6 w600. Group cards 100.7 wide, padding 8 8 9, radius 10. Rotation cells 32 × 28, radius 7. Dock 390 × 80.6, padding 10 16 28, gap 10, blur 24 saturate 170%; its two buttons 174 × 41.6, radius 12, 16 w600.

**Save and publish.** Folder tiles 103.3 × 98.2, padding 10, radius 12. "Saving…" capsule 326 × 41, radius 12, with a 3px sweep. Receipt check 22 × 22. Undo 15 w600 accent. Proposal card 358 wide; rows 43 tall, padding 10 16, gap 12; switch 40 × 23, thumb 19, travel 17, 260ms spring. Faces 26 × 26 (10 w700), 220 wide row. Notification preview 326 × 76.7, padding 10 12, radius 12, app icon 28 radius 7. The publish button reads "Publish to 11 people". Toast: 14 w500, padding 10 14, radius 12, 96 above the bottom, in for 260ms, holds 2.2s, out 200ms.

**Ask on the Mac.** Sidebar 232 wide, padding 18 12. Main bar 56 tall, padding 0 20. The pane is 452 wide on the right, header 60.4 (padding 12 16), body padding 20 20 28, footer 58.4 (padding 12 16, gap 8). Pointer controls there are 30 to 33 tall, which is fine for a pointer.

**Format.** Intro card 358 wide; current format row padding 14 16. Upload options 48 tall, padding 13 14, gap 12. The sample page 176 × 228, padding 12 11, radius 3, inside a 326 × 256 well; the scan line is 22 tall; each found part gets a 2px green ring and a tag (10.5 w600, padding 2 5, radius 4).

**Builder (phone).** Ribbon padding 10 16, radius 12. Helper card padding 16, radius 16. Ghost block padding 12 16, gap 6, radius 14, 1.5px ring; its Keep, Swap and Remove are 28 tall (padding 7 12, radius 9) with 44-tall touch areas. The Keep all row padding 12 16, radius 14.

**Builder (Mac).** Head 64 tall, padding 0 18, step pills 23.3 tall. Library 260 wide, padding 14; drill rows padding 10 12, radius 12. Inspector 340 wide. Keep all strip 404 × 74.6, padding 10 12, radius 12.

**Player.** Lock screen time 82/82 w600, date 18 w500. Banner 370 × 99.5, padding 12 14, radius 22. Practice page large title 34/37.4 w600. Stop rows 63 tall, padding 11 16, gap 10, time 52 wide (15 w600 tabular); Now and Next tags 20.9 tall (13 w600, padding 2 7, radius 7).

**Touch areas.** Every phone control reaches 44pt. Where the drawn control is smaller (segmented halves, sheet Cancel and Done, Back, the bar title, Send, ghost block buttons, version arrows, the stepper), the page adds an invisible 44pt `::after` centred on it. Build it the same way, with `hitSlop` in the app's button, never by drawing the control bigger. The stepper's halves abut, so each stays 34 wide and 44 tall.


## S-ASK.thread

screen. Coach: CoachHelm tab › Ask (today's Ask thread); sends "Make a practice plan for Thursday". Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-thread) · capture `--id S-ASK.thread`.

Frame 390 × 844. 29 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `span < status` | 9:41 | 27.4×15 | 15/15 w600 · `meta strong` | `--ch-on-frame` #F4EEDD on `--ch-frame` #0A331F / `--ch-on-frame` #F4EEDD on `--ch-frame` #08150E | 12.0 / 16.1 |  |
| `button.ib < r` | Notifications | 44×44 |  | surface `--ch-frame` #0A331F / `--ch-frame` #08150E |  /  | met |
| `span.badge < ib` | 3 | 17×17 · 0 4 0 4 · r 9px | 11/17 w700 | `--ch-text-primary` #1C1B18 on `--ch-champagne` #D8C79B / `#1C1B18` on `--ch-champagne` #D8C79B | 10.3 / 10.3 |  |
| `button.ttl < pbar` | CoachHelm | 135.9×18 · gap 6px | 18/18 w600 · `bar title` | `--ch-on-frame` #F4EEDD on `--ch-frame` #0A331F / `--ch-on-frame` #F4EEDD on `--ch-frame` #08150E | 12.0 / 16.1 | 135.9×44 via ::after |
| `svg < ib` |  | 22×22 | icon 22 stroke | `#D0D0BC` on `--ch-frame` #0A331F / `#D0CBBA` on `--ch-frame` #08150E | 8.9 / 11.5 |  |
| `svg < ttl` |  | 14×14 | icon 14 stroke | `--ch-on-frame` #F4EEDD on `--ch-frame` #0A331F / `--ch-on-frame` #F4EEDD on `--ch-frame` #08150E | 12.0 / 16.1 |  |
| `span.dot < ttl` |  | 6×6 · r 50% |  | surface `--ch-champagne` #D8C79B / `--ch-champagne` #D8C79B |  /  |  |
| `div.sheet < base` |  | 390×746 · r 16px 16px 0px 0px |  | surface `--ch-grouped-bg` #F2F0E9 / `--ch-grouped-bg` #0E120F |  /  |  |
| `div.seg < scroll` |  | 358×36 · 2 2 2 2 · r 10px |  | surface `--ch-seg-well` #E7E2D6 / `--ch-well-bg-flat` #141815 |  /  |  |
| `button < seg` ×2 | Board | 177×32 · 7 4 7 4 · r 8px | 15/18 w500 | `--ch-text-secondary` #46433D on `--ch-seg-well` #E7E2D6 / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 7.6 / 10.9 | 177×44 via ::after |
| `span.thumb < seg` |  | 177×32 · r 8px |  | surface `--seg-on-bot` #145635 / `--seg-on-bot` #1D613F |  /  |  |
| `div.msg-me < thread` | Build Thursday’s practice around putting | 286.4×63.2 · 10 14 10 14 · r 18px 18px 6px | 16/21.6 w400 · `body-l` | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |
| `div.who < thread` | CoachHelm | 358×22 · gap 8px | 15/15 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `span.mk < who` |  | 22×22 · r 7px |  | surface `--ch-accent` #155A39 / `--ch-btn-primary-bg` #1F6B45 |  /  |  |
| `svg < mk` |  | 14×14 | icon 14 stroke | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |
| `span.ts < who` | now | 25.2×13 | 13/13 w400 · `caption` | `--ch-text-tertiary` #5F5C55 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-tertiary` #ADA697 on `--ch-grouped-bg` #0E120F | 5.8 / 7.8 |  |
| `div.card.trail < thread` |  | 358×168 · r 16px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `div.card-h < card` |  | 358×45.3 · 12 16 12 16 · gap 10px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  | met |
| `span.t.tl < card-h` | Working | 68.9×21.3 | 17/21.3 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `svg.chev < card-h` |  | 14×14 | icon 14 stroke | `--ch-text-tertiary` #5F5C55 on `--ch-card-bg` #FFFEFB / `--ch-text-tertiary` #ADA697 on `--ch-card-bg` #191E1A | 6.6 / 7.0 |  |
| `div.l < div` | Checking Thursday on the calendar | 292×20.8 | 16/20.8 w500 · `row` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.spin < ic` |  | 5.2×5.2 · r 50% |  | surface `--ch-accent` #155A39 / `--ch-gain` #7CC79B |  /  |  |
| `div.vz.sk < div` |  | 292×74 · r 12px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `div.composer < sheet` |  | 390×79 · 10 12 28 12 · gap 8px |  | surface `#FBF9F4` / `#141915` |  /  |  |
| `div.field < composer` | Ask CoachHelm | 318×40 · 10 14 10 14 · r 20px | 16/20 w400 · `body-l` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `button.send < composer` | Send | 40×40 · 1 6 1 6 · r 50% |  | surface `--ch-accent` #155A39 / `--ch-btn-primary-bg` #1F6B45 |  /  | 44×44 via ::after |
| `svg < send` |  | 18×18 | icon 18 stroke | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |
| `div.psheet < base` | Sheet | 390×61 · r 20px 20px 0px 0px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `div.grab < psheet` |  | 36×5 · r 3px |  | surface `#DBDAD7` / `#3C3F3A` |  /  |  |

## S-ASK.steps

inline state. Appears under the coach's message as each read runs. Design: [running](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-steps) · capture `--id S-ASK.steps`.

Frame 390 × 844. 9 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `svg < ok` |  | 18×18 | icon 18 stroke | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 |  |
| `div.f < div` | Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside · Hargro | 292×40.5 | 15/20.3 w400 · `meta` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `div.vz < div` |  | 292×96.7 · 10 12 10 12 · r 12px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `div.d.on < wk` |  | 64×76.7 · 6 6 7 6 · gap 2px · r 9px |  | surface `--ch-accent` #155A39 / `--ch-btn-primary-bg` #1F6B45 |  /  |  |
| `div.d < wk` ×3 |  | 40×76.7 · 6 6 7 6 · gap 2px · r 9px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `div.d.ev < wk` |  | 80×76.7 · 6 6 7 6 · gap 2px · r 9px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `span < d` ×5 | Thu | 52×15.6 | 12.5/15.6 w400 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |
| `b < d` ×5 | 5 | 52×16.5 | 15/16.5 w600 · `meta strong` · tabular | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |
| `span.e < d` ×2 | Practice 2 to 5 | 52×27.6 | 12/13.8 w500 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |

## S-ASK.read-pictures

inline state. Under each finished read in the steps list (cal, sg, pd, cls, dr). Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-reads) · capture `--id S-ASK.read-pictures`.

Frame 390 × 844. 23 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `span.neg < f` | −0.9 a round | 86.4×19 | 15/20.3 w600 · `meta strong` | `--ch-loss` #9A5700 on `--ch-card-bg` #FFFEFB / `--ch-loss` #E7AE57 on `--ch-card-bg` #191E1A | 5.6 / 8.5 |  |
| `div.vh < vz` ×2 | Strokes gained a round, last 10 team rounds | 268×15 | 12.5/15 w500 | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |
| `span.n < sgr` ×4 | Off the tee | 101.4×16.3 | 13/16.3 w400 · `caption` | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `i.z < tr` ×4 |  | 1.5×14 |  | surface `--ch-text-tertiary` #5F5C55 / `--ch-text-tertiary` #ADA697 |  /  |  |
| `span.v < sgr` ×3 | +0.2 | 36×16.3 | 13/16.3 w600 · tabular | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `span.tr < sgr` ×4 |  | 114.6×8 · r 4px |  | surface `--ch-cp-track (new)` #EBE5D8 / `--ch-cp-track (new)` #2C322D |  /  |  |
| `i.b.bp < tr` |  | 11.5×8 · r 4px |  | surface `--ch-gain` #14613D / `--ch-gain` #7CC79B |  /  |  |
| `i.b.bn < tr` ×3 |  | 22.9×8 · r 4px |  | surface `--ch-loss` #9A5700 / `--ch-loss` #E7AE57 |  /  |  |
| `span.v.lo < sgr` | −0.9 | 36×16.3 | 13/16.3 w600 · tabular | `--ch-loss` #9A5700 on `--ch-well-bg-flat` #F6F4EE / `--ch-loss` #E7AE57 on `--ch-well-bg-flat` #141815 | 5.1 / 9.0 |  |
| `span < pdr` ×4 | 3 to 5 ft | 62×16.3 | 13/16.3 w400 · `caption` | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `i.t < tr` ×4 |  | 2×14 |  | surface `--ch-text-tertiary` #5F5C55 / `--ch-text-tertiary` #ADA697 |  /  |  |
| `span.v < pdr` ×4 | 78% | 34×16.3 | 13/16.3 w600 · tabular | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `span.tr < pdr` ×4 |  | 156×8 · r 4px |  | surface `--ch-cp-track (new)` #EBE5D8 / `--ch-cp-track (new)` #2C322D |  /  |  |
| `i.m < tr` ×4 |  | 121.7×8 · r 4px |  | surface `--ch-loss` #9A5700 / `--ch-loss` #E7AE57 |  /  |  |
| `span < ln` ×2 | Ava, Jade | 70×15.6 | 13/15.6 w400 · `caption` | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `span.bx < ln` ×2 |  | 190×22 · r 7px |  | surface `--ch-cp-track (new)` #EBE5D8 / `--ch-cp-track (new)` #2C322D |  /  |  |
| `i.c < bx` | Class | 47.5×22 · 0 7 0 7 · r 7px | 12/12 w600 | `--ch-text-primary` #1C1B18 on `--ch-flat-tint` #EFEDE7 / `--ch-text-primary` #F1ECDF on `--ch-flat-tint` #232825 | 14.7 / 12.7 |  |
| `i.r < bx` | Rotation | 95×22 · 0 7 0 7 · r 7px | 12/12 w600 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |
| `span < ax` ×4 | 2:00 | 24.7×12 | 12/12 w400 · tabular | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |
| `div.dc < fan` ×3 | Clock drill | 96×57.8 · 8 9 8 9 · gap 4px · r 10px | 12.5/15 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span < dc` ×3 | Skill | 75×21.4 · gap 5px | 12.5/15 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `i < span` ×3 |  | 7.6×7.6 · r 50% |  | surface `--ch-cp-skill (new)` #3D6787 / `--ch-cp-skill (new)` #6E9BC0 |  /  |  |
| `span.more < fan` | +13 more | 51.2×12.5 | 12.5/12.5 w500 | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |

## S-ASK.intake

inline card. After the calendar read; the turn pauses on it. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-intake) · capture `--id S-ASK.intake`.

Frame 390 × 844. 13 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `div.card.intake < thread` |  | 358×549.8 · r 16px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `span.tile < card-h` |  | 32×32 · r 9px |  | surface `--ch-gain-tint` #E8EEE8 / `--ch-gain-tint` #1E3326 |  /  |  |
| `span.t < hd` | What should Thursday cover? | 284×21.3 | 17/21.3 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `svg < tile` |  | 18×18 | icon 18 stroke | `--ch-gain` #14613D on `--ch-gain-tint` #E8EEE8 / `--ch-gain` #7CC79B on `--ch-gain-tint` #1E3326 | 6.3 / 6.7 |  |
| `span.m < hd` | Best guesses are picked. Change any. | 284×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.ql < q` ×3 | How long | 326×15.6 | 13/15.6 w600 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `button.qo < qc` ×6 | 2 h | 45×36 · 0 13 0 13 · r 999px | 14/16.8 w500 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 | 45×36, row spacing gives 44 |
| `button.qo.on < qc` ×4 | 3 h | 45.3×36 · 0 13 0 13 · r 999px | 14/16.8 w500 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 45.3×36, row spacing gives 44 |
| `div.qh < q` ×3 | Your calendar has 2:00 to 5:00 | 326×16.9 | 13/16.9 w400 · `caption` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `svg < fmtline` |  | 16×16 | icon 16 stroke | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 |  |
| `span < fmtline` | In your format · | 216.4×18.2 | 14/18.2 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `b < span` | Fall practice sheet | 119.5×18 | 14/18.2 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `button.btn-p < acts` | Build the plan | 326×36.5 · 10 14 10 14 · r 12px | 15/16.5 w600 · `meta strong` | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 326×36.5, row spacing gives 44 |

## S-ASK.intake-folded

inline state. Press Build the plan on S-ASK.intake. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-reads) · capture `--id S-ASK.intake-folded`.

Every element is specified in an earlier section (same component, this state only changes content).

## S-ASK.plan-card

inline card. After the reads finish; the plan writes itself block by block. Design: [writing](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-writing) · capture `--id S-ASK.plan-card`.

Frame 390 × 844. 21 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `span.t.tl < card-h` | 6 steps | 57.5×21.3 | 17/21.3 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.m.tc < card-h` | 9s | 16.3×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.card.art < thread` |  | 358×892.5 · r 16px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `span.t < hd` | Thursday practice | 211.5×21.3 | 17/21.3 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `button.btn-s < card-h` | Open | 62.5×29.4 · 7 13 7 13 · r 999px | 14/15.4 w600 | `--ch-accent` #155A39 on `--ch-well-bg-flat` #F6F4EE / `--ch-gain` #7CC79B on `--ch-well-bg-flat` #141815 | 7.5 / 9.0 | 70.5×49.4 via ::after |
| `span.m < hd` | Draft · Thu, Nov 5 · 2:00 to 5:00 PM | 211.5×39 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.strip < card` |  | 326×8 · gap 2px · r 4px |  | surface `--ch-cp-track (new)` #EBE5D8 / `--ch-cp-track (new)` #2C322D |  /  |  |
| `div.blk < blocks` |  | 358×116.2 · 12 16 12 16 · gap 12px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  | met |
| `div.tm.num < blk` ×2 | 2:00 | 54×92.2 | 15/18 w600 · `meta strong` · tabular | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.btt < bt` ×2 | Warm-up | 72.1×20 | 16/20.8 w500 · `row` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span < tm` ×2 | 30 min | 54×15.6 | 13/15.6 w400 · `caption` · tabular | `--ch-text-tertiary` #5F5C55 on `--ch-card-bg` #FFFEFB / `--ch-text-tertiary` #ADA697 on `--ch-card-bg` #191E1A | 6.6 / 7.0 |  |
| `div.bs < div` | Range · everyone | 260×20.3 | 15/20.3 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.rout < div` | Runs to 2:30 so Ava and Jade, in class until 2:1 | 260×43.1 | 15/20.3 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `button.srcb < src` | Classes | 63.3×22.9 · 3 8 3 8 · r 7px | 13/16.9 w600 | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 | 71.3×42.9 via ::after |
| `div.blk.wh < blocks` |  | 358×411.1 · 12 16 12 16 · gap 12px · r 12px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  | met |
| `span.caret < btt` |  | 2×16 |  | surface `--ch-accent` #155A39 / `--ch-gain` #7CC79B |  /  |  |
| `i.sb < tm` ×8 |  | 38×11 · r 6px |  · tabular | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `i.sb < div` ×8 |  | 192.4×11 · r 6px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `span.bl < building` | Writing block 2 of 6 | 132.9×15 | 15/15 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `span.bar < building` |  | 185.1×3 · r 2px |  | surface `--ch-cp-track (new)` #EBE5D8 / `--ch-cp-track (new)` #2C322D |  /  |  |
| `i < bar` |  | 30.9×3 |  | surface `--ch-accent` #155A39 / `--ch-gain` #7CC79B |  /  |  |

## S-ASK.why

inline panel. Inside each block of S-ASK.plan-card. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-card) · capture `--id S-ASK.why`.

Frame 390 × 844. 30 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `i < strip` ×4 |  | 69.8×8 |  | surface `--ch-cp-skill (new)` #3D6787 / `--ch-cp-skill (new)` #6E9BC0 |  /  |  |
| `i.gd.g-A < sline` | A | 20×20 · r 6px | 12/12 w700 | white #FFFFFF on `--ch-cp-pressure (new)` #1F6B45 / `--ch-grouped-bg` #0E120F on `--ch-cp-pressure (new)` #4FA877 | 6.5 / 6.5 |  |
| `span.dn < sline` ×3 | Clock drill, 3 to 5 ft | 126.3×20.3 | 15/20.3 w400 · `meta` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.kind.k-skill < sline` ×2 | Skill | 39.5×20.9 · 2 7 2 7 · r 7px | 13/16.9 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `i.gd.g-B < sline` | B | 20×20 · r 6px | 12/12 w700 | white #FFFFFF on `#2F5B7E` / `--ch-grouped-bg` #0E120F on `--ch-cp-skill (new)` #6E9BC0 | 7.2 / 6.4 |  |
| `i.gd.g-C < sline` | C | 20×20 · r 6px | 12/12 w700 | white #FFFFFF on `#654A7E` / `#0E120F` on `--gC` #B49ACB | 7.4 / 7.6 |  |
| `span.kind.k-random < sline` | Random | 59.2×20.9 · 2 7 2 7 · r 7px | 13/16.9 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `div.why < div` ×3 |  | 260×221.5 · 8 10 8 10 · gap 6px · r 10px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `div < why` ×6 | More makes from 3 to 5 feet, better speed from l | 240×40.5 | 15/20.3 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |
| `b < div` ×6 | Aim | 28.7×19 | 15/20.3 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `span.neg < div` | 0.9 strokes a round | 133.5×19 | 15/20.3 w600 · `meta strong` | `--ch-loss` #9A5700 on `--ch-well-bg-flat` #F6F4EE / `--ch-loss` #E7AE57 on `--ch-well-bg-flat` #141815 | 5.1 / 9.0 |  |
| `span.kind.k-random < bt` | Random | 65.6×20.9 · 2 7 2 7 · r 7px | 13/16.9 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span < gstarts` ×3 | Hole 1 | 76.2×26 · 3 9 3 3 · gap 6px · r 8px | 14/16.8 w500 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `i.gd.g-A < span` | A | 20×20 · r 6px | 12/12 w700 | white #FFFFFF on `--ch-cp-pressure (new)` #1F6B45 / `--ch-grouped-bg` #0E120F on `--ch-cp-pressure (new)` #4FA877 | 6.5 / 6.5 |  |
| `i.gd.g-B < span` | B | 20×20 · r 6px | 12/12 w700 | white #FFFFFF on `#2F5B7E` / `--ch-grouped-bg` #0E120F on `--ch-cp-skill (new)` #6E9BC0 | 7.2 / 6.4 |  |
| `i.gd.g-C < span` | C | 20×20 · r 6px | 12/12 w700 | white #FFFFFF on `#654A7E` / `#0E120F` on `--gC` #B49ACB | 7.4 / 7.6 |  |
| `span.kind.k-pressure < bt` | Pressure | 68.3×20.9 · 2 7 2 7 · r 7px | 13/16.9 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `div.mix < mixw` |  | 326×6 · gap 2px · r 3px |  | surface `--ch-cp-track (new)` #EBE5D8 / `--ch-cp-track (new)` #2C322D |  /  |  |
| `i < mix` ×3 |  | 95.4×6 |  | surface `--ch-cp-skill (new)` #3D6787 / `--ch-cp-skill (new)` #6E9BC0 |  /  |  |
| `span < mixleg` ×4 | Skill 40 min | 82.7×16.9 | 13/16.9 w400 · `caption` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `button.saverow < foot` |  | 326×39 · 10 12 10 12 · gap 10px · r 12px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  | 326×39, row spacing gives 44 |
| `svg.fi < saverow` |  | 24×19 | icon 24 stroke | `--ch-accent` #155A39 on `--ch-well-bg-flat` #F6F4EE / `--ch-gain` #7CC79B on `--ch-well-bg-flat` #141815 | 7.5 / 9.0 |  |
| `span < saverow` | Save to | 152.9×18 | 15/18 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |
| `b.fn < span` | Practice plans | 99.8×19 | 15/18 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `svg.chev < saverow` |  | 14×14 | icon 14 stroke | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |
| `button.btn-g < acts` | Save draft | 99.4×36.5 · 10 14 10 14 · r 12px | 15/16.5 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 | 99.4×36.5, row spacing gives 44 |
| `button.btn-p < acts` | Publish… | 91.4×36.5 · 10 14 10 14 · r 12px | 15/16.5 w600 · `meta strong` | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 91.4×36.5, row spacing gives 44 |
| `div.prose < thread` |  | 358×171.1 · 12 14 12 14 · r 6px 18px 18px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `p < prose` ×2 | Built around where the team loses most: short pu | 330×92.8 | 16/23.2 w400 · `body-l` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `button < refine` ×3 | Make it 2 hours | 123.4×36 · 0 13 0 13 · r 999px | 14/15.4 w500 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 | 123.4×36, row spacing gives 44 |

## S-ASK.evidence

sheet (hug, max 84%). Tap a source chip in S-ASK.why. Design: [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-evidence) · capture `--id S-ASK.evidence`.

Frame 390 × 844. 8 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `div.scrimx.on < base` |  | 390×844 |  | surface `#0B281A` / `#040B07` |  /  |  |
| `button < sh-h` | Done | 40.5×32 · 8 0 8 0 | 16/16 w600 | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 | 44×44 via ::after |
| `span.t < sh-h` | Evidence | 73.1×20.4 | 17/20.4 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `div.grp < sh-b` ×2 |  | 358×266.5 · 14 14 14 14 · gap 8px · r 14px |  | surface `--ch-grouped-bg` #F2F0E9 / `--ch-grouped-bg` #0E120F |  /  |  |
| `b < grp` | Putting by distance | 330×22.1 | 17/22.1 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `span < grp` ×2 | Team, last 10 rounds · 86 player-rounds · 412 pu | 330×42 | 15/21 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-grouped-bg` #F2F0E9 / `--ch-text-secondary` #D0C9B8 on `--ch-grouped-bg` #0E120F | 8.6 / 11.4 |  |
| `span < div` ×8 | 3 to 5 ft | 65.5×21 | 15/21 w400 · `meta` | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `span.num < div` ×4 | 78% | 27×21 | 15/21 w400 · `meta` · tabular | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |

## S-ASK.refine

inline chips. Under the ready plan card. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-card) · capture `--id S-ASK.refine`.

Every element is specified in an earlier section (same component, this state only changes content).

## S-ASK.block-sheet

sheet (hug, max 84%). Tap a block row in S-ASK.plan-card. Design: [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-edit) · capture `--id S-ASK.block-sheet`.

Frame 390 × 844. 10 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `span.t < sh-h` | Pressure finish | 118.2×20.4 | 17/20.4 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.stepper < field-row` |  | 126×30 · gap 0px · r 9px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `button < stepper` ×2 | − | 34×30 · 1 6 1 6 | 18/18 w600 · `bar title` | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 | 34×44 via ::after (halves abut, whole control 126 wide) |
| `span < field-row` ×4 | Length | 52.6×20.8 | 16/20.8 w400 · `body-l` | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `span.len < stepper` | 15 min | 58×15 | 15/15 w600 · `meta strong` · tabular | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.v < field-row` ×3 | Putting green | 101.3×20.8 | 16/20.8 w400 · `body-l` | `--ch-text-secondary` #46433D on `--ch-grouped-bg` #F2F0E9 / `--ch-text-secondary` #D0C9B8 on `--ch-grouped-bg` #0E120F | 8.6 / 11.4 |  |
| `div.why < sh-b` |  | 358×111.6 · 8 10 8 10 · gap 6px · r 10px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `div.ask-in < sh-b` |  | 358×35.5 · 8 8 8 12 · gap 8px · r 12px |  | surface `--ch-grouped-bg` #F2F0E9 / `--ch-grouped-bg` #0E120F |  /  |  |
| `span < ask-in` | Ask about this block | 312×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-grouped-bg` #F2F0E9 / `--ch-text-secondary` #D0C9B8 on `--ch-grouped-bg` #0E120F | 8.6 / 11.4 |  |
| `svg < ask-in` |  | 18×18 | icon 18 stroke | `--ch-accent` #155A39 on `--ch-grouped-bg` #F2F0E9 / `--ch-gain` #7CC79B on `--ch-grouped-bg` #0E120F | 7.2 / 9.4 |  |

## S-ASK.swap

sheet (hug, max 84%). Swap in S-ASK.block-sheet, or Swap on a station. Design: [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-swap) · capture `--id S-ASK.swap`.

Frame 390 × 844. 10 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `button < sh-h` | Cancel | 52.5×32 · 8 0 8 0 | 16/16 w600 | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 | 52.5×44 via ::after |
| `span.t < sh-h` | Swap drill | 77.7×20.4 | 17/20.4 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `div.grp < sh-b` ×2 | Fits the same gap: 78% from 3 to 5 ft against th | 358×87 · 12 14 12 14 · r 14px | 15/21 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |
| `b < grp` | Station 1 · Clock drill, 3 to 5 ft | 198.1×19 | 15/21 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `span.n < alt` ×3 | Make 7 from 5 feet | 267.1×20.9 | 16/20.8 w500 · `row` | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `span.kind.k-pressure < n` | Pressure | 68.3×20.9 · 2 7 2 7 · r 7px | 13/16.9 w600 | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `button.btn-s < alt` ×3 | Use | 50.9×29.4 · 7 13 7 13 · r 999px | 14/15.4 w600 | `--ch-accent` #155A39 on `--ch-well-bg-flat` #F6F4EE / `--ch-gain` #7CC79B on `--ch-well-bg-flat` #141815 | 7.5 / 9.0 | 58.9×49.4 via ::after |
| `span.d < alt` ×3 | 20 min · Same 3 to 5 ft gap, practised under pre | 267.1×37.8 | 14/18.9 w400 | `--ch-text-secondary` #46433D on `--ch-grouped-bg` #F2F0E9 / `--ch-text-secondary` #D0C9B8 on `--ch-grouped-bg` #0E120F | 8.6 / 11.4 |  |
| `span.kind.k-skill < n` ×2 | Skill | 39.5×20.9 · 2 7 2 7 · r 7px | 13/16.9 w600 | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `span < ask-in` | Ask about this station | 312×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-grouped-bg` #F2F0E9 / `--ch-text-secondary` #D0C9B8 on `--ch-grouped-bg` #0E120F | 8.6 / 11.4 |  |

## S-ASK.full-plan

push. Tap Open the full plan on S-ASK.plan-card. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-full) · capture `--id S-ASK.full-plan`.

Frame 390 × 844. 50 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `button.back < pbar` | Ask | 51.2×20 · 0 8 0 0 · gap 2px | 17/17 w400 | `--ch-champagne` #D8C79B on `--ch-frame` #0A331F / `--ch-champagne` #D8C79B on `--ch-frame` #08150E | 8.3 / 11.2 | 51.2×44 via ::after |
| `svg < back` |  | 12×20 | icon 12 stroke | `--ch-champagne` #D8C79B on `--ch-frame` #0A331F / `--ch-champagne` #D8C79B on `--ch-frame` #08150E | 8.3 / 11.2 |  |
| `div.ctr < pbar` | Thursday practice | 144.7×18.7 | 17/18.7 w600 · `card-title` · ellipsis | `--ch-on-frame` #F4EEDD on `--ch-frame` #0A331F / `--ch-on-frame` #F4EEDD on `--ch-frame` #08150E | 12.0 / 16.1 |  |
| `div.sheet < layer` |  | 390×746 · r 16px 16px 0px 0px |  | surface `--ch-grouped-bg` #F2F0E9 / `--ch-grouped-bg` #0E120F |  /  |  |
| `article.paper.doc < scroll` | Thursday practice, printed plan | 358×1572.3 · 22 20 14 20 · gap 16px · r 5px |  | surface `--ch-card-bg` #FFFEFB / `#FFFEFB` |  /  |  |
| `div.pp-date < pp-top` | Thursday, November 5 | 48×59.3 · 5 0 6 0 · r 9px |  | surface `--ch-card-bg` #FFFEFB / `#FFFEFB` |  /  |  |
| `span < pp-date` ×2 | THU | 24.5×12.6 | 10.5/12.6 w600 · 0.84px | `#47443D` on `--ch-card-bg` #FFFEFB / `#47443D` on `#FFFEFB` | 9.6 / 9.6 |  |
| `span.pp-mark < pp-top` | DU | 36×36 · r 9px | 13/13 w700 · 0.26px | `--ch-on-frame` #F4EEDD on `--ch-feature-bg` #0B3A25 / `--ch-on-frame` #F4EEDD on `#0B3A25` | 11.0 / 11.0 |  |
| `b < pp-org` | Demo University Golf | 214×16.8 | 14/16.8 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `#1C1B18` on `#FFFEFB` | 17.1 / 17.1 |  |
| `b < pp-date` | 5 | 13.2×23.1 | 22/23.1 w600 · tabular | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `#1C1B18` on `#FFFEFB` | 17.1 / 17.1 |  |
| `span < pp-org` | Practice plan · Coach copy | 148.6×15 | 12.5/16.3 w400 | `#47443D` on `--ch-card-bg` #FFFEFB / `#47443D` on `#FFFEFB` | 9.6 / 9.6 |  |
| `h3.pp-title < paper` | Thursday practice | 318×31.5 | 30/31.5 w600 · -0.9px | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `#1C1B18` on `#FFFEFB` | 17.1 / 17.1 |  |
| `div.pp-focus < paper` | Putts inside 6 feet and speed from long range. F | 318×44 | 15.5/22 w400 · `body-l` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `#1C1B18` on `#FFFEFB` | 17.1 / 17.1 |  |
| `dt < div` ×3 | Time | 96×14.4 | 12/14.4 w500 | `#47443D` on `--ch-card-bg` #FFFEFB / `#47443D` on `#FFFEFB` | 9.6 / 9.6 |  |
| `dd < div` ×3 | 2:00 to 5:00 PM | 96×35.1 | 13.5/17.6 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `#1C1B18` on `#FFFEFB` | 17.1 / 17.1 |  |
| `h4.pp-h < section` ×4 | Groups | 318×16.2 · gap 8px | 13.5/16.2 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `#1C1B18` on `#FFFEFB` | 17.1 / 17.1 |  |
| `span < pp-h` ×2 | 9 players | 54.9×16.2 | 13.5/16.2 w400 · tabular | `#47443D` on `--ch-card-bg` #FFFEFB / `#47443D` on `#FFFEFB` | 9.6 / 9.6 |  |
| `div.pp-g.g-A < pp-groups` |  | 100.7×101.7 · 8 8 9 8 · gap 7px · r 10px |  | surface `#E4EEE7` / `#E4EEE7` |  /  |  |
| `div.pp-g.g-B < pp-groups` |  | 100.7×101.7 · 8 8 9 8 · gap 7px · r 10px |  | surface `#E3EAF2` / `#E3EAF2` |  /  |  |
| `div.pp-g.g-C < pp-groups` |  | 100.7×101.7 · 8 8 9 8 · gap 7px · r 10px |  | surface `#ECE7F1` / `#ECE7F1` |  /  |  |
| `div.gh < pp-g` ×3 | Group A | 84.7×19 · gap 5px | 12.5/12.5 w600 | `--ch-text-primary` #1C1B18 on `#E4EEE7` / `#1C1B18` on `#E4EEE7` | 14.5 / 14.5 |  |
| `i.gd.g-A < gh` | A | 19×19 · r 5px | 11/11 w700 | white #FFFFFF on `--ch-cp-pressure (new)` #1F6B45 / `#FFFFFF` on `--ch-btn-primary-bg` #1F6B45 | 6.5 / 6.5 |  |
| `i.gd.g-B < gh` | B | 19×19 · r 5px | 11/11 w700 | white #FFFFFF on `#2F5B7E` / `#FFFFFF` on `#2F5B7E` | 7.2 / 7.2 |  |
| `i.gd.g-C < gh` | C | 19×19 · r 5px | 11/11 w700 | white #FFFFFF on `#654A7E` / `#FFFFFF` on `#654A7E` | 7.4 / 7.4 |  |
| `li < ul` ×9 | Sofia | 84.7×18.2 | 13.5/18.2 w400 | `--ch-text-primary` #1C1B18 on `#E4EEE7` / `#1C1B18` on `#E4EEE7` | 14.5 / 14.5 |  |
| `b < pt` ×6 | 2:00 | 42×16.8 | 14/16.8 w600 · tabular | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `#1C1B18` on `#FFFEFB` | 17.1 / 17.1 |  |
| `div.pn < pc` ×6 | Warm-up | 268×18.8 | 14.5/18.9 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `#1C1B18` on `#FFFEFB` | 17.1 / 17.1 |  |
| `div.pd < pc` ×6 | Range | 268×18.2 | 13.5/18.2 w400 | `#47443D` on `--ch-card-bg` #FFFEFB / `#47443D` on `#FFFEFB` | 9.6 / 9.6 |  |
| `span < pt` ×6 | 30 min | 38.6×15 | 12/15.6 w400 | `#47443D` on `--ch-card-bg` #FFFEFB / `#47443D` on `#FFFEFB` | 9.6 / 9.6 |  |
| `span.all < pp-who` ×4 | Everyone | 72.3×22.5 · 5 9 5 9 · gap 6px · r 7px | 12.5/12.5 w500 | `--ch-text-primary` #1C1B18 on `#F1EEE6` / `#1C1B18` on `#F1EEE6` | 14.8 / 14.8 |  |
| `div.pp-why < pc` ×4 | Runs to 2:30 so Ava and Jade, in class until 2:1 | 268×35 | 12.5/17.5 w400 | `#47443D` on `--ch-card-bg` #FFFEFB / `#47443D` on `#FFFEFB` | 9.6 / 9.6 |  |
| `b < pp-why` ×4 | Why | 27.7×15 | 12.5/17.5 w600 | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `#155A39` on `#FFFEFB` | 8.2 / 8.2 |  |
| `div.dock < sheet` |  | 390×80.6 · 10 16 28 16 · gap 10px |  | surface `#FBF9F4` / `#141915` |  /  |  |
| `button.btn-g < dock` | Edit in builder | 174×41.6 · 12 16 12 16 · r 12px | 16/17.6 w600 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 | 174×41.6, row spacing gives 44 |
| `button.btn-p < dock` | Publish… | 174×41.6 · 12 16 12 16 · r 12px | 16/17.6 w600 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 174×41.6, row spacing gives 44 |
| `span.h < pp-rot` ×4 | Station | 160×13.5 · 0 0 2 0 | 11.5/11.5 w500 · tabular | `#47443D` on `--ch-card-bg` #FFFEFB / `#47443D` on `#FFFEFB` | 9.6 / 9.6 |  |
| `b < s` ×3 | Clock drill, 3 to 5 ft | 160×16.3 | 13/16.3 w500 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `#1C1B18` on `#FFFEFB` | 17.1 / 17.1 |  |
| `span.c.g-A < pp-rot` ×3 |  | 32×28 · r 7px |  | surface `#E4EEE7` / `#E4EEE7` |  /  |  |
| `span.c.g-C < pp-rot` ×3 |  | 32×28 · r 7px |  | surface `#ECE7F1` / `#ECE7F1` |  /  |  |
| `span.c.g-B < pp-rot` ×3 |  | 32×28 · r 7px |  | surface `#E3EAF2` / `#E3EAF2` |  /  |  |
| `i.gd.g-A < c` ×3 | A | 19×19 · r 5px | 11/11 w700 | white #FFFFFF on `--ch-cp-pressure (new)` #1F6B45 / `#FFFFFF` on `--ch-btn-primary-bg` #1F6B45 | 6.5 / 6.5 |  |
| `i.gd.g-C < c` ×3 | C | 19×19 · r 5px | 11/11 w700 | white #FFFFFF on `#654A7E` / `#FFFFFF` on `#654A7E` | 7.4 / 7.4 |  |
| `i.gd.g-B < c` ×3 | B | 19×19 · r 5px | 11/11 w700 | white #FFFFFF on `#2F5B7E` / `#FFFFFF` on `#2F5B7E` | 7.2 / 7.2 |  |
| `span < s` ×3 | Green, front · Coach Lin | 127.6×15 | 12/15.6 w400 | `#47443D` on `--ch-card-bg` #FFFEFB / `#47443D` on `#FFFEFB` | 9.6 / 9.6 |  |
| `div.psheet < layer` | Sheet | 390×61 · r 20px 20px 0px 0px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `span.neg < pp-why` | 0.9 strokes a round | 238.2×32.5 | 12.5/17.5 w600 | `--ch-loss` #9A5700 on `--ch-card-bg` #FFFEFB / `#9A5700` on `#FFFEFB` | 5.6 / 5.6 |  |
| `span < pp-who` ×3 | Hole 1 | 70.1×25 · 3 8 3 3 · gap 6px · r 7px | 12.5/12.5 w500 | `--ch-text-primary` #1C1B18 on `#F1EEE6` / `#1C1B18` on `#F1EEE6` | 14.8 / 14.8 |  |
| `li < pp-check` ×4 | Alignment sticks · 6 | 150×17.5 · gap 8px | 13.5/17.6 w400 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `#1C1B18` on `#FFFEFB` | 17.1 / 17.1 |  |
| `span < pp-foot` ×3 | Draft · not published | 105.3×14.9 | 11.5/14.9 w400 | `#47443D` on `--ch-card-bg` #FFFEFB / `#47443D` on `#FFFEFB` | 9.6 / 9.6 |  |
| `span < mixleg` ×3 | Random 80 min | 109×16.9 | 13/16.9 w400 · `caption` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |

## S-ASK.toast

toast. Save draft… in the S-ASKD.pane footer (the phone saves from the plan card, S-ASK.saved). Not drawn: build from the rules in 05 and the components of its parent below.

## S-ASK.save-to

inline list. Tap the Save to row in the plan card foot. Design: [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-folders) · capture `--id S-ASK.save-to`.

Frame 390 × 844. 6 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `button.saverow.open < foot` |  | 326×39 · 10 12 10 12 · gap 10px · r 12px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  | 326×39, row spacing gives 44 |
| `div.flist < foot` |  | 326×195 · r 12px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `svg.fi < fr` ×5 |  | 24×19 | icon 24 stroke | `--ch-accent` #155A39 on `--ch-well-bg-flat` #F6F4EE / `--ch-gain` #7CC79B on `--ch-well-bg-flat` #141815 | 7.5 / 9.0 |  |
| `span.n < fr` ×5 | Practice plans | 220.2×18.8 | 15/18.8 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `span.c < fr` ×4 | 4 | 7.8×16.3 | 13/16.3 w400 · `caption` · tabular | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |
| `svg < tk` |  | 16×16 | icon 16 stroke | `--ch-accent` #155A39 on `--ch-well-bg-flat` #F6F4EE / `--ch-gain` #7CC79B on `--ch-well-bg-flat` #141815 | 7.5 / 9.0 |  |

## S-ASK.saved

inline receipt. Press Save draft. Design: [saving](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-saving) · capture `--id S-ASK.saved`.

Frame 390 × 844. 9 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `b.fn < span` | Hargrove week | 105.4×19 | 15/18 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `div.cap < acts` |  | 326×41 · 13 16 13 16 · r 12px |  | surface `--ch-accent` #155A39 / `--ch-btn-primary-bg` #1F6B45 |  /  |  |
| `span < cap` | Saving… | 58.7×19 | 15/15 w600 · `meta strong` | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |
| `i.sw2 < cap` |  | 130.4×3 |  | surface `--ch-seg-on-ink` #F6F1E4 / `--ch-seg-on-ink` #F6F1E4 |  /  |  |
| `div.fold.tg < dstrip` |  | 103.3×98.2 · 10 10 10 10 · gap 4px · r 12px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `div.fold < dstrip` ×2 |  | 103.3×98.2 · 10 10 10 10 · gap 4px · r 12px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `svg < fold` ×3 |  | 30×24 | icon 30 stroke | `--ch-accent` #155A39 on `--ch-well-bg-flat` #F6F4EE / `--ch-gain` #7CC79B on `--ch-well-bg-flat` #141815 | 7.5 / 9.0 |  |
| `b < fold` ×3 | Hargrove week | 83.3×31.2 | 13/15.6 w600 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `span.cnt < fold` ×3 | 0 plans | 40.6×15 | 12.5/15 w400 · tabular | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |

## S-ASK.failed

inline state. A save or publish that fails. Not drawn: build from the rules in 05 and the components of its parent below.

## S-ASK.undone

inline state. Press Undo inside 8s on a receipt. Not drawn: build from the rules in 05 and the components of its parent below.

## S-ASK.cancelled

inline state. Press Cancel on S-ASK.publish-confirm. Not drawn: build from the rules in 05 and the components of its parent below.

## S-ASK.publish-confirm

inline card. Press Publish… on the plan card or the full-plan dock. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-confirm) · capture `--id S-ASK.publish-confirm`.

Frame 390 × 844. 18 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `div.card.prop < thread` |  | 358×639 · r 16px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `span.t < card-h` | Publish Thursday’s plan? | 284×21.3 | 17/21.3 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span < m` | Players get the plan and where they start. It fi | 325.6×41.1 | 15/21 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `span.k < fact` ×4 | When | 96×20.3 | 15/20.3 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `span.v < fact` ×3 | Thu, Nov 5 · 2:00 to 5:00 PM | 220×20.3 | 15/20.3 w400 · `meta` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.av < avs` ×9 | SM | 26×26 · r 50% | 10/10 w700 | white #FFFFFF on `--ch-cp-pressure (new)` #1F6B45 / `#FFFFFF` on `--ch-btn-primary-bg` #1F6B45 | 6.5 / 6.5 |  |
| `span < v` | 9 players and 2 coaches, push and bell | 220×40.5 | 15/20.3 w400 · `meta` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `button.btn-s < v` | Change | 78×29.4 · 7 13 7 13 · r 999px | 14/15.4 w600 | `--ch-accent` #155A39 on `--ch-well-bg-flat` #F6F4EE / `--ch-gain` #7CC79B on `--ch-well-bg-flat` #141815 | 7.5 / 9.0 | 86×49.4 via ::after |
| `div < card` | What Jonah gets (each player sees their own star | 358×22.9 · 6 16 0 16 | 13/16.9 w400 · `caption` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.preview < card` |  | 326×76.7 · 10 12 10 12 · gap 10px · r 12px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `span.app < preview` |  | 28×28 · r 7px |  | surface `--ch-frame` #0A331F / `--ch-frame` #08150E |  /  |  |
| `span < preview` | 2:00 PM · You start on the putting green with Gr | 264×56.7 | 14/18.9 w400 | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |
| `b < span` | Practice plan for Thursday | 264×18.9 | 14/18.9 w600 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `svg < app` |  | 16×16 | icon 16 stroke | `--ch-on-frame` #F4EEDD on `--ch-frame` #0A331F / `--ch-on-frame` #F4EEDD on `--ch-frame` #08150E | 12.0 / 16.1 |  |
| `span < row-sw` | Post the plan card in Team chat | 213.4×20.3 | 15/20.3 w400 · `meta` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `button.sw < row-sw` | Post in Team chat | 40×23 · r 999px |  | surface `--ch-accent` #155A39 / `.ch-switch on` #2E8459 |  /  | 52×45 via ::before |
| `div.oncf < card` | it files in Documents now. The 11 people hear on | 358×51.1 · 12 16 0 16 | 14.5/19.6 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `b < oncf` | On confirm: | 80.3×18 | 14.5/19.6 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |

## S-ASK.published

inline receipt. Press Publish to 11 people. Design: [publishing](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-publishing) · capture `--id S-ASK.published`.

Frame 390 × 844. 4 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `span < cap` | Publishing… | 85.8×19 | 15/15 w600 · `meta strong` | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |
| `div.dl < card` | Documents | 358×25.6 · 2 16 8 16 | 13/15.6 w500 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `b < fold` ×3 | Practice plans | 83.3×31.2 | 13/15.6 w600 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `span.cnt < fold` ×3 | 4 plans | 40.6×15 | 12.5/15 w400 · tabular | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |

## S-ASK.share-pdf

system print sheet. Share PDF on S-ASK.full-plan (phone). Not drawn: build from the rules in 05 and the components of its parent below.

## S-ASKD.thread

screen (desktop). Mac: CoachHelm › Ask, same send. Design: [built](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-desk-pane) · capture `--id S-ASKD.thread`.

Frame 1280 × 800. 33 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `div.dscreen < dwrap` |  | 1280×800 |  | surface `--ch-frame` #0A331F / `--ch-frame` #08150E |  /  |  |
| `div.dmain < dscreen` |  | 1048×792 · r 14px 0px 0px |  | surface `--ch-grouped-bg` #F2F0E9 / `--ch-grouped-bg` #0E120F |  /  |  |
| `div.dbar < dmain` |  | 1048×56 · 0 20 0 20 · gap 16px |  | surface `#FBF9F4` / `#141915` |  /  |  |
| `div.team < dside` | Demo University Golf | 208×52 · 6 10 18 10 · gap 10px | 15/18 w600 · `meta strong` | `--ch-on-frame` #F4EEDD on `--ch-frame` #0A331F / `--ch-on-frame` #F4EEDD on `--ch-frame` #08150E | 12.0 / 16.1 |  |
| `div.seg < dbar` |  | 200×36 · 2 2 2 2 · r 10px |  | surface `--ch-seg-well` #E7E2D6 / `--ch-well-bg-flat` #141815 |  /  |  |
| `i < team` | DU | 28×28 · r 8px | 12/12 w700 | `--ch-frame` #0A331F on `--ch-champagne` #D8C79B / `#0A331F` on `--ch-champagne` #D8C79B | 8.3 / 8.3 |  |
| `span.tt < dbar` | CoachHelm | 94.4×17 | 17/17 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `#FBF9F4` / `--ch-text-primary` #F1ECDF on `#141915` | 16.3 / 15.1 |  |
| `div.dpanel < dbody` |  | 452×736 |  | surface `--ch-grouped-bg` #F2F0E9 / `--ch-grouped-bg` #0E120F |  /  |  |
| `div.ph-h < dpanel` |  | 451×60.4 · 12 16 12 16 · gap 10px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `a < dside` ×8 | Home | 208×33.4 · 8 10 8 10 · gap 10px · r 9px | 14.5/17.4 w500 | `sidebar ink 2` #CFD6C8 on `--ch-frame` #0A331F / `sidebar ink 2` #CFD6C8 on `--ch-frame` #08150E | 9.4 / 12.6 | 208×33.4 pointer (desktop, no slop needed) |
| `span.tile < ph-h` |  | 32×32 · r 9px |  | surface `--ch-gain-tint` #E8EEE8 / `--ch-gain-tint` #1E3326 |  /  |  |
| `span.t < div` | Thursday practice | 136.2×19.2 | 16/19.2 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `svg < a` ×8 |  | 17×17 | icon 17 stroke | `sidebar ink 2` #CFD6C8 on `--ch-frame` #0A331F / `sidebar ink 2` #CFD6C8 on `--ch-frame` #08150E | 9.4 / 12.6 |  |
| `button < vsw` ×2 | ‹ | 26×26 · 1 6 1 6 · r 7px | 13.5/13.5 w400 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 | 26×26 pointer (desktop, no slop needed) |
| `button.ib < ph-h` | ✕ | 28×28 · 1 6 1 6 · r 8px | 13/13 w500 | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 | 28×28 pointer (desktop, no slop needed) |
| `div.msg-me < dthread` | Build Thursday’s practice around putting | 314.7×40.9 · 10 14 10 14 · r 18px 18px 6px | 15.5/20.9 w400 · `body-l` | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |
| `span.vl < vsw` | 1 of 1 | 28.6×13.5 | 13.5/13.5 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `span.m < div` | Draft · not published | 136.2×16.2 | 13.5/16.2 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `a.on < dside` | CoachHelm | 208×33.4 · 8 10 8 10 · gap 10px · r 9px | 14.5/17.4 w500 | `--ch-on-frame` #F4EEDD on `#264936` / `--ch-on-frame` #F4EEDD on `#202B23` | 8.6 / 12.7 | 208×33.4 pointer (desktop, no slop needed) |
| `svg < on` |  | 17×17 | icon 17 stroke | `--ch-on-frame` #F4EEDD on `#264936` / `--ch-on-frame` #F4EEDD on `#202B23` | 8.6 / 12.7 |  |
| `div.pb < dpanel` |  | 451×617.2 · 20 20 28 20 |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `div.who < dthread` | CoachHelm | 540×22 · gap 8px | 15/15 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `article.paper.doc < pb` | Thursday practice, printed plan | 411×1518.3 · 22 22 22 22 · gap 16px · r 5px |  | surface `--ch-card-bg` #FFFEFB / `#FFFEFB` |  /  |  |
| `div.card.trail < dthread` |  | 540×45.3 · r 16px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `div.card.art < dthread` |  | 540×90.8 · r 16px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `div.gl < dside` | Team | 208×34.5 · 16 10 6 10 | 12.5/12.5 w600 | `sidebar ink 2` #CFD6C8 on `--ch-frame` #0A331F / `sidebar ink 2` #CFD6C8 on `--ch-frame` #08150E | 9.4 / 12.6 |  |
| `span.btn-s < card-h` | Open | 62.5×29.4 · 7 13 7 13 · r 999px | 14/15.4 w600 | `--ch-accent` #155A39 on `--ch-well-bg-flat` #F6F4EE / `--ch-gain` #7CC79B on `--ch-well-bg-flat` #141815 | 7.5 / 9.0 |  |
| `span.m.cm < hd` | Draft · 6 blocks · 3 h | 393.5×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.prose < dthread` |  | 540×99.4 · 12 14 12 14 · r 6px 18px 18px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `div.composer < dthread` |  | 596×71 · 12 20 18 20 · gap 8px |  | surface `#FBF9F4` / `#141915` |  /  |  |
| `div.pf < dpanel` |  | 451×58.4 · 12 16 12 16 · gap 8px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `button.btn-g < pf` ×2 | Edit in builder | 116.3×33.4 · 9 13 9 13 · r 9px | 14/15.4 w600 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 | 116.3×33.4 pointer (desktop, no slop needed) |
| `button.btn-p < pf` | Publish… | 85.2×33.4 · 9 13 9 13 · r 9px | 14/15.4 w600 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 85.2×33.4 pointer (desktop, no slop needed) |

## S-ASKD.steps

inline state (desktop). As S-ASK.steps, in the thread column. Not drawn: build from the rules in 05 and the components of its parent below.

## S-ASKD.intake

inline card (desktop). As S-ASK.intake, in the thread column. Not drawn: build from the rules in 05 and the components of its parent below.

## S-ASKD.pane

pane 452px. Opens beside the thread when the plan starts writing; the compact card reopens it. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-desk-pane) · capture `--id S-ASKD.pane`.

Every element is specified in an earlier section (same component, this state only changes content).

## S-ASKD.pane-v2

pane state. Send "Make it 2 hours" or tap a refine chip. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-desk-v2) · capture `--id S-ASKD.pane-v2`.

Frame 1280 × 800. 6 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `span.m < div` | Draft · 2:00 to 4:00 PM · 1 h of the practice op | 221.9×32.4 | 13.5/16.2 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `span.vl < vsw` | 2 of 2 | 32.7×13.5 | 13.5/13.5 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.msg-me < dthread` | Make it 2 hours | 134.5×40.9 · 10 14 10 14 · r 18px 18px 6px | 15.5/20.9 w400 · `body-l` | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |
| `span.t < card-h` | Changed 4 blocks | 142.8×21.3 | 17/21.3 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.m.tc < card-h` | 3 s | 18.7×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `span.changed < pn` ×4 | Changed | 70.4×18.9 · 1 7 1 7 · r 7px | 13/16.9 w600 | `--ch-gain` #14613D on `--ch-gain-tint` #E8EEE8 / `#14613D` on `#E8EEE8` | 6.3 / 6.3 |  |

## S-ASKD.publish

inline card (desktop). Publish… in the pane footer. Not drawn: build from the rules in 05 and the components of its parent below.

## S-DOC.sheet-coach

component. The printed plan body used by S-ASK.full-plan, S-ASKD.pane, Documents and the PDF. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-full) · capture `--id S-DOC.sheet-coach`.

Every element is specified in an earlier section (same component, this state only changes content).

## S-DOC.sheet-player

component. Same component with copy=player. Not drawn: build from the rules in 05 and the components of its parent below.

## S-DOC.print-coach

print page. Print or Share PDF from the coach's plan. Not drawn: build from the rules in 05 and the components of its parent below.

## S-DOC.print-player

print page. Print from S-PLY.plan. Not drawn: build from the rules in 05 and the components of its parent below.

## S-DOC.list-draft

list row. Team Hub › Documents › <folder> after Save draft. Not drawn: build from the rules in 05 and the components of its parent below.

## S-DOC.list-shared

list row. Team Hub › Documents › Practice plans after Publish. Not drawn: build from the rules in 05 and the components of its parent below.

## S-FMT.empty

screen (push). Practice › Plan format, or the format link on S-ASK.intake. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-home) · capture `--id S-FMT.empty`.

Frame 390 × 844. 16 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `button.ib < r` | More | 44×44 |  | surface `--ch-frame` #0A331F / `--ch-frame` #08150E |  /  | met |
| `button.back < pbar` | Practice | 86.4×20 · 0 8 0 0 · gap 2px | 17/17 w400 | `--ch-champagne` #D8C79B on `--ch-frame` #0A331F / `--ch-champagne` #D8C79B on `--ch-frame` #08150E | 8.3 / 11.2 | 86.4×44 via ::after |
| `div.ctr < pbar` | Plan format | 93.4×18.7 | 17/18.7 w600 · `card-title` · ellipsis | `--ch-on-frame` #F4EEDD on `--ch-frame` #0A331F / `--ch-on-frame` #F4EEDD on `--ch-frame` #08150E | 12.0 / 16.1 |  |
| `div.card.fintro < scroll` |  | 358×215.1 · r 16px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `span.t < hd` | Use the plan you already use | 284×21.3 | 17/21.3 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.m < hd` | Upload one practice plan you like. CoachHelm bui | 284×58.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `button.btn-p < fbtns` | Upload a plan | 326×41.6 · 12 16 12 16 · r 12px | 16/17.6 w600 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 326×41.6, row spacing gives 44 |
| `div.fhint < card` | A PDF, a photo of a printed sheet, or a Word or  | 358×57.8 · 6 16 14 16 | 14/18.9 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.card < scroll` |  | 358×226 · r 16px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `span.t < card-h` | It learns as you go | 140.9×21.3 | 17/21.3 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `svg < r` ×3 |  | 20×20 | icon 20 stroke | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 |  |
| `span < r` ×3 | Drills you keep, and ones you swap out | 294×21 | 15/20.3 w400 · `meta` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `div.ft < lrn` | From the 6 plans you’ve published. Nothing to se | 358×53.8 · 2 16 14 16 | 14/18.9 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.card.cur < scroll` |  | 358×47.5 · 14 16 14 16 · gap 10px · r 16px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `span < card` | Current format | 103.3×19.5 | 15/19.5 w400 · `meta` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.m < card` | GolfHelm standard | 130.4×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |

## S-FMT.upload-sheet

sheet (hug). Tap Upload a plan. Design: [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-upload) · capture `--id S-FMT.upload-sheet`.

Frame 390 × 844. 3 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `span.t < sh-h` | Upload a plan | 107.9×20.4 | 17/20.4 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `div.upopt < grp` ×3 | Choose file | 358×48 · 13 14 13 14 · gap 12px | 16/20.8 w400 · `body-l` | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `svg < upopt` ×3 |  | 22×22 | icon 22 stroke | `--ch-accent` #155A39 on `--ch-grouped-bg` #F2F0E9 / `--ch-gain` #7CC79B on `--ch-grouped-bg` #0E120F | 7.2 / 9.4 |  |

## S-FMT.reading

inline state. A file is picked; the sheet closes. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-scan) · capture `--id S-FMT.reading`.

Frame 390 × 844. 16 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `span.t < hd` | Fall practice sheet.pdf | 284×21.3 | 17/21.3 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.m < hd` | PDF · 1 page | 284×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.smpw < card` |  | 326×256 · 14 14 14 14 · r 12px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `div.smp < smpw` | Fall practice sheet, page 1 | 176×228 · 12 11 12 11 · gap 7px · r 3px |  | surface white #FFFFFF / `#FFFFFF` |  /  |  |
| `i < sh1` ×2 |  | 73.9×7 · r 2px |  | surface `#3B3934` / `#3B3934` |  /  |  |
| `i < sh2` |  | 110.9×3 · r 2px |  | surface `#C9C3B6` / `#C9C3B6` |  /  |  |
| `span < sbx` ×3 |  | 48.7×30 · r 2px |  | surface `#E2DDD2` / `#E2DDD2` |  /  |  |
| `div.stb < smp` |  | 154×113 · gap 0px · r 2px |  | surface white #FFFFFF / `#FFFFFF` |  /  |  |
| `div < stb` |  | 154×13 · 0 5 0 5 · gap 5px |  | surface `#EDE9E0` / `#EDE9E0` |  /  |  |
| `i < div` ×30 |  | 22×3 · r 2px |  | surface `#C9C3B6` / `#C9C3B6` |  /  |  |
| `span.scanl < smp` |  | 176×22 |  | surface white #FFFFFF / `#FFFFFF` |  /  |  |
| `div.l < div` | Reading Fall practice sheet.pdf | 292×20.8 | 16/20.8 w500 · `row` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.thb < pickf` |  | 34×44 · 6 5 6 5 · gap 3px · r 3px |  | surface white #FFFFFF / `#FFFFFF` |  /  |  |
| `span < pickf` | 1 page · 240 KB | 156.1×39 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-grouped-bg` #F2F0E9 / `--ch-text-secondary` #D0C9B8 on `--ch-grouped-bg` #0E120F | 8.6 / 11.4 |  |
| `b < span` | Fall practice sheet.pdf | 156.1×19.5 | 15/19.5 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `i < thb` ×5 |  | 24×2 |  | surface `#C9C3B6` / `#C9C3B6` |  /  |  |

## S-FMT.found

inline card. Reading finishes. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-found) · capture `--id S-FMT.found`.

Frame 390 × 844. 13 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `div.smp.found < smpw` | Fall practice sheet, page 1 | 176×228 · 12 11 12 11 · gap 7px · r 3px |  | surface white #FFFFFF / `#FFFFFF` |  /  |  |
| `em.tagr < sh1` | Header | 45.9×14.5 · 2 5 2 5 · r 4px | 10.5/10.5 w600 | white #FFFFFF on `--ch-accent` #155A39 / `#FFFFFF` on `#155A39` | 8.2 / 8.2 |  |
| `em.tagr < sbx` | Groups | 46.4×14.5 · 2 5 2 5 · r 4px | 10.5/10.5 w600 | white #FFFFFF on `--ch-accent` #155A39 / `#FFFFFF` on `#155A39` | 8.2 / 8.2 |  |
| `em.tagr < stb` | Schedule | 56.5×14.5 · 2 5 2 5 · r 4px | 10.5/10.5 w600 | white #FFFFFF on `--ch-accent` #155A39 / `#FFFFFF` on `#155A39` | 8.2 / 8.2 |  |
| `em.tagr < div` ×2 | Bring | 36.5×14.5 · 2 5 2 5 · r 4px | 10.5/10.5 w600 | white #FFFFFF on `--ch-accent` #155A39 / `#FFFFFF` on `#155A39` | 8.2 / 8.2 |  |
| `div.f < div` ×3 | 1 page · 5 sections | 292×20.3 | 15/20.3 w400 · `meta` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `div.card.fsum < scroll` |  | 358×471.5 · r 16px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `span.okc < fs` ×5 |  | 22×22 · r 50% |  | surface `--ch-gain-tint` #E8EEE8 / `--ch-gain-tint` #1E3326 |  /  |  |
| `b < div` ×5 | Header | 294×20.8 | 16/20.8 w500 · `row` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `svg < okc` ×5 |  | 12×12 | icon 12 stroke | `--ch-gain` #14613D on `--ch-gain-tint` #E8EEE8 / `--ch-gain` #7CC79B on `--ch-gain-tint` #1E3326 | 6.3 / 6.7 |  |
| `span < div` ×5 | Team, date, time and place | 176.2×18 | 14.5/19.6 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `button.btn-g < acts` | Try another | 109.3×36.5 · 10 14 10 14 · r 12px | 15/16.5 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 | 109.3×36.5, row spacing gives 44 |
| `button.btn-p < acts` | Use this format | 208.7×36.5 · 10 14 10 14 · r 12px | 15/16.5 w600 · `meta strong` | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 208.7×36.5, row spacing gives 44 |

## S-FMT.set

inline receipt. Press Use this format. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-set) · capture `--id S-FMT.set`.

Frame 390 × 844. 8 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `span.t < div` | Your format is set | 265.8×21.3 | 17/21.3 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.okb < rcpt-h` |  | 28×28 · r 50% |  | surface `--ch-accent` #155A39 / `--ch-gain` #7CC79B |  /  |  |
| `svg < okb` |  | 14×14 | icon 14 stroke | `--ch-card-bg` #FFFEFB on `--ch-accent` #155A39 / `--ch-card-bg` #191E1A on `--ch-gain` #7CC79B | 8.2 / 8.4 |  |
| `span < div` | Plans from Ask and the builder now use it. | 265.8×18.2 | 14/18.2 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `a < rlinks` | See Thursday in it | 125.1×15 | 15/15 w600 · `meta strong` | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 | 125.1×35 via ::after |
| `button.undo < rlinks` | Undo | 62×18 · gap 6px | 15/15 w600 · `meta strong` | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 | 62×38 via ::after |
| `svg < undo` |  | 18×18 | icon 18 stroke | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 |  |
| `b < m` | Fall practice sheet | 128×19 | 15/19.5 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |

## S-FMT.see

push. Press See Thursday in it. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-see) · capture `--id S-FMT.see`.

Frame 390 × 844. 3 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `button.back < pbar` | Format | 78.8×20 · 0 8 0 0 · gap 2px | 17/17 w400 | `--ch-champagne` #D8C79B on `--ch-frame` #0A331F / `--ch-champagne` #D8C79B on `--ch-frame` #08150E | 8.3 / 11.2 | 78.8×44 via ::after |
| `button.btn-g < dock` | Share PDF | 174×41.6 · 12 16 12 16 · r 12px | 16/17.6 w600 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 | 174×41.6, row spacing gives 44 |
| `button.btn-p < dock` | Print | 174×41.6 · 12 16 12 16 · r 12px | 16/17.6 w600 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 174×41.6, row spacing gives 44 |

## S-FMT.undone

inline state. Undo inside 8s on S-FMT.set. Not drawn: build from the rules in 05 and the components of its parent below.

## S-BLD.helper

inline card. Practice › New plan › Builder, empty Blocks step. Design: [empty](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bld-empty) · capture `--id S-BLD.helper`.

Frame 390 × 844. 17 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `div.sheet < ph` |  | 390×746 · r 16px 16px 0px 0px |  | surface `--ch-grouped-bg` #F2F0E9 / `--ch-grouped-bg` #0E120F |  /  |  |
| `button < seg` ×4 | Blocks | 88.5×32 · 7 4 7 4 · r 8px | 15/18 w600 · `meta strong` | `--ch-seg-on-ink` #F6F1E4 on `--ch-seg-well` #E7E2D6 / `--ch-seg-on-ink` #F6F1E4 on `--ch-well-bg-flat` #141815 | 5.7 on chip / 5.4 on chip | 88.5×44 via ::after |
| `div.ribbon < scroll` |  | 358×38.2 · 10 16 10 16 · gap 8px · r 12px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `span < ribbon` | planned | 103×18.2 | 14/18.2 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `b.rb < span` | 0 of 3 h | 47.7×18 | 14/18.2 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.ro < ribbon` | 3 h open | 55×18.2 | 14/18.2 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.feat < helper` |  | 358×317.6 · 16 16 16 16 · r 16px |  | surface `--ch-feature-bg` #0B3A25 / `--ch-feature-bg` #123D29 |  /  |  |
| `div.t < feat` | Start Thursday from your team’s data | 326×21.3 | 17/21.3 w600 · `card-title` | `--ch-feature-ink` #F4F1E8 on `--ch-feature-bg` #0B3A25 / `--ch-feature-ink` #F4F1E8 on `--ch-feature-bg` #123D29 | 11.3 / 10.8 |  |
| `div.m < feat` | CoachHelm read the calendar, the last 10 rounds  | 326×42 | 15/21 w400 · `meta` | `--ch-feature-ink-2` #D3D9CB on `--ch-feature-bg` #0B3A25 / `--ch-feature-ink-2` #D3D9CB on `--ch-feature-bg` #123D29 | 8.8 / 8.4 |  |
| `li < ul` ×3 | loses , the most of any part of the game | 326×57.5 · 8 0 8 0 | 15/20.3 w400 · `meta` | `--ch-feature-ink-2` #D3D9CB on `--ch-feature-bg` #0B3A25 / `--ch-feature-ink-2` #D3D9CB on `--ch-feature-bg` #123D29 | 8.8 / 8.4 |  |
| `b < li` ×4 | Putting | 53.3×19 | 15/20.3 w600 · `meta strong` | `--ch-feature-ink` #F4F1E8 on `--ch-feature-bg` #0B3A25 / `--ch-feature-ink` #F4F1E8 on `--ch-feature-bg` #123D29 | 11.3 / 10.8 |  |
| `button.btn-p < feat` | Fill the draft | 326×41.6 · 12 16 12 16 · r 12px | 16/17.6 w600 | `--ch-feature-bg` #0B3A25 on `--ch-feature-ink` #F4F1E8 / `--ch-feature-bg` #123D29 on `--ch-feature-ink` #F4F1E8 | 11.3 / 10.8 | 326×41.6, row spacing gives 44 |
| `div < feat` | Or tell it what you want | 326×16.8 | 14/16.8 w500 | `--ch-feature-ink-2` #D3D9CB on `--ch-feature-bg` #0B3A25 / `--ch-feature-ink-2` #D3D9CB on `--ch-feature-bg` #123D29 | 8.8 / 8.4 |  |
| `div.empty.eb < scroll` | Add one, start from a template, or let CoachHelm | 358×140.8 · 16 16 16 16 · gap 10px · r 16px | 15/21 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `b < empty` | No blocks yet | 326×23.8 | 17/23.8 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.addrow < empty` | + Add block | 326×23 · 4 0 4 0 · gap 8px | 15/15 w600 · `meta strong` | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 |  |
| `div.psheet < ph` | Sheet | 390×61 · r 20px 20px 0px 0px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |

## S-BLD.new-sheet

sheet (hug). Practice › New plan; Start from Ask CoachHelm. Design: [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bld-new) · capture `--id S-BLD.new-sheet`.

Frame 390 × 844. 9 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `div.scrimx.on < ph` |  | 390×844 |  | surface `#0B281A` / `#040B07` |  /  |  |
| `span.t < sh-h` | New plan | 73.6×20.4 | 17/20.4 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `div < sh-b` ×3 | Which practice | 358×16.9 · 0 2 0 2 | 13/16.9 w600 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `span.n < opt` ×6 | Thursday, Nov 5 | 298×20.8 | 16/20.8 w500 · `row` | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `span.rd < opt` ×6 |  | 22×22 · r 50% |  | surface `--ch-accent` #155A39 / `--ch-gain` #7CC79B |  /  |  |
| `svg < rd` ×2 |  | 12×12 | icon 12 stroke | `--ch-card-bg` #FFFEFB on `--ch-accent` #155A39 / `--ch-card-bg` #191E1A on `--ch-gain` #7CC79B | 8.2 / 8.4 |  |
| `span.d < opt` ×6 | 2:00 to 5:00 PM · Lakeside · no plan yet | 298×18.9 | 14/18.9 w400 | `--ch-text-secondary` #46433D on `--ch-grouped-bg` #F2F0E9 / `--ch-text-secondary` #D0C9B8 on `--ch-grouped-bg` #0E120F | 8.6 / 11.4 |  |
| `div.card.intake < sh-b` |  | 358×397.3 · 14 0 4 0 · r 16px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `button.btn-p < sh-b` | Build the plan | 358×41.6 · 12 16 12 16 · r 12px | 16/17.6 w600 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 358×41.6, row spacing gives 44 |

## S-BLD.ghosts

inline state. Press Fill the draft on S-BLD.helper. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bld-ghost) · capture `--id S-BLD.ghosts`.

Frame 390 × 844. 16 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `div.foldrow < helper` |  | 358×63 · 12 16 12 16 · gap 10px · r 14px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `span.sp < foldrow` | · building 6 suggestions | 206.3×39 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `b < sp` | CoachHelm | 83.3×19 | 15/19.5 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `button.btn-p < foldrow` | Keep all | 75.7×29.4 · 7 12 7 12 · r 9px | 14/15.4 w600 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 75.7×44 via ::after |
| `span.mk < foldrow` |  | 24×24 · r 7px |  | surface `--ch-accent` #155A39 / `--ch-btn-primary-bg` #1F6B45 |  /  |  |
| `div.gb < gbs` ×2 |  | 358×145.5 · 12 16 12 16 · gap 6px · r 14px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `span.bt < top` ×2 | Warm-up | 220.9×20.8 | 16/20.8 w500 · `row` | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `span.tm < top` ×2 | 2:00 | 44×18 | 15/18 w600 · `meta strong` · tabular | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `span.mn < top` ×2 | 30 min | 45.1×14 | 14/14 w400 | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |
| `span.sug < gb` ×2 | Suggested | 326×16.9 | 13/16.9 w600 | `--ch-accent` #155A39 on `--ch-well-bg-flat` #F6F4EE / `--ch-gain` #7CC79B on `--ch-well-bg-flat` #141815 | 7.5 / 9.0 |  |
| `div.gw < gb` ×2 | Runs to 2:30 so Ava and Jade, in class until 2:1 | 326×37.8 | 14/18.9 w400 | `--ch-text-secondary` #46433D on `--ch-well-bg-flat` #F6F4EE / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 9.0 / 10.9 |  |
| `button.keep < ga` ×2 | Keep | 57.9×28 · 7 12 7 12 · r 9px | 14/14 w600 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 57.9×44 via ::after |
| `button.swap < ga` ×2 | Swap | 60.3×28 · 7 12 7 12 · r 9px | 14/14 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 | 60.3×44 via ::after |
| `button.rm < ga` ×2 | Remove | 77.5×28 · 7 12 7 12 · r 9px | 14/14 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 | 77.5×44 via ::after |
| `b < gw` | Because | 55.9×18 | 14/18.9 w600 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 |  |
| `span.neg < gw` | 0.9 strokes a round | 289.4×36.9 | 14/18.9 w600 | `--ch-loss` #9A5700 on `--ch-well-bg-flat` #F6F4EE / `--ch-loss` #E7AE57 on `--ch-well-bg-flat` #141815 | 5.1 / 9.0 |  |

## S-BLD.kept

inline state. Press Keep or Keep all. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bld-kept) · capture `--id S-BLD.kept`.

Frame 390 × 844. 5 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `b.rb < span` | 3 h of 3 h | 57.6×18 | 14/18.2 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.ro < ribbon` | On time | 51.6×18.2 | 14/18.2 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `button.btn-g < foldrow` | Undo | 59.5×29.4 · 7 12 7 12 · r 9px | 14/15.4 w600 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 | 59.5×44 via ::after |
| `span.sp < foldrow` | · 6 suggestions kept | 222.5×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.gb.kept < gbs` ×6 |  | 358×88.6 · 12 16 12 16 · gap 6px · r 14px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |

## S-BLDD.board

screen (desktop). Mac: Practice › New plan. Design: [ghosts](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bldd-ghost) · capture `--id S-BLDD.board`.

Frame 1148 × 717.5. 41 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `div.bhead < dmain` |  | 939.9×57.4 · 0 18 0 18 · gap 14px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `button.btn-g < bhead` | Preview | 68.6×29.9 · 9 12 9 12 · r 9px | 14/15.4 w600 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 | 68.6×29.9 pointer (desktop, no slop needed) |
| `button.btn-p < bhead` | Publish | 69.1×29.9 · 9 14 9 14 · r 9px | 14/15.4 w600 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 69.1×29.9 pointer (desktop, no slop needed) |
| `span < bhead` | ‹ Practice | 52.6×26.9 | 15/15 w500 | `--ch-accent` #155A39 on `--ch-card-bg` #FFFEFB / `--ch-gain` #7CC79B on `--ch-card-bg` #191E1A | 8.2 / 8.4 |  |
| `span.steps < bhead` |  | 247.9×26.9 · 2 2 2 2 · gap 2px · r 10px |  | surface `--ch-seg-well` #E7E2D6 / `--ch-well-bg-flat` #141815 |  /  |  |
| `span.on < steps` | Blocks | 60.3×23.3 · 6 12 6 12 · r 8px | 14/14 w600 | `--ch-seg-on-ink` #F6F1E4 on `--seg-on-bot` #145635 / `--ch-seg-on-ink` #F6F1E4 on `--seg-on-bot` #1D613F | 7.7 / 6.6 |  |
| `span < steps` ×3 | Groups | 64.6×23.3 · 6 12 6 12 · r 8px | 14/14 w500 | `--ch-text-secondary` #46433D on `--ch-seg-well` #E7E2D6 / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 7.6 / 10.9 |  |
| `span < rib` | planned · | 159.5×15.7 | 13.5/17.6 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `span.ro < span` | 3 h open | 47.5×14.3 | 13.5/17.6 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `span.m < div` | Thu, Nov 5 · 2:00 to 5:00 PM · Lakeside Golf Clu | 234.6×29 | 13.5/16.2 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.mix < rib` |  | 159.5×5.4 · gap 2px · r 3px |  | surface `--ch-cp-track (new)` #EBE5D8 / `--ch-cp-track (new)` #2C322D |  /  |  |
| `div.lib < bbody` |  | 233.2×652.9 · 14 14 14 14 · gap 10px |  | surface `--ch-grouped-bg` #F2F0E9 / `--ch-grouped-bg` #0E120F |  /  |  |
| `div.insp < bbody` |  | 304.9×652.9 |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `div.itabs < insp` |  | 278.9×28.7 · 2 2 2 2 · gap 2px · r 10px |  | surface `--ch-seg-well` #E7E2D6 / `--ch-well-bg-flat` #141815 |  /  |  |
| `span < itabs` | Inspector | 136.8×25.1 · 7 7 7 7 · r 8px | 14/14 w500 | `--ch-text-secondary` #46433D on `--ch-seg-well` #E7E2D6 / `--ch-text-secondary` #D0C9B8 on `--ch-well-bg-flat` #141815 | 7.6 / 10.9 |  |
| `span.on < itabs` | CoachHelm | 136.8×25.1 · 7 7 7 7 · r 8px | 14/14 w600 | `--ch-seg-on-ink` #F6F1E4 on `--seg-on-bot` #145635 / `--ch-seg-on-ink` #F6F1E4 on `--seg-on-bot` #1D613F | 7.7 / 6.6 |  |
| `span.on < tabs` | Drills | 30.3×18.8 · 0 0 7 0 | 14/14 w600 | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `span < tabs` ×2 | Groups | 43.5×18.8 | 14/14 w600 | `--ch-text-secondary` #46433D on `--ch-grouped-bg` #F2F0E9 / `--ch-text-secondary` #D0C9B8 on `--ch-grouped-bg` #0E120F | 8.6 / 11.4 |  |
| `div.keepall < bslot` |  | 362.3×66.9 · 10 12 10 12 · gap 10px · r 12px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `b < span` | 6 suggestions | 83.8×16.1 | 14/18.2 w700 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `button.btn-g.ka2 < keepall` | Remove all | 67.8×39.2 · 7 12 7 12 · r 9px | 13.5/14.8 w600 | `--ch-text-primary` #1C1B18 on `--ch-well-bg-flat` #F6F4EE / `--ch-text-primary` #F1ECDF on `--ch-well-bg-flat` #141815 | 15.7 / 15.2 | 67.8×39.2 pointer (desktop, no slop needed) |
| `button.btn-p.ka < keepall` | Keep all | 50.9×39.2 · 7 12 7 12 · r 9px | 13.5/14.8 w600 | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 | 50.9×39.2 pointer (desktop, no slop needed) |
| `span < keepall` ×2 |  | 12.6×19.7 · r 6px |  | surface `--ch-accent` #155A39 / `--ch-btn-primary-bg` #1F6B45 |  /  |  |
| `svg < span` |  | 12.6×12.6 | icon 12.6 stroke | `--ch-seg-on-ink` #F6F1E4 on `--ch-accent` #155A39 / `--ch-seg-on-ink` #F6F1E4 on `--ch-btn-primary-bg` #1F6B45 | 7.3 / 5.7 |  |
| `div.search < lib` | Search drills | 207.2×33.8 · 8 10 8 10 · r 9px | 14/21.7 w400 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.feat < ib` |  | 278.9×223.2 · 16 16 16 16 · r 16px |  | surface `--ch-feature-bg` #0B3A25 / `--ch-feature-bg` #123D29 |  /  |  |
| `div.t < feat` | For Thursday | 250.2×19.1 | 17/21.3 w600 · `card-title` | `--ch-feature-ink` #F4F1E8 on `--ch-feature-bg` #0B3A25 / `--ch-feature-ink` #F4F1E8 on `--ch-feature-bg` #123D29 | 11.3 / 10.8 |  |
| `div.gb < bslot` ×2 |  | 362.3×130.5 · 12 16 12 16 · gap 6px · r 14px |  | surface `--ch-well-bg-flat` #F6F4EE / `--ch-well-bg-flat` #141815 |  /  |  |
| `a.on < dside` | Practice | 186.6×29.9 · 8 10 8 10 · gap 10px · r 9px | 14.5/17.4 w500 | `--ch-on-frame` #F4EEDD on `#264936` / `--ch-on-frame` #F4EEDD on `#202B23` | 8.6 / 12.7 | 186.6×29.9 pointer (desktop, no slop needed) |
| `span.on < chips` | Putting | 56×20.2 · 5 9 5 9 · r 7px | 12.5/12.5 w600 | `--ch-gain` #14613D on `--ch-gain-tint` #E8EEE8 / `--ch-gain` #7CC79B on `--ch-gain-tint` #1E3326 | 6.3 / 6.7 |  |
| `span < chips` ×3 | Short game | 78.2×20.2 · 5 9 5 9 · r 7px | 12.5/12.5 w600 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.dr < lib` ×4 |  | 207.2×52 · 10 12 10 12 · gap 3px · r 12px |  | surface `--ch-card-bg` #FFFEFB / `--ch-card-bg` #191E1A |  /  |  |
| `b < dr` ×4 | Clock drill, 3 to 5 ft | 185.7×16.3 | 14.5/18.1 w500 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span < dr` ×4 | Putting · Skill · 20 min · Your bank | 185.7×15.1 | 13/16.9 w400 · `caption` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `button.btn-p < feat` | Fill this plan | 250.2×37.3 · 12 16 12 16 · r 12px | 16/17.6 w600 | `--ch-feature-bg` #0B3A25 on `--ch-feature-ink` #F4F1E8 / `--ch-feature-bg` #123D29 on `--ch-feature-ink` #F4F1E8 | 11.3 / 10.8 | 250.2×37.3 pointer (desktop, no slop needed) |
| `div < ib` | Or add one block | 278.9×15.1 | 13/16.9 w600 | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.sugg < ib` ×3 |  | 278.9×59.7 · 10 12 10 12 · gap 4px · r 12px |  | surface `--ch-grouped-bg` #F2F0E9 / `--ch-grouped-bg` #0E120F |  /  |  |
| `button.btn-s < r` ×3 | Add | 40.7×21.8 · 5 10 5 10 · r 999px | 13/14.3 w600 | `--ch-accent` #155A39 on `--ch-well-bg-flat` #F6F4EE / `--ch-gain` #7CC79B on `--ch-well-bg-flat` #141815 | 7.5 / 9.0 | 48.7×41.8 via ::after |
| `b < r` ×3 | Putting rotation | 96.3×16.9 | 14.5/18.9 w500 | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `span < sugg` ×3 | 60 min · 3 stations · Putting loses 0.9 a round | 257.4×16.3 | 13.5/18.2 w400 | `--ch-text-secondary` #46433D on `--ch-grouped-bg` #F2F0E9 / `--ch-text-secondary` #D0C9B8 on `--ch-grouped-bg` #0E120F | 8.6 / 11.4 |  |
| `div.addrow < lib` | + New drill | 207.2×20.6 · 4 0 4 0 · gap 8px | 15/15 w600 · `meta strong` | `--ch-accent` #155A39 on `--ch-grouped-bg` #F2F0E9 / `--ch-gain` #7CC79B on `--ch-grouped-bg` #0E120F | 7.2 / 9.4 |  |

## S-BLDD.inspector

panel. The CoachHelm tab of the builder inspector. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bldd-ghost) · capture `--id S-BLDD.inspector`.

Every element is specified in an earlier section (same component, this state only changes content).

## S-PLY.notify

push banner + bell row. After Publish and the 8s Undo window. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ply-banner) · capture `--id S-PLY.notify`.

Frame 390 × 844. 27 new elements, top to bottom.

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `div.lock < ph` |  | 390×844 · 96 0 0 0 |  | surface `#0D1611` / `#0D1611` |  /  |  |
| `span < status` | 2:41 | 26.6×15 | 15/15 w600 · `meta strong` | `--ch-on-frame` #F4EEDD on `--ch-frame` #0A331F / `--ch-on-frame` #F4EEDD on `--ch-frame` #08150E | 12.0 / 16.1 |  |
| `button.ttl < pbar` | Practice | 106.5×18 · gap 6px | 18/18 w600 · `bar title` | `--ch-on-frame` #F4EEDD on `--ch-frame` #0A331F / `--ch-on-frame` #F4EEDD on `--ch-frame` #08150E | 12.0 / 16.1 | 106.5×44 via ::after |
| `div.dt < lock` | Wednesday, November 4 | 209.1×18 | 18/18 w500 | `--ch-on-frame` #F4EEDD on `#0D1611` / `--ch-on-frame` #F4EEDD on `#0D1611` | 15.9 / 15.9 |  |
| `div.lt < scroll` | Practice | 358×37.4 | 34/37.4 w600 · `large-title` · -1.156px | `--ch-text-primary` #1C1B18 on `--ch-grouped-bg` #F2F0E9 / `--ch-text-primary` #F1ECDF on `--ch-grouped-bg` #0E120F | 15.1 / 16.0 |  |
| `div.tm < lock` | 9:14 | 120.4×82 | 82/82 w600 · -2.46px | `--ch-on-frame` #F4EEDD on `#0D1611` / `--ch-on-frame` #F4EEDD on `#0D1611` | 15.9 / 15.9 |  |
| `div.ctx < scroll` | Thursday · Group B | 358×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-grouped-bg` #F2F0E9 / `--ch-text-secondary` #D0C9B8 on `--ch-grouped-bg` #0E120F | 8.6 / 11.4 |  |
| `span.m < hd` | 2:00 to 5:00 PM · Lakeside Golf Club | 246.4×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `div.banner < ph` |  | 370×99.5 · 12 14 12 14 · gap 10px · r 22px |  | surface `#CBCFC4` / `#CAC9C1` |  /  |  |
| `div.hair < card` ×2 |  | 342×1 |  | surface `#E8E7E4` / `#2F332E` |  /  |  |
| `div < card` | Putts inside 6 feet and speed from long range. F | 358×68.8 · 12 16 12 16 | 16/22.4 w500 · `row` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.app < banner` |  | 38×38 · r 10px |  | surface `--ch-frame` #0A331F / `#0A331F` |  /  |  |
| `div.top < div` | GolfHelm | 294×16.8 | 14/16.8 w600 | `--ch-text-primary` #1C1B18 on `#CBCFC4` / `#1C1B18` on `#CAC9C1` | 10.8 / 10.4 |  |
| `span < top` | now | 27.2×16.8 | 14/16.8 w400 | `--ch-text-secondary` #46433D on `#CBCFC4` / `#46433D` on `#CAC9C1` | 6.2 / 6.0 |  |
| `div.b < div` | 2:00 PM · You start on the putting green with Gr | 294×58.7 | 14.5/19.6 w400 | `--ch-text-primary` #1C1B18 on `#CBCFC4` / `#1C1B18` on `#CAC9C1` | 10.8 / 10.4 |  |
| `b < b` | Practice plan for Thursday | 294×19.6 | 14.5/19.6 w600 | `--ch-text-primary` #1C1B18 on `#CBCFC4` / `#1C1B18` on `#CAC9C1` | 10.8 / 10.4 |  |
| `span.av < avs` ×3 | EB | 26×26 · r 50% | 10/10 w700 | white #FFFFFF on `--ch-cp-pressure (new)` #1F6B45 / `#FFFFFF` on `--ch-btn-primary-bg` #1F6B45 | 6.5 / 6.5 |  |
| `span < div` | · with Eli and Owen | 186.7×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `b < span` | Group B | 57.1×19 | 15/19.5 w600 · `meta strong` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `button < seg` ×2 | Your practice | 177×32 · 7 4 7 4 · r 8px | 15/18 w600 · `meta strong` | `--ch-seg-on-ink` #F6F1E4 on `--ch-seg-well` #E7E2D6 / `--ch-seg-on-ink` #F6F1E4 on `--ch-well-bg-flat` #141815 | 5.7 on chip / 5.4 on chip | 177×44 via ::after |
| `span.tm < stop` ×8 | 2:00 | 52×19.5 | 15/19.5 w600 · `meta strong` · tabular | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `div.pl < div` ×8 | Range | 254×20.8 | 16/20.8 w600 | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `div.dr < div` ×8 | Warm-up · everyone | 254×20.3 | 15/20.3 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |
| `span.now < stop` | Now | 41.4×20.9 · 2 7 2 7 · r 7px | 13/16.9 w600 | `--ch-gain` #14613D on `--ch-gain-tint` #E8EEE8 / `--ch-gain` #7CC79B on `--ch-gain-tint` #1E3326 | 6.3 / 6.7 |  |
| `span.nx < stop` | Next | 43.2×20.9 · 2 7 2 7 · r 7px | 13/16.9 w600 | `--ch-text-secondary` #46433D on `--ch-flat-tint` #EFEDE7 / `--ch-text-secondary` #D0C9B8 on `--ch-flat-tint` #232825 | 8.4 / 9.1 |  |
| `span.t < card-h` | In Documents | 111.4×21.3 | 17/21.3 w600 · `card-title` | `--ch-text-primary` #1C1B18 on `--ch-card-bg` #FFFEFB / `--ch-text-primary` #F1ECDF on `--ch-card-bg` #191E1A | 17.1 / 14.3 |  |
| `span.m < card-h` | Team Hub › Practice plans | 177.9×19.5 | 15/19.5 w400 · `meta` | `--ch-text-secondary` #46433D on `--ch-card-bg` #FFFEFB / `--ch-text-secondary` #D0C9B8 on `--ch-card-bg` #191E1A | 9.8 / 10.2 |  |

## S-PLY.practice

screen. Tap the banner or the bell row; or Practice tab. Design: [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ply-practice) · capture `--id S-PLY.practice`.

Every element is specified in an earlier section (same component, this state only changes content).

## S-PLY.plan

push. Tap Open the plan on S-PLY.practice. Not drawn: build from the rules in 05 and the components of its parent below.

## S-PLY.docs

list row. Team Hub › Documents › Practice plans. Not drawn: build from the rules in 05 and the components of its parent below.

## Fixes and notes from this pass

Fixed on the design page in this pass (the screenshots in `screenshots/design/` show the fixed page):

- The phone frame drew at 379 × 786. It now draws at 390 × 844, so every phone number in this file is true to an iPhone 16 at 1x.
- Touch areas: 23 phone controls were under 44pt (segmented halves 32 tall, sheet Cancel and Done 32, stepper 34 × 30, version arrows 26, Back 20 tall, bar title 18 tall, Send 40, ghost block buttons 28, Keep all and Undo 29). Each now has a 44pt invisible `::after`. Nothing drawn changed.
- Builder ghost blocks, the ribbon and the Keep all row padded 14 at the sides. They now pad 16 like every other card row (DESIGN_LANGUAGE: rows inside a card pad 16).
- Putting bands and the "made" figures now use the app's bands and baseline (03 §3): 3 to 5 ft 78% against 90.5%, 5 to 10 ft 55% against 62.2%, 10 to 15 ft 31% against 35.7%, 15 to 25 ft 13% against 15.4%. Strokes gained reads "against the scoring baseline", never "the Tour line".
- Reduce Motion crossfades now run 180ms, the app's `CH_FADE_MS`, instead of 120ms.
- Group C and the random drill kind were ochre. In dark mode that read as the loss amber, so both are now plum: light #654A7E (white letter 7.4:1, tint #ECE7F1), dark #B49ACB (letter #0E120F 7.6:1, tint #2B2433). The random strip mark is 5.1:1 on its track in light and 5.3:1 in dark.
- Segmented controls now slide their chip when tapped (M-ASK-31). The page only draws the motion; the content under them does not change.
- Save draft… in the Mac pane footer now shows the toast (S-ASK.toast), and a second tap replaces the toast instead of stacking another.

Build notes (nothing to change on the page):

- Contrast: every text pair is at least 4.9:1 in both themes (full table in `04-FIDELITY-SPEC.md` §3). The script flags the selected segmented label at 1.1:1 because the chip is a sibling element; on the chip it reads 5.7 to 7.7 light. Build the segmented control from today's `.ch-seg` (9.6:1), not from the page's dark chip shade.
- The Ask composer keeps today's 12pt side padding. It is the existing component, not new UI in this lane.
- Mac pointer controls (pane footer, builder head, Keep all strip) are 30 to 39 tall. That is fine for a pointer; they still take keyboard focus with a visible ring (SHARED-4).
- Group disc colours are identity colours for Groups A, B and C, not status. White on each passes in light (A 6.5, B 7.2, C 7.4). Amber stays for losses only; Groups and kinds share green, blue and plum and never mean status.
- The push to the full plan now moves the page behind 24% and dims it to brightness(0.9), the shared `CH_UNDERLAY_SHIFT`, instead of 30% and 0.9 opacity.

## Completeness pass, 4 Nov 2026

Specs for the S-PRC.* screens (05's section of this name): N-00's screens restyled to DESIGN_LANGUAGE. The page does not draw them, so values are the package tokens, with contrast computed by the WCAG formula on the hex (light / dark). Same columns as above; "Text" carries the data source in brackets. Frame 390 × 844 phone, 1280 desktop. Type sizes scale by `--ch-type-scale`.

### New tokens: Groups D to F (02 §C.7)

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| `--gD` disc | D | 24×24 · r 12 | 13/13 w700 | white on #435466 / #0E120F on #9FB0C2 | 7.78 / 8.51 | |
| `--gD` tint (column, grid cell) | names | cell | 14/18 w500 | `--ch-text-primary` #1C1B18 on #E8ECF0 / #F1ECDF on #1F252B | 14.51 / 13.11 | |
| `--gE`, `--gF` disc | E, F | 24×24 · r 12 | 13/13 w700 | white on #5F5C55 / #0E120F on #ADA697 | 6.67 / 7.8 | |
| `--gE`, `--gF` tint | names | cell | 14/18 w500 | #1C1B18 on #EFEDE7 / #F1ECDF on #24261F | 14.71 / 12.98 | |
| `--gD` as a mark on card | | 3pt bar or dot | | #435466 on #FFFEFB / #9FB0C2 on #191E1A | 7.72 / 7.62 | |

E and F share a colour, so the letter is always drawn; no group is told apart by colour alone. A to C stay as above (A #1F6B45 / #4FA877, B #2F5B7E / #6E9BC0, C #654A7E / #B49ACB).

### Shared restyle parts

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| Page | | 390 wide, edge 16 (20 at 414 and up) | | `--ch-grouped-bg` #F2F0E9 / #0E120F | | |
| Large title under the bar | Practice, Drills, Groups, Templates, the plan title | 358 × 41 · margin 8 0 12 | 34/41 w700 ×k | `--ch-text-primary` on page #F2F0E9 / #0E120F | 15.1 / 16.01 | |
| Segmented links | Plans · Drills · Groups · Templates | 358 × 32 in a 44 hit · r 9 | 15/18 w600 | as today's `.ch-seg` (06 build note) | 9.6 | 44 tall via ::after |
| Card | | 358 wide · r 16 · padding 16 | | `--ch-card-bg` #FFFEFB / #191E1A, `--ch-card-ring`, DL card shadow | | |
| Row in a card | plan row, drill row, template row | min 56 · padding 12 16 | title 17/22 w600; line 15/20 w400 | title `--ch-text-primary` 17.08 / 14.34; line `--ch-text-secondary` 9.77 / 10.25 on card | as listed | whole row, 56 |
| State chip | Draft, Published, Updated, Done, No plan | h 22 · padding 0 8 · r 11 | 13/13 w600 | well #F6F4EE / #141815 with `--ch-text-secondary` (8.96 / 10.87); Published uses `--ch-accent` text #155A39 / #7CC79B on well (7.48 / 8.96) | as listed | |
| "Edits not published" | Edits not published | inline, 6pt dot before | 13/17 w500 | `--ch-text-secondary` with an accent dot | 9.77 / 10.25 | |
| Selected or current row | the lit stop, the chosen tile | fill and a 2pt ring, no stripe | | fill #E8EEE8 (accent at 10% on card) / #253229 (mint at 12%), ring `--ch-accent` #155A39 / #7CC79B | ink 14.62 / 11.36; ring 8.15 / 8.45 | |
| Primary button | New plan, Publish, Create plan | h 44 · r 12 · padding 0 16 | 16/16 w600 | `--ch-text-on-accent` #FDFCF8 on `--ch-accent` #155A39 / #F4EEDD on #1F6B45 | 8.01 / 5.58 | 44 |
| Secondary button | Templates, Print, Edit | h 44 · r 12 | 16/16 w600 | `--ch-accent-text` #155A39 / #7CC79B on well | 7.48 / 8.96 | 44 |
| Failure or overrun line | CH-17106, CH-17001 | inline | 13/17 w500 | `--ch-loss` #9A5700 / #E7AE57 on card | 5.57 / 8.53 | |
| Skeleton bar | | as the row it stands for · r 6 | | `--ch-skel-base` | marks only | |
| Toast with Undo | "Deleted Short game rotation", "Published · Told after 8s" | 358 × 52 · r 14 · bottom 16 above the tab bar | 15/20 w500; Undo 15 w600 | `--ch-card-bg` with the pop shadow, text `--ch-text-primary` 17.08 / 14.34; Undo `--ch-accent-text` 8.15 / 8.45; ring 22 | as listed | Undo 44 |
| Sheet | New plan, block, publish | top radius 20, grabber 36×5 | title 17/20.4 w600 | `--ch-card-bg`; scrim as S-BLD.new-sheet | 17.1 / 14.3 | Cancel and Done 44 |

### S-PRC.home, S-PRC.week, S-PRC.past

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| Week tile | Thu 29 · 2:00 PM · chip [`golf_events` practice, team zone] | 96 × 92 phone (scroll, snap), 7 across desktop · r 14 | day 13/16 w600; time 15/18 w500 | card; today's tile has the selected fill and ring | 17.08 / 14.34 | 92 |
| Tile with no practice | No practice | same | 13/16 w500 | `--ch-text-tertiary` on card | 6.61 / 6.99 | none |
| Team time line | Team time this week: 14 h 30 scheduled [event lengths] | 358 × 18 · margin-top 8 | 13/18 w400 | `--ch-text-secondary` on page | 8.64 / 11.45 | |
| Up next card | the schedule cut of `PracticePlanSheet` [plan body] | card | sheet type | sheet tokens | per S-DOC.sheet-coach | Open plan, Edit 44 |
| Past plans toggle | Past plans (12) | row 44 | 15/20 w600 | `--ch-accent-text` on card | 8.15 / 8.45 | 44 |
| First-run card | Plan your first practice · Blank · From a template · Ask CoachHelm | card, three 56 rows | 17/22 w600; rows 15/20 | as Row in a card | 17.08 / 14.34 | 56 each |

### S-PRC.bld-* (builder, phone; desktop panes map to S-BLDD.*)

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| Step bar | Blocks · Groups · Drills · Review | as S-BLD.helper's segmented | as there | as there | 5.7 / 5.4 on chip | 44 |
| Ribbon | 2 h 45 of 3 h · 15 min open [body minutes / event length] | as S-BLD.helper's ribbon | 14/18.2 | as there | 9.8 / 10.2 | |
| Ribbon, over | 15 min past the end of practice (5:00 PM) | same | 14/18.2 w600 | `--ch-loss` on card | 5.57 / 8.53 | |
| Block card | 2:15 to 3:15 · Short game rotation · 60 min · 3 stations · 3 groups · 20 min turns [body] | card · r 16 · padding 14 16 · gap 8 between cards | time 13/16 w600 secondary; name 17/22 w600; line 15/20 | one card style (no kind tint fill, no left edge); kind glyph 20 in a 32 well tile `--ch-text-secondary` | 17.08 / 14.34; glyph 8.96 / 10.87 | whole card 44+ |
| Add block row | + Add block | 358 × 24 drawn, 44 hit | 15/15 w600 | `--ch-accent-text` on page | 7.21 / 9.44 (on #F2F0E9 / #0E120F) | 44 |
| Lifted card (reorder) | | scale 1.02, pop shadow | | card | | |
| Grip (desktop) | | 24 × 24 inside the card, left | | `--ch-text-tertiary` 6.61 / 6.99 | marks 3:1 met | 44 |
| Length stepper | − 5 min + | 120 × 36, buttons 36 with 44 pads | 15/15 w600 | well, `--ch-text-primary` 15.66 / 15.20 | as listed | 44 each |
| Rotation grid cell | group chip with disc | cell min 56 × 44 · r 10 | 14/18 w500 | group tint and disc (above) | 14.2 to 14.7 / 11.4 to 13.1 | 44 |
| Open cell | Open | same | 14/18 w500 | well, `--ch-text-tertiary` | 6.06 / 7.41 | |
| Save status | Saving… · Saved · Offline · changes kept on this device · Couldn't save | header trailing, one line | 13/16 w500 | secondary on page; Couldn't save in `--ch-loss` | 8.64 / 11.45; 4.93 / 9.52 | Try again 44 |
| Stale dialog | CH-17505 · Load latest · Keep mine | alert sheet · r 20 | 17 w600 / 15 w400 | card tokens | 17.08 / 14.34 | 44 |
| Group column header | disc · Group A · 4 players | 44 tall | 15/18 w600 | disc tokens; name primary on tint | 14.5 / 11.44 | name field 44 |
| Problem line | Ava Chen arrives at 2:45. Group C starts at 2:15. … [class-times read; never the class] | inline under the column | 13/17 w500 | warnings `--ch-text-secondary` with an alert glyph in `--ch-loss`; errors `--ch-loss` text | 9.77 / 10.25; 5.57 / 8.53 | fix link 44 |
| Drill row | Lag ladder · Putting · Skill · 15 min · Par 6 of 10 [bank or library] | row 56 | 17/22 w600; 15/20 | as Row in a card; GolfHelm mark 12 secondary | 17.08 / 14.34 | 56 |
| No results | No drills match. · New drill | card 120 | 17/22 w600; button | primary text; accent button | 17.08 / 14.34 | 44 |
| Review coach strip | Problems · 14 players and 2 coaches will be notified. · Print · Share · Publish | card above the sheet | 15/20 | secondary; buttons as above | 9.77 / 10.25 | 44 |

### Publish, plan page, share, print, link states

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| Publish sheet audience | 14 players and 2 coaches will be notified. [audience] | row | 17/22 w600 | primary on card | 17.08 / 14.34 | |
| Team chat switch | Post in team chat | row 44 | 17/22 | primary; switch on `--ch-accent` | 17.08 / 14.34 | 44 |
| What changed list | Group B starts on the range · 3 players [diffVersions] | rows 44 | 15/20 | primary on card | 17.08 / 14.34 | |
| Seen sheet row | Jonah · Opened 2:41 PM [opens, team zone] | row 56 | 17/22 w500; 13 secondary | as Row in a card | 17.08 / 14.34 | |
| Share menu | Copy link · Share image · Print | action sheet rows 56 | 17/22 | primary on card | 17.08 / 14.34 | 56 |
| Link-gate | (redirect, no screen) | | | | | |
| Deep-link dead end | That plan was deleted. · Your coach took this plan down. | card on Practice home | 17/22 w600; 15/20 | primary and secondary on card | 17.08 / 14.34; 9.77 / 10.25 | |
| Print pages | coach copy, range board, pocket cards, appendix | Letter; ink only | the sheet's print type | black on white; group discs printed with their letters | 21:1 | |
| Run view current stop | Now · Putting green · Group B · Rotate in 4 min | card, selected fill and ring | 20/24 w700; 15/20 | as Selected row | 14.62 / 11.36 | 44 |

### Documents (N-10 shapes, this lane's copy)

| Element | Text | Box | Type | Colour light / dark | Contrast L / D | Hit |
|---|---|---|---|---|---|---|
| Plan card chip, draft | Draft · Only coaches | chip as above | 13/13 w600 | well, secondary | 8.96 / 10.87 | |
| Plan card chip, published | Published · Thu, Nov 5 | chip | 13/13 w600 | well, accent text | 7.48 / 8.96 | |
| Move sheet row | Hargrove week · 3 [folder names] | row 56 | 17/22 w500; count 15 secondary | as Row in a card | 17.08 / 14.34 | 56 |

## Wiring, 4 Nov 2026

Checked against helmv3 `main` 03d9087 (1 Nov), read only. Paths under `src/clubhouse/` unless they start with `src/`. "new" means code the build adds in the named file (02-PLAN.md). Every write below happens only on a coach press; the model never saves or publishes. Shot tracking: every read here only selects from `golf_rounds`, `golf_holes`, `golf_shots` and `golf_player_stats_cache`; nothing changes what shot tracking collects, stores or sends. Columns as the wiring brief. Flag "both" means `coachhelm_practice_plans_v1` and `golf_practice_plans` (neither is in `config/feature-flags.yml` today; an unknown id reads false, `src/lib/flags/is-enabled.ts:56`, read with `isFlagEnabled` at :78 on the server and passed down as a boolean). With `coachhelm_practice_plans_v1` off, `buildCoachTools` returns today's keys and every surface is today's.

### S-ASK.thread, .steps, .read-pictures, .intake, .intake-folded, S-ASKD.thread, .steps, .intake (PP1, PP2)

| Element or action | Reads | Writes or calls | Who and RLS | Validation | Success | Failure and rollback | Sync | Notification | Flag | Until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Calendar step `cal` | `getUpcomingEvents` (`src/lib/coachhelm/v3/chat/read-tools.ts:1028`) plus the new practice read counting accepted, attending / declined, not_attending, excused, unexcused (03 §6) | none | coach session in the stream route (`src/app/api/coachhelm/v3/chat/stream/route.ts`); `golf_events` and `golf_event_attendance` policies | team zone | step done with picture | failed read: step "Couldn't read", turn goes on | per turn | none | `coachhelm_practice_plans_v1` | n/a |
| SG step `sg`, putting step `pd` | new `get_team_strokes_gained` (`golf_rounds.strokes_gained_*`), new `get_team_putting_profile` (bands `metrics-catalog.ts:232-243`, Tour from `cohort-baselines.ts`) in `src/lib/coachhelm/v3/chat/practice-reads.ts` (new) | none | coach; team scope in the query | thin under 5 player-rounds or 10 attempts | picture | lean read | per turn | none | `coachhelm_practice_plans_v1` | n/a |
| Class step `cls` | `golf_team_class_day` (applied 2026-10-25) | none | coach-checked RPC; only players sharing class status | names only in the coach thread | picture | step skipped | per turn | none | same | n/a |
| Drill step `dr` | `golf_team_drills` then `golf_drills` (02 §C.1) | none | coach | archived hidden | counts by area | "No drills in the bank yet" | per turn | none | same | `golf_drills` only, label "Reading the drill library" |
| Ask first card, Build the plan | `ask_practice_brief` (new, `practice-draft.ts`) | answers go back as a user message with `metadata` (02 §4.2), no write | coach | length, focus, who required | card folds into the bubble | Stop: nothing written | `publishableParts` (`ui-parts.ts:65`) persists parts | none | same | past-plan guesses hidden ("No past plans yet") |

### S-ASK.plan-card, .why, .evidence, .refine, .block-sheet, .swap, .full-plan, S-ASKD.pane, .pane-v2, S-DOC.sheet-coach, .sheet-player (PP0, PP3)

| Element or action | Reads | Writes or calls | Who and RLS | Validation | Success | Failure and rollback | Sync | Notification | Flag | Until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Plan writes itself | this turn's envelopes | `draft_practice_plan` (new, `src/lib/coachhelm/v3/chat/practice-draft.ts`): no insert, update, delete or rpc (confirm-gate test spy) | coach; Fairway never registers it | drill ids in this turn's bank envelope; minutes sum; `validatePlan` | `data-practice-plan-block` then `data-practice-plan` parts | an unknown drill fails the block, not the turn | parts persist on the message | none | `coachhelm_practice_plans_v1` | drafts work; Save and Publish inert |
| Why, Because, source chips, evidence | envelopes; `auditNumericClaims` (`provenance.ts:989`) | none | coach only: `WhyPanel` never imported by player code; Why lives beside the body (`PlanDraft.why`), never in it | numbers must be in this turn's envelopes | Because or "Lean read" or "Routine. No claim." | failed audit drops the Because | parts | none | same | n/a |
| Refine chips, block sheet, swap | the draft, the bank envelope | a new `draft_practice_plan` call (refine or `blockScope`); block edits are client-side versions | coach | length 5 to 360 in 5s; three swaps from the bank | version 2 with changed blocks | "Nothing in your bank fits this"; New drill inert | parts | none | same | New drill inert until 010100 |
| New drill (swap list) | n/a | `createTeamDrill` (`src/app/golf/actions/practice-library.ts`, new in N-00 slice 2); `copyLibraryDrill` for a library pick | coach; `golf_team_drills` policies (N-00 010100) | N-00 8.3 | the slot takes the new id; toast CH-17016 | sheet stays open with the reason | refetch the bank on open | none | both | inert "Drill bank comes with the Practice tab" |
| Coach sheet and player sheet | `toSheetModel(draft, team, copy)` (`plan-sheet-model.ts`, new) | none | the player model is built on the server and has no `why` key | n/a | n/a | n/a | n/a | none | `coachhelm_practice_plans_v1` (preview routes only before N-00) | n/a |

### S-ASK.save-to, .saved, .failed, .undone, S-ASK.toast, S-DOC.list-draft (PP4)

| Element or action | Reads | Writes or calls | Who and RLS | Validation | Success | Failure and rollback | Sync | Notification | Flag | Until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Save to list | `listPlanFolders(teamId)` (new, `src/app/golf/actions/coachhelm-practice-plans.ts`): `golf_documents.folder` grouped, coach scope, last used first | none | coach (`resolveTeamRole`, as `documents.ts:202`) | "Team" and blank not offered | list in place | list fails: "Practice plans" only | read on open | none | both | rows from today's `golf_documents` only |
| New folder | n/a | client state only; the folder exists once the save writes its first row | coach | 1 to 60 trimmed, not "Team", unique by case | shown on top, count 0 | Escape closes | n/a | none | both | same |
| Event first | `golf_events` for the day | event confirm, then `createGolfEvent` (`src/app/golf/actions/calendar-events.ts:537`) when the day has no practice | coach | not all-day, not cancelled | Save turns on once the event id exists | event create fails: nothing saved | n/a | none | both | same |
| Save draft | the draft | `savePracticePlanDraft({conversationId, planId, version, draft, folder})` (new, same file): `golf_practice_plan_save` (N-00 010500) with `draft.body` only, then `golf_practice_plan_file_draft(planId, version, folder, draft.why)` (lane held `held-migrations/20261104090000_…`; on a published plan it moves the folder only and leaves the row's title, description and date as published until Republish, fixed 4 Nov review) | coach only: both are definer functions checking `is_golf_team_coach`; `golf_practice_plans_select` is coach-only | `validatePlan`; folder 1 to 60 | receipt "Plan saved · Documents · <folder>", card meta "Draft · <folder> · <date>" | amber glyph, reason, "Nothing was saved.", Try again; the draft stays; button locks while saving (double-submit guard) | `router.refresh()` on Documents; 010700 realtime for other coaches | none (spy: no `notifications` row, no push, no `golf_messages` insert) | both | inert "Comes with the Practice tab" |
| Undo (8s) | `savedAt`, `createdByThisSave` from the save result | `undoPracticePlanDraft({planId, documentId, savedAt, previous})` (new): new plan, DELETE `golf_practice_plans` (coach policy `golf_practice_plans_delete`, 010000; the Documents row cascades); re-save, `golf_practice_plan_save` with the client-held previous body and `file_draft` with the previous folder | coach | refused after 10s | "Removed. Nothing was saved." | refused: Undo already gone | `router.refresh()` | none | both | n/a |
| Documents draft row | `getDocuments` (`documents.ts:241`, players filtered to `is_public` at 216) | none | player never gets the row (RLS `golf_documents_select_team`, `policies/golf.sql:635`) | n/a | "Draft · Only coaches" chip, one line in `screens/hub/parts.tsx:665` `Documents` | n/a | Hub refresh | none | both | absent |

### S-ASK.publish-confirm, .published, .cancelled, S-ASKD.publish, S-DOC.list-shared (PP5)

| Element or action | Reads | Writes or calls | Who and RLS | Validation | Success | Failure and rollback | Sync | Notification | Flag | Until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Confirm card | saved plan, audience (`golf_practice_plan_recipients`, service role, via the planner), first player's copy (`practiceNotificationCopy`, `model.ts`) | `publish_practice_plan` proposal: `proposeGated` (`agent-tools.ts:317`), `recordProposal` (`action-runs.ts:96`) | coach; `golf_coachhelm_action_runs` policy `coachhelm_action_runs_coach_only` (`20260725170000_…:97`) | must be saved (an unsaved draft saves in the same run) | "Publish to N people" | Cancel: "Cancelled. Nothing was created."; both buttons lock after one tap (`ActionCard.tsx:42`) | parts | none yet | both | inert |
| Publish to N people | the run | `executeGated` (`agent-tools.ts:372`), `claimForExecution` (`action-runs.ts:148`, unique `(coach_id, idempotency_key)`), then N-00 `publishPracticePlan({notify: 'defer'})` (`golf_practice_plan_publish`, 010600), then `result.notify = {state: 'pending', release_at: now + 8s, audience, teamChat}` | coach only (definer check) | `practice_plan_stale`, `_empty`, `_event_cancelled`, `_all_day` | receipt "Published · <date> · Documents › <row's folder> · shared with players"; the row keeps its folder | failed state as S-ASK.failed; nothing told | parts; 010700 realtime | none until the window closes | both | inert |
| Undo inside 8s | `release_at` from the run | `undoPracticePlanPublish(runKey)` (new) or the Ask lane's `DELETE` on `chat/actions/[key]`: state `pending` to `undone` while `release_at > now()`, then `golf_practice_plan_take_down` (010600: status `draft`, row `is_public false`) with no send | coach | refused after `release_at` | "Taken back. Nobody was told." | refused: Undo already gone | parts | none | both | n/a |
| Release (after 8s) | the run | `releaseNotify(sb, runId)` (new, `src/lib/coachhelm/v3/practice-plan/deferred-notify.ts`), called by the route's `after()` (add `import { after } from 'next/server'`; the route has none today), by the receipt's `onExpire` (`releasePracticePlanNotify`) and by the next request's sweep; state compare `pending` to `sending` runs it once | service role for bell rows (`in-app.ts`), session for the chat post | one batch per run | Told row from `result.notify.told`, polled each 1s for 10s | per-person failures: "Told 10 · 1 didn't go through" | poll, then reload reads the run | push `practice_plan` (Events, `push_events` and Quiet mode via `shouldSendPush`, `push.ts:88`, once N-00 slice 3 adds the case at `push.ts:43`), class holds (`holdOrPass`, `class-hold.ts:76`); bell `event_reminder`, `data.kind 'practice_plan'`, `action_url /golf/dashboard/practice/plan/<id>`, filed under Events (`unified-notifications-model.ts:104`); recipients: plan players in groups and the team's coaches, never the publisher | both | none sent |
| Team chat post | team channel (`golf_conversations.is_team_channel = true`) | `sendMessage({conversationId, content, sport: 'golf', createNotifications: false})` (`src/app/actions/messages.ts:334`): text only, no second push | coach must be a participant | switch off with "You're not in team chat" when not | one text message with the plan link | post fails: logged; Told still counts the plan push | Messages polls as today | none of its own | both | n/a |
| Seen by | `golf_practice_plan_opens` (010000), written by `golf_practice_plan_record_open` (010600) | none | coach-only SELECT | players only | "Seen by N of M" | hidden | poll and reload | none | both | hidden |

### S-ASK.share-pdf, S-DOC.print-coach, S-DOC.print-player (PP6)

| Element or action | Reads | Writes or calls | Who and RLS | Validation | Success | Failure and rollback | Sync | Notification | Flag | Until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Print, Share PDF (coach) | the coach model in memory, or `golf_practice_plans.body` plus `coach_why` on the plan page | `printPlan(model)` (new, `plan/PrintPlan.tsx`): `window.print()` with `@media print`, the pattern of `Calendar.tsx:940` | coach | n/a | print sheet (iOS offers Save to Files and Share) | n/a | n/a | none | `coachhelm_practice_plans_v1` | prints the in-memory draft |
| Share PDF (player) | `loadPlayerPlan(planId)` (new): live version via `golf_practice_plan_versions_select` (010000) cut to `toPlayerPlan`; own lines via `golf_practice_plan_lines_select` | `printPlan` with the player model | player, own copy only; no link, no image; no coach-copy file is ever stored | n/a | print sheet | draft or taken down: CH-17302 | n/a | none | both | absent |

### S-FMT.* (PP7)

| Element or action | Reads | Writes or calls | Who and RLS | Validation | Success | Failure and rollback | Sync | Notification | Flag | Until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Upload a plan | n/a | `uploadTeamDocument` (`screens/hub/upload.ts:18`) with folder "Practice plans", `is_public false` | coach; `documents` bucket policies (`20260728173939_documents_storage_bucket_rls.sql`) | PDF or photo; 10 MB in the sheet | reading starts | amber line, nothing uploaded | Hub refresh | none | `coachhelm_practice_plans_v1` | works |
| Reading, Here's your format | the file via `getPreviewUrl` (`documents.ts:1249`) | `readPlanFormat(documentId)` (new, `src/app/golf/actions/coachhelm-plan-format.ts`): model call, zod, layout only | coach | content fields dropped | sections shown | "Couldn't read the file." | n/a | none | same | works |
| Use this format, Undo | `golf_practice_plan_formats` | `setPlanFormat`, `undoPlanFormat` (new): upsert on `team_id` | coach; four policies in `held-migrations/20261102090000_golf_practice_plan_formats.sql` (PM1, written this pass) | name 1 to 80 | receipt with 8s Undo | 42P01: "Comes with the Practice tab" | n/a | none | same | inert |

### S-BLD.*, S-BLDD.* (PP8)

| Element or action | Reads | Writes or calls | Who and RLS | Validation | Success | Failure and rollback | Sync | Notification | Flag | Until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Fill the draft, ghosts | the builder body | `suggestForBuilder(...)` (new server action over `practice-draft.ts`): writes nothing | coach | drill ids in the bank | ghost blocks in client state | Stop keeps written ghosts as ghosts | n/a | none | both | no builder |
| Keep, Keep all | ghosts | the builder's own autosave (`golf_practice_plan_save`) | coach | never replaces a coach block | block turns solid | Undo is the block delete toast | autosave | none | both | n/a |

### S-PLY.* (PP9)

| Element or action | Reads | Writes or calls | Who and RLS | Validation | Success | Failure and rollback | Sync | Notification | Flag | Until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Banner and bell row | the release above | none | the player's own bell rows (`notifications` RLS, own rows) | n/a | opens `/golf/dashboard/practice/plan/<id>` | flag off: redirect to Calendar (N-00 0.2) | bell refresh | the push and bell above | both | none sent |
| Player Practice page and plan | `loadPlayerPlan` only: focus, their group and members' names, their stops; no `why`, `aim`, `because`, other groups' stops or any read figure | `golf_practice_plan_record_open` | player; version RLS shows only the live version; the server cuts to `toPlayerPlan` | n/a | Now and Next | draft id: CH-17302 | 010700 realtime | none | both | absent |
| Documents row (player) | `getDocuments` with `is_public` true | opens the plan page, never a file (`file_url` null) | `golf_documents_select_team` | n/a | plan page | n/a | Hub refresh | none | both | absent |

Privacy: the filter for the player copy is on the server (`loadPlayerPlan`, `toSheetModel(..., 'player')`). RLS does let a player read the live version body (all groups); that body holds no Why, Aim, Because or read figure, because Why lives in the coach-only `golf_practice_plans.coach_why` and `golf_practice_plan_public_body` strips `why` and `coach_why` (N-00 8.8, fixed this pass). Comparisons on any player surface: none in this lane.
