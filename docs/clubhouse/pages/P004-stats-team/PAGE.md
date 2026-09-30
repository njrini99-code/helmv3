# P004 — Stats (team)

Team performance for the coach: the trend first, then strokes gained by leg, and which players gain or lose them. One player's own numbers are P005 (Stats, player).

## Identity

```text
Page ID:            P004
Page Name:          Stats (team)
Route:              /golf/dashboard/stats (coach, with no ?player=); the old address
                    /golf/dashboard/stats/team renders the same page in place for a coach
Bridge Namespace:   4 (Bridge IDs 4ccii, D-68; catalog codes CH-4xxx)
Roles:              coach
Implementation Root: src/clubhouse/screens/stats
Manifest:           config/clubhouse/pages/P004-stats-team.json
```

## Purpose

### Primary user

A college golf head coach reading how the team is scoring and where it loses strokes, before a
lineup decision or a practice plan. Players never see this page; on the same address they get their
own profile (P005).

### Job to be done

Tell whether the team is getting better, which part of the game is costing strokes, and which
players to look at next.

### Primary action

Open a player from the strokes gained grid (or from Season bests) to see their profile.

### Secondary actions

Change the window (Last 10, Season, Qualifiers), filter the rounds (round type, a date range, course, and Only these or Exclude these rounds), choose a leg, focus a player on the trend, switch
the trend between strokes gained and scoring, show the season from an empty window, export the
grid as a CSV, and on the phone sort the players by Avg or SG.

### Information hierarchy

1. The five figures and the trend: scoring, greens, putts, scrambling and birdies, and the team's
   weekly line against the players'.
2. Strokes gained by leg, and the grid of players by leg.
3. Team putting and Season bests.

### User should notice first

Whether the team's line is rising or falling, and which leg is amber.

### User should never have to think about

Whether a figure is complete (a failed read hides the figures instead of showing them half-built),
which rounds count (countable rounds of the length the filter's Holes control chose, 18 holes by default, and every figure names its window and sample),
or whether a small sample is a real trend (a player with fewer than three rounds of strokes gained
reads Early read, never 0.0).

### Success looks like

A coach names the leg that costs the team the most, opens the player who loses the most there, and
has read it in under a minute.

## Semantic features

Canonical IDs from `memory/registry.yml`:

```text
- stats_analytics
```

## Design authority

```text
Package:          design/handoff/ (v2; VERSIONS.md). v1 files kept where records cite them.
Desktop reference: design/handoff/Coach - Stats.html, stats.jsx, stats.css (v1: Stats.html,
                  screenshots stats-team-01..05)
Phone spec:       docs/clubhouse/phone/stats-team.md (approved, D-22), from
                  design/handoff/Coach - Stats - Mobile.html and m-stats.jsx, board "Team stats"
Status:           approved
```

## Related pages

### Enters from

The coach sidebar and phone tab bar (Stats), the old address /golf/dashboard/stats/team, the back
link and the "Team stats" button on a player's profile (P005), and the "Go to Stats" button of a
round review's not-found state.

### Exits to

A player's profile (P005) from a grid row, a Season best or a phone row, keeping the window
(`?player=<golf_players.id>` and `&window=`).

## Ownership

```text
Design:          the owner (Claude Design)
Implementation:  src/clubhouse/screens/stats (StatsTeam on the server, StatsTeamIslands as client
                 islands, StatsTeamPhone), loader src/clubhouse/data/stats-team.ts
Data:            stats_analytics: golf_teams, golf_team_members, golf_players, golf_rounds,
                 golf_round_stats_cache, golf_shots (putts), golf_pga_standards (the Tour values)
```

## Current status

```text
Design:         approved
Implementation: in_progress (desktop and phone built; gates in PROGRESS.md)
Contract:       complete (CONTRACT.md: all 25 categories answered)
Bridge:         reserved (IDs recorded; nothing is sent until the Bridge is wired, D-68)
Data:           existing (no schema change)
Verification:   partial (VERIFY.md)
Docs:           current
```
