COMMENT ON TABLE "public"."golf_announcement_acknowledgements" IS 'Player acknowledgements of announcements';

COMMENT ON TABLE "public"."golf_announcement_documents" IS 'Documents attached to announcements (links to golf_documents)';

COMMENT ON TABLE "public"."golf_announcement_recipients" IS 'Specific player recipients for announcements. Empty = all team members.';

COMMENT ON TABLE "public"."golf_announcement_tasks" IS 'Tasks attached to announcements (links to golf_tasks)';

COMMENT ON COLUMN "public"."golf_coach_insights"."engine_version" IS 'v3 W21. ''v2'' = legacy mining/* generator output; ''v3'' = BaseGenerator output. Combined with the v3: signature prefix lets both engines coexist during W21-W25 transition + lets W35 outcome attribution score them separately.';

COMMENT ON COLUMN "public"."golf_coach_philosophy"."email_digest_enabled" IS 'Coach opt-in for daily 06:30 UTC morning digest email of top insights.';

COMMENT ON COLUMN "public"."golf_coach_philosophy"."min_insight_confidence" IS 'Confidence floor an insight must clear to surface. Consumed by shouldShowInsight() in the v2 orchestrator. Default 0.30 = the prior hard-coded DEFAULT_MINIMUM_THRESHOLD.';

COMMENT ON COLUMN "public"."golf_coach_philosophy"."min_rounds_for_signal" IS 'Logged rounds a player needs before CoachHelm will surface signals about them. Default 3 = the prior hard-coded honesty gate.';

COMMENT ON COLUMN "public"."golf_coach_philosophy"."alert_digest" IS 'immediate | daily | weekly - how alerts are delivered to this coach.';

COMMENT ON COLUMN "public"."golf_coach_philosophy"."min_hole_plays_for_ranking" IS 'Plays a hole needs before it can be ranked toughest/easiest. Default 3 = the prior DEFAULT_MIN_PLAYS in worst-hole-ranking.ts.';

COMMENT ON COLUMN "public"."golf_coach_philosophy"."pattern_lookback_days" IS 'Rolling window (days) for v2 pattern mining. Default 90 = the prior WINDOW_DAYS in pattern-miner.ts. Does NOT drive the independently-calibrated approach/course-management/tee-strategy windows.';

COMMENT ON COLUMN "public"."golf_coach_philosophy"."stats_benchmark_window_days" IS 'Comparison window (days) for the Stats page benchmark: last N vs the N before. Default 30 = the prior hardcoded split.';

COMMENT ON TABLE "public"."golf_coach_player_intent" IS 'v3 W27 coach narrative posture per player. Locked decision: invisible to player. alert_posture modulates Wave 7 confidence gate threshold: aggressive=0.85×, balanced=1.0×, conservative=1.15×, silent=∞.';

COMMENT ON TABLE "public"."golf_coachhelm_action_runs" IS 'Audit + idempotency ledger for every mutation CoachHelm proposes. A row is written at proposal time; the unique (coach_id, idempotency_key) makes a retried confirmation return the original result instead of duplicating the write.';

COMMENT ON TABLE "public"."golf_coachhelm_chat_conversations" IS 'v3 W32 coach chat thread. Per Part XII coach-only (player chat deferred to v2). pinned + archived_at drive the history UX sort.';

COMMENT ON TABLE "public"."golf_coachhelm_chat_messages" IS 'v3 W32 coach chat messages. Append-only. tool_calls + tool_results are jsonb so the agent can replay/inspect a turn without re-running the model.';

COMMENT ON COLUMN "public"."golf_coachhelm_chat_messages"."ui_parts" IS 'AI SDK UIMessage parts for this message (text, tool calls, typed data parts, approvals, receipts). Lets a reload reproduce charts/mentions/approvals instead of only the prose in content.';

COMMENT ON TABLE "public"."golf_coachhelm_coach_weights" IS 'v3 W35 Bayesian-updated per-coach weights. weight × |strokes_impact| × confidence = ranker score (W36). Default 1.0 until sample_n ≥ 10.';

COMMENT ON TABLE "public"."golf_coachhelm_llm_budget" IS 'v3 W30 per-coach daily LLM spend cap. compose() reads (coach_id, today) before every call; on exhaustion falls back to non-LLM template path per Part XI.4 priority (round_review > coach_chat > hero_narrative).';

COMMENT ON TABLE "public"."golf_coachhelm_llm_calls" IS 'v3 W30 append-only LLM call log. One row per compose() invocation. Used for cost attribution, dedup diagnostics, citation audit, and admin spend dashboard (deferred).';

COMMENT ON COLUMN "public"."golf_coachhelm_settings"."goal_assignment_default" IS 'v3 goal-assignment default: ''mandatory'' (player must accept; forced active) or ''suggested'' (player chooses). Default ''suggested''. Overridable per-goal at creation.';

COMMENT ON COLUMN "public"."golf_coachhelm_settings"."llm_narrative_enabled" IS 'v3 LLM gate: when false, all three LLM surfaces (round_review, hero_narrative, coach_chat) fall back to deterministic templates for this coach''s players. Default false at W9; flipped per-coach via GrowthBook in W30+.';

COMMENT ON COLUMN "public"."golf_coachhelm_settings"."llm_budget_usd_per_day" IS 'v3 LLM spend cap (USD/day) for this coach''s players combined. NULL = use platform default. Enforced in v3/llm/budget.ts before every compose() call. Exhaustion triggers priority fallback: round_review > coach_chat > hero_narrative -> template.';

COMMENT ON COLUMN "public"."golf_conversation_participants"."notification_level" IS 'YOUR delivery preference for this conversation: all | mentions | muted. Per-participant, never per-conversation. With muted_until set, the level lapses back to all once that timestamp passes — evaluated on read, so a stalled job can never leave somebody permanently silent.';

COMMENT ON TABLE "public"."golf_course_tees" IS 'Cloud tee sets for a course (Championship/Blue/White/Women''s/custom). Open-contribution + last-edited metadata + soft-delete. Rounds reference a tee via golf_rounds.tee_id but still snapshot par/yards into golf_holes.';

COMMENT ON COLUMN "public"."golf_demo_sessions"."traffic_quality" IS 'Verdict on whether this gate entry was a human or a security scanner: automated | likely_human | unknown. Classified at write time from send-to-entry latency and IP fan-out.';

COMMENT ON COLUMN "public"."golf_demo_sessions"."quality_reason" IS 'Human-readable justification for traffic_quality so heuristic classifications remain auditable.';

COMMENT ON COLUMN "public"."golf_demo_sessions"."crm_coach_id" IS 'Links a demo tour to its CRM coach. ON DELETE SET NULL preserves traffic-quality evidence.';

COMMENT ON TABLE "public"."golf_document_versions" IS 'Version history for golf team documents';

COMMENT ON COLUMN "public"."golf_document_versions"."version_number" IS 'Auto-incrementing version number per document';

COMMENT ON COLUMN "public"."golf_document_versions"."change_notes" IS 'Optional notes describing changes in this version';

COMMENT ON COLUMN "public"."golf_documents"."current_version_id" IS 'Reference to the current/latest version';

COMMENT ON COLUMN "public"."golf_documents"."version_count" IS 'Total number of versions for quick display';

COMMENT ON COLUMN "public"."golf_documents"."folder" IS 'Optional folder name for document organization';

COMMENT ON COLUMN "public"."golf_event_attendance"."attendance_status" IS 'Coach-recorded attendance mark (dual-axis with status, which is the player''s RSVP). NULL = not yet marked. checked_in/checked_in_at remain the timestamped check-in record.';

COMMENT ON TABLE "public"."golf_goal_suggestions" IS 'v3 W19. Engine-emitted goal suggestions per Part VI.5. Player accepts (→ golf_goals row created) / dismisses / snoozes; 14-day default TTL.';

COMMENT ON TABLE "public"."golf_goals" IS 'v3 Goals primitive (W18). Replaces v2 golf_player_focus_areas + arcs + drill compliance per master plan Part III locked decisions. State machine: active / paused / achieved / missed / partial / abandoned / pending_baseline. Soft cap of 5 active goals per player enforced at app layer (UI warns, schema does not block).';

COMMENT ON COLUMN "public"."golf_goals"."window_days" IS 'Generated column = days between started_at and ends_at. CHECK constraint enforces 7-365 range per locked decision.';

COMMENT ON COLUMN "public"."golf_goals"."baseline_value" IS 'The measured value when the goal window opened. Set by createGoal from the player standing at creation (never by a caller-supplied null). Immutable afterwards: the progress evaluator writes current_value + appends snapshots only. NULL means no reading existed at creation - the card then shows "Not started - baseline captured" rather than a fabricated bar. See issue #1244.';

COMMENT ON COLUMN "public"."golf_goals"."shared_with_coach" IS 'Player-set sharing toggle. DEFAULT false per master plan locked decision — coach sees only assigned goals OR explicitly shared player goals.';

COMMENT ON COLUMN "public"."golf_goals"."coach_assignment_mode" IS 'When creator_role=coach: ''mandatory'' (forced active for player) or ''suggested'' (player accepts/declines). Per-team default lives in golf_coachhelm_settings.goal_assignment_default.';

COMMENT ON COLUMN "public"."golf_goals"."snapshots" IS 'jsonb[] — weekly cron appends {date, value, team_avg} snapshots so the UI can render progress sparklines without recomputing.';

COMMENT ON COLUMN "public"."golf_holes"."yardage" IS 'Actual yardage played for this hole in this round (may differ from course default)';

COMMENT ON TABLE "public"."golf_ingest_connections" IS 'v3 W39-41 OAuth-state per (player, provider). access_token_encrypted is ciphertext — adapters round-trip plaintext via app-layer KMS.';

COMMENT ON TABLE "public"."golf_insight_outcome_attribution" IS 'v3 W35 per-insight outcome attribution. surfaced_at + baseline/post + delta + lift fuels coach-weights Bayesian updates and feeds golf_insight_effectiveness aggregates.';

COMMENT ON COLUMN "public"."golf_insight_outcome_attribution"."target_metric_id" IS 'Canonical metric_id OR an attributable alias (e.g. fairways_hit_pct, score_to_par) resolved by lookupMetricSource(). Intentionally NOT FK-bound to golf_metrics — integrity is enforced in computeAttribution(). See migration 20260608150000.';

COMMENT ON TABLE "public"."golf_message_attachments" IS 'File and video attachments for golf messages';

COMMENT ON COLUMN "public"."golf_message_attachments"."file_type" IS 'Category: image, video, document, audio';

COMMENT ON COLUMN "public"."golf_message_attachments"."mime_type" IS 'MIME type like image/jpeg, video/mp4';

COMMENT ON COLUMN "public"."golf_message_attachments"."storage_path" IS 'Path in Supabase storage bucket';

COMMENT ON COLUMN "public"."golf_message_attachments"."thumbnail_url" IS 'Thumbnail preview URL for images/videos';

COMMENT ON COLUMN "public"."golf_messages"."reply_to_id" IS 'The message this one replies to (spec §30). Self-reference, ON DELETE SET NULL so deleting a quoted message never deletes the replies to it. Confers NO read access: the quoted row is fetched through golf_messages RLS like any other, so a pointer into another conversation resolves to nothing.';

COMMENT ON COLUMN "public"."golf_messages"."kind" IS 'What this message IS. Default text. Structured kinds render as Helm objects (practice/event/rsvp/poll/travel) and MUST carry a payload; system messages render as centred narration with no bubble and no author.';

COMMENT ON TABLE "public"."golf_metrics" IS 'v3 canonical metric registry. Every metric the engine surfaces (in goals, standing, generators, genome) must have a row here. Schema-of-truth that the TS registry at src/lib/coachhelm/v3/metrics/registry.ts mirrors; CI check validates parity. Seeded with 28 metrics in the next migration.';

COMMENT ON COLUMN "public"."golf_metrics"."metric_id" IS 'Stable canonical ID. Format: snake_case with underscore-separated buckets where applicable (e.g. putts_made_3_5ft_pct, scoring_par_4). Never rename — referenced from FK columns across the engine.';

COMMENT ON COLUMN "public"."golf_metrics"."direction" IS 'higher_better: higher player value is better (make %, GIR %, SG). lower_better: lower value is better (penalty rate, scoring vs par, pressure delta).';

COMMENT ON COLUMN "public"."golf_metrics"."active" IS 'False signals deprecated. Existing rows referencing inactive metrics stay valid; new goals/standing rows should not be written against inactive metrics. Drop via separate retire-wave migration.';

COMMENT ON TABLE "public"."golf_pga_standards" IS 'v3 baseline registry. Per (metric_id, season) values for each cohort tier — Tour, Korn Ferry, D1/D2/D3, HS — plus Tour distributional percentiles. Read by standing bars (W11+) and counterfactuals (W17). FK to golf_metrics enforces TS<->DB parity.';

COMMENT ON COLUMN "public"."golf_pga_standards"."season" IS 'Season identifier — typically "2024" for Tour data. Allows historical baselines to coexist; standing surfaces always select the most recent season available.';

COMMENT ON COLUMN "public"."golf_pga_standards"."pga_p50" IS 'PGA Tour median (50th percentile). Used as the "Tour average" reference line when pga_tour_value is null OR when the metric is zero-sum (SG cluster).';

COMMENT ON COLUMN "public"."golf_pga_standards"."source" IS 'Free-text citation pointing into docs/v3-research-golf-domain.md or the source URL. Required per master plan Part V — every causal claim and PGA baseline must trace back to a source.';

COMMENT ON COLUMN "public"."golf_player_classes"."semester" IS 'Academic term the class belongs to, e.g. "Fall 2026" (P231). Persisted on create/edit so semester is never re-derived from the current date.';

COMMENT ON COLUMN "public"."golf_player_focus_areas"."outcome_status" IS 'Outcome of the focus area once evaluated: improved | no_change | worsened | inconclusive (null = not yet evaluated). Source for the Dev-Plans outcome tally (P094).';

COMMENT ON COLUMN "public"."golf_player_focus_areas"."target_kind" IS 'How the measurable target is time-bounded: ''date'' (hit by target_date) | ''rounds'' (hit within target_rounds). null = no timeframe (Feature F).';

COMMENT ON COLUMN "public"."golf_player_focus_areas"."target_date" IS 'Calendar deadline for the target when target_kind = ''date'' (else null) (Feature F).';

COMMENT ON COLUMN "public"."golf_player_focus_areas"."target_rounds" IS 'Number of rounds to hit the target within when target_kind = ''rounds'' (else null) (Feature F).';

COMMENT ON COLUMN "public"."golf_player_focus_areas"."baseline_value" IS 'The measured value when tracking STARTED (stamped alongside started_at, i.e. at player acceptance for a coach-prescribed area). Immutable: the progress driver writes current_value only and must never touch this. NULL means the starting point is unknown - the UI then renders Now/Target with NO percentage rather than guessing. See issue #1240.';

COMMENT ON COLUMN "public"."golf_player_focus_areas"."snapshots" IS 'Append-only [{date, value}] history written by the progress driver, deduped per UTC day. Mirrors golf_goals.snapshots so the card can draw a real trend instead of a permanent em dash. See issue #1241.';

COMMENT ON TABLE "public"."golf_player_genome" IS 'v3 W33 per-player 80-dim genome vector. jsonb keyed by dimension_id. Computed nightly. rounds_basis lets the UI show "8 of 10 dims unlocked" progress states.';

COMMENT ON TABLE "public"."golf_player_standing" IS 'v3 standing snapshots — one row per (player_id, metric_id). Computed nightly by /api/cron/v3/standing-refresh. Powers every StandingBar render plus W17 counterfactuals. pga_value NOT NULL — metric must have a PGA baseline to land here.';

COMMENT ON COLUMN "public"."golf_player_standing"."team_n" IS 'Number of teammates contributing to team_avg / team_pct. When < 5, StandingBar omits the team marker (cold-start rule per master plan Part VII.3). Row still writes for the player vs PGA comparison.';

COMMENT ON COLUMN "public"."golf_player_standing"."team_pct" IS 'Player percentile (0-100) within the team for this metric. Computed via SQL PERCENT_RANK() OVER (PARTITION BY team_id ORDER BY player_value [ASC|DESC depending on metric direction]).';

COMMENT ON COLUMN "public"."golf_player_standing"."pga_delta" IS 'Signed delta: player_value - pga_value. Sign meaning depends on metric.direction in golf_metrics — consumers should join to determine "better" vs "worse". W17 counterfactual reads this to compute strokes-gained-if-closed.';

COMMENT ON COLUMN "public"."golf_player_stats_cache"."last_5_average" IS 'Average score of last 5 completed rounds';

COMMENT ON COLUMN "public"."golf_player_stats_cache"."last_10_average" IS 'Average score of last 10 completed rounds';

COMMENT ON COLUMN "public"."golf_player_stats_cache"."improvement_trend" IS 'Score improvement trend: positive means improving (lower scores)';

COMMENT ON COLUMN "public"."golf_player_stats_cache"."trend_direction" IS 'Quick indicator: improving, stable, or declining';

COMMENT ON COLUMN "public"."golf_player_stats_cache"."is_stale" IS 'TRUE if cache needs recalculation (e.g., after round edit/delete)';

COMMENT ON COLUMN "public"."golf_player_stats_cache"."round_ids_included" IS 'Round IDs from the CURRENT SEASON only (season starts Aug 1) — the same population as rounds_this_season, with which it shares a query in update_player_stats_complete(). This is NOT the set of rounds the cached aggregates were computed from: those cover all of the player''s rounds and are counted by rounds_in_calculation, which will legitimately exceed array_length(round_ids_included, 1) for any player with rounds from a previous season. See issue #1234.';

COMMENT ON COLUMN "public"."golf_players"."anonymized_at" IS 'Set when the linked auth user was deleted and the identity fields were cleared. The round/shot history under this player is deliberately retained and is de-identified. NULL = active player.';

COMMENT ON TABLE "public"."golf_qualifier_round_courses" IS 'Feature G: the course (and optional tee) a coach assigns to each round of a multi-round qualifier. One row per (qualifier_id, round_number). Team-scoped through golf_qualifiers.team_id.';

COMMENT ON TABLE "public"."golf_qualifier_selections" IS 'v3 W29 per-player picks for a qualifier. selection_type=top_score is auto-locked from top-N position; coach_pick is discretionary (coach_reasoning expected).';

COMMENT ON TABLE "public"."golf_review_events" IS 'Timeline of events related to reviews for history display';

COMMENT ON COLUMN "public"."golf_round_reviews"."status" IS 'Review workflow status: draft (coach editing), published (visible to player), archived';

COMMENT ON COLUMN "public"."golf_rounds"."draft_data" IS 'JSON blob storing full draft state for in-progress rounds (step, setupData, holes, completedHoleStats, etc.)';

COMMENT ON COLUMN "public"."golf_rounds"."ai_recap" IS 'Two-sentence editorial recap of the round, generated by Vercel AI Gateway / Claude when the round completes. Brand voice — magazine-style beat-reporter recap.';

COMMENT ON COLUMN "public"."golf_rounds"."coachhelm_analyzed_at" IS 'Timestamp when triggerPlayerInsightsAfterRound completed for this round. NULL = pending or never ran.';

COMMENT ON COLUMN "public"."golf_rounds"."coachhelm_failed_at" IS 'Timestamp when triggerPlayerInsightsAfterRound terminated with an error. Set alongside coachhelm_failure_reason.';

COMMENT ON COLUMN "public"."golf_rounds"."coachhelm_failure_reason" IS 'Short error reason captured by postRoundTrigger on the failure path. Truncated to ~500 chars.';

COMMENT ON TABLE "public"."golf_shots" IS 'Golf shot data. Migration 065 fixed around_green shots that had incorrect lie_before=green values.';

COMMENT ON COLUMN "public"."golf_shots"."distance_to_hole_before" IS 'Distance from ball to hole before this shot. Units specified by distance_unit_before (yards or feet)';

COMMENT ON COLUMN "public"."golf_shots"."distance_to_hole_after" IS 'Distance from ball to hole after this shot. Units specified by distance_unit_after (yards or feet)';

COMMENT ON COLUMN "public"."golf_shots"."shot_distance" IS 'Distance the ball traveled on this shot, in yards';

COMMENT ON COLUMN "public"."golf_shots"."lie_after" IS 'Where the ball ended up (derived from result): tee, fairway, rough, sand, green, other';

COMMENT ON COLUMN "public"."golf_shots"."is_penalty" IS 'Whether this shot was a penalty stroke';

COMMENT ON COLUMN "public"."golf_shots"."penalty_type" IS 'Type of penalty: ob, water, unplayable, lost';

COMMENT ON COLUMN "public"."golf_shots"."putt_made" IS 'Whether the putt was holed (for putting shots only)';

COMMENT ON COLUMN "public"."golf_shots"."putt_distance_feet" IS 'Distance of putt in feet (for putting shots only)';

COMMENT ON COLUMN "public"."golf_shots"."club_type" IS 'driver | non_driver | putter - used for strokes gained benchmarks';

COMMENT ON COLUMN "public"."golf_shots"."distance_unit_before" IS 'yards | feet - unit for distance_to_hole_before';

COMMENT ON COLUMN "public"."golf_shots"."distance_unit_after" IS 'yards | feet - unit for distance_to_hole_after';

COMMENT ON COLUMN "public"."golf_shots"."miss_direction" IS 'left | right | short | long - for approach miss tracking';

COMMENT ON TABLE "public"."golf_staff_invite_codes" IS 'Short human-typable alias for a signed golf staff invite. Lookup only — the role is authorized from the signed token, never from this row. Players must never be able to read it.';

COMMENT ON TABLE "public"."golf_staff_invite_redemptions" IS 'One row per spent golf staff invite, keyed by the signed token''s nonce. The PK is the replay guard; see src/app/golf/actions/teams.ts redeemStaffInviteImpl.';

COMMENT ON TABLE "public"."golf_task_reminders" IS 'Queue for scheduled task reminders processed by edge function';

COMMENT ON COLUMN "public"."golf_task_reminders"."scheduled_for" IS 'When the reminder should be sent';

COMMENT ON COLUMN "public"."golf_task_reminders"."reminder_type" IS 'How to send: in_app, email, push, or all';

COMMENT ON COLUMN "public"."golf_task_reminders"."sent" IS 'Whether the reminder has been processed';

COMMENT ON COLUMN "public"."golf_task_reminders"."sent_at" IS 'When the reminder was actually sent';

COMMENT ON COLUMN "public"."golf_task_reminders"."error" IS 'Error message if sending failed';

COMMENT ON TABLE "public"."golf_task_templates" IS 'Reusable task templates for quick task creation';

COMMENT ON COLUMN "public"."golf_task_templates"."default_assignee_type" IS 'Who to assign by default: all_players, specific_role, coach, individual';

COMMENT ON COLUMN "public"."golf_task_templates"."default_due_days" IS 'Number of days from task creation for the default due date';

COMMENT ON COLUMN "public"."golf_tasks"."reminder_at" IS 'When to send a reminder notification for this task';

COMMENT ON COLUMN "public"."golf_tasks"."reminder_sent" IS 'Whether the reminder notification has been sent';

COMMENT ON COLUMN "public"."golf_tasks"."category" IS 'Task category for organization and filtering';

COMMENT ON COLUMN "public"."golf_tasks"."recurrence_rule" IS 'RRULE text on a series ROOT only (occurrences carry NULL and point at the root via parent_task_id). Same convention as golf_events.recurrence_rule. See issue #1238.';

COMMENT ON COLUMN "public"."golf_tasks"."parent_task_id" IS 'Series root for a materialized recurring-task occurrence; NULL for one-off tasks and for the root itself. Same convention as golf_events.parent_event_id.';

COMMENT ON COLUMN "public"."golf_team_coachhelm_settings"."preferences" IS 'Per-team v3 generator toggles (e.g. {tee_strategy_enabled: false}). Generator-toggles.ts defaults missing keys to true; coaches opt OUT by setting a key to false.';

COMMENT ON TABLE "public"."golf_team_join_requests" IS 'Tracks player requests to join golf teams, requiring coach approval';

COMMENT ON COLUMN "public"."golf_team_join_requests"."status" IS 'Request status: pending (awaiting review), approved (player added to team), rejected (denied by coach)';

COMMENT ON COLUMN "public"."golf_team_join_requests"."message" IS 'Optional message from player explaining why they want to join';

COMMENT ON COLUMN "public"."golf_team_join_requests"."rejection_reason" IS 'Optional explanation from coach when rejecting a request';

COMMENT ON COLUMN "public"."golf_team_settings"."event_reminders_enabled" IS 'Master switch for this team''s automated event reminders. False suppresses both the early and late reminder for every event on the team.';

COMMENT ON COLUMN "public"."golf_team_settings"."event_reminder_early_hours" IS 'Lead time in HOURS for the early event reminder (notification_type = event_reminder_24h, a slot identifier not a literal duration). Default 24 = the prior hard-coded REMINDER_24H_MS.';

COMMENT ON COLUMN "public"."golf_team_settings"."event_reminder_late_minutes" IS 'Lead time in MINUTES for the late event reminder (notification_type = event_reminder_1h, a slot identifier not a literal duration). Default 60 = the prior hard-coded REMINDER_1H_MS.';

COMMENT ON COLUMN "public"."golf_teams"."season_active" IS 'Seasonal email gate: when false, scheduled digest/recap emails (coach morning digest, weekly coach email) skip this team. Event-driven emails (RSVP, cancellations) are NOT gated.';

COMMENT ON TABLE "public"."golf_travel_budgets" IS 'Budget allocations per category for travel itineraries';

COMMENT ON TABLE "public"."golf_travel_expenses" IS 'Travel expenses for golf team trips';

COMMENT ON COLUMN "public"."golf_travel_expenses"."category" IS 'Expense category: lodging, transportation, meals, entry_fees, equipment, other';

COMMENT ON COLUMN "public"."golf_travel_expenses"."paid_by" IS 'Who paid: team, player, pending_reimbursement, split';
