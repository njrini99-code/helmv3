CREATE UNIQUE INDEX "db_error_events_fingerprint_bucket_idx" ON "helm_debug"."db_error_events" USING "btree" ("fingerprint", "bucket_started_at") WHERE (NOT "is_individual");

CREATE INDEX "db_error_events_fingerprint_idx" ON "helm_debug"."db_error_events" USING "btree" ("fingerprint", "last_seen_at" DESC);

CREATE INDEX "db_error_events_occurred_at_idx" ON "helm_debug"."db_error_events" USING "btree" ("occurred_at" DESC);

CREATE INDEX "db_error_events_severity_idx" ON "helm_debug"."db_error_events" USING "btree" ("severity", "occurred_at" DESC) WHERE ("severity" = ANY (ARRAY['error'::"text", 'critical'::"text"]));

CREATE INDEX "db_health_samples_sampled_at_idx" ON "helm_debug"."db_health_samples" USING "btree" ("sampled_at" DESC);

CREATE INDEX "db_lock_incidents_dedupe_idx" ON "helm_debug"."db_lock_incidents" USING "btree" ("kind", "blocked_query_class", "detected_at" DESC) WHERE ("resolved_at" IS NULL);

CREATE INDEX "db_lock_incidents_detected_at_idx" ON "helm_debug"."db_lock_incidents" USING "btree" ("detected_at" DESC);

CREATE INDEX "db_platform_samples_sampled_at_idx" ON "helm_debug"."db_platform_samples" USING "btree" ("sampled_at" DESC);

CREATE INDEX "db_stat_deltas_queryid_idx" ON "helm_debug"."db_stat_deltas" USING "btree" ("queryid", "sampled_at" DESC);

CREATE INDEX "db_stat_deltas_regression_idx" ON "helm_debug"."db_stat_deltas" USING "btree" ("sampled_at" DESC) WHERE ("regression_flags" <> '{}'::"text"[]);

CREATE INDEX "db_stat_deltas_sampled_at_idx" ON "helm_debug"."db_stat_deltas" USING "btree" ("sampled_at" DESC);

CREATE INDEX "db_table_samples_relation_idx" ON "helm_debug"."db_table_samples" USING "btree" ("relation_name", "sampled_at" DESC);

CREATE INDEX "db_table_samples_sampled_at_idx" ON "helm_debug"."db_table_samples" USING "btree" ("sampled_at" DESC);

CREATE INDEX "trace_runs_round_id_idx" ON "helm_debug"."trace_runs" USING "btree" ("round_id") WHERE ("round_id" IS NOT NULL);

CREATE INDEX "trace_runs_started_at_idx" ON "helm_debug"."trace_runs" USING "btree" ("started_at" DESC);

CREATE INDEX "trace_runs_status_started_at_idx" ON "helm_debug"."trace_runs" USING "btree" ("status", "started_at" DESC);

CREATE INDEX "trace_runs_workflow_started_at_idx" ON "helm_debug"."trace_runs" USING "btree" ("workflow", "started_at" DESC);

CREATE INDEX "trace_steps_trace_id_idx" ON "helm_debug"."trace_steps" USING "btree" ("trace_id", "created_at", "id");
