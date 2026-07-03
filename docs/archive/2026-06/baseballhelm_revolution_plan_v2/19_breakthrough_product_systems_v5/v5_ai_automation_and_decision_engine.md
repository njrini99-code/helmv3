# V5 AI Automation And Decision Engine

AI should not be a personality. It should be a disciplined decision assistant embedded into the Baseball Program Operating Graph.

## Product Name

CoachHelm Decision Engine.

## AI Jobs

AI should do six jobs:

1. summarize
2. explain
3. classify
4. draft
5. recommend
6. detect data quality issues

AI should not:

- decide on its own
- message players without approval
- make medical claims
- invent facts
- hide sources
- become the primary navigation

## AI Output Types

Daily Brief:

- what changed
- who needs attention
- today's blockers
- staff actions

Signal Explanation:

- why signal exists
- source refs
- suggested action

Practice Recommendation:

- focus
- source reasons
- group suggestions
- caveats

Postgame Recap:

- facts
- interpretation
- practice implications
- player timeline suggestions

Performance Review:

- completion summary
- readiness flags
- practice impact
- caveat

Player Meeting Summary:

- recent progress
- concerns
- action recommendations
- next action

Staff Meeting Prep:

- agenda
- players to discuss
- unresolved signals
- decisions needed

Import Cleanup:

- mapping suggestions
- anomalies
- duplicate warnings
- low-confidence matches

## AI Workflow States

AI output status:

- draft
- pending_review
- approved
- dismissed
- resolved
- converted_to_task
- converted_to_note
- converted_to_practice_block
- expired

AI outputs should not be treated as final until reviewed if they affect players.

## AI Source Rules

Every output must include:

- source refs
- confidence
- source age
- visibility
- excluded restricted sources if applicable

If sources are missing:

- AI should say what it cannot know

Example:

"I cannot recommend a pitching workload change because no recent pitch count or bullpen import exists."

## Automation Rules

Automation should be rule-first, AI-assisted.

Examples:

- if practice starts in 4 hours and unpublished, create signal
- if lift assigned and no completion by deadline, create signal
- if player has class conflict with event, create conflict signal
- if import has low-confidence matches, create import review signal
- if AI creates practice recommendation, require staff review

## AI Settings

Settings:

- staff AI on/off
- player AI on/off
- require approval for player-visible summaries
- source types allowed
- confidence threshold
- expiration window
- restricted note exclusion
- medical language filter

## Why This Competes

Most AI sports products either summarize vaguely or pretend to be a coach.

BaseballHelm AI should be boringly trustworthy and operationally useful.

It should help coaches move from source to action faster.
