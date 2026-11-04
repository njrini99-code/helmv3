# Practice, redesigned front to back: design spec (2026-10-25)

The source of truth for the practice redesign. The design page and the rewritten plans (N-00 Practice, N-10 Documents) both follow this file. Research behind it: `RESEARCH_WEB.md` and `RESEARCH_CODE.md` in this folder.

## Nick's ask (verbatim, 2026-10-24 10:36pm and 10:40pm ET)

"there needs to be like blocks, then add groups, add Drill. and if you create drill it goes in your drill bank, then you can add people to groups. think deeply about how to design this, maybe templates?. It needs to be a customizable masterpiece. the whole thing. The practice plan builder needs to be designed front to back, and the printed version, and shareable version. find example college golf practice plans and redesign with beautiful ui ux and premium details and how to fit it into calendar and messages etc. Practices shoulld be a tab itself. and all practice plans published should live in the coaches documents and players notified when its published. think deeply about designing this all do research"

"docuemnts ui collapsed and open mechanics shoud mirror anthropics. practice plans geenrated after should look really good and be organized after goign through the creation process" (with a screenshot of claude.ai's Artifacts page: sidebar sections Pinned and Recents that collapse with a chevron, a grid of cards with a live page preview on top and title plus "Opened 10m ago" under it, All / Yours / Shared with you tabs, search, filter, list toggle, a + button.)

## What changes from the old N-00

| Old N-00 | Now |
| --- | --- |
| Lives inside Calendar; no tab | **Practice is its own tab** for coaches and players |
| Groups live inside each plan | **Saved groups** you reuse; make groups in a plan and keep them |
| Drills picked from the read-only GolfHelm library | **Drill bank**: the team's own drills plus the GolfHelm library; a drill made inside a plan saves to the bank |
| Templates in a late slice | **Templates from day one**: session, block and week templates, plus six starters |
| Share sends a prefilled message | **Publish** notifies the players in the plan (Nick's override of the prefill-only rule, for this one act), posts a plan card in the team chat, and files the plan in Documents |
| Plans never touch Documents | Every published plan lives in **Team Hub > Documents > Practice plans** |
| One print | **Print studio**: coach wall chart, player pocket cards, drills appendix; Save as PDF |
| No share | **Share**: team chat card, copy link, share image, print or PDF |
| Documents is a flat list | **Documents rebuilt** like claude.ai's Artifacts page (plan N-10) |

Unchanged rules: Apple standard motion, Lenis on desktop, Text Size, 16/20px edge from 414px, no thick-left-border cards, shot tracking untouched, no AI, no weather, no streaks, no emoji or exclamation marks, held migrations only.

## The words

- **Practice**: the tab, and one practice session on the calendar.
- **Plan**: what the coach builds for a practice. Draft, Published, Updated (republished), Done (its day has passed).
- **Block**: a stretch of time on the plan. Five kinds:
  - **Team**: everyone together (warm-up, talk, lift, film). One place, optional drill.
  - **Stations**: groups rotate between stations. Pick stations, groups and minutes per turn; the rotation fills itself.
  - **Course**: holes on the course (9 or 18, or a hole range), a format (stroke, scramble, best ball, worst ball, match), pairings and tee times. Optional "Counts as qualifying" link to an existing qualifier round.
  - **Own work**: each player works on their own list (from focus areas and coach notes). The plan shows "Own work" with each player's one line.
  - **Break**: travel, water, moving between places.
- **Station**: a place inside a Stations block (Putting green, Short game area, Range, Bunker, Course, Indoor bay, Gym, Film room; the team can add its own places), with its drill, the coach at it and its equipment.
- **Group**: a named set of players with a letter and a colour (A to F). Groups are saved to the team and reused ("Travel five", "Freshmen", "Group A"). A player is in one group per Stations block.
- **Drill**: a card in the drill bank. Fields: name, area (Putting, Short game, Bunker, Approach, Tee, Course, Fitness, Mental), kind (Skill, Random, Pressure), minutes, players (Solo, Pairs, Group), equipment, set-up, goal ("8 of 10 inside 3 feet"), scoring (optional points rows), levels (Par, Birdie, Eagle targets), tags, a photo or video link. Team drills are the team's; the GolfHelm library (63 drills) is read-only and "Copy to your bank" makes an editable team copy.
- **Template**: a saved plan without a date (Session), a saved block (Block), or a saved week of practices (Week). Six starters ship.

## The Practice tab

### Nav
- Desktop sidebar, both roles: **Practice** right after Calendar (lucide `Dumbbell`... no: use `ClipboardCheck`? Team Hub owns ClipboardList. Use `Flag`? Pick in the plan from lucide icons not already used in nav; default `Target`).
- Phone section strip: coach first pills become Home, CoachHelm, Calendar, **Practice**, Stats. Player first pills become Home, CoachHelm, **Practice**, Rounds, Hub. (Owner call 1.)
- Route `/golf/dashboard/practice` with children: `/practice/plan/[planId]` (the plan page), `/practice/plan/[planId]/edit` (builder), `/practice/drills`, `/practice/drills/[drillId]`, `/practice/groups`, `/practice/templates`, `/practice/print/[planId]`.

### Coach, Practice home
Desktop, one column max-width 1200 like the course page:
1. Header: "Practice" (large title) and primary button "New plan". Secondary: "Templates".
2. **This week**: seven day tiles Mon to Sun from the calendar's practice events. Each tile: day, time, and a plan state chip: "No plan", "Draft", "Published", "Updated". Tap opens the plan or starts one. A day with no practice reads "No practice" in quiet ink. Under the strip one line: "Team time this week: 14 h 30 scheduled" (owner call 5, deterministic sum of practice and qualifier event lengths; no compliance claim).
3. **Up next**: the next practice's plan as a large preview card (the at-a-glance strip, groups, first block), with "Open plan" and "Edit".
4. Segmented tabs: **Plans · Drills · Groups · Templates** (`?tab=`).
   - Plans: Drafts first, then Published by date, then Past (collapsed). Rows with mini timeline strip.
   - Drills: the drill bank (see below).
   - Groups: saved groups as cards with member avatars and "Used in 6 plans".
   - Templates: gallery of cards with live previews (same card as Documents), starters first under "From GolfHelm".
Phone: the same order as one column; tabs become a Segmented under Up next.

### Player, Practice home
1. "Practice" large title.
2. **Today** (or the next practice): the player's own path card: "Thursday, 2:00 to 5:00 PM, Lakeside" then their stops: "2:00 Warm-up, Range, everyone" / "2:15 Putting green, Lag ladder, Group B" / ... with "Open plan". During practice the current stop is lit and a "Rotate in 4 min" chip shows (no push).
3. **This week**: day tiles, published plans only.
4. **Past plans**: rows.
5. **Team drills**: drills used in published plans, read-only, so a player can practise alone.
Players never see drafts, other teams' data, or class times of teammates.

## The builder (coach)

Nick's flow is the spine: **Blocks, then Groups, then Drills, then Review**. The builder header shows those four as steps the coach can jump between (a segmented step bar, not a locked wizard). A new plan opens on Blocks; reopening a plan opens where it was left.

### Start a plan ("New plan" sheet)
- Pick the practice: a list of this and next week's practice events without a plan, or "New practice" (opens the Calendar's own event form, then returns).
- Then: **Start from** three big choices: "Blank", "Template" (opens the gallery), "Copy a past practice" (list of past plans). Copy keeps blocks, stations, drills and groups; times shift to the new start.

### Desktop layout (three panes)
- **Left, Library rail** (300px): tabs Drills, Groups, Templates; search at top; filter chips by area. Items drag onto the board. "New drill" at the bottom of Drills.
- **Centre, Board**: the timeline. Times down the left in 15-minute rules; blocks stacked top to bottom as cards across the width. A Stations block expands into its **rotation grid**: columns are stations, rows are turns (2:15, 2:35, 2:55), each cell holds a group chip. Group chips are a filled tint with the group letter in a 24px disc, never a left stripe.
- **Right, Inspector** (340px): the selected block, station, drill or group's fields. Nothing selected: "This practice" with title, focus line, place, coaches, problems list and arrivals (coach only, class-aware).
- **Header**: back "Practice", editable title "Thursday practice", chips for date, time, place (from the event; editing time asks to update the calendar event), the step bar, the **time ribbon** ("2 h 50 of 3 h planned, 10 min open" or "15 min over" in warning ink), the **mix bar** (Skill / Random / Pressure split as a thin three-part bar with minutes), "Preview" and primary "Publish".

### Step 1, Blocks
- "+ Add block" between any two blocks and at the end; picks a kind (Team, Stations, Course, Own work, Break) from a small menu with one-line descriptions.
- Drag a block's bottom edge to change its length in 5-minute steps; each step ticks a `selection` haptic; the ribbon updates live. Blocks below move with a spring (CH_SPRINGS), Reduce Motion: instant.
- Drag a block by its handle to reorder; times recompute from the practice start.
- Block card shows: time range, name ("Short game rotation"), kind glyph, minutes, place or stations, and for Stations "3 stations · 3 groups · 20 min turns".
- Save a block as a template from its menu ("Save as block template").

### Step 2, Groups
- Left: **Who's here**: the practice's players with their RSVP and, for coaches, a class-arrival note ("Arrives 2:45, class until 2:30"). Players who said they can't come are listed last, dimmed, with their reply.
- Centre: group columns A, B, C (add up to F). Drag avatars between groups; or "Split evenly" (into N groups, by roster order, keeping late arrivals together in the last group so they join at the second turn, deterministic); or pick a **saved group** ("Travel five", "Freshmen").
- "Save groups" stores them for reuse with a name. A group used in a Stations block shows its colour in the grid.
- Problems show inline: "Ava Chen arrives at 2:45; Group C starts at 2:15. Move Ava or start Group C on the second turn."

### Step 3, Drills
- Each station and Team block has a drill slot: "Add drill". The Library rail filters to the station's area (Putting green shows Putting drills first).
- Drop a drill on a station: its minutes fit the turn; if longer, the cell shows "Drill runs 25 min; turn is 20".
- **New drill**: a sheet with the drill fields (name, area, kind, minutes, players, equipment, set-up, goal, levels, scoring rows, photo or video link). Save adds it to the station and to the bank at once, with the toast "Saved to your drill bank". Edit later in the bank; plans that use it keep the version they were published with until republished.
- Library drills show a "GolfHelm" mark; "Copy to your bank" makes an editable copy.

### Step 4, Review
- The finished plan exactly as players, Documents and print will show it (the plan page, below), with a coach strip on top: problems (must be zero errors to publish; warnings allowed), the recipient line ("14 players and 2 coaches will be notified"), and buttons "Print", "Share" and primary "Publish".

### Phone builder (coach)
- One column. Step bar under the top bar as a Segmented (Blocks, Groups, Drills, Review).
- Blocks: a vertical list of block cards; tap opens a FormSheet with the block's fields; "+ Add block" rows between cards; reorder by long press (450ms, PEEK_HOLD_MS) then drag on the document scroll; length with a stepper (- 5 min +), no edge drag on phone.
- Stations rotation: shown as a compact grid; tap a cell to swap groups via a sheet.
- Groups: avatars in horizontal group rows; tap an avatar to move it (sheet "Move to Group B").
- Drills: tap "Add drill" opens the drill bank sheet with search and area chips; "New drill" sheet.
- Review and Publish as on desktop.

### Templates
- Session templates (whole plan, no date; groups as A/B/C placeholders or saved groups), Block templates, Week templates (Mon to Sun: which days have practice, each day's session template).
- **Applying a week template**: pick a week; GolfHelm lists the calendar's practice events that week and fills each with its day's session template as a Draft. Days with no practice event list "No practice on Wednesday; skip or add one" (adding uses the Calendar's event form). Nothing publishes on its own.
- Six starters ("From GolfHelm"), built from the research:
  1. "Short game rule of thirds": Putting, Chipping and Pitching each Skill, Random, Pressure in 20-minute blocks (John Carroll Golf Academy layout).
  2. "Three-station rotation": Putting green, Short game area, Range; 3 groups; 20-minute turns (First Tee rotation stations, at college length).
  3. "Qualifier day": warm-up 30, Course block 18 holes stroke play counts as qualifying, debrief 15.
  4. "Tournament prep": warm-up, "Play the course on the range" (simulate the next event's holes, one club per shot as the card says), short game to its green sizes, putting at its speed.
  5. "Skills test": a combine-style block per area with point scoring (Keiser-style bands for lag putting: holed 3, inside 3 ft 2, 3 to 6 ft 1, 6 to 9 ft 0, beyond 9 ft minus 1).
  6. "Class-day 75": a 75-minute plan for the 4:30 to 5:45 window: warm-up 10, two 25-minute stations, pressure finisher 15.

## The plan page (the generated plan)

Rebuilt 2026-10-25 after Nick: "this looks vibe coded and shitty" and "just simple, modern, premium. apple level". One render, used for: the coach's Review, the player's view, the Documents preview, the share image, and (with print CSS) the printed copy. It must read like a typeset document, not a form. Full detail: N-00 4.10.

- **Layout**: Apple's tech specs pages. A left label column (Focus, Groups, Schedule, Drills, Bring, Notes), content on the right, a hairline above each section. Desktop sheet 880px (label column 160px, 32px gap); phone stacks the label above its content with 22px side padding.
- **Type only**: Instrument Sans, tabular numerals, sentence case. No small caps eyebrows, icons, tags or pills, coloured group chips or discs, tinted panels, cards inside cards, left-border accents or team monogram. No day strip, three figures, mix bar, legend or timeline spine on the plan (the builder keeps its own mix bar and ribbon).
- **Colour**: ink only. Clubhouse green (`--ch-green-600`) only in the player view, for Now and the player's own group. Dark mode uses the existing `--doc` surface tokens; paper is always light.

1. **Masthead**: eyebrow "Lakeside University Golf · Practice plan" (left) and "Coach copy" (right, coach only); title "Tuesday practice" (56px); deck "Tuesday, October 27 · 2:30 to 5:00 PM · Lakeside Golf Club"; by-line "Coach Rivera and Coach Lin · Version 1, published Monday 9:14 PM". See what changed, In Documents and Seen by are plain text in the by-line and footer, not chips.
2. **Focus**: one line, 24px medium, balanced wrap ("Lag putting and wedges inside 100 yards. Finish under pressure.").
3. **Groups**: three columns, "Group A" then names comma-separated, never broken inside a name. Coach only: a "Late arrival." note under them (replaces the separate Arrivals section).
4. **Your practice** (player viewer only): see the player view below.
5. **Schedule**: each block is a row: start and "15 min" in the time column, title and a one-line description, place right-aligned in muted ink. A Stations block holds its rotation table inline (drill columns with place and coach, turn rows, cells reading "Group A" with the letter bold, a Par row at the foot on screen). A Course block lists tee times in two columns ("3:50 Sofia and Maya"). A break is one compact muted row ("Move to the 10th tee. Water at the cart barn", "5 min").
6. **Drills**: two columns; name, "Putting green · 20 min", description, "Par 6 of 10  Birdie 8  Eagle 10".
7. **Bring**: two columns of hairline rows, name left, count right, merged from all drills. Coach ticks stay on the device.
8. **Notes**: coach notes.
9. **Footer**: "Lakeside University Golf · Team Hub › Documents › Practice plans", a small code "Live plan / team sign-in", and "Seen by 7 of 9" (coach, screen) or "Page 1 of 2" (paper).

Coach-only on the coach's view: the late arrival note, problems.

**Player view** (phone): eyebrow "Practice plan", title, deck, focus, then a neutral iOS-style segmented control "Your practice | Everyone" (grey track, white selected thumb). Your practice: "Group B · with Nora and Jade", then their stops as rows (time, place in bold, drill with coach), with Now (green) and Next labels at the right during practice. Everyone: the full schedule as rows, the rotation table with their group's letters in green, groups by first name.

## Publish

- The **Publish sheet** shows: who is notified (avatars count "14 players, 2 coaches"), a toggle "Post in team chat" (on), the Documents line "Files to Team Hub > Documents > Practice plans", and the primary "Publish plan". This press is the coach's act; nothing sends before it.
- On Publish, in one server action:
  1. Freeze the version (v1, v2...).
  2. File or update the plan's Documents entry (a plan-type document, visible to players).
  3. Notify the plan's players: push (category Events, respects each player's settings and Quiet mode) and a bell row. Title "Practice plan for Thursday", body "2:00 PM · You start on the putting green with Group B".
  4. If on, post a **plan card** in the team chat (`golf_messages.kind = 'practice'`, already allowed by the CHECK).
- **Republish** after edits: the sheet lists "What changed" (time, place, group, drill changes, in words: "Range moved to 3:20 PM", "Ava moved to Group C"). Players whose day changed are notified ("Thursday's plan changed: Range moved to 3:20 PM"). Wording-only edits notify no one. The coach can switch notifying off for a republish.
- **Unpublish** ("Take down") returns the plan to Draft, removes the Documents entry from players' view and marks the chat card "Taken down"; players whose plan disappears get one notice "Thursday's plan was taken down".
- **Seen by**: the plan page shows the coach "Seen by 11 of 14" with names on tap (from plan opens), using the Seen by grammar from P-01.

## Print studio (revised 2026-10-25 11:45pm after Nick: "The pdf version of the practice doesn't really look good"; revised again 2026-10-25 after Nick: "this looks vibe coded and shitty" / "just simple, modern, premium. apple level")

`/practice/print/[planId]`, opened from Review, the plan page and Documents. Page previews on the left, toggles on the right. Every page uses the plan page's own document layout (label column, hairlines, type only) in ink on white, so it reads the same on a black-and-white copier; there is no colour switch, because colour would change nothing. Nothing prints below 8.5pt. Full detail: N-00 4.14.
- **Coach copy** (on): portrait US Letter. Page 1: masthead (eyebrow with "Coach copy", 40px title, deck, by-line), focus, groups with the late arrival note, and the whole schedule with the rotation table (no Par row) and tee times; for a normal plan the schedule always finishes on page 1, and a long plan flows without splitting a block. Page 2: running header "Tuesday practice · Tuesday, October 27 / Coach copy", drills with Par, Birdie and Eagle, Bring in two columns, notes with writing lines. Footer: team, Documents path, small code for the live plan (team sign-in), page x of y.
- **Range board** (on): landscape, only the rotation, readable from ten feet: eyebrow "Lakeside University Golf · Range board", title "Short game rotation", "2:45 to 3:45" on the right, drill columns (26px drill name, place · coach), times and "Group A" at 56px, footer "Twenty minute turns. Move one station right on the horn." / "Then the 10th tee at 3:45". No arrivals, no notes.
- **Pocket cards** (off): two half-letter cards per landscape sheet with a dashed cut line; each card "Group A · Sofia, Maya, Lena", title, deck, that group's stops as rows, a Bring line and a code footer. No colour band.
- **Drills appendix** (off): running header, then each drill with an ink-only set-up diagram (no tinted grounds), description, scoring rows with hairlines, Par, Birdie and Eagle.
- Primary "Print"; the browser dialog offers Save as PDF, which uses the same print CSS (no server PDF). "Fit to one page" is dropped.

## Share

From the plan page's Share button:
- "Send to team chat" (plan card, if not already posted).
- "Copy link" (the plan page; team members only).
- "Share image": a 1080 × 1350 PNG in the plan document's type (html2canvas is already in package.json), for a group text: eyebrow team / "Practice plan", 116px title, deck, focus at 46px, then the day in rows (time, block, place) separated by hairlines, and a foot "Full plan in Team Hub › Documents" with the coaches. No names, no arrivals.
- "Print or save as PDF" (opens the print studio).
- No public link in v1 (owner call 4).

**Plan card in Messages**: kicker "Practice plan", title, facts line, a plain line of the first two blocks (no strip), for a player "You: Group B, start on the putting green", and "Open plan". When republished the card reads "Updated 1:02 PM".

## Calendar

- The practice event's inspector and phone sheet gain a **Plan** row: "No plan yet" with "Build plan", or the plan state with "Open plan". A published plan shows its glance: title, facts line and the first schedule rows.
- Week and day views show a small plan glyph on practices with a published plan.
- Editing a plan's time asks "Also move Thursday practice to 2:30 PM on the calendar?" and uses the existing event update.
- Deleting a practice with a plan keeps open call 5 (warn with a count, then delete).

## Documents (plan N-10, mirrors claude.ai's Artifacts page; revised 2026-10-25 11:45pm after Nick: "the documents don't look like Anthropic's")

Team Hub > Documents is rebuilt on the claude.ai gallery layout. Full detail: N-10 4.1 to 4.12.
- **Left library rail** (232px, desktop): New (+, coaches), Search, then small collapsible labels with a caret: **Pinned**, **Recents** (8 rows and View all), **Folders** (Practice plans, Team, then A to Z, with counts). The caret turns and the list opens with the house 0fr to 1fr grid reveal; Reduce Motion is instant; state remembered per viewer. A folder filters the grid and shows a breadcrumb. Under about 860px of Hub width the rail becomes a "Show library" overlay.
- **Main**: creation tiles at the top (Practice plan, Upload, Folder; coaches only), then a sticky bar: **All · Yours · Shared with players** on the left, icon-only search, filter (type and sort), list or grid, and + on the right.
- **Cards**: 16px radius, 1px border, no shadow. A tinted thumbnail ground (plans deep green, files deep slate, images the image) with a mini page inset and cut off at the bottom; plans with later versions show stacked sheets. Bottom row: type icon tile, one-line title, "Published 2h ago" or "Opened 10m ago", a people glyph when shared. Hover or focus shows round ... and pin buttons; a pinned card always shows its pin. Menu: Pin, Rename, Move, Share with players, Download, Delete.
- **Phone**: tabs, search and filter, collapsible Pinned, Recents and Folders headers with a caret, rows with a 56px thumbnail; + opens the creation sheet.
- Opening: a practice plan opens its plan page; images and PDFs open a preview sheet on desktop; other files open in a new tab.
- Data: N-00 owns `golf_documents.practice_plan_id` (file_url nullable with a CHECK); N-10 owns `golf_document_pins`, `golf_document_opens` and folders.

## Notifications (exact)

Only these send, all from a coach's explicit press: Publish (players in the plan), Republish with player-facing changes (affected players, coach can switch off), Take down (players who had it). Push category Events (`push_events`), bell row type reusing `event_reminder` with `data.kind = 'practice_plan'` (no enum change). Nothing else in the practice feature sends anything: no reminders, no rotation pings.

## Owner calls (defaults the plans are written to)

1. Nav: Practice after Calendar in both sidebars; phone first pills coach Home, CoachHelm, Calendar, Practice, Stats; player Home, CoachHelm, Practice, Rounds, Hub.
2. Published plans in Documents are visible to players (shared). Default yes.
3. Republish notifies only players whose day changed; coach can switch it off. Default yes.
4. Public link for people outside the team: not in v1.
5. "Team time this week" line for coaches: on, worded as scheduled time, no compliance claim.
6. Players logging drill results: later, not in v1.
Earlier calls 4 (range-board print without arrivals) and 5 (delete warns with a count) still stand.

## Premium details checklist (every one deterministic)

Live time ribbon and mix bar; 5-minute snap with haptic ticks; rotation grid that fills itself; drag a group chip to swap turns with a FLIP spring; "Saved to your drill bank" toast; class-aware arrivals with a fix suggestion in words; copy a past practice; import a block from a past plan; week template onto the calendar; starters from real programs; Par, Birdie, Eagle levels on drills; equipment checklist merged from drills; Now and Next lines during practice; "Rotate in 4 min" chip; What changed on republish; Seen by on the plan; print in the plan page's look, ink only so it reads the same in black and white; pocket cards; drill set-up diagrams; share image; Documents preview cards that render the plan itself.
