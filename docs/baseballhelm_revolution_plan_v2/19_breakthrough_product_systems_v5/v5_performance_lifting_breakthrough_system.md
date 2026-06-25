# V5 Performance And Lifting Breakthrough System

This file upgrades the lifting/performance product from "complete module" to "competitive system."

## The Competitive Problem

TeamBuildr, BridgeAthletic, TrainHeroic, Volt, and CoachMePlus already handle:

- program building
- exercise libraries
- athlete logging
- strength reports
- questionnaires
- team compliance

BaseballHelm should not try to outbuild them in generic strength software.

BaseballHelm wins by answering what those tools do not answer naturally:

How does today's strength and readiness information change baseball decisions?

## The Product Name

Performance-to-Field Engine.

This should be the internal product concept.

## Core Promise

The strength coach logs or imports performance data. BaseballHelm translates it into:

- player availability
- practice group adjustments
- pitcher/catcher/two-way workload flags
- player Today actions
- staff meeting items
- coach signals
- player timeline events

## Strength Coach Home

The strength coach should not land on the generic coach command center.

Strength Coach Home first viewport:

- Today's lift sessions
- check-in completion
- no-check-in players
- limited players
- lift completion
- practice impact
- pitcher workload watch
- import issues

Primary actions:

- Import lift results
- Create lift assignment
- Review readiness
- Flag player for staff
- Add practice limitation
- Send player task

## Player Lift Flow

Player Today should include a lift card only when relevant.

Lift card states:

- not started
- due soon
- in progress
- completed
- partially completed
- skipped with reason
- modified
- staff review needed

Player lift logging:

- complete whole workout
- log exercise rows
- RPE
- limitation note
- ask for modification
- mark unable

Player check-in:

- sleep
- soreness
- energy
- stress
- throwing arm
- lower body
- availability
- need staff follow-up

Player UX principle:

The player should never feel like they are filling out an insurance form. It should feel like telling the staff what they need to know before baseball activity.

## Strength Coach Lift Board

The board should be a serious operational table.

Columns:

- player
- position
- group
- assignment
- completion
- RPE
- soreness
- throwing arm status
- lower body status
- availability
- last check-in
- practice impact
- source
- action

Interactions:

- filter pitchers only
- filter no check-in
- filter limited
- filter missed lift
- filter two-way players
- bulk assign task
- bulk mark reviewed
- add to meeting
- modify assignment

## Practice Impact Translator

This is the breakthrough.

Rules:

- if player is limited and practice includes intense block, generate practice impact signal
- if pitcher soreness high and bullpen block assigned, flag pitching coach
- if lift incomplete and player has heavy practice workload, flag strength coach
- if catcher lower body status poor and bullpen catching scheduled, flag staff
- if two-way player cannot throw but is available to hit, update practice group suggestion

Output examples:

- "Move Caleb Morrison to hitter-only group today. Sources: check-in throwing arm 4/5, Sunday 42 pitches, strength note no mound work."
- "Review catcher bullpen workload. Eli Carter has class conflict during early defense and lower-body soreness 4/5."
- "Three players missed lift before practice. Create follow-up task for strength coach."

## Readiness Composite

Do not call this injury risk.

Call it:

- Field Readiness
- Practice Readiness
- Availability Review

Score states:

- Ready
- Monitor
- Review
- Limited
- Unavailable

Each state must include:

- source breakdown
- confidence
- what changed
- suggested action

Example:

Status: Review

Reasons:

- throwing arm soreness 4/5
- 42 pitches two days ago
- no check-in yesterday

Suggested action:

- pitching coach review before bullpen

Caveat:

- operational flag, not medical assessment

## Pitcher Workload

Pitcher workload needs more than pitch count.

Inputs:

- game pitches
- bullpen pitches
- days rest
- role
- last outing
- soreness
- strength completion
- coach note

Statuses:

- full go
- light catch
- bullpen cap
- no mound
- recovery
- hitter-only for two-way

Interactions:

- status appears in practice planner
- player sees player-safe assignment
- staff sees source details
- signal goes to pitching coach

## Two-Way Player Handling

Two-way players are where generic systems break.

BaseballHelm should allow split availability:

- hitting availability
- throwing availability
- lifting availability
- running availability

Example:

Caleb Morrison:

- Hit: available
- Throw: no mound
- Lift: modified lower
- Practice group: hitters
- Signal owner: pitching coach

## Catcher Workload

Add catcher-specific status:

- full catching
- no bullpen catching
- catching limited
- hitting only
- receiving work only

Sources:

- innings caught
- bullpen caught
- lower body soreness
- coach note

## Strength Programming Depth

Phase 1:

- assignments
- results
- imports
- check-ins
- compliance
- practice impact

Phase 2:

- templates
- group programming
- exercise normalization
- player progress charts

Phase 3:

- exercise library
- video demos
- periodization
- external sync

## Performance Reports

Reports should be baseball-operational:

- Who is unavailable for baseball?
- Who missed lift?
- Who needs staff review before practice?
- Which groups are low compliance?
- Which players have repeated readiness flags?
- Which pitcher/catcher workload issues affect the week?

Not just:

- total tonnage
- average RPE
- workout leaderboard

## Player Profile Integration

Performance tab:

- current status
- lift history
- check-in trend
- availability history
- practice impact history
- strength coach notes
- player-visible progress

Timeline:

- lift completed
- lift missed
- modified assignment
- readiness flag
- staff review
- practice limitation

## AI Performance Role

AI should act like an assistant strength coordinator:

- summarize completion
- highlight practice-impact issues
- prepare staff meeting notes
- explain readiness status
- draft player-safe check-in reminders

It should never:

- diagnose
- predict injury
- assign medical restrictions
- override staff

## Why This Competes

TeamBuildr tells the strength coach what was programmed and completed.

BaseballHelm tells the baseball program what it means for today.

That is the competitive edge.
