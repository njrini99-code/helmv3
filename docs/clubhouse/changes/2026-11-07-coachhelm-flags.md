# CoachHelm flags retired: the upgraded version is the only version (2026-11-07)

Eight flags came off. Each picked between an UPGRADED version (flag ON) and an
OLD one (flag OFF). The ON code stays, the
OFF code goes. A prop such as `v2?: boolean` defaults to false, so "inline the
default" would keep the OLD path: every
prop below is inlined as `true` (or deleted, with its ON branch kept).

Flags: `coachhelm_ask_v2`, `coachhelm_quick_chat_v1`, `coachhelm_player_ask_v1`
(Ask group); `golf_practice_plans`,
`coachhelm_practice_plans_v1` (Practice group); `coachhelm_read_v1`;
`coachhelm_player_file_v1`; `coachhelm_team_board_v1`.
`golf_practice_plans` is also a table name: only flag reads were removed, never
a table reference.

## Step 1: what renders or runs ONLY when the flag is ON (written before any edit)

### Ask group (`ask-flag.ts`: `isAskV2Enabled`, `isPlayerAskEnabled`; props `v2`, `askOn`, `quickChat`, `helmViews.playerAsk`)

ON-only:

- `Thread.tsx` `if (v2)` branch: `AnswerCard` (parts/AnswerCard.tsx) with
  `Steps`, `ReadChip`, `Sources`, `FollowUps`, `ToolSkeleton`,
  `ArtifactCard`, `BriefCard`, `HandoffCard`, `PlanCard`, `ConfirmCard`,
  `Receipt`; the live "Reading your program" `Steps` row for
  the awaiting turn; the `ch-ak-th` class and `data-v2`; the follow-the-answer
  reach of 0.9 screens and the "Jump to the latest"
  portal button (`ch-ak-jump`).
- `Home.tsx` `AskHomeV2`.
- `Ask.tsx` v2 branches: `AskKnowsPanel` (desktop footer, phone settings sheet
  "Chat settings"), the composer `hint`, `scopeOf`
  and `slash` props, the phone `ch-ak-scope` line, `ch-ak-root`, the allowance
  meter hidden on the home.
- `Composer.tsx` scope chips, `/` list and home line props (only passed when
  v2); `Prose.tsx` `chip` prop and word fade.
- Server: `/api/coachhelm/v3/chat/actions/[key]` (held-action Undo),
  `stream/route.ts` `askV2` (read-knows, steps, Ask v2 tools),
  `coachhelm-ask.ts` facts and tone actions, `coachhelm-chat.ts` `askKnows`.
- Player Ask: `PlayerAskTabs`, `PlayerAskView`, `runPlayerTurn`,
  `requestAskCredits`, `AllowanceMeter`, `helmViews.playerAsk`.
- Quick chat: `shell/quick-chat/*` (`QuickChatProvider`, `HelmKey`,
  `QuickChatSession`), `data/shell.ts` `quickChat`.
- CSS: `coachhelm-ask-v2.css` (every rule under `[data-v2]`), `quick-chat.css`.

OFF-only:

- `Thread.tsx` fall-through `<article class="ch-th-ans">`: `AskProse`/`AskEvidenceView`/`CoachVisualArtifact`/`CoachComposition`
  drawn straight, `AskActionCard`, `AskReceiptCard` (`ActionCard.tsx`, imported
  nowhere else), `Work`, `useElapsed`, `workReceipt`,
  Thread's own copy button and `ch-th-follow` pills, the `ch-th-think`
  placeholder, the 80px stick reach.
- `Home.tsx` `AskHome` (old home). The old sparkle Ask sheet as the top-bar
  entry (`AskSheetButton`) when `quickChat` is off.
- Server: the `isAskV2Enabled()` / `isPlayerAskEnabled()` denials
  ("Unauthorized", "Ask is off.").

NOTE (parent's brief vs the code): `AskEvidenceView`, `AskProse`,
`CoachComposition`, `CoachVisualArtifact`, `FollowUps` and the
copy `Icon` are NOT only in the OFF article. `AnswerCard.tsx` renders each of
them on the ON path (see "kept" below), so they stay.
Only `AskActionCard`, `AskReceiptCard`, `Work`, `useElapsed`, `workReceipt` and
Thread's own copy and follow-up markup are OFF-only.

### Practice group (`practice-plan/flag.ts`: `isPracticePlansEnabled`, `isPracticeTabEnabled`; props `askOn`, `practicePlans`, `practice`, `helperOn`, `saveOn`, `slashFlags.plans`)

ON-only:

- The whole Practice tab: `/golf/dashboard/practice/**` pages (no redirect to
  Calendar), the Practice nav entry (`CH_NAV_PRACTICE`),
  `PracticeHome`, the Builder, library pages, plan format page.
- With `coachhelm_practice_plans_v1`: `NewPlanSheet` "Ask CoachHelm" start (and
  it is the default start), the "Plan format" links, the
  first-run line about CoachHelm drafting, `helperOn` facts in
  `loadPlanForBuilder`, plan tools in the chat stream
  (`practicePlans`), the plan tile in quick chat (`plans`), the `/plan` slash
  command, `saveOn` on the plan card, the
  `coachhelm-practice-plans` and `coachhelm-plan-format` server actions.
- `calendar.ts` reads each event's plan (`readEventPlans`).
- CSS: `coachhelm-plan.css`.
OFF-only: the redirects to Calendar, the `unavailable` returns ("Practice plans
aren't on for your team yet.", "Comes with the
Practice tab."), the `'blank'` default start and `emptyBody(..., start ===
'blank' && !askOn)`.

### Read (`read/flag.ts`: `isReadEnabled`; props `readOn`)

ON-only: `?view=read` pages (`ReadPage`, `ReadSkeleton`, `loadCoachRead`,
`loadPlayerRead`), `readHref` returning the read address,
`ReadPanel` linking to it (`canLink`), the Reads rail, `coachhelm-read.css`.
OFF-only: `readHref`'s old branch to the Deep dive address, `readOn` plumbing
(`ChFile` data `readOn`, `ReadPanel readOn`).

### Player file (`player-file/flag.ts`: `isPlayerFileEnabled`; props `fileOn`)

ON-only: `?view=player` (`PlayerFile`, `FileSkeleton`, `loadCoachPlayerFile`),
the player's "Your week" (`PlayerYourWeek`,
`YourWeek`, `loadPlayerYourWeek`), `playerFileHref` returning the file address,
the redirect of old coach drill addresses to the
file, `coachhelm-file.css`.
OFF-only: `playerFileHref`'s old branch (Standing / Deep dive addresses), the
player's old board as their CoachHelm home
(`PlayerBoard` at `!drill`), `fileOn` plumbing. (`PlayerBoard.tsx` itself stays:
`coachHelmLinks` is imported by Standing and Deep dive.)

### Team board (`team-board/flag.ts`: `isTeamBoardEnabled`; `helmViews.team`)

ON-only: `TeamBoard`, `TeamBoardSkeleton`, `loadCoachTeamBoard`, the Team tab,
`coachhelm-team.css`, `ReadPanel`/`PlayerPanel`
cross-lane links. OFF-only: the coach's first view being `CoachBoard`.
(`CoachBoard` stays: gate-off pages use it.
`TEAM_BOARD_FIRST_VIEW` and `COURSE_TAB` are design switches, not flags.)

## Step 3: proof that every ON-only item still exists and is rendered

Grep for the JSX use or the import in live code (previews and tests excluded).
No ON-only item is gone.

### Ask group

- kept: AnswerCard (src/clubhouse/screens/coachhelm/chat/Thread.tsx:192)
- kept: Steps (live row) (src/clubhouse/screens/coachhelm/chat/Thread.tsx:164)
- kept: ConfirmCard (src/clubhouse/screens/coachhelm/chat/Thread.tsx:217)
- kept: Receipt (ON path) (src/clubhouse/screens/coachhelm/chat/parts/ConfirmCard.tsx:307)
- kept: Jump to latest (src/clubhouse/screens/coachhelm/chat/Thread.tsx:253)
- kept: AskHomeV2 (src/clubhouse/screens/coachhelm/chat/Ask.tsx:307)
- kept: AskKnowsPanel (src/clubhouse/screens/coachhelm/chat/Ask.tsx:255)
- kept: askSlashCommands (src/clubhouse/screens/coachhelm/chat/Ask.tsx:283)
- kept: ReadChip (src/clubhouse/screens/coachhelm/chat/parts/AnswerCard.tsx:55)
- kept: FollowUps (src/clubhouse/screens/coachhelm/chat/parts/AnswerCard.tsx:161)
- kept: Copy icon in AnswerCard (src/clubhouse/screens/coachhelm/chat/parts/AnswerCard.tsx:150)
- kept: AskEvidenceView (src/clubhouse/screens/coachhelm/chat/parts/AnswerCard.tsx:109)
- kept: AskProse (src/clubhouse/screens/coachhelm/chat/parts/AnswerCard.tsx:106)
- kept: CoachComposition (src/clubhouse/screens/coachhelm/chat/parts/AnswerCard.tsx:74)
- kept: CoachVisualArtifact (src/clubhouse/screens/coachhelm/chat/parts/AnswerCard.tsx:74)
- kept: PlayerAskTabs (src/clubhouse/screens/coachhelm/chat/Ask.tsx:382)
- kept: PlayerAskView (src/clubhouse/routes/coachhelm.tsx:308)
- kept: AllowanceMeter (src/clubhouse/screens/coachhelm/chat/Ask.tsx:383)
- kept: HelmKey (src/clubhouse/shell/TopBar.tsx:105)
- kept: QuickChatProvider (src/clubhouse/shell/ClubhouseFrame.tsx:179)
- kept: QuickChatSession (src/clubhouse/shell/quick-chat/QuickChatProvider.tsx:90)
- kept: runPlayerTurn (src/app/api/coachhelm/v3/chat/stream/route.ts:346)
- kept: actions/[key] route (src/app/api/coachhelm/v3/chat/actions/[key]/route.ts:4)

### Practice group

- kept: PracticeHome (src/app/golf/(dashboard)/dashboard/practice/page.tsx:6)
- kept: PlayerPracticeHome (src/clubhouse/routes/practice.tsx:56)
- kept: Builder (src/clubhouse/routes/practice.tsx:158)
- kept: NewPlanSheet (src/clubhouse/screens/practice/PracticeHome.tsx:201)
- kept: Plan format link (src/clubhouse/screens/practice/PracticeHome.tsx:110)/dashboard/practice/format/error.tsx:7)
- kept: Practice nav entry (src/clubhouse/shell/nav.ts:88)
- kept: readEventPlans (src/clubhouse/data/calendar.ts:70)
- kept: practice tools in stream (src/app/api/coachhelm/v3/chat/stream/route.ts:591)
- kept: coachhelm-plan.css (imported by src/clubhouse/routes/practice.tsx:26 and
  routes/coachhelm.tsx:54)

### Read

- kept: ReadPage (src/clubhouse/routes/coachhelm.tsx:97)
- kept: ReadSkeleton (src/clubhouse/routes/coachhelm.tsx:247)
- kept: readHref (read address) (src/clubhouse/data/coachhelm-views-shape.ts:115)
- kept: coachhelm-read.css (imported by src/clubhouse/routes/coachhelm.tsx:50-52)

### Player file

- kept: PlayerFile (src/clubhouse/screens/coachhelm/file/PlayerFile.tsx:89)
- kept: FileSkeleton (src/clubhouse/routes/coachhelm.tsx:113)
- kept: PlayerYourWeek (src/clubhouse/routes/coachhelm.tsx:155)
- kept: YourWeek (src/clubhouse/routes/coachhelm.tsx:126)
- kept: playerFileHref (file address) (src/clubhouse/data/coachhelm-views-shape.ts:127)/dashboard/players/[playerId]/game/PlayerDeepDiveTabs.tsx:107)
- kept: coachhelm-file.css (imported by src/clubhouse/routes/coachhelm.tsx:50-52)

### Team board

- kept: TeamBoard (src/clubhouse/routes/coachhelm.tsx:78)
- kept: TeamBoardSkeleton (src/clubhouse/routes/coachhelm.tsx:289)
- kept: loadCoachTeamBoard (src/clubhouse/routes/coachhelm.tsx:78)
- kept: coachhelm-team.css (imported by src/clubhouse/routes/coachhelm.tsx:50-52)
- kept: PlayerPanel (src/clubhouse/screens/coachhelm/team/TeamBoard.tsx:367)

Also kept: `coachhelm-ask-v2.css` (routes/coachhelm.tsx:53) and `quick-chat.css`
(shell/quick-chat/QuickChatProvider.tsx:15).

## Deleted (OFF-only)

- `chat/ActionCard.tsx` (`AskActionCard`, `AskReceiptCard`), `Work`,
  `useElapsed`, the `<article class="ch-th-ans">` branch and Thread's own copy
  and follow-up markup, `workReceipt`, `AskHome`.
- `AskSheetProvider`, `useAskSheet`, `AskSheetButton` (the sparkle key) and
  `MaybeQuickChat`; the top bar draws `HelmKey` only.
- Every `isAskV2Enabled`, `isPlayerAskEnabled`, `isPracticePlansEnabled`,
  `isPracticeTabEnabled`, `isReadEnabled`, `isPlayerFileEnabled`,
  `isTeamBoardEnabled` read and their helper files (except `team-board/flag.ts`,
  which keeps the design switches `TEAM_BOARD_FIRST_VIEW` and `COURSE_TAB`).
- The Practice pages' redirect to Calendar, `practiceNavEnabled`, the
  `practice`, `quickChat` and `practicePlans` shell fields.
- The player's old board as their CoachHelm home (`PlayerBoard` at `!drill`);
  `PlayerBoard.tsx` stays for `coachHelmLinks` and the preview.

## Decisions

- Fairway keeps its tool set: the stream route passes `practicePlans: true`, and
  plan tools still need `teamTools` (Clubhouse for the team).
- The Practice pages no longer redirect to Calendar for anyone. A Fairway user
  is not offered the tab (the nav is Clubhouse's).
- No-round players get the first-run empty state whether or not the team has
  events (`isPlayerFirstRun`).
