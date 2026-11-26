# 05. CoachHelm Ask: screen inventory

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 32 rows).

> Shared values (START_HERE): wherever this file says the Reduce Motion fade is 120ms, that is the design page's own fade. The build uses `CH_FADE_MS` from `lib/motion.ts` (180ms today, opacity only, linear), and the page behind a push moves 24% (`CH_UNDERLAY_SHIFT` 0.24). Clip checks compare against those values.

Every screen, subscreen, pushed page, sheet, menu, popover, toast and inline state Ask can put on screen. The IDs here are final: 06, 07, 08 and `capture/capture.mjs` use them, and `node capture/capture.mjs --list` prints the same registry with each ID's selectors. Where this file and `04-FIDELITY-SPEC.md` disagree, this file wins.

Design page: https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA (v12, 3 Nov). Local copy: `redesign/coachhelm-ask.html` (identical to `coachhelm-ask.html` in this folder). Every anchor below works after the artifact URL or after the local file name.

## How the design anchors work

```
#<section>?play=<key>&stage=<stage>&device=phone|desk&viewer=coach|player&theme=light|dark&rm=1&ts=xxl
```

- `section` is the heading the page scrolls to when nothing plays: `h-live` (the live phone and desktop), `h-moments` (task moments), `h-make` (everything Ask can make), `h-pieces` (the pieces board). With `play`, the page does not scroll; the run plays in the live device.
- `play` starts a scene at load: `putts`, `jonah`, `trend`, `plan` (coach); `player`, `recap`, `limit` (player); `f_event`, `f_annc`, `f_travel`, `f_board`, `f_poll`, `f_qual`, `f_lineup`, `f_task`, `f_goal`, `f_note`, `f_drill` (create flows).
- `stage` holds the run there for good: `start`, `steps` (first read row running), `reads` (steps folded), `worked` (Worked out pills), `brief` (first question), `draft` (live draft built, before its fields fill), `confirm` (fields filled, buttons live), `adding` (capsule), `receipt` (receipt in, Undo ring running), `done`. These are markers only, never holds: `brief-done`, `undone`, `cancelled`, `told` (set when the Undo window closes, just before the flow's close step), and for `f_lineup` only `lock` (the Lock card has risen) and `locked` (after a press on Lock lineup). A marker in `stage` holds nothing, so `&stage=lock` plays to the end and stops by itself on the Lock card; `locked` needs the press. Leave `stage` out to run to the end. Clicking any Play clears the hold.
- `<html data-stage>` names the last stage the main thread run reached and `<html data-flow>` the scene key (v12 renamed it from `data-play`, which made every click replay); capture waits on them. Note the end of a run sets `done` before the 8s Undo timer sets `told`.
- `ts=xxl` sets the page's `--k` to 1.36 (`ts=large` 1.18, unused here). `rm=1` turns on the page's Reduce Motion.
- Only nodes inside the thread hold: the save card and the publish sheet live in the artifact pane, so their stages are reached by stepping the clock, and the plan's calendar card is not built by the flow engine, so it has no `draft` or `confirm` hold. An anchor below with no `stage` runs through; the capture script steps its clock to the ID's DOM selector (the `wait` field of `--list`).

## How the app gets there

AK0 adds the preview `coachhelm-ask-v2` (02 §3). Capture calls it as:

```
/clubhouse-preview/coachhelm-ask-v2?id=<ID>&scene=<play>&stage=<stage>&viewer=coach|player[&answers=..][&state=<capture state>][&text=xxl]
```

It renders that stage frozen and sets `data-ch-ak-ready="1"` on `<html>` once settled; `?motion=<M-ID>` renders the start of a 07 row and plays it on the `ch-ak-play` event. Until it exists, `capture.mjs app` shoots today's Ask (`/clubhouse-preview/coachhelm-ask?state=…`, `PreviewAsk.tsx`) as the "before" for the IDs listed with a today state.

## Capture states

| Matrix row | Capture state id | What it is |
|---|---|---|
| default | `default` | Phone 390×844, default Text Size, motion on, settled |
| loading | `loading` | Loading; app fixture state |
| empty | `empty` | Nothing to show; app fixture state |
| error or failed | `failed` | A read or write failed; app fixture state |
| long text | `long` | Longest real strings: Bartholomew Featherstonehaugh-Okonkwo; "Team meeting before the Pinehurst qualifier and the Tiger Classic travel briefing"; "Clubhouse film room at the Lake Course, upstairs past the pro shop"; a 3-line note |
| lots of items | `many` | 25 players, 40 rows, 8 reads |
| one item | `one` | One player, one row, one read |
| offline or stale | `stale` | Offline, or data computed before today |
| XXL Text Size | `xxl` | Text Size XXL: `ts=xxl` on the page (--k 1.36), `--ch-type-scale` 1.353 in the app |
| dark | `__dark` file | Not a state: every shot is written light and dark |
| Reduce Motion | `reduce` | Playwright reducedMotion reduce plus `rm=1` |
| phone 390 | `default` | Same shot as default |
| large phone 430 | `w430` | Large phone 430×932, page edge 20 |
| desktop 1280 | `desktop-1280`, `desktop` | Desktop 1280×800 (and `desktop`, 1440×900) |

## Inventory

### Shell, composer, history, tone, knows

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-ASK` | screen | CoachHelm section switcher, then the Ask segment (phone); CoachHelm in the sidebar, then Ask (desktop) | [#h-live](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK` (add, AK0) | both: player sees "Morning, Jonah", Your focus and the Ask this week meter instead of the team pulse | AK1 Answer card and steps |
| `S-ASK.player` | screen | Player signed in, CoachHelm, Ask (own switch) | [#h-live?viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player` (add, AK0) | player only | AK10a Player Ask |
| `S-ASK.scope` | inline state | Always above the thread on phone; changes when a question is sent | [#h-live?play=putts&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.scope` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.composer` | inline state | Bottom of the Ask tab, idle | [#h-live](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.composer` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.composer.typing` | inline state | Tap the composer and type | [#h-live?play=putts](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.composer.typing` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.composer.busy` | inline state | Send; the send button becomes Stop while steps run | [#h-live?play=putts&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.composer.busy` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.composer.paused` | inline state | Player Ask when the weekly allowance is out | [#h-live?play=limit&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=limit&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.composer.paused` (add, AK0) | player only | AK10b Allowance |
| `S-ASK.composer.at-menu` | menu | Type @ in the composer | [#h-pieces](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-pieces) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.composer.at-menu` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.composer.slash-menu` | menu | Type / in the composer | [#h-pieces](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-pieces) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.composer.slash-menu` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.composer.add-menu` | menu | Tap + in the composer | not drawn; parent [#h-live](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.composer.add-menu` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.history` | screen | Desktop: always in the left rail of Ask | [#h-live?device=desk](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?device=desk) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.history` (add, AK0) | coach | AK8 Tone and CoachHelm knows |
| `S-ASK.history.sheet` | sheet (74%) | Phone: tap the chat title or history button (today's drawer) | not drawn; parent [#h-live](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.history.sheet` (add, AK0) | coach | AK8 Tone and CoachHelm knows |
| `S-ASK.knows` | inline state | Desktop: bottom of the history rail | [#h-live?device=desk](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?device=desk) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.knows` (add, AK0) | coach | AK8 Tone and CoachHelm knows |
| `S-ASK.knows.edit` | sheet (90%) | Tap "Edit what it knows" | not drawn; parent [#h-live](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.knows.edit` (add, AK0) | coach | AK8 Tone and CoachHelm knows |
| `S-ASK.settings.sheet` | sheet (62%) | Phone: chat settings (tone and what it knows) | not drawn; parent [#h-live](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.settings.sheet` (add, AK0) | coach | AK8 Tone and CoachHelm knows |
| `S-ASK.tone` | inline state | History rail (desktop) or settings sheet (phone), Straight picked | [#h-pieces](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-pieces) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.tone` (add, AK0) | coach | AK8 Tone and CoachHelm knows |
| `S-ASK.tone.detailed` | inline state | Tap Detailed | [#h-pieces](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-pieces) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.tone.detailed` (add, AK0) | coach | AK8 Tone and CoachHelm knows |
| `S-ASK.tone.team-talk` | inline state | Tap Team talk | [#h-pieces](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-pieces) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.tone.team-talk` (add, AK0) | coach | AK8 Tone and CoachHelm knows |
| `S-ASK.loading` | inline state | Open Ask while the team loads | not drawn; parent [#h-live](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.loading` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=loading` | coach | AK1 Answer card and steps |
| `S-ASK.error` | inline state | The stream fails or the team can't load | not drawn; parent [#h-live](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.error` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=error` | coach | AK1 Answer card and steps |
| `S-ASK.flag-off` | screen | coachhelm_ask_v2 off: today's Ask | not drawn; parent [#h-live](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flag-off` (add, AK0); today: `/clubhouse-preview/coachhelm-ask` | coach | AK0 Plumbing |

### A turn: bubble, answer card, steps, tool cards, read chips, sources, follow-ups

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-ASK.turn.user` | inline state | Send a question | [#h-live?play=putts&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.turn.user` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.turn.answer` | inline state | The answer lands | [#h-live?play=putts&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.turn.answer` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.steps` | inline state | Steps run inside the answer card while CoachHelm reads | [#h-live?play=putts](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.steps` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.steps.folded` | inline state | The answer lands; steps fold to "4 steps · 4s" | [#h-live?play=putts&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.steps.folded` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.steps.open` | inline state | Tap the folded steps line | [#h-live?play=putts&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.steps.open` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.steps.waiting` | inline state | A turn stops at Confirm | [#h-pieces](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-pieces) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.steps.waiting` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.steps.failed` | inline state | A read fails | [#h-pieces](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-pieces) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.steps.failed` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=readfail` | coach | AK1 Answer card and steps |
| `S-ASK.steps.next` | inline state | A step announced but not started | [#h-pieces](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-pieces) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.steps.next` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.steps.stopped` | inline state | Tap Stop while steps run | not drawn; parent [#h-live?play=putts&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.steps.stopped` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.toolcard.skeleton` | inline state | A read with a visual is in flight | [#h-live?play=putts](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.toolcard.skeleton` (add, AK0) | coach | AK3 Tool cards and Follow-ups |
| `S-ASK.toolcard.putt-profile` | inline state | The putts read lands | [#h-live?play=putts](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.toolcard.putt-profile` (add, AK0) | coach | AK6 Shot reads |
| `S-ASK.toolcard.sg` | inline state | Strokes gained read lands | [#h-live?play=jonah](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=jonah) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.toolcard.sg` (add, AK0) | coach | AK3 Tool cards and Follow-ups |
| `S-ASK.toolcard.miss-pattern` | inline state | Shot read lands | [#h-live?play=jonah](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=jonah) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.toolcard.miss-pattern` (add, AK0) | coach | AK6 Shot reads |
| `S-ASK.toolcard.season` | inline state | Season compare read lands | [#h-live?play=trend](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=trend) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.toolcard.season` (add, AK0) | coach | AK7 Engine reads |
| `S-ASK.toolcard.hole-strip` | inline state | Player asks about a round | [#h-live?play=recap&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=recap&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.toolcard.hole-strip` (add, AK0) | both (drawn for the player) | AK7 Engine reads |
| `S-ASK.toolcard.ask-about` | inline state | Tap a bar or dot on a chart | [#h-live?play=putts](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.toolcard.ask-about` (add, AK0) | coach | AK3 Tool cards and Follow-ups |
| `S-ASK.toolcard.expanded` | sheet (full) | Tap the expand button on a tool card | not drawn; parent [#h-live?play=putts](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.toolcard.expanded` (add, AK0) | coach | AK3 Tool cards and Follow-ups |
| `S-ASK.readchip` | inline state | After a sentence with a figure | [#h-live?play=putts&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.readchip` (add, AK0) | coach | AK2 Read chips and Sources |
| `S-ASK.readchip.popover` | popover | Tap a read chip | [#h-live?play=putts&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.readchip.popover` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=reads` | coach | AK2 Read chips and Sources |
| `S-ASK.sources` | inline state | Under every answer | [#h-live?play=putts&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.sources` (add, AK0) | coach | AK2 Read chips and Sources |
| `S-ASK.sources.open` | inline state | Tap "4 reads" | [#h-live?play=putts&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.sources.open` (add, AK0) | coach | AK2 Read chips and Sources |
| `S-ASK.followups` | inline state | Under the answer card | [#h-live?play=putts&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.followups` (add, AK0) | coach | AK3 Tool cards and Follow-ups |
| `S-ASK.hypothesis` | inline state | An answer that suggests something to test | [#h-live?play=jonah&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=jonah&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.hypothesis` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.answer.putts` | screen | Ask "Why are we missing so many short putts lately?" | [#h-live?play=putts&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.answer.putts` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=answer` | coach | AK1 Answer card and steps |
| `S-ASK.answer.jonah` | screen | Ask "Where is Jonah losing strokes?" | [#h-live?play=jonah&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=jonah&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.answer.jonah` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.answer.trend` | screen | Ask "How are we scoring this fall compared to last fall?" | [#h-live?play=trend&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=trend&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.answer.trend` (add, AK0) | coach | AK1 Answer card and steps |

### Practice plan: brief, artifact, save, publish, then the calendar write

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-ASK.flow.plan.reads` | inline state | Ask "Build Tuesday's practice" (or /plan) | [#h-live?play=plan&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.plan.reads` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.brief.q1` | inline state | After the first read step | [#h-live?play=plan&stage=brief](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=brief) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.brief.q1` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.brief.q2` | inline state | Next on question 1 | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.brief.q2` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.brief.q3` | inline state | Next on question 2 | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.brief.q3` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.brief.q4` | inline state | Next on question 3 | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.brief.q4` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.brief.free` | inline state | Tap "Anything else?" and type | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.brief.free` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.brief.folded` | inline state | Build the plan on the last question | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.brief.folded` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.brief.skip` | inline state | Tap "Skip, just build" on any question | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.brief.skip` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.brief.change` | inline state | Tap "Change answers" on the folded brief | not drawn; parent [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.brief.change` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.flow.plan.drafting` | inline state | The brief folds; drafting steps run | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.plan.drafting` (add, AK0) | coach | AK1 Answer card and steps |
| `S-ASK.artifact.card` | inline state | The plan starts writing | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.artifact.card` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.artifact.card.saved` | inline state | After Save, back in the thread | [#h-live?play=plan&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.artifact.card.saved` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.artifact.push` | push | Phone: the plan opens as its own screen (or tap Open on the card) | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.artifact.push` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.artifact.pane` | screen | Desktop: the right pane widens to 452 beside the chat | [#h-live?play=plan&device=desk](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&device=desk) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.artifact.pane` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.artifact.versions` | inline state | Header arrows, "1 of 3" when a plan was revised | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.artifact.versions` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.artifact.why-popover` | popover | Tap a Why chip in a plan block | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.artifact.why-popover` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.artifact.edit` | toast | Desktop: tap "Edit in builder" | [#h-live?play=plan&device=desk](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&device=desk) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.artifact.edit` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.save` | sheet (docked card) | Tap "Save draft…" in the artifact footer or dock | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.save` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.save.folder-list` | menu (in place) | Tap "Save to [Practice plans ⌄]" | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.save.folder-list` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.save.new-folder` | inline state | Tap New folder in the list and type | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.save.new-folder` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.save.confirm` | inline state | New folder created, list closed, "Save to November" ready | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.save.confirm` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.save.commit` | inline state | Tap "Save to November" | [#h-live?play=plan&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.save.commit` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.save.receipt` | inline state | The plan lands in the folder | [#h-live?play=plan&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.save.receipt` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.save.told` | inline state | Undo window closes | [#h-live?play=plan&device=desk](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&device=desk) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.save.told` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.save.undone` | inline state | Tap Undo within 8s | [#h-live?play=plan&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.save.undone` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.save.cancelled` | inline state | Tap Cancel on the save card | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.save.cancelled` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.publish` | sheet (90%) | Tap "Publish…" in the artifact footer or dock | [#h-live?play=plan&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.publish` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.publish.commit` | inline state | Tap "Publish to 7 players" | [#h-live?play=plan&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.publish.commit` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.publish.receipt` | inline state | The plan fans out to 7 players and Practice plans | [#h-live?play=plan&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.publish.receipt` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.publish.told` | inline state | Undo window closes | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.publish.told` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.publish.undone` | inline state | Tap Undo within 8s | [#h-live?play=plan&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.publish.undone` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.publish.cancelled` | inline state | Tap Cancel on the publish sheet | [#h-live?play=plan&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.publish.cancelled` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.flow.plan.draft` | inline state | Before Save when the day has no practice event (fixed 4 Nov: event first, 02 completeness AK9; the page draws it after Save) | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.plan.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.flow.plan.confirm` | inline state | Every field filled | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.plan.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.flow.plan.commit` | inline state | Tap "Add to calendar" | [#h-live?play=plan&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.plan.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.flow.plan.receipt` | inline state | The event lands on Tuesday | [#h-live?play=plan&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.plan.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.flow.plan.told` | inline state | Undo window closes; invites go out | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.plan.told` (add, AK0) | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.flow.plan.undone` | inline state | Tap Undo within 8s | [#h-live?play=plan&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.plan.undone` (add, AK0) | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.flow.plan.cancelled` | inline state | Tap Cancel on the event draft | [#h-live?play=plan](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=plan) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.plan.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach | AK4 Confirm, commit, receipt, Undo |

### Task moments (design board demos of the kit)

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-ASK.moment.cal.draft` | inline state | Add a practice to the calendar | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.cal.draft` (add, AK0) | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.moment.cal.confirm` | inline state | Add a practice to the calendar | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.cal.confirm` (add, AK0) | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.moment.cal.receipt` | inline state | Add a practice to the calendar | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.cal.receipt` (add, AK0) | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.moment.cal.told` | inline state | Add a practice to the calendar | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.cal.told` (add, AK0) | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.moment.fold.draft` | inline state | Save into a new folder | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.fold.draft` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.moment.fold.confirm` | inline state | Save into a new folder | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.fold.confirm` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.moment.fold.receipt` | inline state | Save into a new folder | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.fold.receipt` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.moment.fold.told` | inline state | Save into a new folder | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.fold.told` (add, AK0) | coach | AK9 Practice brief and Save to folder |
| `S-ASK.moment.focus.draft` | inline state | Set a focus area | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.focus.draft` (add, AK0) | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.moment.focus.confirm` | inline state | Set a focus area | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.focus.confirm` (add, AK0) | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.moment.focus.receipt` | inline state | Set a focus area | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.focus.receipt` (add, AK0) | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.moment.focus.told` | inline state | Set a focus area | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.focus.told` (add, AK0) | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.moment.pub.draft` | inline state | Publish a plan to players | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.pub.draft` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.moment.pub.confirm` | inline state | Publish a plan to players | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.pub.confirm` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.moment.pub.receipt` | inline state | Publish a plan to players | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.pub.receipt` (add, AK0) | coach | AK5 Artifacts |
| `S-ASK.moment.pub.told` | inline state | Publish a plan to players | [#h-moments](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-moments) (board card) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.moment.pub.told` (add, AK0) | coach | AK5 Artifacts |

### Shared kit states the page does not draw

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-ASK.kit.failed` | inline state | The write fails after the confirm press | not drawn; parent [#h-live?play=f_event&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=f_event&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.kit.failed` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receiptfailed` | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.kit.partial` | inline state | Part of a multi-row write fails | not drawn; parent [#h-live?play=f_event&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=f_event&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.kit.partial` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=partial` | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.kit.reloaded` | inline state | Reload after the Undo window: the durable receipt | not drawn; parent [#h-live?play=f_event&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=f_event&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.kit.reloaded` (add, AK0) | coach | AK4 Confirm, commit, receipt, Undo |

### Create flows

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-ASK.flow.f_event.reads` | inline state | Ask in words (or from / or a follow-up chip); steps run | [#h-make?play=f_event&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.reads` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=working` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_event.worked` | inline state | Reads done; the Worked out pills pop in | [#h-make?play=f_event&stage=worked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=worked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.worked` (add, AK0) | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_event.brief` | inline state | Only what Ask could not work out, question 1 | [#h-make?play=f_event&stage=brief](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=brief) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.brief` (add, AK0) | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_event.brief-2` | inline state | Next | [#h-make?play=f_event](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.brief-2` (add, AK0) | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_event.folded` | inline state | Last Next; answers fold to pills | [#h-make?play=f_event](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.folded` (add, AK0) | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_event.draft` | inline state | The live draft is built; its fields are about to fill | [#h-make?play=f_event&stage=draft](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=draft) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_event.confirm` | inline state | Every field filled; "On confirm:" line and buttons | [#h-make?play=f_event&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_event.commit` | inline state | Tap the primary button | [#h-make?play=f_event&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_event.receipt` | inline state | The draft lands in its home; Undo runs 8s | [#h-make?play=f_event&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_event.told` | inline state | Undo window closes; players told | [#h-make?play=f_event](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.told` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_event.undone` | inline state | Tap Undo within 8s | [#h-make?play=f_event&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.undone` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_event.cancelled` | inline state | Tap Cancel on the draft | [#h-make?play=f_event](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach only | AK11a Create engine |
| `S-ASK.flow.f_event.confirm.seniors` | inline state | In the brief pick "Seniors only" | [#h-make?play=f_event&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.confirm.seniors` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_event.told.seniors` | inline state | In the brief pick "Seniors only", then wait for Undo to close | [#h-make?play=f_event](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.told.seniors` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_annc.reads` | inline state | Ask in words (or from / or a follow-up chip); steps run | [#h-make?play=f_annc&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.reads` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=working` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_annc.worked` | inline state | Reads done; the Worked out pills pop in | [#h-make?play=f_annc&stage=worked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc&stage=worked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.worked` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_annc.brief` | inline state | Only what Ask could not work out, question 1 | [#h-make?play=f_annc&stage=brief](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc&stage=brief) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.brief` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_annc.brief-2` | inline state | Next | [#h-make?play=f_annc](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.brief-2` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_annc.folded` | inline state | Last Next; answers fold to pills | [#h-make?play=f_annc](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.folded` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_annc.draft` | inline state | The live draft is built; its fields are about to fill | [#h-make?play=f_annc&stage=draft](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc&stage=draft) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_annc.confirm` | inline state | Every field filled; "On confirm:" line and buttons | [#h-make?play=f_annc&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_annc.commit` | inline state | Tap the primary button | [#h-make?play=f_annc&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_annc.receipt` | inline state | The draft lands in its home; Undo runs 8s | [#h-make?play=f_annc&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_annc.told` | inline state | Undo window closes; players told | [#h-make?play=f_annc](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.told` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_annc.undone` | inline state | Tap Undo within 8s | [#h-make?play=f_annc&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.undone` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_annc.cancelled` | inline state | Tap Cancel on the draft | [#h-make?play=f_annc](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach only | AK11b More creates |
| `S-ASK.flow.f_annc.confirm.urgent` | inline state | In the brief pick "Urgent" | [#h-make?play=f_annc&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.confirm.urgent` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_annc.confirm.no-got-it` | inline state | In the brief pick "No" | [#h-make?play=f_annc&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.confirm.no-got-it` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_annc.told.no-got-it` | inline state | In the brief pick "No", then wait for Undo to close | [#h-make?play=f_annc](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_annc) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.told.no-got-it` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_travel.reads` | inline state | Ask in words (or from / or a follow-up chip); steps run | [#h-make?play=f_travel&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.reads` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=working` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_travel.worked` | inline state | Reads done; the Worked out pills pop in | [#h-make?play=f_travel&stage=worked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel&stage=worked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.worked` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_travel.brief` | inline state | Only what Ask could not work out, question 1 | [#h-make?play=f_travel&stage=brief](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel&stage=brief) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.brief` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_travel.brief-2` | inline state | Next | [#h-make?play=f_travel](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.brief-2` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_travel.brief-3` | inline state | Next | [#h-make?play=f_travel](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.brief-3` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_travel.folded` | inline state | Last Next; answers fold to pills | [#h-make?play=f_travel](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.folded` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_travel.draft` | inline state | The live draft is built; its fields are about to fill | [#h-make?play=f_travel&stage=draft](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel&stage=draft) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_travel.confirm` | inline state | Every field filled; "On confirm:" line and buttons | [#h-make?play=f_travel&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_travel.commit` | inline state | Tap the primary button | [#h-make?play=f_travel&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_travel.receipt` | inline state | The draft lands in its home; Undo runs 8s | [#h-make?play=f_travel&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_travel.told` | inline state | Undo window closes; players told | [#h-make?play=f_travel](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.told` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_travel.undone` | inline state | Tap Undo within 8s | [#h-make?play=f_travel&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.undone` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_travel.cancelled` | inline state | Tap Cancel on the draft | [#h-make?play=f_travel](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach only | AK11b More creates |
| `S-ASK.flow.f_travel.confirm.fly` | inline state | In the brief pick "Fly" | [#h-make?play=f_travel&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.confirm.fly` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_travel.confirm.rooms-mine` | inline state | In the brief pick "I'll set them" | [#h-make?play=f_travel&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.confirm.rooms-mine` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_travel.confirm.by-tee-time` | inline state | In the brief pick "By tee time" | [#h-make?play=f_travel&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_travel&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.confirm.by-tee-time` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_board.reads` | inline state | Ask in words (or from / or a follow-up chip); steps run | [#h-make?play=f_board&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.reads` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=working` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_board.worked` | inline state | Reads done; the Worked out pills pop in | [#h-make?play=f_board&stage=worked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board&stage=worked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.worked` (add, AK0) | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_board.brief` | inline state | Only what Ask could not work out, question 1 | [#h-make?play=f_board&stage=brief](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board&stage=brief) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.brief` (add, AK0) | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_board.brief-2` | inline state | Next | [#h-make?play=f_board](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.brief-2` (add, AK0) | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_board.brief-free` | inline state | Tap the free line and type | [#h-make?play=f_board](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.brief-free` (add, AK0) | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_board.folded` | inline state | Last Next; answers fold to pills | [#h-make?play=f_board](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.folded` (add, AK0) | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_board.draft` | inline state | The live draft is built; its fields are about to fill | [#h-make?play=f_board&stage=draft](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board&stage=draft) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_board.confirm` | inline state | Every field filled; "On confirm:" line and buttons | [#h-make?play=f_board&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_board.commit` | inline state | Tap the primary button | [#h-make?play=f_board&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_board.receipt` | inline state | The draft lands in its home; Undo runs 8s | [#h-make?play=f_board&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_board.told` | inline state | Undo window closes; players told | [#h-make?play=f_board](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.told` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_board.undone` | inline state | Tap Undo within 8s | [#h-make?play=f_board&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.undone` (add, AK0) | coach only | AK11c Board and poll |
| `S-ASK.flow.f_board.cancelled` | inline state | Tap Cancel on the draft | [#h-make?play=f_board](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach only | AK11c Board and poll |
| `S-ASK.flow.f_board.confirm.no-note` | inline state | In the brief pick "No note" | [#h-make?play=f_board&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.confirm.no-note` (add, AK0) | coach only | AK11c Board and poll |
| `S-ASK.flow.f_board.confirm.four-tiles` | inline state | In the brief pick "Strokes gained", "Miss pattern 125 to 150", "This fall against last", "Tuesday's drill" | [#h-make?play=f_board&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_board&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.confirm.four-tiles` (add, AK0) | coach only | AK11c Board and poll |
| `S-ASK.flow.f_poll.reads` | inline state | Ask in words (or from / or a follow-up chip); steps run | [#h-make?play=f_poll&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.reads` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=working` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_poll.worked` | inline state | Reads done; the Worked out pills pop in | [#h-make?play=f_poll&stage=worked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll&stage=worked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.worked` (add, AK0) | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_poll.brief` | inline state | Only what Ask could not work out, question 1 | [#h-make?play=f_poll&stage=brief](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll&stage=brief) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.brief` (add, AK0) | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_poll.brief-2` | inline state | Next | [#h-make?play=f_poll](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.brief-2` (add, AK0) | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_poll.folded` | inline state | Last Next; answers fold to pills | [#h-make?play=f_poll](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.folded` (add, AK0) | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_poll.draft` | inline state | The live draft is built; its fields are about to fill | [#h-make?play=f_poll&stage=draft](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll&stage=draft) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_poll.confirm` | inline state | Every field filled; "On confirm:" line and buttons | [#h-make?play=f_poll&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_poll.commit` | inline state | Tap the primary button | [#h-make?play=f_poll&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_poll.receipt` | inline state | The draft lands in its home; Undo runs 8s | [#h-make?play=f_poll&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_poll.told` | inline state | Undo window closes; players told | [#h-make?play=f_poll](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.told` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11c Board and poll |
| `S-ASK.flow.f_poll.undone` | inline state | Tap Undo within 8s | [#h-make?play=f_poll&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.undone` (add, AK0) | coach only | AK11c Board and poll |
| `S-ASK.flow.f_poll.cancelled` | inline state | Tap Cancel on the draft | [#h-make?play=f_poll](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach only | AK11c Board and poll |
| `S-ASK.flow.f_poll.confirm.leave-open` | inline state | In the brief pick "Leave it open" | [#h-make?play=f_poll&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.confirm.leave-open` (add, AK0) | coach only | AK11c Board and poll |
| `S-ASK.flow.f_poll.confirm.four-nights` | inline state | In the brief pick "Mon Nov 2", "Wed Nov 4", "Thu Nov 5", "Sat Nov 7" | [#h-make?play=f_poll&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_poll&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.confirm.four-nights` (add, AK0) | coach only | AK11c Board and poll |
| `S-ASK.flow.f_qual.reads` | inline state | Ask in words (or from / or a follow-up chip); steps run | [#h-make?play=f_qual&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.reads` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=working` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_qual.worked` | inline state | Reads done; the Worked out pills pop in | [#h-make?play=f_qual&stage=worked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual&stage=worked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.worked` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_qual.brief` | inline state | Only what Ask could not work out, question 1 | [#h-make?play=f_qual&stage=brief](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual&stage=brief) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.brief` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_qual.folded` | inline state | Last Next; answers fold to pills | [#h-make?play=f_qual](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.folded` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_qual.draft` | inline state | The live draft is built; its fields are about to fill | [#h-make?play=f_qual&stage=draft](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual&stage=draft) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_qual.confirm` | inline state | Every field filled; "On confirm:" line and buttons | [#h-make?play=f_qual&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_qual.commit` | inline state | Tap the primary button | [#h-make?play=f_qual&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_qual.receipt` | inline state | The draft lands in its home; Undo runs 8s | [#h-make?play=f_qual&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_qual.told` | inline state | Undo window closes; players told | [#h-make?play=f_qual](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.told` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_qual.undone` | inline state | Tap Undo within 8s | [#h-make?play=f_qual&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.undone` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_qual.cancelled` | inline state | Tap Cancel on the draft | [#h-make?play=f_qual](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach only | AK11b More creates |
| `S-ASK.flow.f_qual.confirm.three-rounds` | inline state | In the brief pick "3 rounds, 54 holes" | [#h-make?play=f_qual&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.confirm.three-rounds` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_qual.confirm.one-round` | inline state | In the brief pick "1 round" | [#h-make?play=f_qual&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_qual&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.confirm.one-round` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_lineup.reads` | inline state | Ask in words (or from / or a follow-up chip); steps run | [#h-make?play=f_lineup&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.reads` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=working` | coach only (player Ask has no writes) | AK11d Lineup |
| `S-ASK.flow.f_lineup.worked` | inline state | Reads done; the Worked out pills pop in | [#h-make?play=f_lineup&stage=worked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=worked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.worked` (add, AK0) | coach only (player Ask has no writes) | AK11d Lineup |
| `S-ASK.flow.f_lineup.brief` | inline state | Only what Ask could not work out, question 1 | [#h-make?play=f_lineup&stage=brief](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=brief) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.brief` (add, AK0) | coach only (player Ask has no writes) | AK11d Lineup |
| `S-ASK.flow.f_lineup.folded` | inline state | Last Next; answers fold to pills | [#h-make?play=f_lineup](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.folded` (add, AK0) | coach only (player Ask has no writes) | AK11d Lineup |
| `S-ASK.flow.f_lineup.tie` | inline state | Seats fill; the tie for spot 5 wobbles | [#h-make?play=f_lineup](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.tie` (add, AK0) | coach only (player Ask has no writes) | AK11d Lineup |
| `S-ASK.flow.f_lineup.draft` | inline state | The live draft is built; its fields are about to fill | [#h-make?play=f_lineup&stage=draft](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=draft) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach only (player Ask has no writes) | AK11d Lineup |
| `S-ASK.flow.f_lineup.confirm` | inline state | Every field filled; "On confirm:" line and buttons | [#h-make?play=f_lineup&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach only (player Ask has no writes) | AK11d Lineup |
| `S-ASK.flow.f_lineup.commit` | inline state | Tap the primary button | [#h-make?play=f_lineup&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach only (player Ask has no writes) | AK11d Lineup |
| `S-ASK.flow.f_lineup.receipt` | inline state | The draft lands in its home; Undo runs 8s | [#h-make?play=f_lineup&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11d Lineup |
| `S-ASK.flow.f_lineup.told` | inline state | Undo window closes; players told | [#h-make?play=f_lineup](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.told` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11d Lineup |
| `S-ASK.flow.f_lineup.undone` | inline state | Tap Undo within 8s | [#h-make?play=f_lineup&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.undone` (add, AK0) | coach only | AK11d Lineup |
| `S-ASK.flow.f_lineup.cancelled` | inline state | Tap Cancel on the draft | [#h-make?play=f_lineup](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach only | AK11d Lineup |
| `S-ASK.flow.f_lineup.lock` | inline state | Undo window closes; the Lock card rises under the receipt | [#h-make?play=f_lineup&stage=lock](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=lock) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.lock` (add, AK0) | coach only | AK11d Lineup |
| `S-ASK.flow.f_lineup.locked` | inline state | Tap "Lock lineup"; each seat locks, then the no-Undo receipt | [#h-make?play=f_lineup&stage=locked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=locked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.locked` (add, AK0) | coach only | AK11d Lineup |
| `S-ASK.flow.f_lineup.not-locked` | inline state | Tap "Not yet" on the Lock card | [#h-make?play=f_lineup&stage=lock](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=lock) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.not-locked` (add, AK0) | coach only | AK11d Lineup |
| `S-ASK.flow.f_lineup.confirm.ana` | inline state | In the brief pick "Ana" | [#h-make?play=f_lineup&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.confirm.ana` (add, AK0) | coach only | AK11d Lineup |
| `S-ASK.flow.f_lineup.confirm.playoff` | inline state | In the brief pick "Play off Monday" | [#h-make?play=f_lineup&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_lineup&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.confirm.playoff` (add, AK0) | coach only | AK11d Lineup |
| `S-ASK.flow.f_task.reads` | inline state | Ask in words (or from / or a follow-up chip); steps run | [#h-make?play=f_task&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.reads` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=working` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_task.worked` | inline state | Reads done; the Worked out pills pop in | [#h-make?play=f_task&stage=worked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task&stage=worked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.worked` (add, AK0) | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_task.brief` | inline state | Only what Ask could not work out, question 1 | [#h-make?play=f_task&stage=brief](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task&stage=brief) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.brief` (add, AK0) | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_task.brief-2` | inline state | Next | [#h-make?play=f_task](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.brief-2` (add, AK0) | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_task.folded` | inline state | Last Next; answers fold to pills | [#h-make?play=f_task](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.folded` (add, AK0) | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_task.draft` | inline state | The live draft is built; its fields are about to fill | [#h-make?play=f_task&stage=draft](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task&stage=draft) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_task.confirm` | inline state | Every field filled; "On confirm:" line and buttons | [#h-make?play=f_task&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_task.commit` | inline state | Tap the primary button | [#h-make?play=f_task&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_task.receipt` | inline state | The draft lands in its home; Undo runs 8s | [#h-make?play=f_task&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_task.told` | inline state | Undo window closes; players told | [#h-make?play=f_task](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.told` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_task.undone` | inline state | Tap Undo within 8s | [#h-make?play=f_task&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.undone` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_task.cancelled` | inline state | Tap Cancel on the draft | [#h-make?play=f_task](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach only | AK11a Create engine |
| `S-ASK.flow.f_task.confirm.no-reminder` | inline state | In the brief pick "No reminder" | [#h-make?play=f_task&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.confirm.no-reminder` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_task.confirm.weekly` | inline state | In the brief pick "Every week until Hargrove" | [#h-make?play=f_task&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_task&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.confirm.weekly` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_goal.reads` | inline state | Ask in words (or from / or a follow-up chip); steps run | [#h-make?play=f_goal&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.reads` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=working` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_goal.worked` | inline state | Reads done; the Worked out pills pop in | [#h-make?play=f_goal&stage=worked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal&stage=worked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.worked` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_goal.brief` | inline state | Only what Ask could not work out, question 1 | [#h-make?play=f_goal&stage=brief](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal&stage=brief) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.brief` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_goal.brief-2` | inline state | Next | [#h-make?play=f_goal](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.brief-2` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_goal.folded` | inline state | Last Next; answers fold to pills | [#h-make?play=f_goal](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.folded` (add, AK0) | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_goal.draft` | inline state | The live draft is built; its fields are about to fill | [#h-make?play=f_goal&stage=draft](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal&stage=draft) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_goal.confirm` | inline state | Every field filled; "On confirm:" line and buttons | [#h-make?play=f_goal&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_goal.commit` | inline state | Tap the primary button | [#h-make?play=f_goal&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_goal.receipt` | inline state | The draft lands in its home; Undo runs 8s | [#h-make?play=f_goal&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_goal.told` | inline state | Undo window closes; players told | [#h-make?play=f_goal](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.told` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11b More creates |
| `S-ASK.flow.f_goal.undone` | inline state | Tap Undo within 8s | [#h-make?play=f_goal&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.undone` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_goal.cancelled` | inline state | Tap Cancel on the draft | [#h-make?play=f_goal](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach only | AK11b More creates |
| `S-ASK.flow.f_goal.confirm.just-set` | inline state | In the brief pick "Just set it" | [#h-make?play=f_goal&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.confirm.just-set` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_goal.told.just-set` | inline state | In the brief pick "Just set it", then wait for Undo to close | [#h-make?play=f_goal](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.told.just-set` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_goal.confirm.stretch` | inline state | In the brief pick "To −0.3 in 45 days" | [#h-make?play=f_goal&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_goal&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.confirm.stretch` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_note.reads` | inline state | Ask in words (or from / or a follow-up chip); steps run | [#h-make?play=f_note&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_note&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_note.reads` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=working` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_note.worked` | inline state | Reads done; the Worked out pills pop in | [#h-make?play=f_note&stage=worked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_note&stage=worked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_note.worked` (add, AK0) | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_note.draft` | inline state | The live draft is built; its fields are about to fill | [#h-make?play=f_note&stage=draft](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_note&stage=draft) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_note.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_note.confirm` | inline state | Every field filled; "On confirm:" line and buttons | [#h-make?play=f_note&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_note&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_note.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_note.commit` | inline state | Tap the primary button | [#h-make?play=f_note&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_note&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_note.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_note.receipt` | inline state | The draft lands in its home; Undo runs 8s | [#h-make?play=f_note&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_note&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_note.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_note.told` | inline state | Undo window closes; players told | [#h-make?play=f_note](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_note) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_note.told` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11a Create engine |
| `S-ASK.flow.f_note.undone` | inline state | Tap Undo within 8s | [#h-make?play=f_note&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_note&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_note.undone` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_note.cancelled` | inline state | Tap Cancel on the draft | [#h-make?play=f_note](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_note) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_note.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach only | AK11a Create engine |
| `S-ASK.flow.f_drill.reads` | inline state | Ask in words (or from / or a follow-up chip); steps run | [#h-make?play=f_drill&stage=steps](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill&stage=steps) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.reads` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=working` | coach only (player Ask has no writes) | AK11e Drill |
| `S-ASK.flow.f_drill.worked` | inline state | Reads done; the Worked out pills pop in | [#h-make?play=f_drill&stage=worked](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill&stage=worked) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.worked` (add, AK0) | coach only (player Ask has no writes) | AK11e Drill |
| `S-ASK.flow.f_drill.brief` | inline state | Only what Ask could not work out, question 1 | [#h-make?play=f_drill&stage=brief](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill&stage=brief) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.brief` (add, AK0) | coach only (player Ask has no writes) | AK11e Drill |
| `S-ASK.flow.f_drill.folded` | inline state | Last Next; answers fold to pills | [#h-make?play=f_drill](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.folded` (add, AK0) | coach only (player Ask has no writes) | AK11e Drill |
| `S-ASK.flow.f_drill.draft` | inline state | The live draft is built; its fields are about to fill | [#h-make?play=f_drill&stage=draft](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill&stage=draft) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.draft` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=staging` | coach only (player Ask has no writes) | AK11e Drill |
| `S-ASK.flow.f_drill.confirm` | inline state | Every field filled; "On confirm:" line and buttons | [#h-make?play=f_drill&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.confirm` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach only (player Ask has no writes) | AK11e Drill |
| `S-ASK.flow.f_drill.commit` | inline state | Tap the primary button | [#h-make?play=f_drill&stage=adding](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill&stage=adding) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.commit` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=confirmed` | coach only (player Ask has no writes) | AK11e Drill |
| `S-ASK.flow.f_drill.receipt` | inline state | The draft lands in its home; Undo runs 8s | [#h-make?play=f_drill&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.receipt` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11e Drill |
| `S-ASK.flow.f_drill.told` | inline state | Undo window closes; players told | [#h-make?play=f_drill](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.told` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=receipt` | coach only (player Ask has no writes) | AK11e Drill |
| `S-ASK.flow.f_drill.undone` | inline state | Tap Undo within 8s | [#h-make?play=f_drill&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.undone` (add, AK0) | coach only | AK11e Drill |
| `S-ASK.flow.f_drill.cancelled` | inline state | Tap Cancel on the draft | [#h-make?play=f_drill](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.cancelled` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=cancelled` | coach only | AK11e Drill |
| `S-ASK.flow.f_drill.confirm.coaches-only` | inline state | In the brief pick "Coaches only" | [#h-make?play=f_drill&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_drill&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.confirm.coaches-only` (add, AK0) | coach only | AK11e Drill |

### Player Ask

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-ASK.player.steps` | inline state | Player asks "Why is my approach costing me strokes?" | [#h-live?play=player&stage=steps&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=player&stage=steps&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.steps` (add, AK0) | player only | AK10a Player Ask |
| `S-ASK.player.answer` | screen | The answer lands with the coach's drill as a read-only card | [#h-live?play=player&stage=done&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=player&stage=done&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.answer` (add, AK0) | player only | AK10a Player Ask |
| `S-ASK.player.drill` | inline state | Read-only drill card inside the answer (no button) | [#h-live?play=player&stage=done&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=player&stage=done&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.drill` (add, AK0) | player only | AK10a Player Ask |
| `S-ASK.player.recap` | screen | Player asks "How did I play at Hilltop?" | [#h-live?play=recap&stage=done&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=recap&stage=done&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.recap` (add, AK0) | player only | AK10a Player Ask |
| `S-ASK.player.allowance` | inline state | Player Ask home: "Ask this week" meter | [#h-live?viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.allowance` (add, AK0) | player only | AK10b Allowance |
| `S-ASK.player.allowance-low` | inline state | Under 20% left this week | not drawn; parent [#h-live?viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.allowance-low` (add, AK0) | player only | AK10b Allowance |
| `S-ASK.player.out` | inline state | Send a question with the allowance used up | [#h-live?play=limit&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=limit&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.out` (add, AK0) | player only | AK10b Allowance |
| `S-ASK.player.request` | inline state | Tap "Request more" | [#h-live?play=limit&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=limit&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.request` (add, AK0) | player only | AK10b Allowance |
| `S-ASK.player.request.commit` | inline state | Tap "Send request" | [#h-live?play=limit&stage=adding&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=limit&stage=adding&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.request.commit` (add, AK0) | player only | AK10b Allowance |
| `S-ASK.player.request.receipt` | inline state | Request ready; Undo runs 8s | [#h-live?play=limit&stage=receipt&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=limit&stage=receipt&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.request.receipt` (add, AK0) | player only | AK10b Allowance |
| `S-ASK.player.request.told` | inline state | Undo closes; one email sent | [#h-live?play=limit&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=limit&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.request.told` (add, AK0) | player only | AK10b Allowance |
| `S-ASK.player.request.undone` | inline state | Tap Undo within 8s | [#h-live?play=limit&stage=receipt&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=limit&stage=receipt&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.request.undone` (add, AK0) | player only | AK10b Allowance |
| `S-ASK.player.request.cancelled` | inline state | Tap Cancel on the request | [#h-live?play=limit&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=limit&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.request.cancelled` (add, AK0) | player only | AK10b Allowance |

Counts: Shell 21, A turn 26, Practice plan 39, Task moments (design board demos of the kit) 16, Shared kit states the page does not draw 3, Create flows 154, Player Ask 13; 272 IDs in all, 14 of them not drawn on the page.

## Retired IDs

The page no longer draws these, so they are out of the registry, out of 06 and 07, and `capture.mjs` says so when one is asked for. Do not reuse them.

| ID | Why |
|---|---|
| `S-ASK.flow.f_annc.brief-3` | v11: the announcement asks two questions (no scheduled send) |
| `S-ASK.flow.f_annc.confirm.later` | v11: no scheduled send |
| `S-ASK.flow.f_annc.told.later` | v11: no scheduled send |
| `S-ASK.flow.f_qual.brief-2` | v12: no exempt question |
| `S-ASK.flow.f_qual.confirm.exempt` | v12: no exempt question and no tie rule |
| `S-ASK.flow.f_note.brief` | v12: the note asks nothing and is always shared |
| `S-ASK.flow.f_note.brief-free` | v12: no brief |
| `S-ASK.flow.f_note.folded` | v12: no brief |
| `S-ASK.flow.f_note.confirm.private` | v12: the note is always shared |
| `S-ASK.flow.f_note.told.private` | v12: the note is always shared |

## State matrices

One matrix per ID, in inventory order. "drawn?" gives the anchor for that state, or "not drawn" with the build rule in the last column. The capture state id is what `--state` takes; files are `screenshots/<ID>__<state>__{design,app}__{light,dark}.png`.

### S-ASK

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Greeting and composer show at once; pulse and suggestions hold three well-colour skeleton bars (pulse stops under Reduce Motion) until the team loads; no spinner. |
| empty | `#h-live` | `empty` | Drawn: the home is the empty thread. |
| error or failed | not drawn | `failed` | The team cannot load: S-ASK.error (amber glyph, "Couldn't load your team", Try again); the composer stays usable. |
| long text | probe (strings swapped in) | `long` | Greeting wraps to two lines; suggestion rows wrap; tags stay one line. |
| lots of items | not drawn | `many` | Pulse keeps three lines, suggestions keep four; extra items are not shown. |
| one item | not drawn | `one` | One player: the pulse names the player instead of counting. |
| offline or stale | not drawn | `stale` | Offline: the composer says "You're offline. Ask needs a connection." and Send is disabled; past chats still open. |
| XXL Text Size | `#h-live?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Greeting and composer show at once; pulse and suggestions hold three well-colour skeleton bars (pulse stops under Reduce Motion) until the team loads; no spinner. |
| empty | `#h-live?viewer=player` | `empty` | Drawn: the home is the empty thread. |
| error or failed | not drawn | `failed` | The team cannot load: S-ASK.error (amber glyph, "Couldn't load your team", Try again); the composer stays usable. (fixed 4 Nov: player copy is "Couldn't load your Ask"; a player never sees the word team in an error.) |
| long text | probe (strings swapped in) | `long` | Greeting wraps to two lines; suggestion rows wrap; tags stay one line. |
| lots of items | not drawn | `many` | Pulse keeps three lines, suggestions keep four; extra items are not shown. |
| one item | not drawn | `one` | One player: the pulse names the player instead of counting. (fixed 4 Nov: players have no team pulse. The player home shows Your focus and the Ask this week meter only; a player with one round sees suggestions about that round and "Ask after your next round to see a trend" in place of trend suggestions.) |
| offline or stale | not drawn | `stale` | Offline: the composer says "You're offline. Ask needs a connection." and Send is disabled; past chats still open. |
| XXL Text Size | `#h-live?viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.scope

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=steps` | `default` | As drawn (06). |
| loading | not drawn | `loading` | No loading of its own: the composer is live as soon as Ask shows. |
| empty | not drawn | `empty` | Placeholder "Ask about your team…" in tertiary ink; Send dims until there is text. |
| error or failed | not drawn | `failed` | Send fails: the bubble stays with an amber "Didn't send. Tap to retry." under it. |
| long text | probe (strings swapped in) | `long` | Typed text scrolls inside the box; the scope line ends in an ellipsis at one line. |
| lots of items | not drawn | `many` | Scope line lists the first scope and "+2". |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Offline: Send disabled with that line above the box. |
| XXL Text Size | `#h-live?play=putts&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.composer

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live` | `default` | As drawn (06). |
| loading | not drawn | `loading` | No loading of its own: the composer is live as soon as Ask shows. |
| empty | not drawn | `empty` | Placeholder "Ask about your team…" in tertiary ink; Send dims until there is text. |
| error or failed | not drawn | `failed` | Send fails: the bubble stays with an amber "Didn't send. Tap to retry." under it. |
| long text | probe (strings swapped in) | `long` | Typed text scrolls inside the box; the scope line ends in an ellipsis at one line. |
| lots of items | not drawn | `many` | Scope line lists the first scope and "+2". |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Offline: Send disabled with that line above the box. |
| XXL Text Size | `#h-live?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.composer.typing

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts` | `default` | As drawn (06). |
| loading | not drawn | `loading` | No loading of its own: the composer is live as soon as Ask shows. |
| empty | not drawn | `empty` | Placeholder "Ask about your team…" in tertiary ink; Send dims until there is text. |
| error or failed | not drawn | `failed` | Send fails: the bubble stays with an amber "Didn't send. Tap to retry." under it. |
| long text | probe (strings swapped in) | `long` | Typed text scrolls inside the box; the scope line ends in an ellipsis at one line. |
| lots of items | not drawn | `many` | Scope line lists the first scope and "+2". |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Offline: Send disabled with that line above the box. |
| XXL Text Size | `#h-live?play=putts&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.composer.busy

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=steps` | `default` | As drawn (06). |
| loading | not drawn | `loading` | No loading of its own: the composer is live as soon as Ask shows. |
| empty | not drawn | `empty` | Placeholder "Ask about your team…" in tertiary ink; Send dims until there is text. |
| error or failed | not drawn | `failed` | Send fails: the bubble stays with an amber "Didn't send. Tap to retry." under it. |
| long text | probe (strings swapped in) | `long` | Typed text scrolls inside the box; the scope line ends in an ellipsis at one line. |
| lots of items | not drawn | `many` | Scope line lists the first scope and "+2". |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Offline: Send disabled with that line above the box. |
| XXL Text Size | `#h-live?play=putts&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.composer.paused

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=limit&viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Meter track shows with no fill until the usage bucket arrives; never a number. (fixed 4 Nov: the rows here described the meter. For the composer: it shows its normal idle state until the bucket arrives and never flashes paused.) |
| empty | not drawn | `empty` | Start of the week: full meter, "Plenty left · resets Monday". (fixed 4 Nov: for the composer, not reachable; it pauses only when the bucket is out.) |
| error or failed | not drawn | `failed` | Usage read fails: the meter is hidden (never guessed); asking still works and the server enforces the cap. (fixed 4 Nov: the composer is not paused on a failed read; if the server then finds the week out, the turn returns the Out card and the composer pauses.) |
| long text | probe (strings swapped in) | `long` | Reason text wraps; the meter line stays one line. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Offline: the meter keeps its last bucket. (fixed 4 Nov: for the composer, the offline line wins over the paused line, "You're offline. Ask needs a connection."; back online it shows "Ask is paused until Monday" again.) |
| XXL Text Size | `#h-live?play=limit&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=limit&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=limit&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=limit&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=limit&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.composer.at-menu

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-pieces` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Rows come from the roster and actions already loaded; if the roster is still loading, the @ menu shows two skeleton rows. |
| empty | not drawn | `empty` | No match: one row "No players match" in secondary ink; Escape closes. |
| error or failed | not drawn | `failed` | Roster read fails: the menu shows actions only and one amber line "Couldn't load players". |
| long text | not drawn | `long` | Longest name ends in an ellipsis at one line; the class year stays whole. |
| lots of items | not drawn | `many` | 25 players: the menu scrolls inside a 6-row height; the typed text filters it. |
| one item | not drawn | `one` | One match: one row, already highlighted; Enter picks it. |
| offline or stale | not drawn | `stale` | Offline: the menu still opens from the cached roster. |
| XXL Text Size | `#h-pieces?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-pieces?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-pieces?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-pieces` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.composer.slash-menu

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-pieces` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Rows come from the roster and actions already loaded; if the roster is still loading, the @ menu shows two skeleton rows. |
| empty | not drawn | `empty` | No match: one row "No players match" in secondary ink; Escape closes. |
| error or failed | not drawn | `failed` | Roster read fails: the menu shows actions only and one amber line "Couldn't load players". |
| long text | not drawn | `long` | Longest name ends in an ellipsis at one line; the class year stays whole. |
| lots of items | not drawn | `many` | 25 players: the menu scrolls inside a 6-row height; the typed text filters it. |
| one item | not drawn | `one` | One match: one row, already highlighted; Enter picks it. |
| offline or stale | not drawn | `stale` | Offline: the menu still opens from the cached roster. |
| XXL Text Size | `#h-pieces?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-pieces?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-pieces?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-pieces` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.composer.add-menu

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. Menu above the composer in the @ menu's card style (14pt radius, 15pt rows, 44pt hit): Attach a round, Attach a file, Pick players. Escape or a tap outside closes. |
| loading | not drawn | `loading` | Rows come from the roster and actions already loaded; if the roster is still loading, the @ menu shows two skeleton rows. |
| empty | not drawn | `empty` | No match: one row "No players match" in secondary ink; Escape closes. |
| error or failed | not drawn | `failed` | Roster read fails: the menu shows actions only and one amber line "Couldn't load players". |
| long text | not drawn | `long` | Longest name ends in an ellipsis at one line; the class year stays whole. |
| lots of items | not drawn | `many` | 25 players: the menu scrolls inside a 6-row height; the typed text filters it. |
| one item | not drawn | `one` | One match: one row, already highlighted; Enter picks it. |
| offline or stale | not drawn | `stale` | Offline: the menu still opens from the cached roster. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.history

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?device=desk` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Five skeleton rows in the rail (14pt bars, well colour); New chat works at once. |
| empty | not drawn | `empty` | No chats yet: "No chats yet" in tertiary under New chat; CoachHelm knows shows "Nothing yet" and Edit. |
| error or failed | not drawn | `failed` | History fails: rail shows "Couldn't load your chats" with Try again; the current chat is unaffected. |
| long text | probe (strings swapped in) | `long` | Chat titles end in an ellipsis at one line; facts in CoachHelm knows wrap. |
| lots of items | not drawn | `many` | 40 chats: the rail scrolls, grouped Today, This week, Earlier. |
| one item | not drawn | `one` | One chat: one row under Today. |
| offline or stale | not drawn | `stale` | Offline: the cached list shows; New chat is disabled. |
| XXL Text Size | `#h-live?device=desk&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?device=desk&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?device=desk&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?device=desk` | `default` | Same shot as default; edge 16. |
| large phone 430 | desktop only | `w430` | Desktop only. |
| desktop 1280 | `#h-live?device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.history.sheet

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. Phone: today's history drawer as a 74% sheet with the rail's rows (S-ASK.history); grabber, close on drag down. |
| loading | not drawn | `loading` | Five skeleton rows in the rail (14pt bars, well colour); New chat works at once. |
| empty | not drawn | `empty` | No chats yet: "No chats yet" in tertiary under New chat; CoachHelm knows shows "Nothing yet" and Edit. |
| error or failed | not drawn | `failed` | History fails: rail shows "Couldn't load your chats" with Try again; the current chat is unaffected. |
| long text | not drawn | `long` | Chat titles end in an ellipsis at one line; facts in CoachHelm knows wrap. |
| lots of items | not drawn | `many` | 40 chats: the rail scrolls, grouped Today, This week, Earlier. |
| one item | not drawn | `one` | One chat: one row under Today. |
| offline or stale | not drawn | `stale` | Offline: the cached list shows; New chat is disabled. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.knows

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?device=desk` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Five skeleton rows in the rail (14pt bars, well colour); New chat works at once. |
| empty | not drawn | `empty` | No chats yet: "No chats yet" in tertiary under New chat; CoachHelm knows shows "Nothing yet" and Edit. |
| error or failed | not drawn | `failed` | History fails: rail shows "Couldn't load your chats" with Try again; the current chat is unaffected. |
| long text | probe (strings swapped in) | `long` | Chat titles end in an ellipsis at one line; facts in CoachHelm knows wrap. |
| lots of items | not drawn | `many` | 40 chats: the rail scrolls, grouped Today, This week, Earlier. |
| one item | not drawn | `one` | One chat: one row under Today. |
| offline or stale | not drawn | `stale` | Offline: the cached list shows; New chat is disabled. |
| XXL Text Size | `#h-live?device=desk&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?device=desk&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?device=desk&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?device=desk` | `default` | Same shot as default; edge 16. |
| large phone 430 | desktop only | `w430` | Desktop only. |
| desktop 1280 | `#h-live?device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.knows.edit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. 90% sheet: one row per fact with delete, "Add a fact" field at the bottom, Done. Coach-written only. |
| loading | not drawn | `loading` | Five skeleton rows in the rail (14pt bars, well colour); New chat works at once. |
| empty | not drawn | `empty` | No chats yet: "No chats yet" in tertiary under New chat; CoachHelm knows shows "Nothing yet" and Edit. |
| error or failed | not drawn | `failed` | History fails: rail shows "Couldn't load your chats" with Try again; the current chat is unaffected. |
| long text | not drawn | `long` | Chat titles end in an ellipsis at one line; facts in CoachHelm knows wrap. |
| lots of items | not drawn | `many` | 40 chats: the rail scrolls, grouped Today, This week, Earlier. |
| one item | not drawn | `one` | One chat: one row under Today. |
| offline or stale | not drawn | `stale` | Offline: the cached list shows; New chat is disabled. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.settings.sheet

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. Phone 62% sheet: Tone segmented (Straight, Detailed, Team talk) then CoachHelm knows list and Edit. |
| loading | not drawn | `loading` | Five skeleton rows in the rail (14pt bars, well colour); New chat works at once. |
| empty | not drawn | `empty` | No chats yet: "No chats yet" in tertiary under New chat; CoachHelm knows shows "Nothing yet" and Edit. |
| error or failed | not drawn | `failed` | History fails: rail shows "Couldn't load your chats" with Try again; the current chat is unaffected. |
| long text | not drawn | `long` | Chat titles end in an ellipsis at one line; facts in CoachHelm knows wrap. |
| lots of items | not drawn | `many` | 40 chats: the rail scrolls, grouped Today, This week, Earlier. |
| one item | not drawn | `one` | One chat: one row under Today. |
| offline or stale | not drawn | `stale` | Offline: the cached list shows; New chat is disabled. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.tone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-pieces` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Five skeleton rows in the rail (14pt bars, well colour); New chat works at once. |
| empty | not drawn | `empty` | No chats yet: "No chats yet" in tertiary under New chat; CoachHelm knows shows "Nothing yet" and Edit. |
| error or failed | not drawn | `failed` | History fails: rail shows "Couldn't load your chats" with Try again; the current chat is unaffected. |
| long text | not drawn | `long` | Chat titles end in an ellipsis at one line; facts in CoachHelm knows wrap. |
| lots of items | not drawn | `many` | 40 chats: the rail scrolls, grouped Today, This week, Earlier. |
| one item | not drawn | `one` | One chat: one row under Today. |
| offline or stale | not drawn | `stale` | Offline: the cached list shows; New chat is disabled. |
| XXL Text Size | `#h-pieces?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-pieces?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-pieces?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-pieces` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.tone.detailed

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-pieces` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Five skeleton rows in the rail (14pt bars, well colour); New chat works at once. |
| empty | not drawn | `empty` | No chats yet: "No chats yet" in tertiary under New chat; CoachHelm knows shows "Nothing yet" and Edit. |
| error or failed | not drawn | `failed` | History fails: rail shows "Couldn't load your chats" with Try again; the current chat is unaffected. |
| long text | not drawn | `long` | Chat titles end in an ellipsis at one line; facts in CoachHelm knows wrap. |
| lots of items | not drawn | `many` | 40 chats: the rail scrolls, grouped Today, This week, Earlier. |
| one item | not drawn | `one` | One chat: one row under Today. |
| offline or stale | not drawn | `stale` | Offline: the cached list shows; New chat is disabled. |
| XXL Text Size | `#h-pieces?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-pieces?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-pieces?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-pieces` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.tone.team-talk

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-pieces` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Five skeleton rows in the rail (14pt bars, well colour); New chat works at once. |
| empty | not drawn | `empty` | No chats yet: "No chats yet" in tertiary under New chat; CoachHelm knows shows "Nothing yet" and Edit. |
| error or failed | not drawn | `failed` | History fails: rail shows "Couldn't load your chats" with Try again; the current chat is unaffected. |
| long text | not drawn | `long` | Chat titles end in an ellipsis at one line; facts in CoachHelm knows wrap. |
| lots of items | not drawn | `many` | 40 chats: the rail scrolls, grouped Today, This week, Earlier. |
| one item | not drawn | `one` | One chat: one row under Today. |
| offline or stale | not drawn | `stale` | Offline: the cached list shows; New chat is disabled. |
| XXL Text Size | `#h-pieces?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-pieces?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-pieces?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-pieces` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.loading

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. As the loading row of S-ASK. |
| loading | not drawn | `loading` | Greeting and composer show at once; pulse and suggestions hold three well-colour skeleton bars (pulse stops under Reduce Motion) until the team loads; no spinner. |
| empty | not drawn | `empty` | The home is the empty thread (greeting, pulse, four suggestions). A team with no rounds keeps the greeting and shows suggestions that need no rounds. |
| error or failed | not drawn | `failed` | The team cannot load: S-ASK.error (amber glyph, "Couldn't load your team", Try again); the composer stays usable. |
| long text | not drawn | `long` | Greeting wraps to two lines; suggestion rows wrap; tags stay one line. |
| lots of items | not drawn | `many` | Pulse keeps three lines, suggestions keep four; extra items are not shown. |
| one item | not drawn | `one` | One player: the pulse names the player instead of counting. |
| offline or stale | not drawn | `stale` | Offline: the composer says "You're offline. Ask needs a connection." and Send is disabled; past chats still open. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.error

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. Thread shows one card: amber glyph, "Couldn't load your team" and Try again; composer usable. |
| loading | not drawn | `loading` | Greeting and composer show at once; pulse and suggestions hold three well-colour skeleton bars (pulse stops under Reduce Motion) until the team loads; no spinner. |
| empty | not drawn | `empty` | The home is the empty thread (greeting, pulse, four suggestions). A team with no rounds keeps the greeting and shows suggestions that need no rounds. |
| error or failed | not drawn | `failed` | The team cannot load: S-ASK.error (amber glyph, "Couldn't load your team", Try again); the composer stays usable. |
| long text | not drawn | `long` | Greeting wraps to two lines; suggestion rows wrap; tags stay one line. |
| lots of items | not drawn | `many` | Pulse keeps three lines, suggestions keep four; extra items are not shown. |
| one item | not drawn | `one` | One player: the pulse names the player instead of counting. |
| offline or stale | not drawn | `stale` | Offline: the composer says "You're offline. Ask needs a connection." and Send is disabled; past chats still open. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flag-off

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. Flag off: today's Ask at 75b4956 exactly (SHARED-8). |
| loading | not drawn | `loading` | Greeting and composer show at once; pulse and suggestions hold three well-colour skeleton bars (pulse stops under Reduce Motion) until the team loads; no spinner. |
| empty | not drawn | `empty` | The home is the empty thread (greeting, pulse, four suggestions). A team with no rounds keeps the greeting and shows suggestions that need no rounds. |
| error or failed | not drawn | `failed` | The team cannot load: S-ASK.error (amber glyph, "Couldn't load your team", Try again); the composer stays usable. |
| long text | not drawn | `long` | Greeting wraps to two lines; suggestion rows wrap; tags stay one line. |
| lots of items | not drawn | `many` | Pulse keeps three lines, suggestions keep four; extra items are not shown. |
| one item | not drawn | `one` | One player: the pulse names the player instead of counting. |
| offline or stale | not drawn | `stale` | Offline: the composer says "You're offline. Ask needs a connection." and Send is disabled; past chats still open. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.turn.user

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=steps` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the bubble shows the moment Send is pressed. |
| empty | not drawn | `empty` | Not possible: Send needs text. |
| error or failed | not drawn | `failed` | As composer: amber retry line under the bubble. |
| long text | probe (strings swapped in) | `long` | Wraps at 84% of the thread width; never truncates. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Offline: as the composer. |
| XXL Text Size | `#h-live?play=putts&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.turn.answer

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Steps carry the wait; the prose streams in word by word once the first read is back. |
| empty | not drawn | `empty` | Nothing to report: one plain sentence, no chart, no chips. |
| error or failed | not drawn | `failed` | The stream fails mid-answer: what streamed stays, then an amber line "The answer stopped. Try again." with a button. |
| long text | probe (strings swapped in) | `long` | Prose wraps; player and course names never truncate in prose. |
| lots of items | not drawn | `many` | Long answers keep one card; visuals stack inside it. |
| one item | not drawn | `one` | Single-player team: comparisons read against the player's own season, never "the team". |
| offline or stale | not drawn | `stale` | Reopened later: the answer is the saved version; reads show their Computed time. |
| XXL Text Size | `#h-live?play=putts&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.steps

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts` | `default` | As drawn (06). |
| loading | `#h-live?play=putts` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-live?play=putts&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.steps.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=done` | `default` | As drawn (06). |
| loading | `#h-live?play=putts&stage=done` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-live?play=putts&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.steps.open

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=done` | `default` | As drawn (06). |
| loading | `#h-live?play=putts&stage=done` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-live?play=putts&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.steps.waiting

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-pieces` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | not drawn | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-pieces?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-pieces?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-pieces?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-pieces` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.steps.failed

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-pieces` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | `#h-pieces` | `failed` | Drawn on the pieces board: amber ring with a bar, "Couldn't read …", Retry. |
| long text | not drawn | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-pieces?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-pieces?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-pieces?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-pieces` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.steps.next

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-pieces` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | not drawn | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-pieces?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-pieces?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-pieces?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-pieces` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.steps.stopped

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. Stop while steps run: the active row shows a dash, the list ends with "Stopped. Nothing was saved." in secondary ink; Send returns. |
| loading | not drawn | `loading` | The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | not drawn | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.toolcard.skeleton

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts` | `default` | As drawn (06). |
| loading | `#h-live?play=putts` | `loading` | Drawn: this stage is the loading state. Skeleton card in the shape of its block (S-ASK.toolcard.skeleton) until the read lands, then one 260ms crossfade. |
| empty | not drawn | `empty` | No rows for the window: no card; the answer says so in one sentence ("No putts logged in the last 30 days"). |
| error or failed | not drawn | `failed` | The read behind it fails: header stays, body says "Couldn't load this chart" with an amber glyph and Retry; no empty axes. |
| long text | probe (strings swapped in) | `long` | Title wraps to two lines; axis labels never truncate, they rotate nothing and shorten to the band name. |
| lots of items | not drawn | `many` | Bands and legs are fixed; more shots or rounds keep mark sizes and the footer count grows. |
| one item | not drawn | `one` | One round or one shot: the chart still draws its axes and the single mark; no trend line. |
| offline or stale | not drawn | `stale` | Stale read: the popover's Computed line shows the older time; no banner. |
| XXL Text Size | `#h-live?play=putts&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.toolcard.putt-profile

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Skeleton card in the shape of its block (S-ASK.toolcard.skeleton) until the read lands, then one 260ms crossfade. |
| empty | not drawn | `empty` | No rows for the window: no card; the answer says so in one sentence ("No putts logged in the last 30 days"). |
| error or failed | not drawn | `failed` | The read behind it fails: header stays, body says "Couldn't load this chart" with an amber glyph and Retry; no empty axes. |
| long text | probe (strings swapped in) | `long` | Title wraps to two lines; axis labels never truncate, they rotate nothing and shorten to the band name. |
| lots of items | not drawn | `many` | Bands and legs are fixed; more shots or rounds keep mark sizes and the footer count grows. |
| one item | not drawn | `one` | One round or one shot: the chart still draws its axes and the single mark; no trend line. |
| offline or stale | not drawn | `stale` | Stale read: the popover's Computed line shows the older time; no banner. |
| XXL Text Size | `#h-live?play=putts&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.toolcard.sg

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=jonah` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Skeleton card in the shape of its block (S-ASK.toolcard.skeleton) until the read lands, then one 260ms crossfade. |
| empty | not drawn | `empty` | No rows for the window: no card; the answer says so in one sentence ("No putts logged in the last 30 days"). |
| error or failed | not drawn | `failed` | The read behind it fails: header stays, body says "Couldn't load this chart" with an amber glyph and Retry; no empty axes. |
| long text | probe (strings swapped in) | `long` | Title wraps to two lines; axis labels never truncate, they rotate nothing and shorten to the band name. |
| lots of items | not drawn | `many` | Bands and legs are fixed; more shots or rounds keep mark sizes and the footer count grows. |
| one item | not drawn | `one` | One round or one shot: the chart still draws its axes and the single mark; no trend line. |
| offline or stale | not drawn | `stale` | Stale read: the popover's Computed line shows the older time; no banner. |
| XXL Text Size | `#h-live?play=jonah&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=jonah&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=jonah&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=jonah` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=jonah&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.toolcard.miss-pattern

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=jonah` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Skeleton card in the shape of its block (S-ASK.toolcard.skeleton) until the read lands, then one 260ms crossfade. |
| empty | not drawn | `empty` | No rows for the window: no card; the answer says so in one sentence ("No putts logged in the last 30 days"). |
| error or failed | not drawn | `failed` | The read behind it fails: header stays, body says "Couldn't load this chart" with an amber glyph and Retry; no empty axes. |
| long text | probe (strings swapped in) | `long` | Title wraps to two lines; axis labels never truncate, they rotate nothing and shorten to the band name. |
| lots of items | not drawn | `many` | Bands and legs are fixed; more shots or rounds keep mark sizes and the footer count grows. |
| one item | not drawn | `one` | One round or one shot: the chart still draws its axes and the single mark; no trend line. |
| offline or stale | not drawn | `stale` | Stale read: the popover's Computed line shows the older time; no banner. |
| XXL Text Size | `#h-live?play=jonah&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=jonah&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=jonah&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=jonah` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=jonah&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.toolcard.season

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=trend` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Skeleton card in the shape of its block (S-ASK.toolcard.skeleton) until the read lands, then one 260ms crossfade. |
| empty | not drawn | `empty` | No rows for the window: no card; the answer says so in one sentence ("No putts logged in the last 30 days"). |
| error or failed | not drawn | `failed` | The read behind it fails: header stays, body says "Couldn't load this chart" with an amber glyph and Retry; no empty axes. |
| long text | probe (strings swapped in) | `long` | Title wraps to two lines; axis labels never truncate, they rotate nothing and shorten to the band name. |
| lots of items | not drawn | `many` | Bands and legs are fixed; more shots or rounds keep mark sizes and the footer count grows. |
| one item | not drawn | `one` | One round or one shot: the chart still draws its axes and the single mark; no trend line. |
| offline or stale | not drawn | `stale` | Stale read: the popover's Computed line shows the older time; no banner. |
| XXL Text Size | `#h-live?play=trend&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=trend&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=trend&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=trend` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=trend&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.toolcard.hole-strip

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=recap&viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Skeleton card in the shape of its block (S-ASK.toolcard.skeleton) until the read lands, then one 260ms crossfade. |
| empty | not drawn | `empty` | No rows for the window: no card; the answer says so in one sentence ("No putts logged in the last 30 days"). |
| error or failed | not drawn | `failed` | The read behind it fails: header stays, body says "Couldn't load this chart" with an amber glyph and Retry; no empty axes. |
| long text | probe (strings swapped in) | `long` | Title wraps to two lines; axis labels never truncate, they rotate nothing and shorten to the band name. |
| lots of items | not drawn | `many` | Bands and legs are fixed; more shots or rounds keep mark sizes and the footer count grows. |
| one item | not drawn | `one` | One round or one shot: the chart still draws its axes and the single mark; no trend line. |
| offline or stale | not drawn | `stale` | Stale read: the popover's Computed line shows the older time; no banner. |
| XXL Text Size | `#h-live?play=recap&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=recap&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=recap&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=recap&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=recap&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.toolcard.ask-about

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Skeleton card in the shape of its block (S-ASK.toolcard.skeleton) until the read lands, then one 260ms crossfade. |
| empty | not drawn | `empty` | No rows for the window: no card; the answer says so in one sentence ("No putts logged in the last 30 days"). |
| error or failed | not drawn | `failed` | The read behind it fails: header stays, body says "Couldn't load this chart" with an amber glyph and Retry; no empty axes. |
| long text | probe (strings swapped in) | `long` | Title wraps to two lines; axis labels never truncate, they rotate nothing and shorten to the band name. |
| lots of items | not drawn | `many` | Bands and legs are fixed; more shots or rounds keep mark sizes and the footer count grows. |
| one item | not drawn | `one` | One round or one shot: the chart still draws its axes and the single mark; no trend line. |
| offline or stale | not drawn | `stale` | Stale read: the popover's Computed line shows the older time; no banner. |
| XXL Text Size | `#h-live?play=putts&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.toolcard.expanded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. Full sheet with the card at full width, the same header and footer, chart re-laid out at sheet width; close top right. |
| loading | not drawn | `loading` | Skeleton card in the shape of its block (S-ASK.toolcard.skeleton) until the read lands, then one 260ms crossfade. |
| empty | not drawn | `empty` | No rows for the window: no card; the answer says so in one sentence ("No putts logged in the last 30 days"). |
| error or failed | not drawn | `failed` | The read behind it fails: header stays, body says "Couldn't load this chart" with an amber glyph and Retry; no empty axes. |
| long text | not drawn | `long` | Title wraps to two lines; axis labels never truncate, they rotate nothing and shorten to the band name. |
| lots of items | not drawn | `many` | Bands and legs are fixed; more shots or rounds keep mark sizes and the footer count grows. |
| one item | not drawn | `one` | One round or one shot: the chart still draws its axes and the single mark; no trend line. |
| offline or stale | not drawn | `stale` | Stale read: the popover's Computed line shows the older time; no banner. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.readchip

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Chips arrive with the sentence that cites them; nothing to load. |
| empty | not drawn | `empty` | No reads cited: no chip and no Sources row. |
| error or failed | not drawn | `failed` | A source cannot open: the popover keeps window and sample and says "Couldn't open the source". |
| long text | probe (strings swapped in) | `long` | Chip label stays one line (nowrap); the popover wraps inside its 280pt width. |
| lots of items | not drawn | `many` | 12 reads: the Sources well lists all 12; the stack shows 3 marks and "12 reads". |
| one item | not drawn | `one` | One read: Sources says "1 read". |
| offline or stale | not drawn | `stale` | Stale read: the popover shows the Computed time it was read at. |
| XXL Text Size | `#h-live?play=putts&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.readchip.popover

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Chips arrive with the sentence that cites them; nothing to load. |
| empty | not drawn | `empty` | No reads cited: no chip and no Sources row. |
| error or failed | not drawn | `failed` | A source cannot open: the popover keeps window and sample and says "Couldn't open the source". |
| long text | probe (strings swapped in) | `long` | Chip label stays one line (nowrap); the popover wraps inside its 280pt width. |
| lots of items | not drawn | `many` | 12 reads: the Sources well lists all 12; the stack shows 3 marks and "12 reads". |
| one item | not drawn | `one` | One read: Sources says "1 read". |
| offline or stale | not drawn | `stale` | Stale read: the popover shows the Computed time it was read at. |
| XXL Text Size | `#h-live?play=putts&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.sources

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Chips arrive with the sentence that cites them; nothing to load. |
| empty | not drawn | `empty` | No reads cited: no chip and no Sources row. |
| error or failed | not drawn | `failed` | A source cannot open: the popover keeps window and sample and says "Couldn't open the source". |
| long text | probe (strings swapped in) | `long` | Chip label stays one line (nowrap); the popover wraps inside its 280pt width. |
| lots of items | not drawn | `many` | 12 reads: the Sources well lists all 12; the stack shows 3 marks and "12 reads". |
| one item | not drawn | `one` | One read: Sources says "1 read". |
| offline or stale | not drawn | `stale` | Stale read: the popover shows the Computed time it was read at. |
| XXL Text Size | `#h-live?play=putts&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.sources.open

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Chips arrive with the sentence that cites them; nothing to load. |
| empty | not drawn | `empty` | No reads cited: no chip and no Sources row. |
| error or failed | not drawn | `failed` | A source cannot open: the popover keeps window and sample and says "Couldn't open the source". |
| long text | probe (strings swapped in) | `long` | Chip label stays one line (nowrap); the popover wraps inside its 280pt width. |
| lots of items | not drawn | `many` | 12 reads: the Sources well lists all 12; the stack shows 3 marks and "12 reads". |
| one item | not drawn | `one` | One read: Sources says "1 read". |
| offline or stale | not drawn | `stale` | Stale read: the popover shows the Computed time it was read at. |
| XXL Text Size | `#h-live?play=putts&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.followups

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Chips appear together after the answer ends (260ms); nothing shows before. |
| empty | not drawn | `empty` | Only grounded follow-ups show; fewer than three is fine, none when nothing is grounded. |
| error or failed | not drawn | `failed` | No follow-ups after a failed answer. |
| long text | probe (strings swapped in) | `long` | A chip longer than the row wraps its text to two lines inside the pill. |
| lots of items | not drawn | `many` | Three at most. |
| one item | not drawn | `one` | One chip is fine. |
| offline or stale | not drawn | `stale` | Offline: chips show but tapping one waits for the connection. |
| XXL Text Size | `#h-live?play=putts&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.hypothesis

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=jonah&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Chips arrive with the sentence that cites them; nothing to load. |
| empty | not drawn | `empty` | No reads cited: no chip and no Sources row. |
| error or failed | not drawn | `failed` | A source cannot open: the popover keeps window and sample and says "Couldn't open the source". |
| long text | probe (strings swapped in) | `long` | Chip label stays one line (nowrap); the popover wraps inside its 280pt width. |
| lots of items | not drawn | `many` | 12 reads: the Sources well lists all 12; the stack shows 3 marks and "12 reads". |
| one item | not drawn | `one` | One read: Sources says "1 read". |
| offline or stale | not drawn | `stale` | Stale read: the popover shows the Computed time it was read at. |
| XXL Text Size | `#h-live?play=jonah&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=jonah&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=jonah&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=jonah&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=jonah&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.answer.putts

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=putts&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Steps carry the wait; the prose streams in word by word once the first read is back. |
| empty | not drawn | `empty` | Nothing to report: one plain sentence, no chart, no chips. |
| error or failed | not drawn | `failed` | The stream fails mid-answer: what streamed stays, then an amber line "The answer stopped. Try again." with a button. |
| long text | probe (strings swapped in) | `long` | Prose wraps; player and course names never truncate in prose. |
| lots of items | not drawn | `many` | Long answers keep one card; visuals stack inside it. |
| one item | not drawn | `one` | Single-player team: comparisons read against the player's own season, never "the team". |
| offline or stale | not drawn | `stale` | Reopened later: the answer is the saved version; reads show their Computed time. |
| XXL Text Size | `#h-live?play=putts&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=putts&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=putts&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=putts&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=putts&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.answer.jonah

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=jonah&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Steps carry the wait; the prose streams in word by word once the first read is back. |
| empty | not drawn | `empty` | Nothing to report: one plain sentence, no chart, no chips. |
| error or failed | not drawn | `failed` | The stream fails mid-answer: what streamed stays, then an amber line "The answer stopped. Try again." with a button. |
| long text | probe (strings swapped in) | `long` | Prose wraps; player and course names never truncate in prose. |
| lots of items | not drawn | `many` | Long answers keep one card; visuals stack inside it. |
| one item | not drawn | `one` | Single-player team: comparisons read against the player's own season, never "the team". |
| offline or stale | not drawn | `stale` | Reopened later: the answer is the saved version; reads show their Computed time. |
| XXL Text Size | `#h-live?play=jonah&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=jonah&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=jonah&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=jonah&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=jonah&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.answer.trend

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=trend&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Steps carry the wait; the prose streams in word by word once the first read is back. |
| empty | not drawn | `empty` | Nothing to report: one plain sentence, no chart, no chips. |
| error or failed | not drawn | `failed` | The stream fails mid-answer: what streamed stays, then an amber line "The answer stopped. Try again." with a button. |
| long text | probe (strings swapped in) | `long` | Prose wraps; player and course names never truncate in prose. |
| lots of items | not drawn | `many` | Long answers keep one card; visuals stack inside it. |
| one item | not drawn | `one` | Single-player team: comparisons read against the player's own season, never "the team". |
| offline or stale | not drawn | `stale` | Reopened later: the answer is the saved version; reads show their Computed time. |
| XXL Text Size | `#h-live?play=trend&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=trend&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=trend&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=trend&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=trend&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.plan.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=steps` | `default` | As drawn (06). |
| loading | `#h-live?play=plan&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-live?play=plan&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.brief.q1

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=brief` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-live?play=plan&stage=brief&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=brief&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=brief&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=brief` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=brief&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.brief.q2

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.brief.q3

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.brief.q4

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.brief.free

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.brief.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.brief.skip

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.brief.change

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn (the page button has no handler). Tap reopens the brief on question 1 with the answers kept; Build again re-runs the drafting steps. |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | not drawn | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.plan.drafting

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | `#h-live?play=plan` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.artifact.card

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | `#h-live?play=plan` | `loading` | Drawn: this stage is the loading state. Writing tile with the scan line on the card; blocks rise in as written; the header shows at once. |
| empty | not drawn | `empty` | An empty plan cannot be drafted; the brief asks first. |
| error or failed | not drawn | `failed` | Plan write fails: the card shows the kit failed row ("Couldn't draft the plan. Nothing was saved.") with Try again. |
| long text | probe (strings swapped in) | `long` | Header title ends in an ellipsis at one line; block text wraps. |
| lots of items | not drawn | `many` | 12 blocks: the plan scrolls; the timeline bar keeps one segment per block. |
| one item | not drawn | `one` | One block: the plan shows one block and a one-segment timeline. |
| offline or stale | not drawn | `stale` | Offline: the plan opens from the saved copy; Save and Publish are disabled with a line. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.artifact.card.saved

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Writing tile with the scan line on the card; blocks rise in as written; the header shows at once. |
| empty | not drawn | `empty` | An empty plan cannot be drafted; the brief asks first. |
| error or failed | not drawn | `failed` | Plan write fails: the card shows the kit failed row ("Couldn't draft the plan. Nothing was saved.") with Try again. |
| long text | probe (strings swapped in) | `long` | Header title ends in an ellipsis at one line; block text wraps. |
| lots of items | not drawn | `many` | 12 blocks: the plan scrolls; the timeline bar keeps one segment per block. |
| one item | not drawn | `one` | One block: the plan shows one block and a one-segment timeline. |
| offline or stale | not drawn | `stale` | Offline: the plan opens from the saved copy; Save and Publish are disabled with a line. |
| XXL Text Size | `#h-live?play=plan&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.artifact.push

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Writing tile with the scan line on the card; blocks rise in as written; the header shows at once. |
| empty | not drawn | `empty` | An empty plan cannot be drafted; the brief asks first. |
| error or failed | not drawn | `failed` | Plan write fails: the card shows the kit failed row ("Couldn't draft the plan. Nothing was saved.") with Try again. |
| long text | probe (strings swapped in) | `long` | Header title ends in an ellipsis at one line; block text wraps. |
| lots of items | not drawn | `many` | 12 blocks: the plan scrolls; the timeline bar keeps one segment per block. |
| one item | not drawn | `one` | One block: the plan shows one block and a one-segment timeline. |
| offline or stale | not drawn | `stale` | Offline: the plan opens from the saved copy; Save and Publish are disabled with a line. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | phone only | `desktop-1280`, `desktop` | Phone only; desktop uses S-ASK.artifact.pane. |

### S-ASK.artifact.pane

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&device=desk` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Writing tile with the scan line on the card; blocks rise in as written; the header shows at once. |
| empty | not drawn | `empty` | An empty plan cannot be drafted; the brief asks first. |
| error or failed | not drawn | `failed` | Plan write fails: the card shows the kit failed row ("Couldn't draft the plan. Nothing was saved.") with Try again. |
| long text | probe (strings swapped in) | `long` | Header title ends in an ellipsis at one line; block text wraps. |
| lots of items | not drawn | `many` | 12 blocks: the plan scrolls; the timeline bar keeps one segment per block. |
| one item | not drawn | `one` | One block: the plan shows one block and a one-segment timeline. |
| offline or stale | not drawn | `stale` | Offline: the plan opens from the saved copy; Save and Publish are disabled with a line. |
| XXL Text Size | `#h-live?play=plan&device=desk&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&device=desk&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&device=desk&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&device=desk` | `default` | Same shot as default; edge 16. |
| large phone 430 | desktop only | `w430` | Desktop only. |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.artifact.versions

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Writing tile with the scan line on the card; blocks rise in as written; the header shows at once. |
| empty | not drawn | `empty` | An empty plan cannot be drafted; the brief asks first. |
| error or failed | not drawn | `failed` | Plan write fails: the card shows the kit failed row ("Couldn't draft the plan. Nothing was saved.") with Try again. |
| long text | probe (strings swapped in) | `long` | Header title ends in an ellipsis at one line; block text wraps. |
| lots of items | not drawn | `many` | 12 blocks: the plan scrolls; the timeline bar keeps one segment per block. |
| one item | not drawn | `one` | One block: the plan shows one block and a one-segment timeline. |
| offline or stale | not drawn | `stale` | Offline: the plan opens from the saved copy; Save and Publish are disabled with a line. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.artifact.why-popover

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Writing tile with the scan line on the card; blocks rise in as written; the header shows at once. |
| empty | not drawn | `empty` | An empty plan cannot be drafted; the brief asks first. |
| error or failed | not drawn | `failed` | Plan write fails: the card shows the kit failed row ("Couldn't draft the plan. Nothing was saved.") with Try again. |
| long text | probe (strings swapped in) | `long` | Header title ends in an ellipsis at one line; block text wraps. |
| lots of items | not drawn | `many` | 12 blocks: the plan scrolls; the timeline bar keeps one segment per block. |
| one item | not drawn | `one` | One block: the plan shows one block and a one-segment timeline. |
| offline or stale | not drawn | `stale` | Offline: the plan opens from the saved copy; Save and Publish are disabled with a line. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.artifact.edit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&device=desk` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Writing tile with the scan line on the card; blocks rise in as written; the header shows at once. |
| empty | not drawn | `empty` | An empty plan cannot be drafted; the brief asks first. |
| error or failed | not drawn | `failed` | Plan write fails: the card shows the kit failed row ("Couldn't draft the plan. Nothing was saved.") with Try again. |
| long text | probe (strings swapped in) | `long` | Header title ends in an ellipsis at one line; block text wraps. |
| lots of items | not drawn | `many` | 12 blocks: the plan scrolls; the timeline bar keeps one segment per block. |
| one item | not drawn | `one` | One block: the plan shows one block and a one-segment timeline. |
| offline or stale | not drawn | `stale` | Offline: the plan opens from the saved copy; Save and Publish are disabled with a line. |
| XXL Text Size | `#h-live?play=plan&device=desk&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&device=desk&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&device=desk&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&device=desk` | `default` | Same shot as default; edge 16. |
| large phone 430 | desktop only | `w430` | Desktop only. |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.save

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Folder list is read when the card opens; until then the row shows the last folder used and the list holds two skeleton rows. |
| empty | not drawn | `empty` | No folders yet: the list shows only New folder; Save defaults to Documents. |
| error or failed | not drawn | `failed` | Folder create or save fails: name field keeps the text and an amber line under it; nothing moves. |
| long text | probe (strings swapped in) | `long` | Folder name ends in an ellipsis at one line in the row and the list; the count stays whole. |
| lots of items | not drawn | `many` | 40 folders: the list scrolls inside the card at 6 rows; New folder stays last. |
| one item | not drawn | `one` | One folder: the list shows it and New folder. |
| offline or stale | not drawn | `stale` | Offline: Save is disabled with "Reconnect to save". |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.save.folder-list

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Folder list is read when the card opens; until then the row shows the last folder used and the list holds two skeleton rows. |
| empty | not drawn | `empty` | No folders yet: the list shows only New folder; Save defaults to Documents. |
| error or failed | not drawn | `failed` | Folder create or save fails: name field keeps the text and an amber line under it; nothing moves. |
| long text | probe (strings swapped in) | `long` | Folder name ends in an ellipsis at one line in the row and the list; the count stays whole. |
| lots of items | not drawn | `many` | 40 folders: the list scrolls inside the card at 6 rows; New folder stays last. |
| one item | not drawn | `one` | One folder: the list shows it and New folder. |
| offline or stale | not drawn | `stale` | Offline: Save is disabled with "Reconnect to save". |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.save.new-folder

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Folder list is read when the card opens; until then the row shows the last folder used and the list holds two skeleton rows. |
| empty | not drawn | `empty` | No folders yet: the list shows only New folder; Save defaults to Documents. |
| error or failed | not drawn | `failed` | Folder create or save fails: name field keeps the text and an amber line under it; nothing moves. |
| long text | probe (strings swapped in) | `long` | Folder name ends in an ellipsis at one line in the row and the list; the count stays whole. |
| lots of items | not drawn | `many` | 40 folders: the list scrolls inside the card at 6 rows; New folder stays last. |
| one item | not drawn | `one` | One folder: the list shows it and New folder. |
| offline or stale | not drawn | `stale` | Offline: Save is disabled with "Reconnect to save". |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.save.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.save.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=adding` | `default` | As drawn (06). |
| loading | `#h-live?play=plan&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-live?play=plan&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.save.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=plan&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.save.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&device=desk` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=plan&device=desk&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&device=desk&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&device=desk&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&device=desk` | `default` | Same shot as default; edge 16. |
| large phone 430 | desktop only | `w430` | Desktop only. |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.save.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=plan&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.save.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.publish

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Folder list is read when the card opens; until then the row shows the last folder used and the list holds two skeleton rows. |
| empty | not drawn | `empty` | No folders yet: the list shows only New folder; Save defaults to Documents. |
| error or failed | not drawn | `failed` | Folder create or save fails: name field keeps the text and an amber line under it; nothing moves. |
| long text | probe (strings swapped in) | `long` | Folder name ends in an ellipsis at one line in the row and the list; the count stays whole. |
| lots of items | not drawn | `many` | 40 folders: the list scrolls inside the card at 6 rows; New folder stays last. |
| one item | not drawn | `one` | One folder: the list shows it and New folder. |
| offline or stale | not drawn | `stale` | Offline: Save is disabled with "Reconnect to save". |
| XXL Text Size | `#h-live?play=plan&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.publish.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=adding` | `default` | As drawn (06). |
| loading | `#h-live?play=plan&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-live?play=plan&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.publish.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=plan&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.publish.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | not drawn | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.publish.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=plan&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.publish.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=done` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=plan&stage=done&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=done&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=done&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=done` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=done&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.plan.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.plan.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.plan.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=adding` | `default` | As drawn (06). |
| loading | `#h-live?play=plan&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-live?play=plan&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.plan.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=plan&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.plan.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.plan.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=plan&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.plan.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=plan` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=plan&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=plan&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=plan&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=plan` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=plan&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.cal.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.cal.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.cal.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.cal.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.fold.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.fold.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.fold.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.fold.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.focus.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.focus.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.focus.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.focus.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.pub.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.pub.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.pub.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.moment.pub.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-moments` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Design board demo; the app follows the matching flow row. |
| empty | not drawn | `empty` | As the matching flow row. |
| error or failed | not drawn | `failed` | As the matching flow row. |
| long text | not drawn | `long` | As the matching flow row. |
| lots of items | not drawn | `many` | As the matching flow row. |
| one item | not drawn | `one` | As the matching flow row. |
| offline or stale | not drawn | `stale` | As the matching flow row. |
| XXL Text Size | `#h-moments?ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-moments?theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-moments?rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-moments` | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.kit.failed

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. Amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again (secondary); Draft chip back to Draft. |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | not drawn | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.kit.partial

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. Amber glyph, lists what failed, "Check what was created before you try again." |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | not drawn | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.kit.reloaded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. Reload after the window: the same receipt row from the persisted action-receipt, no Undo, Told row shown. |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | not drawn | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event&stage=steps` | `default` | As drawn (06). |
| loading | `#h-make?play=f_event&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-make?play=f_event&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.worked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event&stage=worked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_event&stage=worked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&stage=worked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&stage=worked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event&stage=worked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&stage=worked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.brief

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event&stage=brief` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_event&stage=brief&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&stage=brief&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&stage=brief&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event&stage=brief` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&stage=brief&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.brief-2

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_event&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_event&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event&stage=draft` | `default` | As drawn (06). |
| loading | `#h-make?play=f_event&stage=draft` | `loading` | Drawn: this stage is the loading state. Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_event&stage=draft&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&stage=draft&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&stage=draft&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event&stage=draft` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&stage=draft&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_event&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event&stage=adding` | `default` | As drawn (06). |
| loading | `#h-make?play=f_event&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-make?play=f_event&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_event&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_event&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_event&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_event&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.confirm.seniors

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_event&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_event.told.seniors

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_event` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_event&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_event&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_event&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_event` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_event&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc&stage=steps` | `default` | As drawn (06). |
| loading | `#h-make?play=f_annc&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-make?play=f_annc&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.worked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc&stage=worked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_annc&stage=worked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&stage=worked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&stage=worked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc&stage=worked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&stage=worked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.brief

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc&stage=brief` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_annc&stage=brief&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&stage=brief&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&stage=brief&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc&stage=brief` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&stage=brief&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.brief-2

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_annc&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_annc&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc&stage=draft` | `default` | As drawn (06). |
| loading | `#h-make?play=f_annc&stage=draft` | `loading` | Drawn: this stage is the loading state. Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_annc&stage=draft&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&stage=draft&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&stage=draft&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc&stage=draft` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&stage=draft&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_annc&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc&stage=adding` | `default` | As drawn (06). |
| loading | `#h-make?play=f_annc&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-make?play=f_annc&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_annc&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_annc&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_annc&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_annc&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.confirm.urgent

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_annc&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.confirm.no-got-it

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_annc&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_annc.told.no-got-it

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_annc` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_annc&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_annc&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_annc&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_annc` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_annc&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel&stage=steps` | `default` | As drawn (06). |
| loading | `#h-make?play=f_travel&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-make?play=f_travel&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.worked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel&stage=worked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_travel&stage=worked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&stage=worked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&stage=worked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel&stage=worked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&stage=worked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.brief

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel&stage=brief` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_travel&stage=brief&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&stage=brief&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&stage=brief&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel&stage=brief` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&stage=brief&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.brief-2

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_travel&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.brief-3

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_travel&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_travel&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel&stage=draft` | `default` | As drawn (06). |
| loading | `#h-make?play=f_travel&stage=draft` | `loading` | Drawn: this stage is the loading state. Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_travel&stage=draft&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&stage=draft&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&stage=draft&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel&stage=draft` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&stage=draft&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_travel&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel&stage=adding` | `default` | As drawn (06). |
| loading | `#h-make?play=f_travel&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-make?play=f_travel&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_travel&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_travel&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_travel&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_travel&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.confirm.fly

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_travel&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.confirm.rooms-mine

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_travel&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_travel.confirm.by-tee-time

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_travel&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_travel&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_travel&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_travel&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_travel&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_travel&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board&stage=steps` | `default` | As drawn (06). |
| loading | `#h-make?play=f_board&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-make?play=f_board&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.worked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board&stage=worked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_board&stage=worked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&stage=worked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&stage=worked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board&stage=worked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&stage=worked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.brief

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board&stage=brief` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_board&stage=brief&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&stage=brief&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&stage=brief&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board&stage=brief` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&stage=brief&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.brief-2

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_board&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.brief-free

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_board&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_board&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board&stage=draft` | `default` | As drawn (06). |
| loading | `#h-make?play=f_board&stage=draft` | `loading` | Drawn: this stage is the loading state. Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_board&stage=draft&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&stage=draft&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&stage=draft&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board&stage=draft` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&stage=draft&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_board&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board&stage=adding` | `default` | As drawn (06). |
| loading | `#h-make?play=f_board&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-make?play=f_board&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_board&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_board&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_board&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_board&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.confirm.no-note

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_board&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_board.confirm.four-tiles

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_board&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_board&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_board&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_board&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_board&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_board&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll&stage=steps` | `default` | As drawn (06). |
| loading | `#h-make?play=f_poll&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-make?play=f_poll&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.worked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll&stage=worked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_poll&stage=worked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&stage=worked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&stage=worked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll&stage=worked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&stage=worked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.brief

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll&stage=brief` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_poll&stage=brief&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&stage=brief&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&stage=brief&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll&stage=brief` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&stage=brief&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.brief-2

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_poll&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_poll&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll&stage=draft` | `default` | As drawn (06). |
| loading | `#h-make?play=f_poll&stage=draft` | `loading` | Drawn: this stage is the loading state. Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_poll&stage=draft&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&stage=draft&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&stage=draft&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll&stage=draft` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&stage=draft&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_poll&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll&stage=adding` | `default` | As drawn (06). |
| loading | `#h-make?play=f_poll&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-make?play=f_poll&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_poll&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_poll&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_poll&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_poll&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.confirm.leave-open

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_poll&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_poll.confirm.four-nights

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_poll&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_poll&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_poll&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_poll&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_poll&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_poll&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual&stage=steps` | `default` | As drawn (06). |
| loading | `#h-make?play=f_qual&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-make?play=f_qual&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.worked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual&stage=worked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_qual&stage=worked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&stage=worked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&stage=worked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual&stage=worked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&stage=worked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.brief

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual&stage=brief` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_qual&stage=brief&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&stage=brief&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&stage=brief&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual&stage=brief` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&stage=brief&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_qual&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual&stage=draft` | `default` | As drawn (06). |
| loading | `#h-make?play=f_qual&stage=draft` | `loading` | Drawn: this stage is the loading state. Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_qual&stage=draft&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&stage=draft&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&stage=draft&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual&stage=draft` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&stage=draft&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_qual&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual&stage=adding` | `default` | As drawn (06). |
| loading | `#h-make?play=f_qual&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-make?play=f_qual&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_qual&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_qual&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_qual&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_qual&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.confirm.three-rounds

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_qual&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_qual.confirm.one-round

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_qual&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_qual&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_qual&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_qual&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_qual&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_qual&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=steps` | `default` | As drawn (06). |
| loading | `#h-make?play=f_lineup&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-make?play=f_lineup&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.worked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=worked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_lineup&stage=worked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=worked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=worked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=worked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=worked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.brief

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=brief` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_lineup&stage=brief&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=brief&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=brief&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=brief` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=brief&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_lineup&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.tie

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_lineup&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=draft` | `default` | As drawn (06). |
| loading | `#h-make?play=f_lineup&stage=draft` | `loading` | Drawn: this stage is the loading state. Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_lineup&stage=draft&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=draft&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=draft&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=draft` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=draft&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_lineup&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=adding` | `default` | As drawn (06). |
| loading | `#h-make?play=f_lineup&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-make?play=f_lineup&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_lineup&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_lineup&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_lineup&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_lineup&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.lock

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=lock` | `default` | As drawn (06). |
| loading | not drawn | `loading` | After Lock lineup: the button becomes the "Locking…" capsule for the call (700ms on the page); Not yet is hidden; no spinner. |
| empty | not drawn | `empty` | Never empty: the card only rises when the lineup has seated players. |
| error or failed | not drawn | `failed` | Lock call fails: the card stays, the capsule goes back to "Lock lineup", the kit failed line shows in amber (as S-ASK.kit.failed); no seat shows a lock (08 f_lineup 8). |
| long text | probe (strings swapped in) | `long` | Event name wraps to two lines in the title; buttons keep one line. |
| lots of items | not drawn | `many` | A 6-spot event: the question reads "these six"; one lock per seat, 70ms apart. |
| one item | not drawn | `one` | One seated player: "Scores then count for this player." |
| offline or stale | not drawn | `stale` | Offline: Lock lineup is disabled with "Connect to lock the lineup"; Not yet still works. |
| XXL Text Size | `#h-make?play=f_lineup&stage=lock&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=lock&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=lock&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=lock` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=lock&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.locked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=locked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | After Lock lineup: the button becomes the "Locking…" capsule for the call (700ms on the page); Not yet is hidden; no spinner. |
| empty | not drawn | `empty` | Never empty: the card only rises when the lineup has seated players. |
| error or failed | not drawn | `failed` | Lock call fails: the card stays, the capsule goes back to "Lock lineup", the kit failed line shows in amber (as S-ASK.kit.failed); no seat shows a lock (08 f_lineup 8). |
| long text | probe (strings swapped in) | `long` | Event name wraps to two lines in the title; buttons keep one line. |
| lots of items | not drawn | `many` | A 6-spot event: the question reads "these six"; one lock per seat, 70ms apart. |
| one item | not drawn | `one` | One seated player: "Scores then count for this player." |
| offline or stale | not drawn | `stale` | Offline: Lock lineup is disabled with "Connect to lock the lineup"; Not yet still works. |
| XXL Text Size | `#h-make?play=f_lineup&stage=locked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=locked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=locked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=locked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=locked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.not-locked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=lock` | `default` | As drawn (06). |
| loading | not drawn | `loading` | After Lock lineup: the button becomes the "Locking…" capsule for the call (700ms on the page); Not yet is hidden; no spinner. |
| empty | not drawn | `empty` | Never empty: the card only rises when the lineup has seated players. |
| error or failed | not drawn | `failed` | Lock call fails: the card stays, the capsule goes back to "Lock lineup", the kit failed line shows in amber (as S-ASK.kit.failed); no seat shows a lock (08 f_lineup 8). |
| long text | probe (strings swapped in) | `long` | Event name wraps to two lines in the title; buttons keep one line. |
| lots of items | not drawn | `many` | A 6-spot event: the question reads "these six"; one lock per seat, 70ms apart. |
| one item | not drawn | `one` | One seated player: "Scores then count for this player." |
| offline or stale | not drawn | `stale` | Offline: Lock lineup is disabled with "Connect to lock the lineup"; Not yet still works. |
| XXL Text Size | `#h-make?play=f_lineup&stage=lock&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=lock&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=lock&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=lock` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=lock&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.confirm.ana

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_lineup&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_lineup.confirm.playoff

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_lineup&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_lineup&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_lineup&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_lineup&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_lineup&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_lineup&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task&stage=steps` | `default` | As drawn (06). |
| loading | `#h-make?play=f_task&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-make?play=f_task&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.worked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task&stage=worked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_task&stage=worked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&stage=worked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&stage=worked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task&stage=worked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&stage=worked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.brief

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task&stage=brief` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_task&stage=brief&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&stage=brief&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&stage=brief&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task&stage=brief` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&stage=brief&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.brief-2

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_task&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_task&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task&stage=draft` | `default` | As drawn (06). |
| loading | `#h-make?play=f_task&stage=draft` | `loading` | Drawn: this stage is the loading state. Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_task&stage=draft&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&stage=draft&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&stage=draft&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task&stage=draft` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&stage=draft&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_task&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task&stage=adding` | `default` | As drawn (06). |
| loading | `#h-make?play=f_task&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-make?play=f_task&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_task&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_task&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_task&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_task&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.confirm.no-reminder

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_task&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_task.confirm.weekly

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_task&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_task&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_task&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_task&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_task&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_task&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal&stage=steps` | `default` | As drawn (06). |
| loading | `#h-make?play=f_goal&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-make?play=f_goal&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.worked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal&stage=worked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_goal&stage=worked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&stage=worked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&stage=worked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal&stage=worked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&stage=worked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.brief

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal&stage=brief` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_goal&stage=brief&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&stage=brief&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&stage=brief&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal&stage=brief` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&stage=brief&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.brief-2

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_goal&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_goal&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal&stage=draft` | `default` | As drawn (06). |
| loading | `#h-make?play=f_goal&stage=draft` | `loading` | Drawn: this stage is the loading state. Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_goal&stage=draft&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&stage=draft&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&stage=draft&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal&stage=draft` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&stage=draft&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_goal&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal&stage=adding` | `default` | As drawn (06). |
| loading | `#h-make?play=f_goal&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-make?play=f_goal&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_goal&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_goal&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_goal&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_goal&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.confirm.just-set

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_goal&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.told.just-set

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_goal&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_goal.confirm.stretch

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_goal&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_goal&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_goal&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_goal&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_goal&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_goal&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_note.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_note&stage=steps` | `default` | As drawn (06). |
| loading | `#h-make?play=f_note&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-make?play=f_note&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_note&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_note&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_note&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_note&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_note.worked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_note&stage=worked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_note&stage=worked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_note&stage=worked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_note&stage=worked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_note&stage=worked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_note&stage=worked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_note.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_note&stage=draft` | `default` | As drawn (06). |
| loading | `#h-make?play=f_note&stage=draft` | `loading` | Drawn: this stage is the loading state. Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_note&stage=draft&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_note&stage=draft&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_note&stage=draft&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_note&stage=draft` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_note&stage=draft&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_note.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_note&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_note&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_note&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_note&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_note&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_note&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_note.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_note&stage=adding` | `default` | As drawn (06). |
| loading | `#h-make?play=f_note&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-make?play=f_note&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_note&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_note&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_note&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_note&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_note.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_note&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_note&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_note&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_note&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_note&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_note&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_note.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_note` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_note&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_note&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_note&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_note` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_note&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_note.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_note&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_note&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_note&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_note&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_note&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_note&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_note.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_note` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_note&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_note&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_note&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_note` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_note&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.reads

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill&stage=steps` | `default` | As drawn (06). |
| loading | `#h-make?play=f_drill&stage=steps` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-make?play=f_drill&stage=steps&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&stage=steps&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&stage=steps&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill&stage=steps` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&stage=steps&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.worked

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill&stage=worked` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_drill&stage=worked&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&stage=worked&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&stage=worked&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill&stage=worked` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&stage=worked&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.brief

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill&stage=brief` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_drill&stage=brief&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&stage=brief&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&stage=brief&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill&stage=brief` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&stage=brief&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.folded

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill` | `default` | As drawn (06). |
| loading | not drawn | `loading` | The reads are the wait; the brief appears only after the first read is done. |
| empty | not drawn | `empty` | Nothing left to ask: the brief is skipped and the draft builds at once; no Worked out block when nothing was worked out. |
| error or failed | not drawn | `failed` | A read the brief depends on fails: that question shows without a picked default and its why line says what could not be read. |
| long text | probe (strings swapped in) | `long` | Question title wraps and the pane height follows; option labels wrap; hints stay one line. |
| lots of items | not drawn | `many` | At most 4 questions and 4 options each, as drawn. |
| one item | not drawn | `one` | One question: the header says "One quick question" (as drawn for f_qual, f_lineup, f_drill; f_note asks nothing and goes straight from Worked out to the draft). |
| offline or stale | not drawn | `stale` | Connection drops: the brief keeps its picks; Next waits for the connection. |
| XXL Text Size | `#h-make?play=f_drill&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.draft

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill&stage=draft` | `default` | As drawn (06). |
| loading | `#h-make?play=f_drill&stage=draft` | `loading` | Drawn: this stage is the loading state. Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_drill&stage=draft&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&stage=draft&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&stage=draft&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill&stage=draft` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&stage=draft&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.confirm

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_drill&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill&stage=adding` | `default` | As drawn (06). |
| loading | `#h-make?play=f_drill&stage=adding` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-make?play=f_drill&stage=adding&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&stage=adding&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&stage=adding&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill&stage=adding` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&stage=adding&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_drill&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_drill&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill&stage=receipt` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_drill&stage=receipt&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&stage=receipt&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&stage=receipt&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill&stage=receipt` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&stage=receipt&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-make?play=f_drill&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.flow.f_drill.confirm.coaches-only

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-make?play=f_drill&stage=confirm` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-make?play=f_drill&stage=confirm&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-make?play=f_drill&stage=confirm&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-make?play=f_drill&stage=confirm&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-make?play=f_drill&stage=confirm` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-make?play=f_drill&stage=confirm&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.steps

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=player&stage=steps&viewer=player` | `default` | As drawn (06). |
| loading | `#h-live?play=player&stage=steps&viewer=player` | `loading` | Drawn: this stage is the loading state. The steps are the loading state: live rows with the breathing dot and label shimmer; no spinner, timer or percentage. |
| empty | not drawn | `empty` | A turn with no reads shows no step list at all. |
| error or failed | not drawn | `failed` | A read fails: amber ring with a bar, "Couldn't read …" and Retry on that row (S-ASK.steps.failed); the answer continues with what loaded and says what is missing. |
| long text | probe (strings swapped in) | `long` | Labels and detail lines wrap to two lines or more; no ellipsis. |
| lots of items | not drawn | `many` | 8 reads: all 8 rows; folded line "8 steps · 6s". Never a "more" row. |
| one item | not drawn | `one` | One read: one row; folded line "1 step · 1s". |
| offline or stale | not drawn | `stale` | Connection drops mid-run: the active row turns amber "Lost connection" and the turn stops; nothing was saved. |
| XXL Text Size | `#h-live?play=player&stage=steps&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=player&stage=steps&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=player&stage=steps&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=player&stage=steps&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=player&stage=steps&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.answer

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=player&stage=done&viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Steps carry the wait; the prose streams in word by word once the first read is back. |
| empty | not drawn | `empty` | Nothing to report: one plain sentence, no chart, no chips. |
| error or failed | not drawn | `failed` | The stream fails mid-answer: what streamed stays, then an amber line "The answer stopped. Try again." with a button. |
| long text | probe (strings swapped in) | `long` | Prose wraps; player and course names never truncate in prose. |
| lots of items | not drawn | `many` | Long answers keep one card; visuals stack inside it. |
| one item | not drawn | `one` | Single-player team: comparisons read against the player's own season, never "the team". |
| offline or stale | not drawn | `stale` | Reopened later: the answer is the saved version; reads show their Computed time. |
| XXL Text Size | `#h-live?play=player&stage=done&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=player&stage=done&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=player&stage=done&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=player&stage=done&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=player&stage=done&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.drill

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=player&stage=done&viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Steps carry the wait; the prose streams in word by word once the first read is back. |
| empty | not drawn | `empty` | Nothing to report: one plain sentence, no chart, no chips. |
| error or failed | not drawn | `failed` | The stream fails mid-answer: what streamed stays, then an amber line "The answer stopped. Try again." with a button. |
| long text | probe (strings swapped in) | `long` | Prose wraps; player and course names never truncate in prose. |
| lots of items | not drawn | `many` | Long answers keep one card; visuals stack inside it. |
| one item | not drawn | `one` | Single-player team: comparisons read against the player's own season, never "the team". |
| offline or stale | not drawn | `stale` | Reopened later: the answer is the saved version; reads show their Computed time. |
| XXL Text Size | `#h-live?play=player&stage=done&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=player&stage=done&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=player&stage=done&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=player&stage=done&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=player&stage=done&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.recap

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=recap&stage=done&viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Steps carry the wait; the prose streams in word by word once the first read is back. |
| empty | not drawn | `empty` | Nothing to report: one plain sentence, no chart, no chips. |
| error or failed | not drawn | `failed` | The stream fails mid-answer: what streamed stays, then an amber line "The answer stopped. Try again." with a button. |
| long text | probe (strings swapped in) | `long` | Prose wraps; player and course names never truncate in prose. |
| lots of items | not drawn | `many` | Long answers keep one card; visuals stack inside it. |
| one item | not drawn | `one` | Single-player team: comparisons read against the player's own season, never "the team". |
| offline or stale | not drawn | `stale` | Reopened later: the answer is the saved version; reads show their Computed time. |
| XXL Text Size | `#h-live?play=recap&stage=done&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=recap&stage=done&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=recap&stage=done&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=recap&stage=done&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=recap&stage=done&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.allowance

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Meter track shows with no fill until the usage bucket arrives; never a number. |
| empty | not drawn | `empty` | Start of the week: full meter, "Plenty left · resets Monday". |
| error or failed | not drawn | `failed` | Usage read fails: the meter is hidden (never guessed); asking still works and the server enforces the cap. |
| long text | probe (strings swapped in) | `long` | Reason text wraps; the meter line stays one line. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Offline: the meter keeps its last bucket. |
| XXL Text Size | `#h-live?viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.allowance-low

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | not drawn | `default` | Not drawn. Meter fill in loss fill (amber), "Running low · resets Monday"; never a number. |
| loading | not drawn | `loading` | Meter track shows with no fill until the usage bucket arrives; never a number. |
| empty | not drawn | `empty` | Start of the week: full meter, "Plenty left · resets Monday". |
| error or failed | not drawn | `failed` | Usage read fails: the meter is hidden (never guessed); asking still works and the server enforces the cap. |
| long text | not drawn | `long` | Reason text wraps; the meter line stays one line. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Offline: the meter keeps its last bucket. |
| XXL Text Size | not drawn | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | not drawn | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | not drawn | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | not drawn | `default` | Same shot as default; edge 16. |
| large phone 430 | not drawn | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | not drawn | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.out

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=limit&viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Meter track shows with no fill until the usage bucket arrives; never a number. |
| empty | not drawn | `empty` | Start of the week: full meter, "Plenty left · resets Monday". |
| error or failed | not drawn | `failed` | Usage read fails: the meter is hidden (never guessed); asking still works and the server enforces the cap. |
| long text | probe (strings swapped in) | `long` | Reason text wraps; the meter line stays one line. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Offline: the meter keeps its last bucket. |
| XXL Text Size | `#h-live?play=limit&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=limit&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=limit&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=limit&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=limit&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.request

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=limit&viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | Fields not known yet are well-colour skeleton bars; each becomes its value with a 6px rise and fade as it arrives. |
| empty | not drawn | `empty` | An optional field with no value shows "Not set" in secondary ink; a missing required field keeps the primary button disabled and the On confirm line names it. |
| error or failed | not drawn | `failed` | A field's read fails: it shows "Not set" and the On confirm line names what is missing; the primary works only if the field is optional. |
| long text | probe (strings swapped in) | `long` | Each draft field clamps at two lines then an ellipsis (as drawn); home-surface rows end in an ellipsis at one line. |
| lots of items | not drawn | `many` | 25 players: coin rows show 7 coins then a "+18" well chip; text counts ("25 players") stay exact. |
| one item | not drawn | `one` | One recipient: copy names the player ("Jonah gets an invite"); one coin. |
| offline or stale | not drawn | `stale` | Offline: the primary is disabled with "You're offline. Nothing was created."; the draft stays. |
| XXL Text Size | `#h-live?play=limit&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=limit&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=limit&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=limit&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=limit&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.request.commit

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=limit&stage=adding&viewer=player` | `default` | As drawn (06). |
| loading | `#h-live?play=limit&stage=adding&viewer=player` | `loading` | Drawn: this stage is the loading state. This stage is the loading state: the capsule with its verb ("Adding…", "Posting…") and the 900ms sweep until the server answers. |
| empty | not drawn | `empty` | Not reachable without a filled draft. |
| error or failed | not drawn | `failed` | Server refuses: S-ASK.kit.failed: capsule turns back into the button, amber glyph, "Couldn't <verb> it. Nothing was saved." and Try again. |
| long text | probe (strings swapped in) | `long` | Capsule label is fixed short copy; no change. |
| lots of items | not drawn | `many` | Not applicable. |
| one item | not drawn | `one` | Not applicable. |
| offline or stale | not drawn | `stale` | Connection drops: after the server timeout the kit failed row shows; Try again reuses the same proposal id so it cannot write twice. |
| XXL Text Size | `#h-live?play=limit&stage=adding&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=limit&stage=adding&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=limit&stage=adding&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=limit&stage=adding&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=limit&stage=adding&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.request.receipt

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=limit&stage=receipt&viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=limit&stage=receipt&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=limit&stage=receipt&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=limit&stage=receipt&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=limit&stage=receipt&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=limit&stage=receipt&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.request.told

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=limit&viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=limit&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=limit&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=limit&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=limit&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=limit&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.request.undone

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=limit&stage=receipt&viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=limit&stage=receipt&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=limit&stage=receipt&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=limit&stage=receipt&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=limit&stage=receipt&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=limit&stage=receipt&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |

### S-ASK.player.request.cancelled

| State | drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | `#h-live?play=limit&viewer=player` | `default` | As drawn (06). |
| loading | not drawn | `loading` | None: the receipt replaces the buttons when the server answers. |
| empty | not drawn | `empty` | Private writes have nobody to tell: the Told row says who can see it ("Only you can see it"). |
| error or failed | not drawn | `failed` | Write fails: S-ASK.kit.failed. Part of a multi-row write fails: S-ASK.kit.partial. Undo fails: amber "Couldn't undo. Open it to remove it." with Open. |
| long text | probe (strings swapped in) | `long` | Receipt line wraps to two lines; Open and Undo never wrap. |
| lots of items | not drawn | `many` | 25 players told: 7 coins light, then "+18"; the line says "25 players got it". |
| one item | not drawn | `one` | One player told: one coin; the line names the player ("Jonah got it"). |
| offline or stale | not drawn | `stale` | Reloaded after the window: S-ASK.kit.reloaded, the durable receipt without Undo. |
| XXL Text Size | `#h-live?play=limit&viewer=player&ts=xxl` | `xxl` | Grows to 1.36, never clips (SHARED-5). |
| dark | `#h-live?play=limit&viewer=player&theme=dark` | `__dark` file | Dark tokens; pairs in contrast-table.txt. |
| Reduce Motion | `#h-live?play=limit&viewer=player&rm=1` | `reduce` | 120ms opacity only; loops stop (SHARED-6). |
| phone 390 | `#h-live?play=limit&viewer=player` | `default` | Same shot as default; edge 16. |
| large phone 430 | frame 430 (page draws 390) | `w430` | Edge 20, cards widen (SHARED-7). |
| desktop 1280 | `#h-live?play=limit&viewer=player&device=desk` | `desktop-1280`, `desktop` | Rail 248, thread max 680 centred. |



## Completeness pass, 4 Nov 2026

Added by the completeness pass so one agent can build Ask front to back without guessing. Nothing here reopens DECISIONS.md or the shared values table. Where a rule here and an older row disagree, the older row carries a `(fixed 4 Nov: ...)` note and this section wins. Every "120ms" fade in this file reads `CH_FADE_MS` (180ms today). 08 checks each rule here as CP-1 to CP-71.

### CP-A. New IDs (inventory rows)

These IDs are added to the registry in AK12 (`capture.mjs` gets each one with `nd: true`, its parent anchor and the scene in the row); until then they are app-only shots on the preview route. All are not drawn on the design page.

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-ASK.turn.stopped` | inline state | Tap Stop after the steps are done, while the answer's words are still streaming | not drawn; parent [#h-live?play=putts&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.turn.stopped&scene=putts` (add, AK0) | both | AK1 Answer card and steps |
| `S-ASK.turn.dropped` | inline state | The connection drops while an answer streams | not drawn; parent [#h-live?play=putts&stage=done](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=putts&stage=done) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.turn.dropped&scene=putts` (add, AK0) | both | AK1 Answer card and steps |
| `S-ASK.jump` | control | Scroll up more than 0.9 of the thread height while a turn streams or after new turns land | not drawn; Messages `S-MSG.jump` reused | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.jump&scene=jonah` (add, AK0) | both | AK1 Answer card and steps |
| `S-ASK.chat.gone` | inline state | Open a chat link whose chat was deleted, belongs to another coach or player, or is on another team | not drawn; parent [#h-live](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.chat.gone` (add, AK0) | both | AK8 Tone and CoachHelm knows |
| `S-ASK.history.more` | inline state | Scroll to the end of the history rail or sheet with more than 30 chats | not drawn; parent [#h-live?device=desk](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?device=desk) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.history.more&state=many` (add, AK0) | coach; player once HM3 runs | AK8 Tone and CoachHelm knows |
| `S-ASK.desk-mid` | screen | Desktop or iPad window 821 to 1279 wide (820 and below is the phone layout, the same break as the Read lane) | not drawn; parent [#h-live?device=desk](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?device=desk) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.desk-mid` (add, AK0), shot at 1024 × 768 | both | AK1 Answer card and steps |
| `S-ASK.kit.release-failed` | inline state | The held write runs when Undo closes and the server refuses it | not drawn; parent [#h-make?play=f_event&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.kit.release-failed&scene=f_event` (add, AK0) | coach; player for Request more | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.kit.undo-late` | inline state | Undo pressed in the last frames, after the server already released the write | not drawn; parent [#h-make?play=f_event&stage=receipt](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=receipt) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.kit.undo-late&scene=f_event` (add, AK0) | coach; player for Request more | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.kit.recheck` | inline state | Press the primary when something the draft names changed since it was drawn (a player left the roster, the coach switched team, the slot was taken) | not drawn; parent [#h-make?play=f_event&stage=confirm](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-make?play=f_event&stage=confirm) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.kit.recheck&scene=f_task` (add, AK0) | coach | AK11a Create engine |
| `S-ASK.kit.no-hold` | inline state | Any write while HM1 has not run | not drawn; today's ActionCard | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.kit.no-hold` (add, AK0); today: `/clubhouse-preview/coachhelm-ask?state=action` | coach | AK4 Confirm, commit, receipt, Undo |
| `S-ASK.flow.f_event.failed` | inline state | `createGolfEvent` refuses after Undo closes | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.failed&scene=f_event` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_event.partial` | inline state | The event saves but some invites fail | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_event.partial&scene=f_event` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_annc.failed` | inline state | The announcement insert is refused | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.failed&scene=f_annc` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_annc.partial` | inline state | The announcement posts but push or email fails for some players | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_annc.partial&scene=f_annc` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_travel.failed` | inline state | The trip insert is refused | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_travel.failed&scene=f_travel` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_board.failed` | inline state | The board picture can't be made or stored for the composer | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_board.failed&scene=f_board` (add, AK0) | coach only | AK11c Board and poll |
| `S-ASK.flow.f_poll.failed` | inline state | The poll draft can't be put in the composer | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_poll.failed&scene=f_poll` (add, AK0) | coach only | AK11c Board and poll |
| `S-ASK.flow.f_qual.failed` | inline state | The qualifier insert is refused | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_qual.failed&scene=f_qual` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_lineup.failed` | inline state | `golf_tournament_set_entries` refuses (for example a version clash) | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.failed&scene=f_lineup` (add, AK0) | coach only | AK11d Lineup |
| `S-ASK.flow.f_lineup.lock-failed` | inline state | `golf_tournament_lock_lineup` refuses | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_lineup.lock-failed&scene=f_lineup` (add, AK0) | coach only | AK11d Lineup |
| `S-ASK.flow.f_task.failed` | inline state | The task insert is refused | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.failed&scene=f_task` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_task.partial` | inline state | The task saves but a reminder or one assignee fails | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_task.partial&scene=f_task` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_goal.failed` | inline state | `createGoal` refuses | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_goal.failed&scene=f_goal` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.f_note.failed` | inline state | `saveRoundCoachNote` refuses, or the earlier notes changed since the draft | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_note.failed&scene=f_note` (add, AK0) | coach only | AK11a Create engine |
| `S-ASK.flow.f_drill.failed` | inline state | The drill bank insert is refused (most often a name already in the bank) | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.f_drill.failed&scene=f_drill` (add, AK0) | coach only | AK11e Drill |
| `S-ASK.flow.q_block` | inline state (all kit stages) | "Block off Friday afternoon" | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.q_block&stage=<stage>` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.q_break` | inline state (all kit stages) | "Add fall break, Oct 16 to 19" | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.q_break&stage=<stage>` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.q_term` | inline state (all kit stages) | "Spring term runs Jan 12 to May 1, exams to May 8" | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.q_term&stage=<stage>` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.q_avail` | inline state (all kit stages) | "Note that Sam is away Thursday for a funeral" | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.q_avail&stage=<stage>` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.flow.q_recruit` | inline state (all kit stages) | "Add a recruit, Mia Torres, class of 2028" | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.flow.q_recruit&stage=<stage>` (add, AK0) | coach only | AK11b More creates |
| `S-ASK.player.requested` | inline state | A player who already sent Request more this week opens Ask or sends again | not drawn; parent [#h-live?play=limit&viewer=player](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA#h-live?play=limit&viewer=player) | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.requested&viewer=player` (add, AK0) | player only | AK10b Allowance |
| `S-ASK.player.request.failed` | inline state | The request row can't be written when Undo closes | not drawn | `/clubhouse-preview/coachhelm-ask-v2?id=S-ASK.player.request.failed&viewer=player` (add, AK0) | player only | AK10b Allowance |

Counts after this pass: 272 drawn and earlier IDs plus 32 here, 304 in all.

### CP-B. Every create flow, every stage

One row per flow. "kit" means the stage follows the shared rules (05 matrices for that stage, 08 Kit pieces and Receipt sections). A stage marked "none" is not reachable, with the reason. Quiet flows (q_*) use the kit with no flow visual: the draft is the kit draft well (06 E-EVD) with the fields in TASK_FIELDS §5.16 to §5.20, and the Home surface (E-HS) is skipped.

| Flow | reads | worked | brief | folded | draft | confirm | commit | receipt | told | undone | cancelled | failed | partial |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| f_event | ID | ID | brief, brief-2 | ID | ID | ID, .seniors | ID "Adding…" | ID | ID, .seniors | ID | ID | CP-A f_event.failed | CP-A f_event.partial (event saved, some invites failed) |
| f_annc | ID | ID | brief, brief-2 | ID | ID | ID, .urgent, .no-got-it | ID "Posting…" | ID | ID, .no-got-it | ID | ID | CP-A f_annc.failed | CP-A f_annc.partial (posted; push or email failed for some) |
| f_travel | ID | ID | brief, brief-2, brief-3 | ID | ID | ID, .fly, .rooms-mine, .by-tee-time | ID "Adding…" | ID | ID | ID | ID | CP-A f_travel.failed | none: one insert carries rooms, gear and uniform |
| f_board | ID | ID | brief, brief-2, brief-free | ID | ID | ID, .no-note, .four-tiles | ID "Opening…" | ID | ID (no coins: "Nothing is sent until you tap Send") | ID | ID | CP-A f_board.failed | none: nothing is written |
| f_poll | ID | ID | brief, brief-2 | ID | ID | ID, .leave-open, .four-nights | ID "Opening…" | ID | ID (no coins) | ID | ID | CP-A f_poll.failed | none: nothing is written |
| f_qual | ID | ID | brief (one question) | ID | ID | ID, .three-rounds, .one-round | ID "Creating…" | ID | ID | ID | ID | CP-A f_qual.failed | none: one insert |
| f_lineup | ID | ID | brief (one question, the tie) and .tie | ID | ID | ID, .ana, .playoff | ID "Setting…" | ID | ID, then .lock | ID | ID | CP-A f_lineup.failed; lock: CP-A f_lineup.lock-failed | none: one RPC |
| f_task | ID | ID | brief, brief-2 | ID | ID | ID, .no-reminder, .weekly | ID "Assigning…" | ID | ID | ID | ID | CP-A f_task.failed | CP-A f_task.partial (task saved, reminder failed) |
| f_goal | ID | ID | brief, brief-2 | ID | ID | ID, .just-set, .stretch | ID "Setting…" | ID | ID, .just-set | ID | ID | CP-A f_goal.failed | none: one insert |
| f_note | ID | ID | none (always shared; retired IDs) | none | ID | ID | ID "Sharing…" | ID | ID | ID | ID | CP-A f_note.failed | none: one update |
| f_drill | ID | ID | none in the build (CP-L) | none in the build | ID | ID (.coaches-only is the only case) | ID "Adding…" | ID | ID ("Nobody is told") | ID | ID | CP-A f_drill.failed | none: one insert |
| q_block, q_break, q_term, q_avail, q_recruit | kit | kit (only what the words gave) | kit, only for TASK_FIELDS ASK rows (end date, missing term dates, status word) | kit | kit well | kit, "On confirm: Nobody is told." (q_avail: "Only coaches see it.") | kit "Adding…" | kit | private told ("Only you and your coaches can see it.") | kit | kit | kit failed with the flow's noun | none: one insert each |
| plan calendar write (S-ASK.flow.plan.*) | the plan's reads | none | none | none | ID | ID | ID | ID | ID | ID | ID | S-ASK.kit.failed with "Couldn't add the practice." | S-ASK.kit.partial when some invites fail |
| Request more (S-ASK.player.request*) | none | none | none | none | ID | ID | ID | ID | ID | ID | ID | CP-A player.request.failed | none |

### CP-C. Failed and partial copy per flow

Shape for all: the receipt row turns amber (06 CP-E-RELFAIL), the Draft chip springs back to Draft, the draft regains its colour and its fields stay as confirmed, Try again (secondary) reuses the same proposal id so it can never write twice, and Edit reopens the fields. The Told row never shows. Failure is amber, never red.

| Flow | Failed line | Partial line | Try again does |
|---|---|---|---|
| f_event | "Couldn't add the meeting. Nothing was saved." | "Added the meeting. Invites didn't reach Theo and Eli. Check the event before you try again." with Open | resends the same event; partial: Open only (no second event) |
| f_annc | "Couldn't post it. Nothing was sent." | "Posted. Push didn't reach 2 players." (email clause only while the email switch is on: "Email didn't reach 1.") | resends; partial: no Try again (the post exists), Open |
| f_travel | "Couldn't add the trip. Nothing was saved." | none | resends |
| f_board | "Couldn't put the board in your message. Nothing was sent." | none | rebuilds the picture and the prefill |
| f_poll | "Couldn't put the poll in the composer. Nothing was posted." | none | rebuilds the prefill |
| f_qual | "Couldn't create the qualifier. Nothing was saved." | none | resends |
| f_lineup (set) | "Couldn't set the lineup. The earlier lineup stands." | none | re-reads the version, redraws the seats, then asks again (a version clash never retries blind) |
| f_lineup (lock) | "Couldn't lock the lineup. It's set but not locked." (08 f_lineup 8) | none | Lock lineup again |
| f_task | "Couldn't assign the task. Nothing was saved." | "Assigned to Eli and Theo. The reminder didn't save." with Open | resends; partial: Open |
| f_goal | "Couldn't set the goal. Nothing was saved." | none | resends |
| f_note | "Couldn't share the note. Your earlier notes are unchanged." When the earlier notes changed since the draft: "Theo's round notes changed since this draft." and the draft redraws with the new earlier notes before Confirm comes back | none | resends after the redraw |
| f_drill | "Couldn't add the drill. Nothing was saved." Name in use: "You already have a drill called Gate drill. Rename this one." with the name field open | none | resends with the new name |
| quiet flows | "Couldn't add the {blocked time, break, term, note, recruit}. Nothing was saved." Overlapping term: "That overlaps Fall 2026. Change the dates." | none | resends |
| plan calendar write | "Couldn't add the practice. Nothing was saved." | "Added the practice. Invites didn't reach 2 players." | resends; partial: Open |
| Request more | "Couldn't send your request. Try again later." | none | resends once per week |

### CP-D. Held migrations, other lanes' holds and flags: what shows

The client never reads a flag (02 §3); the server decides each piece and sends only what is on. A missing column or table is detected once per server boot (Postgres `42703` or `42P01`, or `to_regclass` null), never by trying a write.

| Missing | Pieces hidden | Pieces degraded | What the coach or player sees instead |
|---|---|---|---|
| `coachhelm_ask_v2` off | all of Ask v2 | none | today's Ask at 75b4956 exactly (S-ASK.flag-off). Quick chat's "Open full chat" opens today's Ask |
| HM1 `20261101090000_coachhelm_action_runs_hold` | Undo ring, Told row, the held receipt, every f_* flow except board and poll, Request more (fixed 4 Nov wiring: Request more holds on its own HM4 row, `ask_credit_requests.release_at`, not on the coach-only action ledger, so it waits on HM4, not HM1), Publish's Undo on the Ask path | today's four writes (recurring practice, focus area, task, team update) run through today's ActionCard and AskReceiptCard, immediate write, no Undo (S-ASK.kit.no-hold) | no "Undo" anywhere; the / menu lists /plan, /recap, /compare and drops create commands; the Make anything gallery is absent. Per 02 §7 the flag stays off until HM1 runs, so this row is a safety net, not a shipped state |
| HM2 `20261101090100_coachhelm_ask_tone_and_facts` | Tone control, CoachHelm knows list, Edit what it knows sheet, the settings sheet's two sections | tone is Straight for every chat | phone: the settings button is absent (the sheet would be empty); desktop: the rail shows only New chat and the history list |
| HM3 `20261101090200_player_ask_conversations` | player history rail and sheet, `chat=` deep links for players | each visit is a new chat; a reload mid-answer loses the turn | the player's history button is absent; a player `chat=` link opens a new chat with no notice |
| HM4 `20261101090300_ask_allowance` | all of player Ask (02 §16: no cap, no ship) | none | a player's `?view=ask` falls through to their Board as with `coachhelm_player_ask_v1` off |
| N-00 `20261026010100_golf_team_drills` (HM5 superseded) | f_drill in the gallery, the / menu and the model's tools | the plan's drill reads say "Reading the drill library" (practice-plan 03 §5) | gallery tile "Drill bank comes with the Practice tab", no Play |
| N-00 `20261026010000` to `010600` (plans, save, publish) | none in the thread | Save draft… and Publish… inert | both read "Comes with the Practice tab" and make no network call; the artifact still opens, reads, versions and prints |
| N-10 `20261026090200_golf_document_folders` | nothing (folders are names, practice-plan default 1) | none | the Save folder list shows `golf_documents.folder` names with counts |
| `20261028140800_golf_messages_deleted_poll_payload_check` | f_poll | none | gallery tile "Polls come back when a fix ships", no Play; "poll" in words gets a plain answer and no flow |
| `golf_tournaments_v1` off | f_lineup, /lineup, the travel leave time from tee times | travel asks the leave time instead | absent, no tile, no notice (it is a team feature the team doesn't have) |
| `coachhelm_practice_plans_v1` off | /plan, `ask_practice_brief`, `draft_practice_plan`, the plan suggestion on Ask home, S-ASK.brief.*, S-ASK.artifact.* for practice_plan | none | "Build Tuesday's practice" gets a plain answer from the reads (free window, slipped areas) with no plan card and one follow-up chip "Add a practice to the calendar" (f_event) |
| `golf_practice_plans` off (with the one above on) | Edit in builder, Save draft…, Publish… become inert | the artifact opens in the pane or push screen and prints | inert buttons read "Comes with the Practice tab" |
| `coachhelm_team_pattern_v1` off | `get_team_patterns` | none | answers never cite a team pattern |
| `class_awareness_v1` off | q_break and q_term, class conflict dots in the event draft | event free slots use events only | the event draft's day strip shows no class dots and its Worked out pill reads "Calendar" not "Calendar and classes" |
| `coachhelm_player_ask_v1` off | player Ask | none | player `?view=ask` falls through to their Board |
| `HELM_CUSTOMER_EMAIL_ENABLED` off | "Also emailed" lines, the email clause in On confirm lines, the email in Request more | Request more writes its row, `sent_at` null | f_annc confirm: "7 players get it in Messages and as a push once Undo closes."; Request more told: "Request logged. Helm Sports Labs will see it." |

### CP-E. Player allowance and limits

| Case | Rule |
|---|---|
| Plenty | meter "Ask this week · Plenty left · resets Monday" (as drawn) |
| Low (under 20% left) | meter turns amber, copy "Running low · resets Monday"; no number |
| Out, at home | Out card at the top of the thread, composer paused ("Ask is paused until Monday"), suggestions hidden |
| Out, mid-turn | the turn that crosses the cap finishes (the server never cuts an answer); the next send returns the Out card without calling the model |
| Out, opening a past chat | the chat reads normally (reading costs nothing); composer paused |
| Requested this week (S-ASK.player.requested) | Out card's ask row reads "Requested this week. Ask opens again Monday." with no button; `ask_credit_requests` is unique per player per week |
| Allowance raised by staff | the next send works; the meter shows the new bucket on the next load; no push to the player |
| Week rollover | Monday 00:00 in the team zone (02 §13.2); a player who opens Ask on Sunday night and sends after midnight gets the new bucket on that send |
| Usage read fails | meter hidden, composer not paused; the server still enforces the cap |
| Offline | the offline line wins over the paused line |
| Coach | coaches have no meter and no cap in Ask (today's coach daily budget is unchanged and shows today's message if hit) |

### CP-F. The practice plan flow: one flow, two lanes

The practice-plan lane (lane 6) and this lane both specify the plan flow inside Ask. There is one flow. Rule: lane 6's 05 to 08 win for what is inside the plan (the brief's shape and questions, the plan card's body, Why, block sheet, swap, Save to row, publish confirm and their copy and counts); this lane wins for the Ask v2 shell around it (answer card, steps row, artifact card in the stream, the 452 desktop pane, the phone push with "‹ Ask" and dock, version arrows, history). AGENT_KIT's lane note says Ask matches lane 6 on Ask first, and lane 6 chose one card. With `coachhelm_ask_v2` off, lane 6's flow runs in today's Ask unchanged.

| This lane's ID | Lane 6 ID | Rule in the build |
|---|---|---|
| `S-ASK.flow.plan.reads` | `S-ASK.steps`, `S-ASK.read-pictures` | Ask's steps rows with lane 6's read pictures inside each done row |
| `S-ASK.brief.q1` to `.q4`, `.free`, `.skip` | `S-ASK.intake` | one Ask first card with lane 6's three groups (How long, Work on, Who) plus the "Anything else?" line, `ask_practice_brief` input `{practice_event_id?, date, groups}`. Ask's paged q1 to q4 and the separate "where" question are "can't match as drawn: one plan flow, lane 6's one card (AGENT_KIT lane note)". Capture shoots `.q1` to `.q4` as the same card; `.skip` is lane 6's "Skip, just build" footer link if lane 6 draws one, else absent |
| `S-ASK.brief.folded`, `.brief.change` | `S-ASK.intake-folded` | answers fold to the coach's own bubble; Change answers reopens the card with the picks kept |
| `S-ASK.flow.plan.drafting`, `S-ASK.artifact.card` | `S-ASK.plan-card` | lane 6's plan card writes itself; Ask's artifact card shell (tile, title, Open) is the card's header on desktop, where the body lives in the pane |
| `S-ASK.artifact.pane`, `.artifact.versions` | `S-ASKD.pane`, `S-ASKD.pane-v2` | Ask's pane chrome; lane 6's body (`PracticePlanSheet`) |
| `S-ASK.artifact.push` | `S-ASK.full-plan` | Ask's push chrome and dock; lane 6's body |
| `S-ASK.artifact.why-popover` | `S-ASK.why`, `S-ASK.evidence` | lane 6's Why panel and evidence sheet (coach only) |
| `S-ASK.artifact.edit` | `S-ASK.toast` | "Edit in builder" opens the Practice tab builder on this draft when `golf_practice_plans` is on; otherwise inert with "Comes with the Practice tab" |
| `S-ASK.save` to `.save.cancelled` | `S-ASK.save-to`, `S-ASK.saved`, `S-ASK.undone`, `S-ASK.failed` | one Save row (lane 6's `SaveToRow`); folders are names (02 §12 fixed note); Save writes at once and Undo deletes |
| `S-ASK.publish` to `.publish.cancelled` | `S-ASK.publish-confirm`, `S-ASK.published`, `S-ASK.cancelled`, `S-ASKD.publish` | lane 6's inline publish confirm on phone and desktop; Ask's 90% sheet is "can't match as drawn: lane 6 draws it inline"; files at once, tells after Undo; Undo "Taken back. Nobody was told." |
| `S-ASK.flow.plan.draft` to `.cancelled` (calendar write) | none | Ask's own, offered only when the plan's date has no practice event yet ("Want it on the calendar?"); when lane 6's brief found a `practice_event_id` the plan attaches to that event and no calendar card is offered |
| `S-ASK.moment.fold.*`, `.moment.pub.*` | as above | design board demos only; the build checks them against the rows above |

Note for the builder: lane 6 also names IDs `S-ASK.steps`, `S-ASK.failed`, `S-ASK.undone`, `S-ASK.cancelled`, `S-ASK.toast` in its own `practice-plan/capture/`. They are lane 6's capture IDs, not this lane's IDs of the same or similar name; run each lane's capture from its own folder.

### CP-G. Conversation behaviour

| Case | Rule |
|---|---|
| Long answer | one card grows (08 S-ASK.turn.answer 1); while it streams the thread follows the bottom only if the reader was within 0.9 of a screen of it; otherwise the jump key (CP-A `S-ASK.jump`, Messages S-MSG.jump reused) shows with no count |
| New turn sent | the thread scrolls the new bubble to 16 below the scope line (phone) or the top of the thread column (desktop) on the smooth spring; Reduce Motion jumps |
| Stop during steps | as S-ASK.steps.stopped |
| Stop while words stream (`S-ASK.turn.stopped`) | the words already shown stay; streaming ends at the last whole word; the card ends with "Stopped." in secondary ink and a Try again text button that sends the same question again as a new turn; visuals that had not drawn are dropped (no skeleton left behind); follow-ups don't show; nothing is saved because answers write nothing |
| Connection drops mid-answer (`S-ASK.turn.dropped`) | what streamed stays; amber line "The answer stopped. Try again." with Try again (05 S-ASK.turn.answer failed); the composer shows the offline line until the connection is back |
| Regenerate | not built (not drawn, not in today's Ask). Try again exists only on a failed, dropped or stopped answer |
| Send while a turn streams | Send is the Stop key while streaming, so a second question can't be sent; typing is allowed and kept |
| Composer text | kept per chat in sessionStorage while the tab lives (Messages drafts pattern); switching chats keeps each chat's text; sending clears it |
| History, 0 chats | "No chats yet" (05 S-ASK.history empty) |
| History, many | 30 rows load first, grouped Today, This week, Earlier (season names after 1 August: "Last season" for chats before the most recent 1 August); `S-ASK.history.more` loads 30 more on reaching the end (a 44 tall row with a well-colour skeleton bar), never a page button; the list is not virtualised under 300 rows |
| History refresh | the list refetches on open (sheet) or on focus (rail); no pull to refresh in the thread or the sheet |
| Chat titles | today's title rule; longest titles end in an ellipsis at one line |
| Deleted or not-allowed chat link (`S-ASK.chat.gone`) | the thread opens empty with a well notice above the composer, "That chat isn't available. It was deleted or isn't yours.", and New chat focused; the server returns 404 for another owner's chat, never its title |
| Cold start into a chat link | the green bar and composer draw first; the thread shows two answer-card skeletons until the chat loads; scroll lands at the bottom with no animation |
| Back from a pushed artifact | the thread scroll position is restored exactly (02 §8 test) |
| Same chat on two devices | the thread refetches on focus; a held receipt shows on both, its ring timed to the server's `held_until`; Undo works from either; the second press gets the late rule |
| Undo pressed at the edge (`S-ASK.kit.undo-late`) | the server refused because the write already ran: the ring is gone, the receipt reads "Too late to undo. It's done. Open it to change it." with Open; the Told row follows |
| Held write fails at release (`S-ASK.kit.release-failed`) | the receipt the coach saw turns amber with CP-C's failed line; nobody is told; if the coach left the thread, the durable receipt shows it on return and the chat's history row gets an amber dot until opened. No push to the coach |
| Something changed before the press (`S-ASK.kit.recheck`) | execute-time re-check (02 §14): the primary turns back to a button and a line names the change ("Eli is no longer on the roster. Eli is out of this draft." / "You switched to JV. This draft was for Varsity." / "Wednesday 4:00 is taken now. Pick another time."); the draft redraws; Confirm needs a new press |
| A player removed mid-session | answers already shown keep their figures; new reads leave the player out; the @ menu drops them on its next open |
| Team switch | the thread for the old team stays readable; the composer scope line changes; a held write keeps the team it was confirmed for |
| Dates and zones | every day word ("today", "tomorrow", "Wednesday") is in the team zone (`resolveTeamTimeZone`); a draft made at 11:58 PM that says "tomorrow" keeps the date it showed; "this season" and season compares turn over on 1 August |
| Haptics | none (07: web view, no haptic bridge) |
| Share and print | only the practice plan prints (lane 6's print of `PracticePlanSheet`); no other Ask surface has Share or Print |

### CP-H. Coach and player, piece by piece

| Piece | Coach | Player |
|---|---|---|
| Home | greeting, team pulse, four suggestions | greeting "Morning, Jonah", Your focus, Ask this week meter, suggestions about their own game only |
| Scope line | "Reading Varsity · last 30 days" | "Reading your rounds · last 30 days" |
| Composer | @ (players, rounds, events, qualifiers, documents), / (/plan, /lineup, /recap, /compare), + menu | @ lists their own rounds and events only; / lists /recap only; + menu shows "Attach a round" only |
| Steps | team reads | own reads only; labels say "your" |
| Read chips and popovers | any read | own reads, team average and PGA Tour benchmarks with no names |
| Tool cards | all blocks; ask-about on every mark | own blocks; ask-about on own marks; no per-player bars or dots |
| Follow-ups | three | three, never about a teammate |
| Artifacts | practice plan, player report, lineup, round recap | none (no artifact kinds for players) |
| Create flows, Make anything gallery | yes | absent from DOM |
| Confirm, receipt, Undo | every write | only Request more |
| Tone | Straight, Detailed, Team talk (HM2) | Encouraging, fixed, no control |
| CoachHelm knows | yes (HM2) | absent from DOM |
| History | yes | only with HM3 |
| Allowance | none | meter, Out card, Request more |
| Read entry (`askAboutHref`) | any read on the team | only reads about themselves, as the player projection (never a likely cause, CR0) |
| Errors | "Couldn't load your team" | "Couldn't load your Ask" |

### CP-I. Entry points and deep links

| Entry | URL or trigger | Lands on | Back goes to |
|---|---|---|---|
| CoachHelm switcher or sidebar | `?view=ask` (today's `chat/SubTabs.tsx`) | the last open chat, or Ask home if none | the switcher's previous view |
| A chat | `?view=ask&chat=<conversationId>` (fixed 4 Nov wiring: the param is `c`, `?view=ask&c=<id>`, built by `conversationHref(id)` in `screens/coachhelm/chat/History.tsx:34-36` and read by `routes/coachhelm.tsx` as `conversationId`) | that chat scrolled to the bottom; S-ASK.chat.gone if missing or not allowed | Ask home |
| A seed from another lane | `?view=ask&seed=read:<insightId>` or `seed=station:<id>` or `seed=player:<rosterId>` (from `askAboutHref`) | a new chat with the composer filled ("Ask about this: Long approaches finish short-right") and the read pinned as an @ chip; nothing is sent | the screen that opened it (browser back) |
| A seed the viewer can't see | as above | a new empty chat; the seed is dropped silently (no leak of whether it exists) | as above |
| Quick chat "Open full chat" | `?view=ask&chat=<id>` (fixed 4 Nov wiring: `conversationHref(id)`, `?view=ask&c=<id>`) | the same chat; a held receipt from quick chat shows with its remaining ring | the screen under the quick chat |
| Slash commands | /plan, /lineup, /recap, /compare | the same as typing the request | none |
| Push or bell | none: Ask sends no notifications to the coach or player. Players hear about created things through the destination's own notifications (event invite, announcement, task) | the destination screen | that screen's own back |
| Open on a receipt | event: Calendar on that day; announcement: Messages, Announcements fold, that announcement; trip: Hub, that trip; qualifier: Qualifiers, that qualifier; lineup: the tournament's lineup; task: the task on Home; goal: the player's goals; note: the round; drill: Practice, Drills (when the Practice tab is on, else the receipt has no Open); board and poll: the Messages thread with the draft in its composer; plan: Documents, the folder | the destination | browser back returns to the Ask chat at the same scroll |
| Cold start | any of the above | as CP-G cold start | as above |
| Player | `?view=ask` with both player flags and HM4 | player Ask; otherwise their Board | their Board |

### CP-J. Keyboard, focus and VoiceOver

| Area | Rule |
|---|---|
| Focus ring | 2px `--ch-accent` outline (#155A39 / #7CC79B, 8.15 / 8.45 on card, at least 3:1 on page and glass), offset 2, following the element's radius; never on mouse press, only `:focus-visible` |
| Tab order, phone and iPad keyboard | green bar (unchanged) → Board / Ask segmented → scope line (not focusable) → thread (each turn: steps summary, prose links and chips in reading order, tool card marks, Sources, follow-ups) → kit card (fields, Cancel, primary; after commit: Open, Undo) → composer (+, input, @ via typing, Send or Stop) |
| Tab order, desktop | sidebar (unchanged) → history rail (New chat, rows, tone, knows) → thread → composer → artifact pane (header arrows, close, body, footer) |
| Enter and Shift+Enter | desktop: Enter sends, Shift+Enter adds a line; phone: Return adds a line and Send sends (Messages rule) |
| Esc | closes the topmost of: @ / + menu, read chip popover, Why popover, folder list, publish sheet, settings sheet, history sheet, expanded tool card, artifact pane (desktop); one press closes one layer; Esc during streaming does not stop it (Stop is a button) |
| Focus return | every menu, popover, sheet and pane returns focus to the control that opened it; after Confirm, focus moves to the receipt's Open; after Undo, to the receipt line; after Cancel, to the composer |
| Arrow keys | @ and / menus: Up and Down move, Enter picks; brief chips: Left and Right within a group, Space toggles; version arrows: Left and Right |
| Shortcuts | Cmd+K (desktop) focuses the composer only if quick chat has not taken it; quick chat's Cmd+J is unchanged |
| VoiceOver order | as the tab order; each turn is a group labelled "CoachHelm answer" (player: the same); steps list `aria-live="polite"` while live, announcing each step once in its done words; the Undo ring is labelled "Undo, 8 seconds" and announces "Undo closed" once; Told row announces its summary line once |
| Labels | Send "Send", Stop "Stop answer", + "Add", jump key "Jump to latest", expand "Expand chart", chart marks "{label}, {value}. Ask about this", read chip "{read}, {window}. Show source" |
| Targets | every control meets 44 × 44 (06 hit rows); chips 36 drawn with the 44 hit extension |

### CP-K. Hand-offs with other lanes

| From | To | Trigger | Context carried | Back | If the other lane's flag is off |
|---|---|---|---|---|---|
| Ask f_annc | Messages (inbox Announcements fold) | Post, then Undo closes | the announcement row, its Got it state | Open returns to Ask by browser back | the announcement is today's announcement and shows in today's announcements list; nothing in Ask changes |
| Messages | coach sees it | after Undo closes | the post at the top of Announcements, today's acknowledgement count, "0 of 7 acknowledged", counting up from `golf_announcement_acknowledgements` (fixed 4 Nov: Messages keeps today's wording) | | as above |
| Players | Messages and push | after Undo closes | bell, push, email (email per the switch) through today's `createEnrichedAnnouncement` fan-out | | as above |
| Ask f_board, f_poll | Messages composer (player thread or team chat) | "Open in Messages" | `ChPrefill` with `conversationId`, `poll`, `attachment` (sessionStorage only) | the Messages back key returns to Ask with the receipt "Nothing is sent until you tap Send" | today's composer reads the same prefill fields (02 §1 exception), so it works with the Messages redesign flag on or off |
| Ask plan | practice-plan lane pieces | /plan or "Build Tuesday's practice" | as CP-F | as CP-F | CP-D rows for `coachhelm_practice_plans_v1` and `golf_practice_plans` |
| Ask plan Save | Documents (Hub) | Save draft… | `golf_documents.folder` name, `practice_plan_id`, `is_public` false | Open goes to Documents filtered to that folder | Save inert, "Comes with the Practice tab" |
| Ask plan Publish | Documents, Practice plans folder, team chat text post, player push | Publish confirm | the published version | Open goes to the plan in Documents | inert as above |
| Ask plan calendar | Calendar | Add to calendar | event with the plan attached | Open goes to Calendar on that day | |
| Read, Team Board, Lenses | Ask | "Ask about this read", "Ask about this", "Ask CoachHelm about this" | `askAboutHref(seed)` (02 §14 note in CP-K export below) | browser back | Ask v2 off: `askAboutHref` returns null, so those lanes draw no link (their rule) |
| Ask read chip | Stats | "Open in Stats" in the popover | metric and window | browser back | Stats as it is today |
| Ask answer | a player's file (Lenses) | a player name in prose is a link for coaches only | `coachReadHref` / `playerFileHref` (Lenses lane) | browser back | `coachPlayerHref` until Lenses exports `playerFileHref` |
| Quick chat | Ask | "Open full chat" | conversation id | browser back | quick chat flag off: no entry |
| Coach Home, Stats | Ask | none drawn in those lanes | | | no entry is added there |

Export for the other lanes (AK2, `src/clubhouse/screens/coachhelm/chat/ask-links.ts`): `askAboutHref(seed: {insightId: string; playerId?: string | null} | {station: string} | {playerId: string}): string | null`, and `askAboutReadHref` as an alias taking `{insightId, playerId | null}` for the Read lane's name. It returns null when `coachhelm_ask_v2` is off (decided on the server and passed down as the route prop does), and, for a player viewer, when player Ask is off or the read isn't theirs.

### CP-L. The drill flow on the one team bank

The flow writes N-00's `golf_team_drills` (held `20261026010100`), the bank lane 6 reads. HM5 is superseded and not written.
- Reads: "Reading your drill bank" then the GolfHelm library (`golf_drills`); D1 detail names where the drill came from ("Gate drill is in the GolfHelm library at 4 ft").
- Worked out: area (from the library drill's `category` mapped to the bank's area list: putting, short_game, bunker, approach, tee, course, fitness, mental), minutes, goal; each pill names its source.
- Brief: none. The design page's "Who can see it?" is "can't match as drawn: the bank has no visibility column". `.brief` and `.folded` are not reached; `.confirm.coaches-only` is the only confirm.
- Draft: the green diagram as drawn, plus one fixed line under it in secondary ink: "Only coaches see the drill bank. Players see a drill when a published plan uses it."
- Confirm: "On confirm: Nobody is told." Button "Add to drill bank".
- Write: through N-00's `createTeamDrill` (or `copyLibraryDrill` when the coach is copying a GolfHelm library drill), the same path the builder and quick chat use (TASK_FIELDS §5.14): `name` 1 to 80, `area`, `kind` skill unless the words say random or pressure, `minutes` 1 to 180, `setup`, `goal`, `copied_from_drill_id` when it came from the library, `created_by` the coach; the other columns take N-00's defaults.
- Before 010100 runs: no f_drill tool. "Add a drill to the bank" gets a plain answer that the drill bank comes with the Practice tab and, when `coachhelm_practice_plans_v1` is on, one chip "Put it in a practice plan" (TASK_FIELDS §5.14).
- Undo inside 8s: no row. After the window, there is no delete (archive only): Open goes to the drill in Practice, Drills, where lane N-00's archive lives.
- Name in use: CP-C f_drill.
