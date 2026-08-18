-- Correct the direction + label of the two break-direction bias metrics.
--
-- `golf_metrics.direction` is read at RUNTIME by the goal-suggestion cron
-- (`v3/goals/suggestion-writer.ts` pulls metric_id/direction/active), so this
-- row is what decides whether a suggested goal target sits above or below the
-- player's baseline.
--
-- Both rows say `lower_better` and are labelled as a miss share. The value
-- stored under them is a MAKE percentage: `PuttBiasGenerator` (W22) emits only
-- the player's WEAKER break direction and writes `weak_pct`, documented at
-- putt-bias.ts:62 as "Make-% on the weaker direction within the cut", with its
-- own evidence label "Break-direction make % (distance-controlled)".
--
-- Measured against production 2026-08-18. The generator's `comparison_value` is
-- the same player's make % on their STRONGER side, and across the active
-- insights carrying both numbers:
--
--     your_value < comparison_value    8 rows
--     your_value > comparison_value    0 rows
--
-- A miss share on the weaker side would be the HIGHER number, not the lower
-- one. 31 active insights carry these two metrics (26 left, 5 right), and a
-- goal suggested off the old direction asked the player to hole FEWER putts on
-- the side they already struggle with.
--
-- The W9 miss-share definition never had a producer — nothing has ever written
-- a miss share under these ids — so this is not a redefinition in competition
-- with live data; it is the metric's only real meaning.
--
-- high/low are deliberately untouched: `DIR_TO_METRIC_ID` maps only 'left' and
-- 'right', so those two have no producer at all and there is no evidence of
-- what a value under them would mean.

UPDATE golf_metrics
SET direction     = 'higher_better',
    display_label = 'Break Make % (weaker side, L-to-R)',
    description   = 'Make percentage on left-to-right breaking putts, distance-controlled, when that is the player''s weaker side.'
WHERE metric_id = 'putt_miss_bias_left_pct';

UPDATE golf_metrics
SET direction     = 'higher_better',
    display_label = 'Break Make % (weaker side, R-to-L)',
    description   = 'Make percentage on right-to-left breaking putts, distance-controlled, when that is the player''s weaker side.'
WHERE metric_id = 'putt_miss_bias_right_pct';
