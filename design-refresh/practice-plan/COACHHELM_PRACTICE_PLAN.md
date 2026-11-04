# CoachHelm builds a practice plan (lane 6, 31 Oct 2026)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (a short note, no new rows).

> Superseded values: where this file differs from 05 to 08 or from the shared values in START_HERE, those win. Reduce Motion is `CH_FADE_MS` (180ms), the push is 24% with brightness(0.9), and Group C is plum.

Design page: https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5 (source: `coachhelm-practice.html` beside this file). Phone and Mac prototypes, a Play button for every motion, a motion lab, and a live contrast table.

Follows `../DESIGN_LANGUAGE.md`. Steps, task visual, confirm, commit, receipt and Undo follow `../coachhelm/AGENT_KIT.md`; the artifact card and desktop pane are the Ask lane's (`../ask/ASK_REDESIGN.md` §3.5). Plan only: no deploys, migrations or flag flips. Nothing here changes what shot tracking collects; it only reads.

Nick's asks this covers (31 Oct): CoachHelm creates a practice plan from Ask and inside the practice plan wizard; visuals of the steps and of the task being done; it asks what you want in the plan and then creates it; documents save to a folder, or a new folder.

Nick's second note (31 Oct, 14:29): the printed plan (PDF) must look a lot better; practices have groups, so show them; coaches upload a sample plan and CoachHelm uses it as the format; it learns from past and future plans; players don't see the why lines; keep it simple, coaches aren't technical. Covered in §12 and §13.

---

## 1. Flow in Ask (phone and Mac)

1. Coach types "Build Thursday's practice around putting".
2. **One quick read**: "Checking Thursday on the calendar". Done row shows a mini week (Thursday lit, Hargrove on Monday).
3. **Asks first** (kit ⑥, `PlanIntake`): one card, "What should Thursday cover? · Best guesses are picked. Change any." Three groups, never more, and nothing the request already said (Thursday):
   - How long: 2 h / 2 h 30 / 3 h (Your calendar has 2:00 to 5:00)
   - Work on, pick any: Short putts 3 to 5 ft / Lag 20 to 40 ft / Up and down / On course, holes 1 to 6 (Your stats point at the first two. Hargrove starts Monday.)
   - Who: Everyone, Tuesday's groups / Travel squad / Pick players (9 going, 1 can't)
   - Best guesses come ticked from this turn's reads; the source line under each group is this lane's addition. "Build the plan" stays dim until every group has an answer (with guesses ticked it is ready at once).
   - The trail shows "Waiting for your answers" while the card waits. On press the card folds into the coach's own bubble ("3 h · short putts, lag, up and down, holes 1 to 6 · everyone"); the waiting row becomes "Got your answers"; the run carries on.
   - The answers drive the plan (picking "On course, holes 1 to 6" is why holes 1 to 6 are in it). The builder's New plan sheet and the top-bar chat use the same card.
4. **Reads, each with a picture** (kit ①, plus a mini chart when the read lands; skeleton while running, crossfade 260ms, marks grow 360ms):
   - Last 10 team rounds → strokes gained by area, centre line, putting −0.9 in amber.
   - Putting by distance → make rate bars with the Tour tick; amber where the gap is over 8 points.
   - Class times → timeline 2:00 to 3:00: Ava and Jade in class to 2:15, rotation from 2:30.
   - Drill bank → the three drills it picked fan out of a stack (+13 more).
   - Steps fold to "6 steps · 9s".
5. **Plan writes itself** (kit ②): the artifact card opens with an outline of all six blocks (sized skeletons). A soft green ring (write head) moves down them; each block fills time first, the title types in with a caret, then place, drills and the Why rise in. The day strip grows a segment per block. Status line under the card: "Writing block 3 of 6", last "Checking every why against the data". The card settles (0.98 → 1) and the foot appears: mix bar, Save draft, Publish…
6. Prose under the card, then refine chips (Make it 2 hours, More pressure, Lighter before Monday, Use Tuesday's groups).
7. Edit: tap a block (sheet with length stepper, place, coach, drill, its Why, Ask about this block); swap a drill (three alternatives from the bank that fit the same gap, each with its own because); tap a source chip (evidence sheet).

Mac: the card in the thread, the full plan in the Ask lane's ArtifactPane at 452px (title, meta, "1 of 2" arrows, close; footer Edit in builder, Save draft…, Publish…). A refine ("Make it 2 hours") makes version 2 and marks changed blocks.

## 2. Save to a folder (kit ⑦)

- The plan card has a "Save to [Practice plans ⌄]" row above Save draft / Publish…, defaulting to the last folder used.
- Tapping it opens the folder list in place inside the card (not a popover or sheet): folders with counts, a check on the chosen one, New folder at the bottom. New folder becomes a name field with Create; the new folder appears at the top, already chosen, and the row names it ("Save to Hargrove week").
- Save draft (a coach press, never the model) → "Saving…" capsule (kit ④); a small Documents strip; the page drops into the folder (462ms arc), the folder squashes 1.08 × 0.94 and settles, the count ticks up; the card edge flashes green once.
- Receipt (kit ⑤): check draws with one soft ring, "Plan saved · Documents · Hargrove week", "Only coaches can see it. Players are told when you publish.", Open, Undo with the 8 second ring. A folder made here and left empty by Undo is removed with the plan. Card meta becomes "Draft · Hargrove week · Thu, Nov 5".
- Server (kit): folders table, `create_document_folder`, `save_practice_plan` takes `folderId`. Folders belong to the Documents round two work (not built); until it lands, the row shows Practice plans only. (fixed 4 Nov: superseded. A folder is a name in `golf_documents.folder`; `savePracticePlanDraft` takes `folder`; the list shows every name the team uses and does not wait for N-10. 02 default 1 and the Completeness section.)

## 3. Publish (one confirm, Undo before anyone hears)

- Confirm card (kit ③): When, Where, Tells (faces + "9 players and 2 coaches, push and bell"), Files to (folder + Change), "What Jonah gets" with the exact notification, team chat switch.
- "On confirm: it files in Documents now. The 11 people hear once Undo closes, 8 seconds later." Buttons Cancel / "Publish to 11 people". Locks after the first tap.
- Commit (kit ④ and ⑤ beats): button → "Publishing…" capsule with sweep; Documents strip; page drops into Practice plans (folder squash, count up); the card edge flashes green once.
- Receipt (kit ⑤): check draws with one soft ring, "Published · Thu, Nov 5, 2:00 PM · Documents › Practice plans · shared with players", Open, Undo with the draining ring. When the ring empties: "Told 11 · push and bell" with each face pinging as its notice is delivered, 90ms apart in arrival order (Reduce Motion: all at once), then "Seen by 4 of 9 · Jonah, Eli, Sofia, Nora" as reads arrive. Same as the kit and lanes 4 and 5: DESIGN_LANGUAGE §10 bans entrance staggers on page load, and this tracks real deliveries.
- Notifications and the chat card run only after the Undo window, so Undo never un-notifies anyone. This is Nick's exception: publishing a plan notifies players.

## 4. Inside the practice plan builder

- Builder header "‹ Practice", steps Blocks / Groups / Drills / Review; the CoachHelm helper card on each step ("Fill the draft"). Suggestions arrive as ghost blocks (dashed well, Keep / Swap / Remove, Keep all). Nothing joins the plan until kept.
- New plan sheet has "Ask CoachHelm" with the same ask-first questions as Ask (focus chips, length, groups).
- Mac: library rail, board with proportional ghost blocks, inspector with a CoachHelm tab.

## 5. What players get

Lock screen and banner "Practice plan for Thursday · 2:00 PM · You start on the putting green with Group B". The player's Practice page shows their group's stops (Now, Next). Players see focus, aim, their group and stops; the why lines are coach copy only (settled).

## 6. The why rule (CoachHelm evidence rule, strict)

Every non-routine block carries Aim, Because and source chips. Every number in a Because must appear in a read from this turn (claim audit in `chat/claims-packet.ts`); a block that fails loses its Because and shows "Lean read". Routine blocks (warm-up, move, wrap) say "Routine. No claim." Drills come only from the team bank and the GolfHelm library (call 4).

## 7. Motion (from `tokens.css` / `lib/motion.ts`)

| Moment | Spec | Reduce Motion |
|---|---|---|
| Step active / done | dot breathes 1.0→0.6 every 1.2s, label pulses 1.9s; check stroke draws 240ms ease; fact rises 6px 260ms | static dot; `CH_FADE_MS` (180ms) crossfades |
| Read picture | skeleton pulse → crossfade 260ms; bars and segments grow 360ms; drills fan 462ms smooth spring | appears whole, `CH_FADE_MS` (180ms) fade |
| Ask-first chip | accent ring on the chip, press 0.97 (110ms down, 280ms release), fill cross-fades 180ms; the chip keeps its size (kit ⑥: 36pt pill, accent fill, ivory label) | instant |
| Card → coach bubble | card fades 160ms and collapses 260ms smooth; bubble arrives 260ms | `CH_FADE_MS` (180ms) fades |
| Block written | write head ring, title types (~300ms total), rest rises 260ms; strip segment scaleX 360ms | block appears filled |
| Plan settles | scale 0.98→1, spring 260ms | none |
| Sheet | up 462ms smooth spring, down 280ms ease | `CH_FADE_MS` (180ms) fade |
| Button → capsule | 280ms smooth, sweep 900ms loop | `CH_FADE_MS` (180ms) crossfade |
| Files into folder | arc 462ms smooth spring, folder squash 1.08 × 0.94 on the spring, count changes | no flight, folder fades |
| Card edge flash | inset 2pt accent ring at 60%, fades 900ms, once | none |
| Receipt check | check draws 300ms, one ring 1 → 1.9 fading 620ms | check shown, no ring |
| Undo ring | 8s linear | same (it is a timer) |
| Team chat switch | today's `ui/Switch.tsx`: 40 × 23 track, 19pt thumb, slides 17pt on `--ch-ease-spring` 260ms, held thumb stretches 1.2 × 1 | thumb jumps, no stretch |
| Players told | each face pops 300ms spring as delivered, 90ms apart | appear at once |

No count-ups, no entrance staggers on page load. Transform and opacity only, except morph heights (FLIP).

## 8. Tokens and contrast

Light/dark tokens on the page's `:root`. Text pairs computed live in the page's contrast table at a 4.9:1 floor; dark buttons use #1F6B45 under #F6F1E4 (about 5.6:1). Amber (`--loss`) only for losses and gaps; no red anywhere in the agent UI. No accent left borders, no gradient text (the working pulse is opacity only).

## 9. Where it lands (helmv3 main)

| Piece | Where | Notes |
|---|---|---|
| Steps | `chat/agent-tools.ts` PROGRESS_LABEL, `data-progress` | add labels for class times and drill bank reads; one-line fact per finished read |
| Ask first | kit ⑥ card (`chat/parts/AskFirst.tsx`, shared with the quick chat) | stops the turn after the calendar read; Build the plan sends answers as tool input |
| Draft a plan | new tool `draft_practice_plan` (class draft) | writes nothing; streams `practice-plan-block` parts; reads get_upcoming_events, get_team_rounds, get_putting_distance_profile, get_player_weakest_areas, get_focus_areas, plus new class-times and drill-bank reads (Ask lane's `get_calendar`, `get_practice`) |
| Plan shape | `screens/practice/model.ts` PlanBodyV2 (N-00 8.1) | plus `why` per block (aim, because, sources); validatePlan before "Ready"; drill ids must exist |
| Card and pane | Ask lane's `ArtifactCard.tsx` / `ArtifactPane.tsx`, kind `practice_plan` | |
| Save draft | kit ⑦ row; `save_practice_plan` with `folderId` over N-00 `golf_practice_plan_save` (held 20261026010500); folders table from Documents round two (fixed 4 Nov: `savePracticePlanDraft` with `folder` by name, 02 §6.2) | coach press only |
| Publish | new confirm tool `publish_practice_plan` in CONFIRM_REQUIRED_TOOLS; N-00 publish RPC (held 010600) | notify and chat card after the Undo window |
| Builder helper | `screens/practice/builder/HelperPanel.tsx`, `HelperSheet.tsx` | same draft endpoint with the current body and a scope |
| Flag | `coachhelm_practice_plans_v1` | off in prod; needs the Practice tab flag and N-00 migrations; its one migration (plan format table) is held with them |
| Override | N-00 §1.4 | N-00 cut "CoachHelm writing plans"; Nick's 31 Oct asks reverse it |

## 10. Research kept

Claude artifacts (card + pane, versions, writes in place), Notion AI (draft inline, keep or discard), TrainingPeaks (block width = time), Runna and Future (plan built from your answers, coach-voice reasons), WHOOP (non-judgmental wording), ChatGPT and Claude ask-first question cards (picked defaults, one tap to go).

## 11. Settled with Nick (31 Oct)

1. Ships together with the Practice tab, right after Practice slices 1 to 5.
2. Players don't see the why lines. Coach copy has them; the player copy is the same sheet without them.
3. A draft shows in Documents marked "Only coaches" and becomes "Shared with players" on publish.
4. Drills only from the team bank and the GolfHelm library; never invented. When nothing fits it says so and opens New drill.

## 12. The printed plan (the page and the PDF are one component)

The plan page in the desktop pane, the phone full plan and the PDF are the same component. It is a page: it stays light in dark mode, because that is what prints.

- Top: team mark, "Demo University Golf / Practice plan · Coach copy", and a date block (THU 5 NOV). A 2px ink rule under it.
- Title, focus line, then Time · Place · Coaches in three columns.
- Groups: one tinted column per group (A green, B blue, C plum (fixed 4 Nov: was ochre; settled plum #654A7E, dark #B49ACB)), letter disc and names. Group colours are tokens `--gA/--gB/--gC` with tints; the disc letter is white in light, near-black in dark (all ≥4.9:1, in the page's contrast table).
- Schedule: time and length, then title, place, and who. A rotation is a small grid: stations down, turns across (2:30, 2:50, 3:10), each cell the group's letter on its tint. A course block shows chips "A Hole 1 · B Hole 3 · C Hole 5". Everything else says "Everyone".
- Coach copy: one short "Why" line per block (accent label, secondary text). Player copy drops it. No Aim/Because/source chips on paper; those stay in Ask.
- Bring as a checklist, Notes as ruled lines, footer: state · "In your format · <format name>" · Page 1 of 1.
- Phone (under 340px content) tightens the group columns and rotation cells by container query.
- Groups also show in Ask: each rotation station line starts with the group that begins there, and the course block has the hole chips.

## 13. Your plan format (upload a sample, then it learns)

Where: Practice › Plan format, and the last line of the ask first card ("In your format · Fall practice sheet"), which links there.

1. "Use the plan you already use": Upload a plan (PDF, photo of a printed sheet, Word or Excel). Sheet with Choose file / Photo library / Take a photo.
2. The file shows as a page in a well; a scan line passes down it (kit ② task visual) while kit ① steps run: Reading the file (1 page · 5 sections), Matching your sections, Checking your past plans (6 plans · you split into 3 groups most weeks). Found sections are outlined on the page all at once, each with a small tag.
3. "Here's your format": Header, Groups, Schedule, Bring, Notes in plain words. Try another / Use this format.
4. Use → Saving capsule → receipt "Your format is set · Plans from Ask and the builder now use it", See Thursday in it, 8 second Undo. Current format row updates.
5. It copies layout only (sections, order, schedule columns), never old content.
6. Learning has no settings: published plans, past and future, feed drills kept and swapped, block lengths and group splits into the ask first guesses.
7. Kept simple: no template editor, no field mapping, no toggles.

Server: new table `golf_practice_plan_formats` (team, source document, sections jsonb), held with the Practice migrations behind `coachhelm_practice_plans_v1`. The sample file lives in Documents storage. Learning needs no table: the draft tool reads the team's published plans.

## Completeness pass, 4 Nov 2026

Three lines above were fixed in place (folders by name twice, Group C plum). Everything this pass adds lives in the build files: decisions in `02-PLAN.md` §C.1 to §C.10, data in 03, the N-00 and N-10 screen map and S-PRC.* states in 05, specs in 06, motion in 07 and CP-PP-01 to CP-PP-84 in 08, each in its section of this name.
