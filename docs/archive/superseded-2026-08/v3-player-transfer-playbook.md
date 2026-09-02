<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Companion doc to docs/v3-master-plan.md; zero memory/registry.yml references. The wave sequence it was written against has run past W35 into the later clean-slate/production-readiness passes.
KEPT FOR HISTORY -- do not delete this file.
-->

# CoachHelm v3 — Player Transfer & Lifecycle Playbook

> Edge cases the v3 engine and UI must handle correctly. Every wave that adds player-scoped data must read this and confirm its tables don't break these scenarios. If a wave introduces a new player-scoped table, add a row to the matrix at the bottom.

---

## Scenarios

### S1 — Transfer mid-season (player leaves Team A, joins Team B)

**What happens in `golf_team_members`:** the row for (player_id, Team A) is updated to `status='inactive'` with `removed_at`. A new row is inserted for (player_id, Team B) with `status='active'`.

**What v3 must do:**

- **Standing** (`golf_player_standing`) — recompute against Team B on next cron run. Team-percentile against Team A is no longer relevant; the row's `team_avg` and `team_pct` reflect new team. Old row updated in place; no second row per team.
- **Goals** (`golf_goals`) — existing active goals stay with the player. If `team_id` is set, update it to Team B and record a `transfer_reason` on the goal. Coach-assigned goals from Team A's coach are transitioned to `state='abandoned'` with `transfer_reason='player_left_team'` — Team B's coach reassigns from scratch.
- **Intent** (`golf_coach_player_intent`) — Team A's coach's intent row stays in the table (do not delete; needed for outcome attribution history) but is no longer used by the engine (intent is queried via `is_team_coach`, which now returns false for Team A's coach against this player). Team B's coach starts at default `develop`.
- **Insights** (`golf_coach_insights`) — historical insights retain `team_id` from when they were generated. Engine writes new insights with Team B's `team_id` going forward.
- **Genome** (`golf_player_genome`) — unchanged. Genome is per-player, not per-team. Next nightly compute uses the player's full round history regardless of team.
- **Chat conversations** (`golf_coachhelm_chat_conversations`) — Team A's coach loses live visibility (RLS filters). Team B's coach starts with empty history. The data is preserved in case the player returns.
- **Effectiveness / weights** (`golf_insight_effectiveness`, `golf_coachhelm_coach_weights`) — coach weights are per-coach, not per-player. Team A's coach's weights persist for future players.

### S2 — Multi-team membership (Showcase + High School, baseball-style — uncommon for golf but possible for transfer-eligible players)

**What happens in `golf_team_members`:** two `status='active'` rows for the same player.

**What v3 must do:**

- **Standing** — choose the *primary* team for percentile (use the team with the most recent activity in the last 30 days; ties broken by `golf_team_members.is_primary` if set, else lower team_id). Document the choice in `evidence.primary_team_id`.
- **Goals** — coach from either team can assign goals; player sees both. The Goals list filter has a team chip.
- **Intent** — each coach has their own intent row. Both are respected when generating insights; the more conservative `alert_posture` wins (silent > conservative > balanced > aggressive).
- **Weekly recap email** — each coach gets their own email for the same player.

### S3 — Graduation (player exits the system)

**What happens in `golf_team_members`:** all active rows for the player are flipped to `status='graduated'`.

**What v3 must do:**

- **Engine writes** stop immediately for this player (BaseGenerator checks `is_active_player(player_id)` before running).
- **All historical data retained** for outcome attribution and coach weight learning.
- **Goals** — auto-mark all active goals as `state='abandoned'` with `transfer_reason='graduated'` on the next cron pass.
- **Player auth** — separate concern; deletion of `users` row cascades to `golf_players` (which cascades to most v3 tables). Graduation does NOT delete; deletion is a separate explicit action initiated by the user.
- **Read paths** — coach can still view the graduated player's history under `/dashboard/coachhelm/genome/[playerId]` for recruiting reference. Player loses their own dashboard (auth-gated by `current_player_id()` which now returns nothing for them).

### S4 — New player (onboarding, baseline period)

**What happens in `golf_team_members`:** a single `status='active'` row is created on join.

**What v3 must do:**

- **Standing** — player has 0 rounds. `golf_player_standing` has no rows for them. Components render the empty state (no standing bars). Cron creates rows once they have ≥5 rounds.
- **Goals** — engine suggestion loop runs on round count ≥5. Before that, only manual goals work. Coach can assign immediately.
- **Intent** — default `narrative_goal='develop'`, `alert_posture='balanced'` written by W27 backfill OR on first round insertion (whichever fires first).
- **Genome** — null until ≥8 rounds per Part XIII.
- **Hero LLM narrative** — falls back to a non-personalized welcome string until standing exists.
- **Round review LLM** — works from round 1 with whatever data is available; missing-baseline cases handled via prompt scaffolding.

### S5 — Player on roster but inactive (injury, leave of absence)

**What happens in `golf_team_members`:** row stays `status='active'` but no rounds entered for > 30 days.

**What v3 must do:**

- **Standing** — stale by definition. Don't refresh percentiles on stale data; mark the row's `computed_at` and let the UI surface "Not active recently."
- **Goals** — ends-at-based auto-evaluator still fires; goals with no movement reach `state='missed'`. Coach should pause manually if they know about the leave. UI surfaces a "pause active goals?" prompt if no rounds in 14 days.
- **Coach alerts** — engine skips alert generation for players with no rounds in 14 days unless `narrative_goal='rehabilitate'` (those still get monitoring).
- **Weekly recap** — the player appears in an "On hiatus" section, not "Active players."

---

## Per-Table Matrix

| Table | S1 Transfer | S2 Multi-team | S3 Graduation | S4 New | S5 Inactive |
|---|---|---|---|---|---|
| `golf_player_standing` | Recompute next cron | Primary-team logic | Retain | Empty until 5 rounds | Mark stale |
| `golf_goals` | Reassign or abandon w/ `transfer_reason` | Both teams visible | Auto-abandon | Manual only until 5 rounds | Prompt pause |
| `golf_coach_player_intent` | Old row retained, unused | Multiple rows | Old row retained | Default backfilled | Honor `rehabilitate` |
| `golf_coach_insights` | Historical retained, new on Team B | Each team's surface | Stop writes | Start from round 1 | Skip if 14d idle |
| `golf_player_genome` | Unchanged | Unchanged | Retained | Null until 8 rounds | Mark stale |
| `golf_coachhelm_chat_conversations` | RLS handoff (Team B blank) | Per-coach | Coach retains view | Empty | Continues |
| `golf_qualifier_selections` | Old selections retained | Per-team | Retained | N/A until eligible | N/A |
| `golf_player_milestones` | Retained on player | Retained | Retained | Empty | Continues |

---

## How to Use This Doc

When you add a new player-scoped table in a wave:

1. Add a column to the matrix above with the table name.
2. Fill in the cell for each of the five scenarios.
3. If any scenario needs custom code (not just RLS), reference the file path in the cell.

Reviewer rejects PRs that add player-scoped tables without updating this matrix.
