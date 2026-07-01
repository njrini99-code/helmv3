# Jobs To Be Done

> Purpose: enumerate the concrete jobs a college golf coach, a college golf player, and (at high level) baseball/lift-lab users hire this product to do — so that feature work, prioritization, and PR review can be checked against "does this serve a real job" rather than against a feature-list checklist.

This doc frames every job as **When [situation], I want [motivation], so I can [outcome]**. Jobs are grouped by persona. Each job links to the feature area that serves it (see `memory/context/golfhelm-features.md` for implementation detail) and, where relevant, to the competitive gap it closes (see `docs/v3-research-competitive-landscape.md`). Cross-reference `00-business-context.md` for company/product framing, `01-personas.md` for persona framing, and `03-product-invariants.md` for the rules that keep these jobs safe to run in production.

Read this doc as: **jobs are stable even when features change**. If a PR changes *how* a job is served, that is fine. If a PR makes a job harder or impossible to complete, that is a regression regardless of how the code looks.

---

## 1. Golf coach jobs

The coach is the buyer and the primary daily user. The tenant unit is the program/team (`organizations` → `golf_teams`, coach linkage via `golf_team_coach_staff` — never `golf_coaches.team_id`, per `docs/v3-master-plan.md:80-99`). All coach jobs below assume RLS scopes every read/write to the coach's own team(s) via `is_team_coach(team_uuid)`.

### 1.1 Pick who travels (qualifying and travel selection)

- **When** a qualifying event finishes and I need to set the travel roster for the next tournament, **I want** a single workspace that shows live leaderboard position, ties, and historical qualifying performance side by side, **so I can** make a defensible selection decision in minutes instead of reconciling scorecards, texts, and a spreadsheet by hand.
- **When** I'm mid-qualifier and scores are coming in from multiple rounds, **I want** the entries and standings to update automatically as players submit rounds, **so I can** trust the leaderboard without manually re-totaling.
- **When** I've made a selection, **I want** it to flow directly into the travel itinerary and calendar event, **so I can** avoid re-entering the same roster in three places.

Served by: Qualifiers (`golf_qualifiers`, `golf_qualifier_entries`, `golf_qualifier_selections`; `memory/context/golfhelm-features.md` §3), Travel (§10), Calendar event linkage (§4).

Competitive framing: `docs/v3-research-competitive-landscape.md:393` names the qualifying/travel-selection workflow "the most-painful, most-frequent, most-poorly-tooled workflow in college golf" and calls it a stated differentiator — no competitor (Clippd, Golfstat, Golf Genius) has built a coach-facing selection workspace. This job is the single highest-leverage job in the product; treat regressions here as severe regardless of surface area touched.

Invariant tie-in: qualifier selection is a save/submit surface. Any change to how selections are written must use upsert/`ON CONFLICT`, never DELETE-then-INSERT (`.greptile/instructions.md:69-72`) — a transient failure between the two statements has previously caused permanent data loss on save paths.

### 1.2 Know who is improving and why (Strokes Gained + CoachHelm insights)

- **When** I'm evaluating a player's trajectory across a season, **I want** their performance broken into a defensible number (Strokes Gained, split OTT/APP/ARG/PUTT) rather than raw scoring average, **so I can** tell whether they're actually getting better or just playing easier courses.
- **When** a player's scores start trending the wrong way, **I want** the system to surface *why* — a detected pattern, a stat regression, a specific hole-type weakness — rather than just flagging that the number moved, **so I can** have a specific, actionable conversation instead of a vague "let's work harder" one.
- **When** I open the team dashboard on a given morning, **I want** the alerts/patterns I see ranked by what actually matters (my coaching philosophy, not a fixed order), **so I can** triage 15 players in the time I actually have.

Served by: Stats & Analytics (`golf_player_stats_cache`; §2), CoachHelm AI Engine — alerts, patterns, insights (§12–16), Coaching Intelligence Settings / philosophy weighting (§18).

SG correctness stakes: SG is defined as `baseline_expected_strokes(start) - baseline_expected_strokes(end) - 1`, summed across four categories to SG:Total, and is **cached, not recomputed on read**, in `golf_player_stats_cache` (`.greptile/instructions.md:81-82`, `docs/v3-master-plan.md:98`). Getting this number wrong doesn't just produce a bad chart — it undermines the entire "know who is improving and why" job and the core value prop against Clippd, whose own SG display users already find hard to interpret (competitive doc, §1 "what users complain about"). This is the single highest-scrutiny numeric surface in GolfHelm.

Known gap (be honest with the reviewer, not the user-facing doc): as of the last feature-registry pass, SG columns in the stats cache are populated as null in places — "SG framework exists but not populated from shot data" (`memory/context/golfhelm-features.md`, Round Tracking §1 and Stats & Analytics §2 gap tables). Any PR claiming to "fix stats" should be checked against whether it actually populates SG, not just whether it changes UI.

Insight-ranking gap: philosophy-weighted insight ranking and outcome tracking (did an insight actually lead to improvement) are known incomplete (§12 gap table: "Insight ranking unused," "Effectiveness tracking not wired," "Outcome measurement missing"). The `golf_insight_*` effectiveness-ledger tables exist for exactly this job; a PR that adds insight generation without wiring outcome tracking is only half-serving this job.

### 1.3 Run practice and the team calendar

- **When** I'm planning the week, **I want** one calendar surface for practice, tournaments, qualifiers, travel, and class conflicts, **so I can** schedule without double-booking a player against a class or an already-committed trip leg.
- **When** a player has a class that conflicts with a practice time, **I want** the system to flag it automatically, **so I can** catch the conflict before it becomes a missed practice or a missed exam.
- **When** I need to know who's coming to an event, **I want** RSVP + attendance check-in in one place, **so I can** stop chasing texts to confirm headcount.
- **When** a practice time is recurring, **I want** to edit "this one," "this and future," or "all" without re-creating the series, **so I can** handle the normal churn of a season schedule without data entry pain.

Served by: Calendar & Events — recurring events, availability polling, iCal feeds, academic conflict detection, attendance (§4, 17 DB tables). Depends on Academics/Classes (§11) for conflict detection.

Invariant tie-in: calendar/scheduling timezone correctness is called out as a high-severity class of bug for this business (recurring events, RRULE, iCal RFC 5545 export) — a coach who gets the wrong practice time from a timezone bug loses trust in the whole calendar job, not just that one event.

### 1.4 Message the team

- **When** I need to reach the whole team or a subset fast, **I want** realtime team messaging with attachments and read receipts, **so I can** confirm information actually landed instead of guessing who saw a text.
- **When** something is urgent and needs acknowledgement (a schedule change, a compliance form), **I want** a formal announcement with acknowledgement tracking, not a chat message that scrolls away, **so I can** prove the team was notified.

Served by: Messaging (`golf_conversations`, `golf_messages`; §7), Announcements with acknowledgement tracking (§8), Documents linkage (§9).

Competitive framing: coach-player communication in Clippd is comment-thread-on-posts, not a workflow surface (competitive doc §1 "where they're vulnerable"); CoachNow is video+comms but not golf-analytics-native (competitive doc §4). A first-class messaging + acknowledgement-tracked announcement workflow, tied to the same roster/team object as everything else, is a differentiator worth protecting.

### 1.5 Set and approve player goals

- **When** I want a player working on something specific between now and the next tournament, **I want** to set a measurable focus area (area type, target metric, target value) that both of us can see progress against, **so I can** turn a vague "work on your putting" into a trackable commitment.
- **When** a player proposes their own goal, **I want** to approve or adjust it before it becomes the plan of record, **so I can** keep development plans aligned with what I actually think matters for that player and that season.
- **When** I check in on a player later, **I want** to see progress as current-value-vs-target with a trend (improving/declining/stable), **so I can** tell at a glance whether the goal is working without re-deriving it from raw stats.

Served by: Development Plans / focus areas (`golf_player_focus_areas`; §25), fed by Roster (§5) and Rounds-derived stats (§1–2). Player-facing counterpart is My Development (§21).

Competitive framing: coach-approved, player-set Goals as a first-class object is named explicitly as a differentiator in the competitive doc — Clippd's "What To Work On" is data-driven and coach-dashboard-visible but is **not coach-curated or goals-aware**; it surfaces weaknesses without tying them to a player-set objective or season arc (competitive doc §1 "where they're vulnerable"). This job is the product's answer to that gap. Treat "goals exist but aren't visibly tied to insights/patterns" as a partial miss on this job, not just a nice-to-have.

---

## 2. Golf player jobs

The player is a student-athlete — many are minors, so every job below is also a compliance surface (see `03-product-invariants.md` for the FERPA/COPPA-adjacent framing). Player access is scoped via `golf_team_members` and `is_team_player(team_uuid)`.

### 2.1 Log rounds fast

- **When** I finish a hole (or a whole round) at the course, **I want** shot entry that's fast enough to do in real time between shots, with the round draft auto-saving, **so I can** actually use it on the course instead of reconstructing my round from memory that night.
- **When** my connection drops or I close the app mid-round, **I want** to resume exactly where I left off — same hole, same shot sequence, same miss tags, **so I can** not lose 12 holes of data to a dead phone battery or a bad signal at hole 14.
- **When** I submit a completed round, **I want** it to immediately feed my stats, trigger my AI review, and (if it's a qualifier round) update the leaderboard, **so I can** see the payoff of logging carefully without extra steps.

Served by: Round Tracking — 4-step wizard, auto-save every 15s, resume-in-progress (`src/hooks/golf/use-auto-save-round.ts`; §1).

Known gap: offline shot sync via IndexedDB is currently disabled due to a `ShotRecord` ↔ `OfflineShot` type mismatch (§1 gap table) — DB auto-save still works when connected, but true offline capture (no signal at the course) is not yet reliable. This directly limits the "log fast, don't lose data" job at courses with poor cell coverage; flag PRs that touch offline sync against this known gap rather than assuming it's solved.

Invariant tie-in: round submission is the highest-volume save/submit/sync surface in the product. It must never be DELETE-then-INSERT; per-round writes to `golf_rounds`/`golf_holes`/`golf_shots` must be structured so a transient failure mid-submit cannot silently destroy a round a player just spent 20 minutes entering.

### 2.2 See my Strokes Gained and my goals

- **When** I finish a round, **I want** to see how I actually performed relative to baseline (SG by category), not just my score, **so I can** understand what part of my game gained or lost strokes.
- **When** I check my profile, **I want** to see my current focus-area goals and how close I am to the target, **so I can** know what I'm supposed to be working on without asking my coach again.
- **When** my coach sets or adjusts a goal, **I want** to see the update and, where the workflow allows it, propose my own, **so I can** stay engaged in my own development plan rather than being a passive recipient of it.

Served by: Player CoachHelm Dashboard (§20), My Development (§21), Stats & Analytics player view (§2).

Numeric-correctness tie-in: this is a player-facing view of the same SG number covered in coach job 1.2 — the "SG columns are null" gap applies here too. A player-facing SG view that silently shows null/zero instead of an honest "not yet available" state is a correctness bug, not a display bug.

### 2.3 Know my schedule

- **When** I'm planning my week around class, practice, and travel, **I want** one calendar that shows all of it with conflicts already flagged, **so I can** stop cross-checking a team calendar against my own class schedule by hand.
- **When** I'm traveling for a tournament, **I want** trip details (hotel, transport, packing list, room assignment) in the same place as the rest of my schedule, **so I can** find logistics without a separate group text thread.
- **When** a practice or event is added or moved, **I want** to be notified and asked to RSVP, **so I can** confirm my availability without a coach having to chase me down.

Served by: Calendar & Events, player view (§4), Travel itinerary player view (§10), Academics/Classes conflict detection (§11).

---

## 3. CoachHelm-specific jobs

CoachHelm is not a separate product — it is the AI insight/narrative layer embedded in GolfHelm (`memory/context/coachhelm-ai.md`), extending into baseball (`src/lib/coachhelm/baseball/`). These jobs sit on top of the coach and player jobs above.

### 3.1 Get a plain-language round review

- **When** a player finishes a round, **I want** (as the player, and as the coach reviewing it) a narrative explanation of what happened — not just a stat table — that ties specific holes/shots to specific causes, **so I can** understand the round the way a human coach would explain it, in the time it takes to read a paragraph.
- **When** the round was unusual (a big number on one hole, a hot putting stretch), **I want** the review to call that out with the predicted-vs-actual comparison and a causal explanation, **so I can** know whether it's a real pattern or a one-off.
- **When** the AI can't produce a well-cited narrative (budget exhausted, citation check fails), **I want** a clear fallback to a template-based summary rather than a broken or hallucinated review, **so I can** still get *something* usable rather than nothing or, worse, a confidently wrong explanation.

Served by: Round Review AI (`golf_round_reviews`; §23) — V2 pipeline (`V2ReviewSummary`, `V2PatternsSection`, `V2PredictionCard`, `V2CausalInsights`) with V1 rule-based fallback.

Competitive framing: this is named directly in the competitive doc as the product's clearest white space — "nobody has it." Clippd's round summaries are static dashboards, not narrative explanations, and public discourse confirms Clippd has no native AI chat / no LLM round narrative (competitive doc §1). 18Birdies has an AI Coach for swing video, not round narrative (competitive doc §8). This job is a genuine category-first, not a me-too feature — treat any regression to citation-checking or fallback behavior on this path as high severity.

Invariant tie-in: `composeRoundReview` must verify citations and regenerate once before falling back to template, and must never be called client-side (`.greptile/instructions.md:139-146`). The per-coach daily LLM budget (`golf_coachhelm_llm_budget`, checked in `src/lib/coachhelm/v3/llm/budget.ts` before every `compose()`) determines whether this job is served by a real narrative or a template; on exhaustion the priority fallback order is `round_review > coach_chat > hero_narrative -> template` — meaning round review is protected *first* when budget runs low, which matches its priority as the flagship job. A PR that changes fallback priority order should be scrutinized against this stated intent.

### 3.2 Talk to a coaching assistant about my team

- **When** I have a question about a player or a trend that isn't already surfaced as an alert, **I want** to ask it in natural language and get an answer grounded in that player's actual data, **so I can** get the same value as scrolling through raw stats without doing the scrolling myself.

Served by: `composeCoachChat` (part of the same LLM budget/citation/fallback contract as round review, per `.greptile/instructions.md:139-146`).

### 3.3 Trust the number behind the narrative

- **When** CoachHelm tells me a player is improving or declining, **I want** that claim traceable back to actual round/shot data and the golf-domain research baseline (`docs/v3-research-golf-domain.md`), not a plausible-sounding LLM guess, **so I can** act on it with confidence in front of a player or a parent.

This is a cross-cutting invariant more than a standalone feature, but it is worth stating as a job because it is the thing that makes jobs 1.2 and 3.1 trustworthy rather than merely fluent: `.greptile/instructions.md` states every causal assertion in v3 generators must trace back to `docs/v3-research-golf-domain.md`, and the v2 scoring functions (`v2/insights/`, `v2/composite/`) must stay pure (no fetches/Supabase inside scoring) so their output is deterministic and auditable.

---

## 4. Baseball and Lift Lab (stable, high-level)

BaseballHelm and Lift Lab are actively being rebuilt at the time of writing; do not treat this section as an implementation reference — see `feedback_baseball_remediation_rules` / `fairway_baseballhelm_migration_deferred` context for current state. State the job only at the level that should stay true across the rebuild:

- **BaseballHelm:** When a college baseball coach needs to manage a roster, recruiting pipeline, and team scheduling in one place, they want the same tenant-scoped, RLS-isolated team-management foundation GolfHelm already proved out, so they can run their program without stitching together spreadsheets and a separate recruiting tool.
- **Lift Lab:** When a coach or strength staff member needs to track an athlete's strength & conditioning work (check-ins, body-map, core lifts) alongside that athlete's sport-specific performance data, they want it to live in the same account and team context as the rest of that athlete's record, so strength training and on-field/on-course performance can eventually be reasoned about together instead of in two disconnected systems.

---

## For the reviewer

- Flag a PR when it changes qualifier-selection save/submit logic without preserving upsert/`ON CONFLICT` semantics — this is job 1.1 and a documented destructive-write incident class (`.greptile/instructions.md:69-72`).
- Flag a PR when it touches SG calculation, `golf_player_stats_cache`, or round-review causal narrative and does not cite `docs/v3-research-golf-domain.md` for the underlying claim — this undermines jobs 1.2, 2.2, and 3.1 simultaneously.
- Flag a PR that adds or changes CoachHelm LLM output (round review, coach chat, hero narrative) without going through the budget check in `src/lib/coachhelm/v3/llm/budget.ts` or without preserving the citation-verify-then-regenerate-once-then-template-fallback contract — this can silently break job 3.1 into either runaway cost or silent quality downgrade.
- Flag a PR that changes round submission, roster writes, or any other save path to DELETE-then-INSERT — this directly threatens job 2.1 (a player's just-logged round) and the documented prior data-loss incident.
- Flag a PR that changes calendar/recurring-event/timezone logic without test coverage for the recurring-edit scopes (`this | thisAndFuture | all`) and iCal export — this threatens job 1.3 and 2.3 silently (wrong-time bugs don't crash, they just erode trust).
- Flag a PR that claims to "improve insights" or "improve goals" without wiring the existing effectiveness-tracking/outcome-measurement gap (`golf_insight_*` tables, §12 known gaps) — new insight generation without outcome tracking only half-serves job 1.2 and 1.5.
