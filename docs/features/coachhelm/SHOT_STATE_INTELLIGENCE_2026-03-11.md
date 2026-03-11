# Shot State Intelligence

Date: 2026-03-11

## Goal

Turn raw shot tracking into a deeper engine that is:

- par-aware
- lie-aware
- yardage-aware
- miss-location-aware
- driven by both `distance_to_hole_before` and `distance_to_hole_after`

This layer is designed to surface the scoring leaks and miss asymmetries coaches usually flatten into generic advice.

## Inputs Used

Directly from production shot tracking:

- `golf_shots.shot_type`
- `golf_shots.distance_to_hole_before`
- `golf_shots.distance_to_hole_after`
- `golf_shots.distance_unit_before`
- `golf_shots.distance_unit_after`
- `golf_shots.lie_before`
- `golf_shots.lie_after`
- `golf_shots.result`
- `golf_shots.is_penalty`
- `golf_shots.miss_direction`
- `golf_shots.shot_number`
- `golf_holes.par`
- `golf_holes.score`

## Derived State Model

Each shot is normalized into a state with:

- `par`
- `shot_type`
- `shot_role`
- `lie_before`
- `lie_after`
- `before_yards`
- `after_yards`
- `progress_yards`
- `before_bucket`
- `after_bucket`
- `miss_sector`
- `remaining_after`

### Shot roles

CoachHelm derives shot roles instead of using clubs:

- `par3_tee`
- `drive`
- `long_approach`
- `approach`
- `wedge_approach`
- `greenside`
- `putting`
- `penalty`

### Miss sectors

Miss sectors are canonicalized into:

- `left`
- `right`
- `short`
- `long`
- `short_left`
- `short_right`
- `long_left`
- `long_right`
- `rough`
- `sand`
- `fairway`
- `green`
- `penalty`
- `hole`

If `miss_direction` is absent, CoachHelm falls back to finish-state aware sectors such as `rough`, `sand`, `green`, or `penalty`.

## Engines Implemented

Implemented in:

- `src/lib/coachhelm/v2/mining/shot-state-intelligence.ts`

### 1. State baseline engine

Context key:

- `shot_role | par | lie_before | before_bucket`

For each context, CoachHelm computes:

- sample size
- average yardage left after the shot
- average yardage progressed
- average strokes remaining after the shot
- penalty rate
- green rate
- playable-finish rate

This makes the engine explicitly aware of both before and after yardage.

### 2. State leak engine

Compares the player’s context-level outcomes against the global completed-shot baseline for the same state.

Outputs:

- exact window leaking scoring
- extra yardage left after the shot
- extra strokes remaining after the shot
- estimated per-round stroke impact

### 3. Danger-side engine

Within the same state window, compares directional miss sectors.

Outputs:

- which side is more expensive
- how many extra strokes remain after that miss
- penalty-rate asymmetry between sides
- which side should become the “acceptable miss”

### 4. Lie penalty engine

Compares the same yardage window from different lies, anchored to fairway when possible.

Outputs:

- real yardage tax from rough or sand
- extra strokes remaining versus fairway
- lie-specific recommendation instead of generic “approach play” advice

## Wiring

The engine is now wired into:

- `src/lib/coachhelm/v2/orchestrator.ts`

Used in:

- full player analysis
- V2 round review generation

The resulting shot-state insights are converted into `ComposedInsight` objects and prioritized alongside:

- stats insights
- lie-specific insights
- shot-pattern insights
- predictions
- causal findings

## Why This Matters

This is the first CoachHelm layer that directly models:

- the exact shot state a player starts from
- the exact state they leave themselves after the shot
- the scoring consequence of specific miss sectors

That creates outputs like:

- “Par 4 fairway approaches from 130-160 are leaking scoring.”
- “Right misses are materially more expensive than left misses in this window.”
- “Rough creates a real yardage tax here, so the target has to change.”

## Next Extensions

The next high-value additions on top of this layer are:

1. finish-state ladders by `lie_after + after_bucket`
2. expected score-to-finish lookup by state
3. playable-side recommendations by context
4. par-5 second-shot aggression maps
5. short-side danger modeling where finish lies imply severe misses
