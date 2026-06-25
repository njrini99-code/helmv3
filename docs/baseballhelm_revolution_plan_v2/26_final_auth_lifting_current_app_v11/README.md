# BaseballHelm V11 Final Touch Layer

V11 is the final handoff layer for Claude Ultracode. It makes login, signup, team joins, staff accounts, assistant coaches, program lifting coaches, player lift delivery, and current-app grounding explicit enough for one-shot implementation.

Read V11 before V10 and V9.

V11 answers four final questions:

1. How do players, coaches, assistant coaches, and lifting coaches get into the product?
2. How do team joins, program joins, staff invites, and role permissions work without creating a messy auth model?
3. What exactly does the premium lifting coach dashboard do, and how does every lift show up for players?
4. How should Claude build efficiently inside the current `Downloads/helmv3` BaseballHelm app instead of inventing a parallel product?

## Files

- `v11_auth_team_join_staff_roles.md`  
  Login, signup, complete signup, team join links, staff invites, assistant coach roles, strength coach roles, multi-team rules, RLS rules, and onboarding UX.

- `v11_strength_coach_premium_lifting_system.md`  
  The full lifting/performance subsystem: groups, templates, training blocks, live weight room mode, lift assignment, player lift UX, readiness, soreness, bodyweight, PR tracking, charts, CoachHelm integration, and future multi-sport structure.

- `v11_current_baseballhelm_context_for_claude.md`  
  Current app routes, components, actions, hooks, stores, migrations, schema realities, and exact workflow guidance for Claude to maximize speed and avoid duplicating existing work.

- `v11_claude_final_touch_execution_prompt.md`  
  Copy-ready prompt block to place above the master Claude prompt so V11 drives the final one-shot build.

## Controlling Decisions

- Do not replace the existing Baseball auth flow. Extend it.
- Do not create a second auth model for lifting coaches. A lifting coach is a staff member with a coach profile, staff role, and capability scope.
- Do not build generic "fitness app" UI. Build a baseball performance command system for a strength coach managing groups, pitcher workloads, readiness, lift execution, and player development transfer.
- Do not hide lifting behind a generic team ops tab. It needs a first-class Performance/Lifting navigation surface for coaches and player-friendly lift cards for players.
- Do not create schema that ignores the current tables. Extend the current `users`, `baseball_coaches`, `baseball_players`, `baseball_teams`, `baseball_team_members`, and `baseball_team_coach_staff` model.
- Do not over-trust user metadata. Authorization must be database-backed and RLS-aware.

## V11 Build Priority

1. Auth and role model: existing user, coach, player, staff membership, team membership.
2. Team join and staff invite UX: player invite links, coach/staff invite links, strength coach invite links, pending approval states.
3. Program/team context selector: current team, current role, current season, current staff scope.
4. Performance schema: lifting groups, exercise library, programs, sessions, prescriptions, set results, readiness, soreness, bodyweight, modifications, and source lineage.
5. Lifting coach dashboard: overview, group builder, program builder, live weight room, player detail, compliance, readiness, CoachHelm signals.
6. Player lift experience: today card, assigned lift, set logging, RPE, readiness, soreness, substitutions, history, PRs, and calendar integration.
7. Current app optimization: reuse shell, actions, server clients, existing Baseball routes, current migrations, and Golf/Fairway premium patterns where they fit.

## What Success Looks Like

A head coach can create a program, invite assistant coaches and a lifting coach, generate team/player invite links, and see every staff member with the correct access.

A lifting coach can create groups, build a training block, assign lifts to position/player groups, monitor live execution, adjust loads, review readiness and soreness, and see whether strength work is helping or hurting baseball outcomes.

A player can join a team, see the correct team context, receive lifts on the calendar and Player Today surface, complete sets with weight/reps/RPE, enter soreness and bodyweight, and see progress without being exposed to restricted staff notes.

Claude can implement this without wasting time because V11 maps the current app structure, existing tables, gaps, and exact build order.
