# INC-2026-08-25 — completed-round SG recalculation rejected

- Feature: `golf_round_lifecycle` and `stats_analytics`
- Status: repairing locally; not deployed
- Risk: R3 — protected database lifecycle / migration
- First reproduced: 2026-08-25

## Symptom

Successful round submissions produced post-submit stats-cache warnings saying
that completed rounds could not be changed.

## Root cause

`recalculate_round_strokes_gained` correctly computes only derived
strokes-gained fields, but it did not declare the narrow `stats_cache`
lifecycle capability before updating those fields. The completed-round guard
therefore treated the intended derived write as a prohibited general edit.

## Repair and regression

The RPC now declares the existing capability; the guard still compares the row
and allows only the five SG columns. `golf_completed_round_sg_recalculation.sql`
exercises that real database boundary.
