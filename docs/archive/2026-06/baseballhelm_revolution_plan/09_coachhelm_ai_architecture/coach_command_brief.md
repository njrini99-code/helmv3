# Coach Command Brief

## Purpose

Provide a practical AI assistant module for coach command brief that helps college baseball staff convert entered/imported data into decisions.

## User

Primary: coaching staff. Secondary: players only where explicitly player-facing and approved.

## Data sources

Roster, player profiles, calendar events, practices, practice grades, games/stats, lifts, wellness, availability, academics, travel, recruiting if enabled, imports, staff notes with permissions.

## Required tables

`players`, `teams`, `team_memberships`, relevant workflow tables, `ai_briefs`, `ai_flags`, `audit_logs`, `imports` where applicable.

## Prompt behavior

- Start with observed data.
- Identify changes and patterns.
- Include confidence.
- Ask for missing data only if it blocks interpretation.
- Give staff-safe recommendations.
- Never expose restricted fields to unauthorized users.

## Output format

Cards with title, severity, confidence, source links, recommendation, owner, and optional task creation.

## UI placement

CoachHelm AI tab, command center cards, player profile timeline, reports, import center assistant drawer.

## Example prompt

"Summarize what changed for the pitching staff in the last 7 days using pitch count, bullpen, wellness, availability, and lift data."

## Example output

"Medium confidence: two pitchers show workload/availability changes this week. Luke Marino threw 88 pitches Saturday and logged elevated soreness Sunday. Review bullpen plan before Tuesday. Source: game_stats_pitching, wellness_checkins, availability_statuses."

## What it should not say

- Do not say a player is injured unless a staff-entered limitation says so.
- Do not prescribe medical treatment.
- Do not call a player lazy or unreliable.
- Do not reveal staff-only notes to players.

## Human review

Sensitive flags require coach review before player visibility or notification.
