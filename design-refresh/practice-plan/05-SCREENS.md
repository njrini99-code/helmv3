# 05 · Screen inventory: CoachHelm practice plans (lane 6)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 225 rows).

Every screen, subscreen, pushed page, sheet, toast and inline state this lane draws or needs. IDs here are used by 06, 07, 08 and `capture/capture.mjs`. Design link: `https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-<state>` (the page plays the scene to that state and holds it; add `-dark`, `-xxl` or `-rm`). Local copy: `redesign/coachhelm-practice.html#cap-<state>`. App routes are under `/clubhouse-preview/`; "…thread" is `coachhelm-practice-thread`, "…format", "…builder", "…player" likewise (02-PLAN.md §2.5). Every route is "add" until PP0 lands the fixtures.

Rules for this file: a state the page does not draw says "not drawn" with its build rule. The Ask desktop frame draws at 1280 × 800 (shown scaled to 0.9 on the page; 06 gives its values at 1:1). The builder desktop frame draws at 1148 × 718; build it at 1280 with the board column taking the extra 132. Phone frames draw at exactly 390 × 844.

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-ASK.thread` | screen | Coach: CoachHelm tab › Ask (today's Ask thread); sends "Make a practice plan for Thursday" | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-thread) | `coachhelm-practice-thread?state=thread` | coach only | PP1 |
| `S-ASK.steps` | inline state | Appears under the coach's message as each read runs | [running](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-steps) · stopped: not drawn | `…thread?state=steps | stopped` | coach only | PP1 |
| `S-ASK.read-pictures` | inline state | Under each finished read in the steps list (cal, sg, pd, cls, dr) | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-reads) · failed: not drawn | `…thread?state=reads | failed` | coach only | PP1 |
| `S-ASK.intake` | inline card | After the calendar read; the turn pauses on it | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-intake) | `…thread?state=intake` | coach only | PP2 |
| `S-ASK.intake-folded` | inline state | Press Build the plan on S-ASK.intake | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-reads) | `…thread?state=reads` | coach only | PP2 |
| `S-ASK.plan-card` | inline card | After the reads finish; the plan writes itself block by block | [writing](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-writing) · [ready](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-card) · lean: not drawn · empty-bank: not drawn · long: not drawn | `…thread?state=writing | card | lean | empty-bank | long` | coach only | PP3 |
| `S-ASK.why` | inline panel | Inside each block of S-ASK.plan-card | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-card) | `…thread?state=card` | coach only (never in any player DOM) | PP3 |
| `S-ASK.evidence` | sheet (hug, max 84%) | Tap a source chip in S-ASK.why | [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-evidence) | `…thread?state=evidence` | coach only | PP3 |
| `S-ASK.refine` | inline chips | Under the ready plan card | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-card) | `…thread?state=card` | coach only | PP3 |
| `S-ASK.block-sheet` | sheet (hug, max 84%) | Tap a block row in S-ASK.plan-card | [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-edit) | `…thread?state=edit` | coach only | PP3 |
| `S-ASK.swap` | sheet (hug, max 84%) | Swap in S-ASK.block-sheet, or Swap on a station | [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-swap) · [swapped](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-swapped) | `…thread?state=swap | swapped` | coach only | PP3 |
| `S-ASK.full-plan` | push | Tap Open the full plan on S-ASK.plan-card | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-full) | `…thread?state=full` | coach only (players get S-PLY.plan) | PP3 |
| `S-ASK.toast` | toast (Mac) | Save draft… in the S-ASKD.pane footer (the phone saves from the plan card, S-ASK.saved) | default: not drawn | `…thread?state=full then tap` | coach only | PP4 |
| `S-ASK.save-to` | inline list | Tap the Save to row in the plan card foot | [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-folders) · [new-folder](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-newfolder) | `…thread?state=folders | newfolder` | coach only | PP4 |
| `S-ASK.saved` | inline receipt | Press Save draft | [saving](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-saving) · [saved](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-saved) | `…thread?state=saving | saved` | coach only | PP4 |
| `S-ASK.failed` | inline state | A save or publish that fails | default: not drawn | `…thread?state=failed` | coach only | PP4 |
| `S-ASK.undone` | inline state | Press Undo inside 8s on a receipt | default: not drawn | `…thread?state=undone` | coach only | PP4 |
| `S-ASK.cancelled` | inline state | Press Cancel on S-ASK.publish-confirm | default: not drawn | `…thread?state=cancelled` | coach only | PP5 |
| `S-ASK.publish-confirm` | inline card | Press Publish… on the plan card or the full-plan dock | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-confirm) | `…thread?state=confirm` | coach only | PP5 |
| `S-ASK.published` | inline receipt | Press Publish to 11 people | [publishing](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-publishing) · [published](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-published) · [told](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-told) | `…thread?state=publishing | published | told` | coach only | PP5 |
| `S-ASK.share-pdf` | system print sheet | Share PDF on S-ASK.full-plan (phone) | default: not drawn | `coachhelm-practice-plan?state=card&density=print` | coach (coach copy); player (player copy) from S-PLY.plan | PP6 |
| `S-ASKD.thread` | screen (desktop) | Mac: CoachHelm › Ask, same send | [built](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-desk-pane) | `…thread?state=card&density=desk` | coach only | PP1 |
| `S-ASKD.steps` | inline state (desktop) | As S-ASK.steps, in the thread column | default: not drawn | `…thread?state=steps&density=desk` | coach only | PP1 |
| `S-ASKD.intake` | inline card (desktop) | As S-ASK.intake, in the thread column | default: not drawn | `…thread?state=intake&density=desk` | coach only | PP2 |
| `S-ASKD.pane` | pane 452px | Opens beside the thread when the plan starts writing; the compact card reopens it | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-desk-pane) | `…thread?state=card&density=desk` | coach only | PP3 |
| `S-ASKD.pane-v2` | pane state | Send "Make it 2 hours" or tap a refine chip | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-desk-v2) | `…thread?state=v2&density=desk` | coach only | PP3 |
| `S-ASKD.publish` | inline card (desktop) | Publish… in the pane footer | default: not drawn | `…thread?state=confirm&density=desk` | coach only | PP5 |
| `S-DOC.sheet-coach` | component | The printed plan body used by S-ASK.full-plan, S-ASKD.pane, Documents and the PDF | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ask-full) | `coachhelm-practice-plan?state=card&copy=coach&density=phone|pane|print` | coach | PP0 |
| `S-DOC.sheet-player` | component | Same component with copy=player | default: not drawn | `coachhelm-practice-plan?state=card&copy=player&density=phone` | player | PP0 |
| `S-DOC.print-coach` | print page | Print or Share PDF from the coach's plan | default: not drawn | `coachhelm-practice-plan?state=card&copy=coach&density=print` | coach | PP6 |
| `S-DOC.print-player` | print page | Print from S-PLY.plan | default: not drawn | `coachhelm-practice-plan?state=card&copy=player&density=print` | player | PP6 |
| `S-DOC.list-draft` | list row | Team Hub › Documents › <folder> after Save draft | default: not drawn | `team-hub-documents?state=practice-draft (add)` | coach only; absent from player DOM | PP4 |
| `S-DOC.list-shared` | list row | Team Hub › Documents › Practice plans after Publish | default: not drawn | `team-hub-documents?state=practice-shared (add)` | coach and player | PP5 |
| `S-FMT.empty` | screen (push) | Practice › Plan format, or the format link on S-ASK.intake | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-home) | `coachhelm-practice-format?state=empty` | coach only | PP7 |
| `S-FMT.upload-sheet` | sheet (hug) | Tap Upload a plan | [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-upload) · [picked](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-picked) | `…format?state=upload-sheet | picked` | coach only | PP7 |
| `S-FMT.reading` | inline state | A file is picked; the sheet closes | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-scan) | `…format?state=reading` | coach only | PP7 |
| `S-FMT.found` | inline card | Reading finishes | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-found) | `…format?state=found` | coach only | PP7 |
| `S-FMT.set` | inline receipt | Press Use this format | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-set) | `…format?state=set` | coach only | PP7 |
| `S-FMT.see` | push | Press See Thursday in it | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-fmt-see) | `…format?state=see` | coach only | PP7 |
| `S-FMT.undone` | inline state | Undo inside 8s on S-FMT.set | default: not drawn | `…format?state=undone` | coach only | PP7 |
| `S-BLD.helper` | inline card | Practice › New plan › Builder, empty Blocks step | [empty](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bld-empty) | `coachhelm-practice-builder?state=empty` | coach only | PP8 |
| `S-BLD.new-sheet` | sheet (hug) | Practice › New plan; Start from Ask CoachHelm | [open](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bld-new) | `…builder?state=new-sheet` | coach only | PP8 |
| `S-BLD.ghosts` | inline state | Press Fill the draft on S-BLD.helper | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bld-ghost) | `…builder?state=ghosts` | coach only | PP8 |
| `S-BLD.kept` | inline state | Press Keep or Keep all | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bld-kept) | `…builder?state=kept` | coach only | PP8 |
| `S-BLDD.board` | screen (desktop) | Mac: Practice › New plan | [ghosts](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bldd-ghost) · [kept](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bldd-kept) | `…builder?state=ghosts | kept&density=desk` | coach only | PP8 |
| `S-BLDD.inspector` | panel | The CoachHelm tab of the builder inspector | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-bldd-ghost) | `…builder?state=ghosts&density=desk` | coach only | PP8 |
| `S-PLY.notify` | push banner + bell row | After Publish and the 8s Undo window | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ply-banner) | `coachhelm-practice-player?state=notify` | player | PP9 |
| `S-PLY.practice` | screen | Tap the banner or the bell row; or Practice tab | [default](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5#cap-ply-practice) | `…player?state=practice` | player (own group only) | PP9 |
| `S-PLY.plan` | push | Tap Open the plan on S-PLY.practice | default: not drawn | `…player?state=plan` | player | PP9 |
| `S-PLY.docs` | list row | Team Hub › Documents › Practice plans | default: not drawn | `…player?state=docs` | player | PP9 |

Coach only means the element is absent from any player's DOM and payload, not hidden (SHARED-11, 08 PLY criteria).

## State matrices

Rows the standard asks for. Drawn gives the page anchor. State is the `capture.mjs --state` value on the "state:" rows and the preview `?state=` value on the others. For XXL, dark and Reduce Motion the page draws every drawn state: add `-xxl`, `-dark` or `-rm` to its anchor. Phone 430 and desktop 1280 are build rules unless stated.

### S-ASK.thread

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-ask-thread | `default` | As drawn. |
| loading | not drawn | `thread` | Composer stays live; no skeleton of the thread. Today's AskThread loading rule. |
| empty | not drawn | `thread` | Empty Ask shows today's suggestions; the practice ask is a suggestion chip only when a practice is on the calendar in the next 7 days. |
| error / failed | not drawn | `failed` | Send fails: today's Ask error row; nothing is drafted. |
| long text | not drawn | `long` | Coach message wraps; bubble max 78% width. |
| lots of items | n/a | | One turn per ask; older turns scroll above. |
| one item | n/a | | Does not apply. |
| offline or stale | not drawn | `failed` | Send is disabled offline with today's "You're offline" line. |
| XXL Text Size | #cap-ask-thread-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-thread-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-thread-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-thread | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.steps

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: running | #cap-ask-steps | `running` | As drawn. |
| state: stopped | not drawn | `stopped` | Not drawn. Stop pressed: the active row shows a dash in place of the dot, label "Stopped. Nothing was saved."; the Stop square turns back into Send (kit ①). |
| loading | #cap-ask-steps | `steps` | The running row is the loading state: breathing dot and shimmer label. |
| empty | n/a | | There is always at least the calendar read. |
| error / failed | not drawn | `failed` | Failed read: amber ring with a bar, reason in secondary ink, "Nothing was saved." The rest of the turn stops. |
| long text | not drawn | `long` | Fact line wraps to 2 lines, then ellipsis. |
| lots of items | not drawn | `steps` | Up to 6 reads; never more than one active. |
| one item | not drawn | `steps` | One read: no fold, the row stays open. |
| offline or stale | not drawn | `failed` | As failed, reason "You're offline". |
| XXL Text Size | #cap-ask-steps-xxl | `running` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-steps-dark | `running` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-steps-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-steps | `running` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `running` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.read-pictures

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-ask-reads | `default` | As drawn. |
| state: failed | not drawn | `failed` | Not drawn. No picture; the read shows the amber failed row (ring with a bar), reason in secondary ink. |
| loading | #cap-ask-steps | `steps` | Skeleton well 74pt tall, shimmer 1.9s (static under Reduce Motion). |
| empty | not drawn | `lean` | Under 5 rounds or under 10 attempts: no picture; the fact says "Only N rounds since <date>, so this is a lean read". |
| error / failed | not drawn | `failed` | No picture; the step shows the failed row. |
| long text | not drawn | `long` | Labels ellipsize at one line; bars keep proportions. |
| lots of items | not drawn | `reads` | Drill fan shows 3 cards and "+N more". |
| one item | not drawn | `reads` | One drill: one card, no fan, no "+N more". |
| offline or stale | n/a | | Does not apply. |
| XXL Text Size | #cap-ask-reads-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-reads-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-reads-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-reads | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.intake

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-ask-intake | `default` | As drawn. |
| loading | n/a | | Card appears only after the calendar read finishes. |
| empty | not drawn | `intake` | No practice on the calendar: Length asks with no tick and no hint line. |
| error / failed | n/a | | Does not apply. |
| long text | not drawn | `long` | Chip labels wrap inside the row; a chip never truncates. |
| lots of items | not drawn | `intake` | At most 3 groups and 4 options a group. |
| one item | not drawn | `intake` | One group needed: the card has one group. |
| offline or stale | not drawn | `failed` | Build the plan disabled with "You're offline". |
| XXL Text Size | #cap-ask-intake-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-intake-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-intake-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-intake | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.intake-folded

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-ask-reads | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | not drawn | `long` | Bubble wraps; max 78% width. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ask-reads-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-reads-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-reads-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-reads | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.plan-card

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: writing | #cap-ask-writing | `writing` | As drawn. |
| state: ready | #cap-ask-card | `ready` | As drawn. |
| state: lean | not drawn | `lean` | Not drawn. Lean read (under 5 rounds): the Because is replaced by "Lean read · Only 3 rounds since Oct 1"; the block keeps its drill. |
| state: empty-bank | not drawn | `empty-bank` | Not drawn. No drill fits a block: that block reads "Nothing in your bank or the GolfHelm library fits this" with New drill (accent text button). |
| state: long | not drawn | `long` | Not drawn. Longest real title (e.g. "Pressure finish: 25 in a row from 3 feet, start over on a miss") wraps to 3 lines; time column stays 54. |
| loading | #cap-ask-writing | `writing` | Six skeleton rows, 11pt bars on the well, 8pt apart; write head moves down. |
| empty | not drawn | `empty-bank` | No drill fits: block says so and offers New drill; Save and Publish stay enabled. |
| error / failed | not drawn | `failed` | validatePlan fails: card reads "Couldn't finish the plan" with Try again; nothing saved. |
| long text | not drawn | `long` | Block titles wrap to 3 lines; time column keeps 54; strip keeps proportions. |
| lots of items | not drawn | `card` | Up to 12 blocks; strip segments under 6pt merge into neighbours' gaps (2pt). |
| one item | not drawn | `card` | One block: strip is one full segment. |
| offline or stale | not drawn | `failed` | Writing stops at the current block with the failed row. |
| XXL Text Size | #cap-ask-writing-xxl | `writing` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-writing-dark | `writing` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-writing-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-writing | `writing` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `writing` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.why

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-ask-card | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | not drawn | `lean` | "Lean read" replaces Because; routine blocks read "Routine. No claim." |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | not drawn | `long` | Because wraps; no clamp. |
| lots of items | not drawn | `card` | At most 2 source chips. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ask-card-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-card-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-card-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-card | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.evidence

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: open | #cap-ask-evidence | `open` | As drawn. |
| loading | not drawn | `evidence` | Opens from data already in the turn; no loading. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | not drawn | `long` | Sheet scrolls past 84%. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ask-evidence-xxl | `open` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-evidence-dark | `open` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-evidence-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-evidence | `open` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `open` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.refine

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-ask-card | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | not drawn | `long` | Chips wrap; never truncate. |
| lots of items | not drawn | `card` | 4 chips max, wrapping to 2 lines. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ask-card-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-card-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-card-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-card | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.block-sheet

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: open | #cap-ask-edit | `open` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Edits are local until saved. |
| long text | not drawn | `long` | Place and coach wrap; stepper stays on one line. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ask-edit-xxl | `open` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-edit-dark | `open` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-edit-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-edit | `open` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `open` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.swap

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: open | #cap-ask-swap | `open` | As drawn. |
| state: swapped | #cap-ask-swapped | `swapped` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | not drawn | `empty-bank` | No other drill fits: "Nothing else in your bank fits this gap" and New drill. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | not drawn | `swap` | 3 options max. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ask-swap-xxl | `open` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-swap-dark | `open` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-swap-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-swap | `open` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `open` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.full-plan

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-ask-full | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | not drawn | `long` | Rotation cells tighten under 340pt content width (container query). |
| lots of items | not drawn | `many` | 25 players: group columns wrap names to more lines; never shrink type. |
| one item | not drawn | `card` | One group: no group columns; every block says "Everyone". |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ask-full-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-full-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-full-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-full | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.toast

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. Drawn on tap of Save draft… in the Mac pane footer (no capture state): toast "Saved as a draft · Documents, coaches only", 14/18.2 weight 500 in card colour on ink, padding 10 14, radius 12, centred 96 above the bottom edge, one line; rises 8 and fades in 260ms, fades out 200ms after 2.2s (07 M-ASK-29). |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.save-to

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: open | #cap-ask-folders | `open` | As drawn. |
| state: new-folder | #cap-ask-newfolder | `new-folder` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | not drawn | `folders` | No folders yet: list shows Practice plans and New folder only. |
| error / failed | not drawn | `failed` | Create fails: field keeps the name; amber line under it. |
| long text | not drawn | `long` | Folder names ellipsize at one line; 60 characters max. |
| lots of items | not drawn | `folders` | Over 6 folders: list scrolls inside the card at 6 rows. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ask-folders-xxl | `open` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-folders-dark | `open` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-folders-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-folders | `open` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `open` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.saved

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: saving | #cap-ask-saving | `saving` | As drawn. |
| state: saved | #cap-ask-saved | `saved` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | not drawn | `failed` | See S-ASK.failed. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | not drawn | `failed` | Capsule returns to Save draft; "You're offline. Nothing was saved." |
| XXL Text Size | #cap-ask-saving-xxl | `saving` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-saving-dark | `saving` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-saving-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-saving | `saving` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `saving` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.failed

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. Kit ⑤: amber glyph, reason, "Nothing was saved.", Try again. The draft card stays. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | not drawn | `failed` | Amber glyph, reason, "Nothing was saved.", Try again; the draft stays (kit ⑤). |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.undone

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. Receipt animates back out (280ms) and a neutral line in secondary ink reads "Undone. Nothing was saved." (publish: "Undone. Nobody was told."). |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.cancelled

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. "Cancelled. Nothing was created." The confirm card dims to 60% and stays readable. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.publish-confirm

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-ask-confirm | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | not drawn | `long` | Faces row shows 6 and "+N"; names never wrap the row. |
| lots of items | not drawn | `many` | 25 players: "Tells 25 players and 2 coaches". |
| one item | not drawn | `card` | One player: "Tells Jonah and 2 coaches". |
| offline or stale | not drawn | `failed` | Publish disabled with "You're offline". |
| XXL Text Size | #cap-ask-confirm-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-confirm-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-confirm-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-confirm | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.published

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: publishing | #cap-ask-publishing | `publishing` | As drawn. |
| state: published | #cap-ask-published | `published` | As drawn. |
| state: told | #cap-ask-told | `told` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | not drawn | `failed` | Publish fails: amber row, "Nothing was sent.", Try again. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | not drawn | `many` | Told shows 8 faces and "+N"; Seen line lists 4 names then "and N more". |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ask-publishing-xxl | `publishing` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-publishing-dark | `publishing` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-publishing-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-publishing | `publishing` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `publishing` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASK.share-pdf

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. iOS print sheet over S-ASK.full-plan; it offers Save to Files and Share. The page prints S-DOC.print-coach. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-ASKD.*: thread column 720 wide plus the 452 pane. |

### S-ASKD.thread

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: built | #cap-desk-pane | `built` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-desk-pane-xxl | `built` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-desk-pane-dark | `built` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-desk-pane-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | n/a | | Desktop-only element; the phone uses its S-ASK / S-BLD counterpart. |
| large phone 430 | n/a | | |
| desktop 1280 | #cap-desk-pane | `built` | As drawn. |

### S-ASKD.steps

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. Same component as S-ASK.steps in the 720 thread column. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | n/a | | Desktop-only element; the phone uses its S-ASK / S-BLD counterpart. |
| large phone 430 | n/a | | |
| desktop 1280 | not drawn | `default` | Build rule: same component as phone in the 720 thread column. |

### S-ASKD.intake

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. Same card as S-ASK.intake at the thread column width, max 560. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | n/a | | Desktop-only element; the phone uses its S-ASK / S-BLD counterpart. |
| large phone 430 | n/a | | |
| desktop 1280 | not drawn | `default` | Build rule: same component as phone in the 720 thread column. |

### S-ASKD.pane

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-desk-pane | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | not drawn | `long` | Pane scrolls; header stays. |
| lots of items | not drawn | `many` | As S-ASK.full-plan. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-desk-pane-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-desk-pane-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-desk-pane-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | n/a | | Desktop-only element; the phone uses its S-ASK / S-BLD counterpart. |
| large phone 430 | n/a | | |
| desktop 1280 | #cap-desk-pane | `default` | As drawn. |

### S-ASKD.pane-v2

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-desk-v2 | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-desk-v2-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-desk-v2-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-desk-v2-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | n/a | | Desktop-only element; the phone uses its S-ASK / S-BLD counterpart. |
| large phone 430 | n/a | | |
| desktop 1280 | #cap-desk-v2 | `default` | As drawn. |

### S-ASKD.publish

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. Same card as S-ASK.publish-confirm in the thread column; the pane footer's Publish… scrolls the thread to it. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | n/a | | Desktop-only element; the phone uses its S-ASK / S-BLD counterpart. |
| large phone 430 | n/a | | |
| desktop 1280 | not drawn | `default` | Build rule: same component as phone in the 720 thread column. |

### S-DOC.sheet-coach

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-ask-full | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | not drawn | `long` | Container query under 340pt. |
| lots of items | not drawn | `many` | 25 players wrap in group columns. |
| one item | not drawn | `card` | One group: no group columns. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ask-full-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ask-full-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ask-full-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ask-full | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Pane density 452 and print density A4/Letter, same component. |

### S-DOC.sheet-player

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. S-DOC.sheet-coach with zero Why nodes, no "Coach copy" label (reads "Player copy"), and only the player's own group highlighted. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Pane density 452 and print density A4/Letter, same component. |

### S-DOC.print-coach

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. @media print of S-DOC.sheet-coach: A4/Letter, 16mm margins, stays light, no app chrome. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | not drawn | `many` | Breaks between blocks only, never inside a block; header repeats. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Pane density 452 and print density A4/Letter, same component. |

### S-DOC.print-player

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. @media print of S-DOC.sheet-player. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Pane density 452 and print density A4/Letter, same component. |

### S-DOC.list-draft

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. Documents row: file icon, plan title, "Draft · Only coaches · Thu, Nov 5" in secondary ink. Documents lane owns the row style. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Documents lane owns the empty folder state. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Pane density 452 and print density A4/Letter, same component. |

### S-DOC.list-shared

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. Documents row: plan title, "Shared with players · Thu, Nov 5". |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Pane density 452 and print density A4/Letter, same component. |

### S-FMT.empty

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-fmt-home | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-fmt-home-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-fmt-home-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-fmt-home-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-fmt-home | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Not drawn: centred 640 column in the Practice page, same cards. |

### S-FMT.upload-sheet

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: open | #cap-fmt-upload | `open` | As drawn. |
| state: picked | #cap-fmt-picked | `picked` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | not drawn | `upload-sheet` | Unsupported file: "That file can't be read. Try a PDF, photo, Word or Excel file." |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-fmt-upload-xxl | `open` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-fmt-upload-dark | `open` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-fmt-upload-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-fmt-upload | `open` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `open` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Not drawn: centred 640 column in the Practice page, same cards. |

### S-FMT.reading

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-fmt-scan | `default` | As drawn. |
| loading | #cap-fmt-scan | `reading` | The reading state is the loading state. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | not drawn | `reading` | Reading fails: amber row, "Couldn't read that file", Try another. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-fmt-scan-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-fmt-scan-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-fmt-scan-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-fmt-scan | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Not drawn: centred 640 column in the Practice page, same cards. |

### S-FMT.found

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-fmt-found | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | not drawn | `found` | No sections found: "This file has no sections I can use", Try another. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | not drawn | `found` | Over 5 sections: list grows; outlines all appear at once. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-fmt-found-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-fmt-found-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-fmt-found-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-fmt-found | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Not drawn: centred 640 column in the Practice page, same cards. |

### S-FMT.set

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-fmt-set | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-fmt-set-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-fmt-set-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-fmt-set-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-fmt-set | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Not drawn: centred 640 column in the Practice page, same cards. |

### S-FMT.see

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-fmt-see | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-fmt-see-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-fmt-see-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-fmt-see-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-fmt-see | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Not drawn: centred 640 column in the Practice page, same cards. |

### S-FMT.undone

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. "Undone. Plans use the standard layout." Format card returns to S-FMT.empty. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Not drawn: centred 640 column in the Practice page, same cards. |

### S-BLD.helper

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: empty | #cap-bld-empty | `empty` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | #cap-bld-empty | `empty` | The empty Blocks step shows the helper card as the one feature card. |
| error / failed | not drawn | `empty` | Fill fails: helper card shows the failed row and keeps Fill the draft. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-bld-empty-xxl | `empty` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-bld-empty-dark | `empty` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-bld-empty-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-bld-empty | `empty` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `empty` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-BLDD.*. |

### S-BLD.new-sheet

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: open | #cap-bld-new | `open` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-bld-new-xxl | `open` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-bld-new-dark | `open` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-bld-new-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-bld-new | `open` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `open` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-BLDD.*. |

### S-BLD.ghosts

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-bld-ghost | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | not drawn | `ghosts` | Up to 12 ghosts; Keep all stays pinned under the list. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-bld-ghost-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-bld-ghost-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-bld-ghost-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-bld-ghost | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-BLDD.*. |

### S-BLD.kept

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-bld-kept | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-bld-kept-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-bld-kept-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-bld-kept-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-bld-kept | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Mac counterpart S-BLDD.*. |

### S-BLDD.board

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: ghosts | #cap-bldd-ghost | `ghosts` | As drawn. |
| state: kept | #cap-bldd-kept | `kept` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-bldd-ghost-xxl | `ghosts` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-bldd-ghost-dark | `ghosts` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-bldd-ghost-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | n/a | | Desktop-only element; the phone uses its S-ASK / S-BLD counterpart. |
| large phone 430 | n/a | | |
| desktop 1280 | #cap-bldd-ghost | `ghosts` | As drawn. |

### S-BLDD.inspector

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-bldd-ghost | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-bldd-ghost-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-bldd-ghost-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-bldd-ghost-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | n/a | | Desktop-only element; the phone uses its S-ASK / S-BLD counterpart. |
| large phone 430 | n/a | | |
| desktop 1280 | #cap-bldd-ghost | `default` | As drawn. |

### S-PLY.notify

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-ply-banner | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ply-banner-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ply-banner-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ply-banner-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ply-banner | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Not drawn: player desktop Practice page, same cards in a 640 column. |

### S-PLY.practice

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | #cap-ply-practice | `default` | As drawn. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | not drawn | `practice` | No plan published: today's Practice home with no plan card. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | not drawn | `long` | Stop names wrap. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | #cap-ply-practice-xxl | `default` + `--xxl` | Type × 1.36; rows grow, text wraps, nothing clips (SHARED-5). |
| dark | #cap-ply-practice-dark | `default` (dark) | Dark tokens from 06; contrast pairs listed there. |
| Reduce Motion | #cap-ply-practice-rm | clip, see 07 | Travel removed; `CH_FADE_MS` (180ms) opacity crossfades (SHARED-6). |
| phone 390 | #cap-ply-practice | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Not drawn: player desktop Practice page, same cards in a 640 column. |

### S-PLY.plan

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. Push to S-DOC.sheet-player at phone density, with Share PDF in the bar. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Not drawn: player desktop Practice page, same cards in a 640 column. |

### S-PLY.docs

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| state: default | not drawn | `default` | Not drawn. Documents › Practice plans row as S-DOC.list-shared, player view. |
| loading | n/a | | Not a state of this element; the parent screen owns it. |
| empty | n/a | | Not a state of this element; the parent screen owns it. |
| error / failed | n/a | | Not a state of this element; the parent screen owns it. |
| long text | n/a | | Not a state of this element; the parent screen owns it. |
| lots of items | n/a | | Not a state of this element; the parent screen owns it. |
| one item | n/a | | Not a state of this element; the parent screen owns it. |
| offline or stale | n/a | | Not a state of this element; the parent screen owns it. |
| XXL Text Size | not drawn | `default` + `--xxl` | Same type ramp as its drawn parent; nothing clips. |
| dark | not drawn | `default` (dark) | Same tokens as its drawn parent. |
| Reduce Motion | not drawn | see 07 | Opacity crossfades only. |
| phone 390 | not drawn | `default` | 16px page edge; cards fill 358. |
| large phone 430 | not drawn | `default` at 430 | 20px edge (SHARED-7); cards fill 390; nothing else changes. |
| desktop 1280 | not drawn | | Not drawn: player desktop Practice page, same cards in a 640 column. |

## Completeness pass, 4 Nov 2026

IDs prefixed `S-ASK` (and `S-ASKD`) in this folder are this lane's capture IDs, scoped to `practice-plan/`; they are not the Ask lane's screen IDs, which live in `../ask/05-SCREENS.md`.

This lane draws CoachHelm's part of the Practice tab. The tab itself (home, builder, groups, drills, templates, plan page, print, share, player home) is N-00 v2 (`../prerequisites/N-00-practice-plan-builder.md`, older preview `../prerequisites/practice-plan-builder.preview.html`, spec `../prerequisites/PRACTICE_DESIGN_SPEC.md`), and Documents is N-10 (`../prerequisites/N-10-documents.md`). Rows above that read "Not a state of this element; the parent screen owns it." had no parent in this package; the parents are the S-PRC.* IDs below. Decisions on the drill bank, folders, renderer, publish and flags are in `02-PLAN.md` §C.1 to §C.9; data in `03-DATA-CHECKS.md`'s section of this name; criteria CP-PP-1 onward in 08.

### Build rule for every S-PRC.* screen (N-00 screens this lane does not redraw)

Build N-00's behaviour, data, routes, copy (CH-17xxx) and server actions as written. Restyle every one of them to `../DESIGN_LANGUAGE.md`, not to N-00's older preview:
1. Flat page on `--ch-grouped-bg` #F2F0E9 / #0E120F; content on card surfaces `--ch-card-bg` #FFFEFB / #191E1A, radius 16, one card style; wells `--ch-well-bg-flat` #F6F4EE / #141815.
2. Large title ("Practice", "Drills", "Plan") under the green bar `--ch-frame` #0A331F / #08150E; the bar never moves.
3. No accent left borders or stripes anywhere (N-00's lit stop uses a fill and a ring, kept); a selected or current row is a fill plus a 2pt ring.
4. Motion tokens only: press 0.97 (110ms down, 280ms release), push 462ms `--ch-ease-spring-smooth` with the 24% underlay and brightness 0.9, sheet up 462ms and down 280ms, Reduce Motion as `CH_FADE_MS` 180ms opacity. N-00's `chSpring('settle')` and `('smooth')` map to these (07's section).
5. Contrast 4.9:1 target, 4.5 floor, 3:1 for marks; 44pt hit areas; text follows Text Size (`--ch-type-scale`); page edge 16, or 20 at 414pt and up.
6. Group colours A to F from 02 §C.7 (C plum, D slate, E and F neutral), always with the letter.
7. Amber `--ch-loss` only for failures and losses; N-00's "Edits not published" in `--ch-warning-600` becomes `--ch-text-secondary` with a dot, because it is a state, not a loss.

### N-00 and N-10 screens: redrawn here, or N-00 only

| N-00 / N-10 screen (section) | Redrawn by this lane? | ID | Rule |
|---|---|---|---|
| Coach Practice home (N-00 4.1) | no | S-PRC.home, S-PRC.home-empty, S-PRC.home-first-run, S-PRC.week, S-PRC.past | build rule |
| Player Practice home (4.2) | yes, the Today card | S-PLY.practice (Today), S-PRC.ply-home (This week, Past plans, Team drills) | lane draws the card; the rest by the build rule |
| New plan sheet step 1, Pick the practice (4.3) | no | S-PRC.new-pick | build rule |
| New plan sheet step 2, Start from (4.3) | yes | S-BLD.new-sheet, plus S-PRC.copy-past and S-PRC.template-pick for the two pickers | lane adds "Ask CoachHelm" |
| Builder desktop frame, rail, board, inspector (4.4) | yes | S-BLDD.board, S-BLDD.inspector | lane draws ghosts and the CoachHelm tab; N-00's inspector fields by kind go in it |
| Step 1 Blocks: add menu, block card, length, reorder, block menu, rotation grid, places (4.5) | partly (empty Blocks with the helper) | S-BLD.helper; S-PRC.bld-blocks, .bld-add-menu, .bld-block-sheet, .bld-block-menu, .bld-delete-undo, .bld-reorder, .bld-rotation, .bld-time-sheet | build rule |
| Ribbon, mix bar, autosave, stale (4.4, 4.9, 10) | no | S-PRC.bld-ribbon, .bld-save-status, .bld-stale | build rule |
| Time-move confirm (CH-17509) | no | S-PRC.bld-move-confirm | build rule |
| Step 2 Groups (4.6) | no | S-PRC.bld-groups, .bld-split-sheet, .bld-move-player | build rule |
| Step 3 Drills and the drill sheet (4.7) | no | S-PRC.bld-drills, .drill-bank-sheet, .drill-new | build rule; one bank (02 §C.1) |
| Step 4 Review (4.8) | no | S-PRC.bld-review | build rule; body is `PracticePlanSheet` |
| Coach phone builder (4.9) | no | the S-PRC.bld-* IDs at phone width | build rule |
| Plan page, coach and player (4.10) | yes, the body | S-DOC.sheet-coach, S-DOC.sheet-player, S-PLY.plan; page chrome S-PRC.plan | lane's sheet replaces N-00's document layout (02 §C.3) |
| Publish, Republish, Take down, Seen by (4.11) | Ask's publish card only (S-ASK.publish-confirm) | S-PRC.publish-sheet, .republish-sheet, .published-toast, .takedown, .seen-sheet | build rule; deferred send (02 §C.5) |
| Now and Next, Run view, rain (4.12) | no | S-PRC.run | build rule |
| Team chat plan card (4.13) | no (default 4: plain text post) | S-PRC.chat-card | text post until the Messages lane draws the card |
| Print studio (4.14) | coach and player copies only | S-DOC.print-coach, S-DOC.print-player; S-PRC.print for the studio, range board, pocket cards, appendix | build rule |
| Share (4.15) | no | S-PRC.share-menu, S-PRC.link-gate | coach only (02 §C.7) |
| Templates gallery and starters (4.16, 4.1) | no | S-PRC.templates, S-PRC.template-menu | build rule |
| Drills tab and drill page (4.1, 4.7) | no | S-PRC.drills, S-PRC.drill | build rule |
| Groups tab and group sheet (4.1) | no | S-PRC.groups, S-PRC.group-sheet | build rule |
| Calendar Plan row and glyph (4.17) | no | S-PRC.cal-row | build rule |
| Home plan lines (0.1) | no | S-PRC.home-line | build rule |
| Deep links and their dead ends (0.2, 10) | no | S-PRC.link-states | build rule |
| Make-ups, recap, Stats (4.19, slices 6 to 9) | no | none this release | after the first release |
| N-10 library: rail, grid, rows, search, sheets, states (4.2 to 4.9) | no; N-10 owns them | none | N-10's own spec |
| N-10 practice plan card and row (4.4, 4.5, slice 4) | yes, the row | S-DOC.list-draft, S-DOC.list-shared, S-PLY.docs; S-PRC.docs-plan-card for the grid card | lane row copy; N-10's card shape |
| N-10 folder view, plan menu, Move sheet (4.3, 4.7, 4.8) | no | S-PRC.docs-folder, S-PRC.docs-plan-menu, S-PRC.docs-move | N-10's spec with Move added for plan rows (02 §C.2) |

### Where N-00 or N-10 and this lane disagree, and which wins

| Topic | N-00 / N-10 | This lane | Wins |
|---|---|---|---|
| Folders | N-10 090200 folders table; 090300 forces plans into "Practice plans"; plan rows have no Move | folder by name in `golf_documents.folder`; any coach folder; Move allowed | lane, with 090300 narrowed (Nick's call, 02 §C.2) |
| Plan renderer | N-00 4.10 type-only document | `PracticePlanSheet` with group discs | lane (default 11) |
| Drafts in Documents | N-00 files only published plans | draft row, coach-only | lane (settled call 3) |
| Notifications | N-00 sends push, bell and chat card at publish | deferred send after the 8s Undo; chat is plain text | lane (default 3, default 4) |
| CoachHelm writing plans | N-00 §1.4 cut it | Nick's 31 Oct asks put it back | lane; N-00 must be updated |
| Group colours | C ochre #8a5a0c, D plum #6a3d72 | C plum, D slate, E and F neutral | lane (settled C; D to F this pass) |
| Block delete | CH-17507 confirm | delete at once with an 8s Undo toast | lane |
| Players' share | none | player copy with Share PDF | lane, player copy only, no link or image |
| `?from=docs` back | always `folder=practice-plans` | the row's own folder | lane |
| Drill bank | `golf_team_drills` (010100) | same; Ask HM5 superseded | N-00 |
| Flag defaults | `preview: true, development: true` | off everywhere (SHARED-8) | package rule |

### Inventory additions

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-PRC.home` | screen | Practice tab (sidebar, phone strip, G P, Cmd or Ctrl 4) | N-00 preview only | `/golf/dashboard/practice` | coach | N-00 slice 1 |
| `S-PRC.home-empty` | screen state | coach, no practices this week (CH-17301) | N-00 preview only | `/golf/dashboard/practice` | coach | N-00 slice 1 |
| `S-PRC.home-first-run` | screen state | coach, no plan ever made for the team | not drawn | `/golf/dashboard/practice` | coach | N-00 slice 1 |
| `S-PRC.week` | inline strip | This week tiles on S-PRC.home and S-PRC.ply-home | N-00 preview only | `/golf/dashboard/practice` | both | N-00 slice 1 |
| `S-PRC.past` | inline list | "Past plans (12)" | N-00 preview only | `/golf/dashboard/practice` | both | N-00 slice 1 |
| `S-PRC.new-pick` | sheet step | New plan, step 1 | N-00 preview only | `?new=1` | coach | N-00 slice 1 |
| `S-PRC.copy-past` | list sheet | Start from › Copy a past practice | N-00 preview only | `?new=1&from=copy` | coach | N-00 slice 1 |
| `S-PRC.template-pick` | list sheet | Start from › Template | N-00 preview only | `?new=1&from=template` | coach | N-00 slice 1 |
| `S-PRC.bld-blocks` | screen step | builder › Blocks with blocks in it | N-00 preview only | `/practice/plan/<id>/edit` | coach | N-00 slice 1 |
| `S-PRC.bld-add-menu` | menu | "+ Add block" | N-00 preview only | same | coach | N-00 slice 1 |
| `S-PRC.bld-block-sheet` | form sheet (phone) / inspector (desktop) | tap a block card | N-00 preview only | same | coach | N-00 slice 1 |
| `S-PRC.bld-block-menu` | menu | block "…" | N-00 preview only | same | coach | N-00 slice 1 |
| `S-PRC.bld-delete-undo` | toast | Delete in the block menu | not drawn | same | coach | N-00 slice 1 with this lane's rule |
| `S-PRC.bld-reorder` | inline drag state | long press 450ms (phone), handle drag or Alt+Up/Down (desktop) | N-00 preview only | same | coach | N-00 slice 1 |
| `S-PRC.bld-rotation` | inline table | a Stations block | N-00 preview only | same | coach | N-00 slice 1 |
| `S-PRC.bld-time-sheet` | stepper (phone) / edge drag (desktop) | length of a block | N-00 preview only | same | coach | N-00 slice 1 |
| `S-PRC.bld-move-confirm` | confirm | change the practice time in the builder (CH-17509) | not drawn | same | coach | N-00 slice 3 |
| `S-PRC.bld-ribbon` | inline bar | under the step bar | N-00 preview only | same | coach | N-00 slice 1 |
| `S-PRC.bld-save-status` | inline line | autosave state in the builder header | not drawn | same | coach | N-00 slice 1 |
| `S-PRC.bld-stale` | dialog | another coach saved first (CH-17505) | not drawn | same | coach | N-00 slice 1 |
| `S-PRC.bld-groups` | screen step | builder › Groups | N-00 preview only | same | coach | N-00 slice 2 |
| `S-PRC.bld-split-sheet` | sheet | Split evenly (CH-17508) | N-00 preview only | same | coach | N-00 slice 2 |
| `S-PRC.bld-move-player` | inline drag or key | drag an avatar, or 1 to 6 | N-00 preview only | same | coach | N-00 slice 2 |
| `S-PRC.bld-drills` | screen step | builder › Drills | N-00 preview only | same | coach | N-00 slice 2 |
| `S-PRC.drill-bank-sheet` | list sheet (phone) / rail (desktop) | Add drill on a slot | N-00 preview only | same | coach | N-00 slice 2 |
| `S-PRC.drill-new` | form sheet | New drill | N-00 preview only | same, and `/practice/drills` | coach | N-00 slice 2 |
| `S-PRC.bld-review` | screen step | builder › Review | N-00 preview only | same | coach | N-00 slice 3 |
| `S-PRC.publish-sheet` | form sheet | Publish on Review or the plan page | N-00 preview only | `/practice/plan/<id>` | coach | N-00 slice 3 |
| `S-PRC.republish-sheet` | form sheet | Republish | N-00 preview only | same | coach | N-00 slice 4 |
| `S-PRC.published-toast` | toast with Undo | after Publish or Republish on the plan page | not drawn | same | coach | N-00 slice 3 with this lane's deferred send |
| `S-PRC.takedown` | confirm | plan menu › Take down (CH-17502) | N-00 preview only | same | coach | N-00 slice 3 |
| `S-PRC.plan` | screen chrome | any plan link | N-00 preview only | `/practice/plan/<id>` | both | N-00 slice 3 |
| `S-PRC.seen-sheet` | list sheet | "Seen by 9 of 11" | N-00 preview only | same | coach | N-00 slice 3 |
| `S-PRC.share-menu` | menu | Share on a published plan | N-00 preview only | same | coach | N-00 slice 5 |
| `S-PRC.link-gate` | redirect state | a shared link opened by someone not on the team | not drawn | `/practice/plan/<id>` | anyone | N-00 slice 5 |
| `S-PRC.print` | screen | Print on Review, the plan page or Documents | N-00 preview only | `/practice/print/<id>` | coach | N-00 slice 5 |
| `S-PRC.run` | screen mode | Run view during practice | N-00 preview only | `/practice/plan/<id>?run=1` | coach | N-00 slice 4 |
| `S-PRC.drills` | screen | Practice › Drills | N-00 preview only | `/practice/drills` | coach; player Team drills | N-00 slice 2 |
| `S-PRC.drill` | pushed screen | a drill row | N-00 preview only | `/practice/drills/<id>` | coach; player for a live drill | N-00 slice 2 |
| `S-PRC.groups` | screen | Practice › Groups | N-00 preview only | `/practice/groups` | coach | N-00 slice 2 |
| `S-PRC.group-sheet` | form sheet | New group, or a group card | N-00 preview only | same | coach | N-00 slice 2 |
| `S-PRC.templates` | screen | Practice › Templates | N-00 preview only | `/practice/templates` | coach | N-00 slice 1 |
| `S-PRC.template-menu` | menu | a template card's "…" (CH-17506) | N-00 preview only | same | coach | N-00 slice 1 |
| `S-PRC.ply-home` | screen | Practice tab, player | N-00 preview only | `/golf/dashboard/practice` | player | N-00 slice 1 (empty), slice 3 |
| `S-PRC.chat-card` | message row | team chat after publish | not drawn | Messages thread | both | PP5 text post; card later |
| `S-PRC.cal-row` | inline row | Calendar event sheet for a practice | N-00 preview only | `/golf/dashboard/calendar` | both | N-00 slice 3 |
| `S-PRC.home-line` | inline line | Home, next practice | N-00 preview only | `/golf/dashboard` | both | N-00 slice 3 |
| `S-PRC.link-states` | screen states | a plan link that can't open as asked | not drawn | `/practice/plan/<id>` | both | N-00 slice 3 |
| `S-PRC.docs-folder` | screen (N-10) | Documents › a folder holding plans | N-10 only | `/golf/dashboard/team-hub?tab=docs&folder=<slug>` | both | N-10 slice 4 |
| `S-PRC.docs-plan-card` | card (N-10 grid) | a plan in the Documents grid | N-10 only | same | both | N-10 slice 4 |
| `S-PRC.docs-plan-menu` | menu (N-10) | a plan row's "…" | N-10 only | same | coach | N-10 slice 4, with Move |
| `S-PRC.docs-move` | sheet (N-10) | menu › Move | N-10 only | same | coach | N-10 slice 4 |

### Rows every S-PRC.* ID takes unless its own rows below say otherwise

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| loading | not drawn | `loading` | Route `loading.tsx` skeleton: card-shaped bars on `--ch-skel-base`, shimmer 1.9s, off under Reduce Motion; the large title shows at once |
| error / failed | not drawn | `failed` | Load fails: N-00's CH-17001 family in one card with Try again; a failed save keeps the local body (CH-17901 copy) and never loses edits |
| offline or stale | not drawn | `offline` | Reads show the last loaded data with "You're offline" in the header; writes queue in `sessionStorage` (CH-17901) and retry with backoff; Publish, Take down, Delete and Share are disabled offline |
| role | not drawn | per role | Coach-only IDs redirect a player to `/golf/dashboard/practice`; a non-member gets S-PRC.link-gate; a coach removed from staff gets N-00's `practice_plan_coach_not_on_staff` on the next save |
| long text | not drawn | `long` | Names wrap to 2 lines then ellipsis; plan titles 1 to 80; place names to 40; nothing clips at XXL |
| lots of items | not drawn | `many` | Lists page 20 at a time with "Show more"; 25 players, 6 groups, 40 blocks render without jank (N-00 limits, CH-17109) |
| one item | not drawn | `one` | One plan, one block, one group, one drill: no plural copy errors ("1 player") |
| XXL Text Size | not drawn | `--xxl` | Type × 1.36; the builder collapses to the phone layout below 821pt of space; the rotation grid scrolls in its own box (N-00 7.3) |
| dark | not drawn | dark | Dark tokens; 06's section lists the pairs |
| Reduce Motion | not drawn | clip, see 07 | `CH_FADE_MS` 180ms opacity; drags drop at once; no spring moves |
| keyboard and focus | not drawn | n/a | Every control reachable by Tab with a visible ring (SHARED-4); sheets trap focus and return it; N-00's keys (Alt+Up/Down, Shift+Up/Down, 1 to 6, Space in the grid) work |
| VoiceOver | not drawn | n/a | N-00 CH-178xx announcements ("Short game rotation, now 2:30 to 3:30"); the rotation grid is a real table |
| phone 390 | not drawn | default | 16pt edge; cards 358 |
| large phone 430 | not drawn | default at 430 | 20pt edge (SHARED-7); cards 390 |
| desktop 1280 | not drawn | default at 1280 | N-00's desktop layout (home max 1200 centred; builder three panes at 821 and up) |
| flag off | n/a | flag off | `golf_practice_plans` off: every route redirects to Calendar and the tab is gone (02 §C.8) |
| pull to refresh | not drawn | n/a | Practice home, the drills list and the player home refresh on pull (the app's shell pull); the builder never pulls |
| scroll restore | not drawn | n/a | Back from a plan or drill returns to the same scroll position and tab; the builder keeps its step on reload (`?step=`) |
| haptics | not drawn | n/a | `press` on taps, `select` on stepper ticks and length snaps, `commit` on a drop, `success` on publish, `warning` on a failed write (07 section) |

### Per-ID rows: home, new plan, templates

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| S-PRC.home · default | N-00 preview only | `default` | Large title "Practice" with New plan (phone: plus in the bar's trailing slot) and Templates; This week; Up next card (the next practice's `PracticePlanSheet` cut to its schedule); Segmented links Plans · Drills · Groups · Templates; Plans: Drafts, Published, Past |
| S-PRC.home-empty | N-00 preview only | `empty` | CH-17301 "No practices this week" / "Add one on the calendar, then plan it here." with New practice; Up next card left out; Plans lists still show earlier plans |
| S-PRC.home-first-run | not drawn | `first-run` | No plan ever: one card "Plan your first practice" with three starts: Blank, a starter template, Ask CoachHelm (only with `coachhelm_practice_plans_v1` on). No empty Drafts or Published headers |
| S-PRC.week · default | N-00 preview only | `default` | Seven tiles, team-zone week; chips No plan, Draft, Published, Updated, Done; two practices on one day show two lines; phone scrolls snapped with today in view |
| S-PRC.week · no practice day | N-00 preview only | `default` | "No practice" in `--ch-text-tertiary`; tap does nothing |
| S-PRC.week · tile tap | N-00 preview only | `default` | With a plan: push to S-PRC.plan. Without: S-PRC.new-pick skipped, New plan opens on that event |
| S-PRC.week · other weeks | not drawn | `week+1` | Previous and Next week arrows; "This week" returns; a week across 1 Aug shows both seasons' plans |
| S-PRC.past · default | N-00 preview only | `default` | Collapsed "Past plans (12)"; open lists 20 at a time, newest first; each row opens the plan page read only with "Ended" |
| S-PRC.past · none | not drawn | `default` | Row left out |
| S-PRC.new-pick · default | N-00 preview only | `open` | This and next week's practices without a plan; New practice goes to Calendar's form and returns (`then=practice`) |
| S-PRC.new-pick · all-day | not drawn | `open` | Listed, disabled, CH-17110 |
| S-PRC.new-pick · none | not drawn | `open` | "No practices without a plan in the next two weeks." and New practice |
| S-PRC.new-pick · race | not drawn | `open` | Another coach created one: opens theirs with "Coach Lin already started a plan for this practice." |
| S-PRC.copy-past · default | N-00 preview only | `copy` | Past plans newest first, same series first; copy drops own-work lines and pairings; members kept only if active |
| S-PRC.copy-past · none | not drawn | `copy` | "No past plans to copy yet." and Back |
| S-PRC.template-pick · none / one / many | not drawn | `template` | None of the team's: the six starters only, with CH-17303 under "Your templates". One: one card. Many: grid, Segmented Session · Block · Week, 20 then Show more |
| S-PRC.templates · none / one / many | N-00 preview only | `default`, `empty`, `many` | As S-PRC.template-pick, as a page; From GolfHelm first |
| S-PRC.template-menu · default | N-00 preview only | `open` | Use, Duplicate, Rename, Delete (CH-17506); starters: Use and Duplicate to your templates |
| S-PRC.template-menu · rename | not drawn | `rename` | Inline field 1 to 80; Enter saves; Escape cancels; a taken name gets "A template called X exists." |

### Per-ID rows: the builder, front to back

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| S-PRC.bld-blocks · default | N-00 preview only | `blocks` | Step bar Blocks · Groups · Drills · Review (sticky); ribbon and mix bar; block cards with "+ Add block" rows between |
| S-PRC.bld-blocks · empty | #cap-bld-empty | `empty` | S-BLD.helper as drawn (with the CoachHelm flag) or N-00's empty card "No blocks yet" with Add block and Start from a template (without it) |
| S-PRC.bld-add-menu · default | N-00 preview only | `add` | Team, Stations, Course, Own work, Break, each with its one-line description; inserts at the row tapped |
| S-PRC.bld-block-sheet · default | N-00 preview only | `block` | Phone FormSheet / desktop inspector with the kind's fields (N-00 4.5); length stepper 5 to 360 in 5s |
| S-PRC.bld-block-sheet · discard | not drawn | `block-dirty` | Swipe down or Cancel with changes: "Discard changes to Short game rotation?" Discard / Keep editing. Done saves into the draft (autosave) |
| S-PRC.bld-block-menu · default | N-00 preview only | `menu` | Duplicate (inserts below, name + " 2", focus moves to it), Save as block template, Move up, Move down, Delete |
| S-PRC.bld-delete-undo · default | not drawn | `deleted` | Delete runs at once; toast "Deleted Short game rotation" with Undo for 8s; Undo puts it back at its index with its drills and grid; replaces CH-17507 (02 §C.7) |
| S-PRC.bld-delete-undo · last block | not drawn | `deleted` | Deleting the only block shows the empty step under the toast |
| S-PRC.bld-reorder · default | N-00 preview only | `drag` | Phone: long press 450ms lifts to 1.02 with the pop shadow; list auto-scrolls near the edges. Desktop: grip 24 inside the card. Times recompute from the practice start |
| S-PRC.bld-reorder · keyboard | not drawn | `drag` | Alt+Up / Alt+Down move the focused block; Move up / Move down in the block menu are the touch alternative; VoiceOver announces the new time |
| S-PRC.bld-rotation · default | N-00 preview only | `stations` | Real table; turns by start time; cells hold group chips (letter disc); fills by (g + t) mod S; spare cells "Open"; drag or Space to swap; "Reset rotation" after an edit |
| S-PRC.bld-time-sheet · default | N-00 preview only | `length` | Phone stepper "− 5 min +"; desktop bottom-edge drag snapping to 5; Shift+Up/Down; Stations change turn minutes |
| S-PRC.bld-ribbon · under | N-00 preview only | `blocks` | "2 h 45 of 3 h · 15 min open" |
| S-PRC.bld-ribbon · overrun | not drawn | `over` | Over the practice's end: CH-17106 "15 min past the end of practice (5:00 PM)." in `--ch-loss` with the over part of the bar in `--ch-loss`; a warning, Publish still allowed |
| S-PRC.bld-move-confirm · default | not drawn | `move` | Changing the practice time from the builder: CH-17509 confirm (this practice only); Move updates the event; players hear only on Republish |
| S-PRC.bld-save-status · states | not drawn | `saving`, `saved`, `offline`, `failed` | "Saving…", "Saved", "Offline · changes kept on this device" (CH-17901), "Couldn't save · Try again" after three failures (CH-17001). Saves 800ms after the last edit, with the version |
| S-PRC.bld-save-status · leave with unsaved | not drawn | `leaving` | Back while a save is pending waits for it (up to 2s); offline it leaves and keeps the body in `sessionStorage`, restored on return with "Restored your changes" |
| S-PRC.bld-stale · default | not drawn | `stale` | CH-17505 "Load latest" (phone and desktop) or "Keep mine" (desktop: reloads and re-applies the local body as a new save) |
| S-PRC.bld-groups · default | N-00 preview only | `groups` | Who's here with RSVP and arrival notes (never the class); columns A to F with letter discs; Add group up to F; inline problems (CH-17105, CH-17107, CH-17103) |
| S-PRC.bld-groups · none needed | not drawn | `groups-none` | No Stations block: "Groups are optional for this plan." and Skip |
| S-PRC.bld-split-sheet · default | N-00 preview only | `split` | Number of groups 2 to 6; Split; CH-17508 when groups have players |
| S-PRC.bld-move-player · default | N-00 preview only | `groups` | Drag an avatar, or focus it and press 1 to 6; the touch alternative is tap avatar › "Move to" menu |
| S-PRC.bld-drills · default | N-00 preview only | `drills` | A drill slot per station and Team block; Add drill filters the bank to the slot's area; CH-17108 when a drill runs past its turn |
| S-PRC.drill-bank-sheet · default | N-00 preview only | `bank` | Search, area chips; "Your drills" (`golf_team_drills`) then "GolfHelm drills" |
| S-PRC.drill-bank-sheet · no results | not drawn | `bank-none` | CH-17304 "No drills match." with New drill prefilled with the search text |
| S-PRC.drill-bank-sheet · empty bank | not drawn | `bank-empty` | "No drills in your bank yet." and New drill; GolfHelm drills still listed |
| S-PRC.drill-new · default | N-00 preview only | `new-drill` | N-00 4.7 fields; Save adds to `golf_team_drills` and to the slot, toast CH-17016 |
| S-PRC.drill-new · before 010100 | not drawn | `new-drill-off` | New drill inert: "Drill bank comes with the Practice tab"; the slot takes a GolfHelm drill only |
| S-PRC.drill-new · discard | not drawn | `new-drill-dirty` | Cancel with any field typed asks "Discard this drill?" |
| S-PRC.bld-review · default | N-00 preview only | `review` | Coach strip: problems (errors block Publish), recipient line, Print, Share (published only), Publish; the body is `PracticePlanSheet` |
| S-PRC.bld-review · errors | not drawn | `review-errors` | Publish disabled with "Fix 1 problem to publish"; each problem links to its block |

### Per-ID rows: publish, the plan page, print and share

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| S-PRC.publish-sheet · default | N-00 preview only | `publish` | Audience line "14 players and 2 coaches will be notified."; team chat switch (off with "You're not in team chat"); Publish |
| S-PRC.publish-sheet · double tap | not drawn | `publish` | Publish locks on the first press; one run per idempotency key |
| S-PRC.published-toast · default | not drawn | `published` | "Published · Told after 8s" with Undo (ring 8s, counted to the server's `release_at`); Undo inside it: "Taken back. Nobody was told." |
| S-PRC.published-toast · after | not drawn | `published` | Toast leaves; the plan page shows Seen by as opens arrive |
| S-PRC.republish-sheet · default | N-00 preview only | `republish` | What changed list; "Only affected players" (default on) and the count; wording only: "Only wording changed. No one will be notified." |
| S-PRC.takedown · default | N-00 preview only | `takedown` | CH-17502; tells each player who had it once; the chat card reads "Taken down" |
| S-PRC.plan · coach draft | N-00 preview only | `draft` | Large title the plan title; chip Draft; Edit, Publish, Print, menu (Delete CH-17501, Save as template, Copy); body `PracticePlanSheet` coach copy |
| S-PRC.plan · coach published | N-00 preview only | `published` | Chip Published; Seen by; "Edits not published" with Republish when the draft is newer; menu adds Take down |
| S-PRC.plan · player | N-00 preview only | `player` | Their copy of the sheet; their group first ("Your practice"); Share PDF (S-PLY.plan); no Edit, no Seen by |
| S-PRC.plan · from | not drawn | `from` | `?from=docs` back "Documents" to the row's folder; `?from=coachhelm&ret=` back names the source; `?from=calendar` back "Calendar" |
| S-PRC.plan · past | not drawn | `ended` | "Ended" chip; read only for players; coach keeps Copy and Print |
| S-PRC.seen-sheet · default | N-00 preview only | `seen` | Opened, then Not yet, by name, with the time opened in the team zone |
| S-PRC.share-menu · default | N-00 preview only | `share` | Copy link (CH-17018 "Link copied. Only your team can open it."), Share image (1080 × 1350 PNG of the schedule), Print; no public link |
| S-PRC.share-menu · draft | not drawn | `share` | Disabled: "Publish first to share" |
| S-PRC.link-gate · signed out | not drawn | n/a | Sign in, then back to the plan |
| S-PRC.link-gate · not on the team | not drawn | n/a | Redirect to Calendar with no plan data in the HTML (RLS returns nothing) |
| S-PRC.print · default | N-00 preview only | `print` | Coach copy (two pages, the sheet), range board (rotation only, landscape), pocket cards (two per sheet), drills appendix (ink-only diagrams), QR to the plan page; Save as PDF from the print dialog |
| S-PRC.print · draft | not drawn | `print-draft` | Prints with "Draft" in the header |
| S-PRC.run · default | N-00 preview only | `run` | Now and Next; "Rotate in 4 min"; the current stop lit with a fill and ring (no stripe); Shift (CH-17512, "Tell players" off by default) |
| S-PRC.run · rain | N-00 preview only | `rain` | Rain layout switch; "Back to main plan" before deleting a rain layout |

### Per-ID rows: library tabs, player, elsewhere and deep links

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| S-PRC.drills · default | N-00 preview only | `default` | Search, area chips, Your drills, GolfHelm drills; New drill |
| S-PRC.drills · no results | not drawn | `none` | CH-17304 and New drill with the text |
| S-PRC.drills · player | not drawn | `player` | Team drills only (drills in live versions this season), read only |
| S-PRC.drill · team / library / archived | N-00 preview only | `team`, `library`, `archived` | Team: Edit, Archive (CH-17510), "Used in 4 plans". Library: Copy to your bank. Archived: "Archived" chip and Restore |
| S-PRC.groups · none / one / many | N-00 preview only | `empty`, `one`, `many` | None: "No saved groups yet." and New group. Cards: avatars up to 8 then "+3", "8 players", "Used in 6 plans" |
| S-PRC.group-sheet · default | N-00 preview only | `open` | Name, roster checklist; Delete group (CH-17511) on edit; a taken name CH-17113 |
| S-PRC.ply-home · default | N-00 preview only | `default` | Today card (S-PLY.practice), This week (published only), Past plans, Team drills |
| S-PRC.ply-home · nothing published | N-00 preview only | `empty` | CH-17302 "Your coach hasn't published a plan for this practice yet." |
| S-PRC.ply-home · no group | not drawn | `no-group` | CH-17305: the plan as Everyone |
| S-PRC.chat-card · default | not drawn | n/a | Plain text post "Practice plan for Thursday, Nov 5 · 2:00 PM · Lakeside Golf Club" with the plan link, after the window (default 4); no second push |
| S-PRC.chat-card · deleted or taken down | not drawn | n/a | The link lands on S-PRC.link-states |
| S-PRC.cal-row · default | N-00 preview only | n/a | On a practice event: "Build plan" or "Open plan" and the glyph; hidden on other event types |
| S-PRC.home-line · default | N-00 preview only | n/a | Coach: "Thursday's plan · Draft" or "Published · Seen by 9 of 11". Player: "You start on the putting green with Group B" |
| S-PRC.link-states · cold start | not drawn | n/a | Push or bell tap with the app closed: the app opens on the plan page after the shell (CH-1402 bar first) |
| S-PRC.link-states · deleted | not drawn | n/a | Practice home with CH-17302-style copy "That plan was deleted." |
| S-PRC.link-states · taken down | not drawn | n/a | Player: "Your coach took this plan down." on Practice home |
| S-PRC.link-states · draft opened by a player | not drawn | n/a | CH-17302 |
| S-PRC.link-states · flag off | not drawn | n/a | Redirect to Calendar |
| S-PRC.docs-folder · plans in it | N-10 only | n/a | Plan rows and cards mixed with files, sorted as N-10; a folder holding only plans is still a folder |
| S-PRC.docs-folder · empty | N-10 only | n/a | Before 090200 an empty folder can't exist (its last row moved or deleted removes it); after, N-10's empty folder state |
| S-PRC.docs-plan-card · draft / published | not drawn | n/a | Draft: "Draft · Only coaches", coach only. Published: "Published · Thu, Nov 5" for both roles. Open goes to S-PRC.plan `?from=docs` |
| S-PRC.docs-plan-menu · coach | N-10 only | n/a | Open, Print, Move (added, 02 §C.2), Pin; no Rename (the title is the plan's, edited in the builder) and no Delete (delete is the plan page's CH-17501) |
| S-PRC.docs-move · default | N-10 only | n/a | Folder names with counts and New folder; moving a published plan tells no one |
| Documents vs Practice tab | n/a | n/a | One plan, two doors: Documents lists the row in its folder; the Practice tab lists the plan by date. Opening either shows the same plan page |

### Gaps closed for IDs above (their "parent screen owns it" rows)

| Row | Drawn? (anchor) | State | Rule |
|---|---|---|---|
| S-BLD.new-sheet · parent | n/a | n/a | Parent S-PRC.new-pick (step 1) and S-PRC.home; loading, error, offline and role rows from the common table |
| S-BLD.new-sheet · CoachHelm off | not drawn | `open` | `coachhelm_practice_plans_v1` off: Start from shows Blank, Template, Copy a past practice only |
| S-BLD.ghosts · stop | not drawn | `ghosts` | Stop while ghosts write: the written ghosts stay as ghosts; nothing joins the plan |
| S-BLD.ghosts · navigate away | not drawn | `ghosts` | Ghosts are client state: leaving the step or the builder drops them with no prompt; kept blocks are already in the draft |
| S-BLD.kept · undo | not drawn | `kept` | A kept block is an ordinary block: delete uses S-PRC.bld-delete-undo |
| S-BLDD.inspector · parent | n/a | n/a | Parent S-BLDD.board; the Block tab carries N-00 4.5's fields by kind; the CoachHelm tab is the lane's |
| S-BLDD.inspector · nothing selected | not drawn | `default` | "Select a block to edit it." |
| S-FMT.* · parent | n/a | n/a | Parent is Practice › Plan format (N-00 slice 1 entry); S-FMT.empty when no format is set |
| S-FMT.upload-sheet · too big or wrong type | not drawn | `failed` | Over 10 MB or not PDF, photo, Word or Excel: amber line in the sheet, nothing uploaded |
| S-FMT.reading · failed | not drawn | `failed` | "Couldn't read the file." with Try another; the uploaded Documents row stays coach-only |
| S-FMT.set · before PM1 | not drawn | `found` | "Use this format" inert: "Comes with the Practice tab" until `golf_practice_plan_formats` is applied |
| S-PLY.plan · parent | n/a | n/a | Parent S-PRC.plan (player); entry points S-PLY.notify, S-PRC.home-line, S-PRC.chat-card, Documents |
| S-PLY.docs · parent | n/a | n/a | Parent N-10's folder view (S-PRC.docs-folder) as a player: published rows only |

### Handoffs

| From | To | What passes | Rule |
|---|---|---|---|
| Ask plan card (PP3, PP4) | the same plan object | body, folder by name | `savePracticePlanDraft`; same Documents row; Save to row as S-ASK.save-to |
| Ask "Want it on the calendar?" | Calendar event confirm | (order changes) | The event confirm runs before Save when the day has no practice (02 §C.6); Ask lane to change |
| Quick chat plan card | the same plan object, then S-PRC.plan | plan id | `?from=coachhelm&ret=`; never publishes |
| Read or Team Board drill suggestion | builder drill slot or the bank | drill id and source | A suggestion opens S-PRC.drill-bank-sheet filtered to it, or "Add to bank" through `createTeamDrill`; never auto-places |
| Publish from any surface | Messages, the bell and push | plan id, audience | Deferred send after 8s; bell `event_reminder` with `data.kind` practice_plan; push type `practice_plan` (Events) to `/golf/dashboard/practice/plan/<id>` |
| Documents (N-10) | S-PRC.plan | plan id | `?from=docs`; back to the row's folder |
| Calendar Plan row | S-PRC.new-pick or S-PRC.plan | event id | `?new=1&event=<id>` skips step 1 |
| Builder | the quick chat | route | "Help with this plan" hands to S-BLD.helper |
