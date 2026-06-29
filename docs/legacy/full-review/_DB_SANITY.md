# CoachHelm DB sanity check — 2026-04-27

Production project: `qmnssrrolpinvwjjnufo` (Helm-Production)

## Volume snapshot

| Table | Rows | Verdict |
|---|---|---|
| `golf_coach_insights` | 240 | ✅ real narratives, 168 evidence-backed |
| `golf_round_reviews` | 48 | ✅ round-specific text, grades A–F |
| `golf_predictions` | 749 (160 validated) | ✅ **70.6% accuracy**, avg abs error 2.05 strokes |
| `golf_patterns_v2` | 22,117 | ⚠️ 99.95% are `contextual` with stroke_impact 0 (noise) |
| `golf_insight_drill_attachments` | 477 | ✅ ~2 drills per evidence-backed insight |
| `golf_player_focus_areas` | 7 | ⚠️ 100% coach-curated; promotion flow never fired |
| `golf_insight_player_feedback` | **0** | ❌ rateInsightAsPlayer wired but no row ever written |
| `golf_insight_effectiveness` | **0** | ❌ `/dashboard/analytics/coachhelm` empty |
| `golf_insight_feedback_scores` | **0** | ❌ |
| `golf_review_insights` | **0** | ❌ |

## 4 gaps to fix (ranked)

### 1. Round review counters are never written
All 48 rows: `insights_count = highlights_count = areas_count = 0`. JSONB arrays have avg 2.9 highlights, 3.5 areas. Writer in `round-review-system.ts` populates the JSONB but not the denormalized counters.

### 2. Two insight cohorts coexist
- 168 rows — new evidence-backed pipeline (lifecycle_state + evidence + drills)
- 72 rows — older mining pipeline (no lifecycle, no evidence, no drills)

### 3. Pattern miner produces 99.95% zero-impact rows
- `contextual`: 22,113 rows, avg stroke_impact 0.00
- `conditional`: 3 rows, avg -0.93
- `temporal`: 1 row, avg -0.50

### 4. Feedback loop fully empty
0 insights dismissed, 0 player feedback rows, 0 effectiveness rows. Either no player has ever clicked, or the action doesn't insert.

## Smaller smells

- Engine version inconsistent: `coachhelm-v2` (40), `v1.0` (7), `rule-based-v2` (1). All `ai_model_version` NULL.
- Status never advances past `draft` — no `published`/`archived` ever fires.
- Focus areas all `from_review=false` AND `from_insight=false` — promote-to-focus-area flow never fired.

## Predictions deeper look

```
metric=score_to_par
validated=160 / 749 total
hits=113   misses=47
accuracy=70.6%
avg signed error=-0.85 (slight optimism bias)
avg abs error=2.05 strokes
```

Other metrics (`fairways_hit_pct`, `gir_pct`, `putts_per_round`) have only 1 row each — not yet a real pipeline.
