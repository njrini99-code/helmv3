# V2 AI Output Contracts

CoachHelm AI is a product layer, not a chatbot. It produces structured, source-cited outputs embedded in workflows.

## Global AI Rules

- AI cannot make medical claims.
- AI cannot infer private academic status beyond provided source fields.
- AI cannot expose staff-only notes to players.
- AI must separate facts from interpretation.
- AI must include confidence and source references.
- AI must create a suggested action or explicitly say no action needed.
- AI output must be dismissible/resolvable.
- AI must not auto-send player messages or change records without review.

## Required AI Output Shape

```json
{
  "title": "string",
  "summary": "string",
  "facts": ["string"],
  "interpretation": "string",
  "recommended_action": {
    "label": "string",
    "type": "task|note|practice_adjustment|meeting_topic|none",
    "owner_role": "string"
  },
  "confidence": 0.0,
  "visibility": "staff_only|player_visible|restricted",
  "source_refs": [
    {
      "source_table": "string",
      "source_id": "uuid",
      "source_label": "string",
      "observed_at": "timestamp"
    }
  ],
  "risk_flags": ["string"],
  "expires_at": "timestamp",
  "disposition": "new|dismissed|resolved|converted_to_task"
}
```

## Daily Brief

Inputs:

- today events
- pending acknowledgements
- unavailable/limited players
- recent imports
- recent timeline events
- open tasks
- practice status

Output:

- 3-7 bullets max
- grouped into Today, Watch, Decide
- includes source refs

Bad output:

- "The team is tired" without wellness source
- "Player is injured" from soreness value

Good output:

- "Four players have not acknowledged today's 2:30 PM lift. Review before practice."

## Risk Flag

Inputs:

- availability
- wellness
- workload
- recent participation
- coach limitations

Output:

- transparent reason
- caveat
- recommended review action

Required caveat:

- "This is an operational flag, not a medical assessment."

## Practice Recommendation

Inputs:

- recent game stats
- coach notes
- practice attendance
- player availability
- upcoming opponent/event
- staff focus tags

Output:

- suggested focus
- affected groups
- time allocation idea
- source refs

Guardrails:

- no complex plan if practice time/location missing
- no player-private data in player-visible practice summary

## Import Cleanup

Inputs:

- raw headers
- sample rows
- known roster
- external IDs
- historical imports

Output:

- suggested column mappings
- low-confidence matches
- duplicate warnings
- anomalies
- questions for human review

Guardrails:

- never commits
- never creates players without review

## Player Meeting Summary

Inputs:

- player timeline
- stats snapshot
- practice notes
- lift/wellness summaries
- development goals

Output:

- what improved
- what needs attention
- source-backed action recommendations
- next action

Player-facing version:

- supportive
- no private staff labels
- no hidden risk terms

## Weekly Staff Report

Inputs:

- last 7 days events
- attendance
- lift compliance
- stats changes
- availability
- academic/travel conflicts
- open tasks

Output:

- top 5 topics
- players to discuss
- decisions needed
- unresolved operational items

## AI QA Checklist

- output has at least one source ref unless it is a setup/empty-state message
- confidence is below 0.7 when data is partial
- player-visible output has passed visibility filter
- every recommended action maps to a real action type
- dismissed/resolved state persists
- stale outputs expire or visibly mark stale
