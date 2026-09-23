CREATE TABLE IF NOT EXISTS "helm_debug"."db_error_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "bucket_started_at" timestamp with time zone DEFAULT "date_trunc"('hour'::"text", "clock_timestamp"()) NOT NULL,
    "source" "text" DEFAULT 'supabase'::"text" NOT NULL,
    "service" "text" NOT NULL,
    "environment" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "release_sha" "text",
    "runtime" "text" NOT NULL,
    "sport" "text",
    "feature" "text" NOT NULL,
    "action" "text" NOT NULL,
    "journey" "text",
    "operation" "text" NOT NULL,
    "relation_name" "text",
    "rpc_name" "text",
    "function_name" "text",
    "bucket_class" "text",
    "error_code" "text",
    "sqlstate" "text",
    "postgrest_code" "text",
    "auth_code" "text",
    "storage_code" "text",
    "http_status" integer,
    "severity" "text" NOT NULL,
    "expectedness" "text" NOT NULL,
    "retryability" "text" NOT NULL,
    "terminal" boolean DEFAULT true NOT NULL,
    "fingerprint" "text" NOT NULL,
    "normalized_message" "text" NOT NULL,
    "safe_details" "text",
    "safe_hint" "text",
    "helm_trace_id" "text",
    "sentry_trace_id" "text",
    "sentry_span_id" "text",
    "duration_ms" integer,
    "attempt" integer,
    "occurrence_count" integer DEFAULT 1 NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "safe_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_individual" boolean DEFAULT false NOT NULL,
    CONSTRAINT "db_error_events_attempt_check" CHECK ((("attempt" IS NULL) OR ("attempt" >= 0))),
    CONSTRAINT "db_error_events_duration_ms_check" CHECK ((("duration_ms" IS NULL) OR ("duration_ms" >= 0))),
    CONSTRAINT "db_error_events_expectedness_check" CHECK (("expectedness" = ANY (ARRAY['expected'::"text", 'routine_recovery'::"text", 'unexpected'::"text", 'unknown'::"text"]))),
    CONSTRAINT "db_error_events_occurrence_count_check" CHECK (("occurrence_count" >= 1)),
    CONSTRAINT "db_error_events_operation_check" CHECK (("operation" = ANY (ARRAY['select'::"text", 'insert'::"text", 'update'::"text", 'delete'::"text", 'upsert'::"text", 'rpc'::"text", 'auth'::"text", 'upload'::"text", 'download'::"text", 'subscribe'::"text", 'invoke'::"text", 'job'::"text"]))),
    CONSTRAINT "db_error_events_retryability_check" CHECK (("retryability" = ANY (ARRAY['yes'::"text", 'no'::"text", 'conditional'::"text", 'unknown'::"text"]))),
    CONSTRAINT "db_error_events_runtime_check" CHECK (("runtime" = ANY (ARRAY['browser'::"text", 'node'::"text", 'edge'::"text", 'postgres'::"text"]))),
    CONSTRAINT "db_error_events_service_check" CHECK (("service" = ANY (ARRAY['postgrest'::"text", 'postgres'::"text", 'auth'::"text", 'storage'::"text", 'realtime'::"text", 'edge_function'::"text", 'pg_cron'::"text", 'pg_net'::"text"]))),
    CONSTRAINT "db_error_events_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'error'::"text", 'critical'::"text"]))),
    CONSTRAINT "db_error_events_source_check" CHECK (("source" = 'supabase'::"text"))
);

ALTER TABLE "helm_debug"."db_error_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "helm_debug"."db_health_samples" (
    "id" bigint NOT NULL,
    "sampled_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "stats_reset_at" timestamp with time zone,
    "connections_total" integer NOT NULL,
    "connections_active" integer NOT NULL,
    "connections_idle_in_tx" integer NOT NULL,
    "connections_waiting_lock" integer NOT NULL,
    "connections_pct_max" numeric(5,2),
    "longest_active_ms" integer,
    "longest_idle_in_tx_ms" integer,
    "longest_lock_wait_ms" integer,
    "xact_commit" bigint NOT NULL,
    "xact_rollback" bigint NOT NULL,
    "deadlocks" bigint NOT NULL,
    "conflicts" bigint NOT NULL,
    "tup_returned" bigint NOT NULL,
    "tup_fetched" bigint NOT NULL,
    "tup_inserted" bigint NOT NULL,
    "tup_updated" bigint NOT NULL,
    "tup_deleted" bigint NOT NULL,
    "temp_files" bigint NOT NULL,
    "temp_bytes" bigint NOT NULL,
    "blks_read" bigint NOT NULL,
    "blks_hit" bigint NOT NULL,
    "db_size_bytes" bigint NOT NULL,
    "xact_commit_delta" bigint,
    "xact_rollback_delta" bigint,
    "deadlocks_delta" bigint,
    "conflicts_delta" bigint,
    "tup_returned_delta" bigint,
    "tup_fetched_delta" bigint,
    "tup_inserted_delta" bigint,
    "tup_updated_delta" bigint,
    "tup_deleted_delta" bigint,
    "temp_files_delta" bigint,
    "temp_bytes_delta" bigint,
    "blks_read_delta" bigint,
    "blks_hit_delta" bigint,
    "cache_hit_ratio" numeric(6,4),
    "collector_version" "text" DEFAULT '1'::"text" NOT NULL,
    "collector_status" "text" DEFAULT 'ok'::"text" NOT NULL
);

ALTER TABLE "helm_debug"."db_health_samples" OWNER TO "postgres";

ALTER TABLE "helm_debug"."db_health_samples" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "helm_debug"."db_health_samples_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "helm_debug"."db_lock_incidents" (
    "id" bigint NOT NULL,
    "detected_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "kind" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "role_class" "text" NOT NULL,
    "wait_ms" integer,
    "blocked_query_class" "text",
    "blocking_query_class" "text",
    "blocked_pid_count" integer,
    "relation_name" "text",
    "feature" "text",
    "action" "text",
    "release_sha" "text",
    "helm_trace_id" "text",
    "safe_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "db_lock_incidents_blocked_pid_count_check" CHECK ((("blocked_pid_count" IS NULL) OR ("blocked_pid_count" >= 0))),
    CONSTRAINT "db_lock_incidents_kind_check" CHECK (("kind" = ANY (ARRAY['long_active'::"text", 'idle_in_tx'::"text", 'lock_wait'::"text", 'deadlock'::"text"]))),
    CONSTRAINT "db_lock_incidents_role_class_check" CHECK (("role_class" = ANY (ARRAY['app'::"text", 'service'::"text", 'other'::"text"]))),
    CONSTRAINT "db_lock_incidents_severity_check" CHECK (("severity" = ANY (ARRAY['warning'::"text", 'critical'::"text"]))),
    CONSTRAINT "db_lock_incidents_wait_ms_check" CHECK ((("wait_ms" IS NULL) OR ("wait_ms" >= 0)))
);

ALTER TABLE "helm_debug"."db_lock_incidents" OWNER TO "postgres";

ALTER TABLE "helm_debug"."db_lock_incidents" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "helm_debug"."db_lock_incidents_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "helm_debug"."db_platform_samples" (
    "id" bigint NOT NULL,
    "sampled_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "db_up" smallint,
    "cpu_pct" numeric(5,2),
    "memory_pct" numeric(5,2),
    "connections_used" integer,
    "connections_max" integer,
    "pool_saturation_pct" numeric(5,2),
    "wal_or_replication_lag_seconds" numeric(12,3),
    "io_pressure" numeric(5,2),
    "db_size_bytes" bigint,
    "autovacuum_or_bloat_signal" numeric(8,2),
    "postgrest_pool_used" integer,
    "postgrest_pool_max" integer,
    "postgrest_pool_saturation_pct" numeric(5,2),
    "auth_pool_used" integer,
    "auth_pool_max" integer,
    "auth_pool_saturation_pct" numeric(5,2),
    "realtime_subscriptions" integer,
    "source_status" "text" NOT NULL,
    CONSTRAINT "db_platform_samples_db_up_check" CHECK ((("db_up" IS NULL) OR ("db_up" = ANY (ARRAY[0, 1])))),
    CONSTRAINT "db_platform_samples_source_status_check" CHECK (("source_status" = ANY (ARRAY['ok'::"text", 'unconfigured'::"text", 'unreachable'::"text", 'unparseable'::"text"])))
);

ALTER TABLE "helm_debug"."db_platform_samples" OWNER TO "postgres";

ALTER TABLE "helm_debug"."db_platform_samples" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "helm_debug"."db_platform_samples_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "helm_debug"."db_stat_deltas" (
    "id" bigint NOT NULL,
    "sampled_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "stats_reset_at" timestamp with time zone,
    "queryid" "text" NOT NULL,
    "safe_query_class" "text" NOT NULL,
    "source_class" "text" NOT NULL,
    "calls_delta" bigint,
    "total_exec_ms_delta" numeric,
    "mean_exec_ms_window" numeric,
    "max_exec_ms_observed" numeric,
    "rows_delta" bigint,
    "wal_bytes_delta" bigint,
    "shared_blks_hit_delta" bigint,
    "shared_blks_read_delta" bigint,
    "temp_blks_read_delta" bigint,
    "temp_blks_written_delta" bigint,
    "regression_flags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "baseline_status" "text" DEFAULT 'collecting'::"text" NOT NULL,
    CONSTRAINT "db_stat_deltas_baseline_status_check" CHECK (("baseline_status" = ANY (ARRAY['collecting'::"text", 'established'::"text"]))),
    CONSTRAINT "db_stat_deltas_source_class_check" CHECK (("source_class" = ANY (ARRAY['helm_product'::"text", 'supabase_realtime'::"text", 'pg_net_job'::"text", 'pg_cron_job'::"text", 'observability'::"text", 'unknown'::"text"])))
);

ALTER TABLE "helm_debug"."db_stat_deltas" OWNER TO "postgres";

ALTER TABLE "helm_debug"."db_stat_deltas" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "helm_debug"."db_stat_deltas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "helm_debug"."db_stat_prior_state" (
    "queryid" "text" NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "stats_reset_at" timestamp with time zone,
    "calls" bigint NOT NULL,
    "total_exec_ms" numeric NOT NULL,
    "rows" bigint NOT NULL,
    "shared_blks_hit" bigint NOT NULL,
    "shared_blks_read" bigint NOT NULL,
    "temp_blks_read" bigint NOT NULL,
    "temp_blks_written" bigint NOT NULL,
    "wal_bytes" bigint NOT NULL,
    "mean_exec_ms_baseline" numeric,
    "max_exec_ms_baseline" numeric,
    "rows_per_call_baseline" numeric,
    "sample_count" integer DEFAULT 0 NOT NULL,
    "baseline_status" "text" DEFAULT 'collecting'::"text" NOT NULL,
    CONSTRAINT "db_stat_prior_state_baseline_status_check" CHECK (("baseline_status" = ANY (ARRAY['collecting'::"text", 'established'::"text"])))
);

ALTER TABLE "helm_debug"."db_stat_prior_state" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "helm_debug"."db_table_samples" (
    "id" bigint NOT NULL,
    "sampled_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "relation_name" "text" NOT NULL,
    "n_live_tup" bigint NOT NULL,
    "n_dead_tup" bigint NOT NULL,
    "dead_ratio" numeric(6,4),
    "last_autovacuum" timestamp with time zone,
    "last_autoanalyze" timestamp with time zone,
    "seq_scan" bigint NOT NULL,
    "idx_scan" bigint NOT NULL,
    "n_tup_ins" bigint NOT NULL,
    "n_tup_upd" bigint NOT NULL,
    "n_tup_del" bigint NOT NULL,
    "total_bytes" bigint NOT NULL,
    "index_bytes" bigint NOT NULL,
    "n_dead_tup_delta" bigint,
    "seq_scan_delta" bigint,
    "idx_scan_delta" bigint,
    "n_tup_ins_delta" bigint,
    "n_tup_upd_delta" bigint,
    "n_tup_del_delta" bigint,
    "collector_status" "text" DEFAULT 'ok'::"text" NOT NULL
);

ALTER TABLE "helm_debug"."db_table_samples" OWNER TO "postgres";

ALTER TABLE "helm_debug"."db_table_samples" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "helm_debug"."db_table_samples_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "helm_debug"."trace_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trace_id" "uuid" NOT NULL,
    "workflow" "text" NOT NULL,
    "environment" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "status" "text" DEFAULT 'started'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "finished_at" timestamp with time zone,
    "duration_ms" integer,
    "round_id" "uuid",
    "team_id" "uuid",
    "player_id" "uuid",
    "sentry_trace_id" "text",
    "root_span_id" "text",
    "expected_step_count" integer DEFAULT 0 NOT NULL,
    "observed_step_count" integer DEFAULT 0 NOT NULL,
    "missing_required_step_count" integer DEFAULT 0 NOT NULL,
    "failure_step" "text",
    "failure_code" "text",
    "failure_summary" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "trace_runs_duration_ms_check" CHECK ((("duration_ms" IS NULL) OR ("duration_ms" >= 0))),
    CONSTRAINT "trace_runs_expected_step_count_check" CHECK (("expected_step_count" >= 0)),
    CONSTRAINT "trace_runs_missing_required_step_count_check" CHECK (("missing_required_step_count" >= 0)),
    CONSTRAINT "trace_runs_observed_step_count_check" CHECK (("observed_step_count" >= 0)),
    CONSTRAINT "trace_runs_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'success'::"text", 'failure'::"text", 'warning'::"text", 'pending'::"text"]))),
    CONSTRAINT "trace_runs_workflow_check" CHECK (("workflow" ~ '^golf[.]'::"text"))
);

ALTER TABLE "helm_debug"."trace_runs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "helm_debug"."trace_steps" (
    "id" bigint NOT NULL,
    "trace_id" "uuid" NOT NULL,
    "step_key" "text" NOT NULL,
    "parent_step_key" "text",
    "layer" "text" NOT NULL,
    "category" "text",
    "status" "text" NOT NULL,
    "requiredness" "text" NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "duration_ms" integer,
    "table_name" "text",
    "function_name" "text",
    "trigger_name" "text",
    "error_code" "text",
    "error_summary" "text",
    "expected" "jsonb",
    "observed" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "trace_steps_duration_ms_check" CHECK ((("duration_ms" IS NULL) OR ("duration_ms" >= 0))),
    CONSTRAINT "trace_steps_layer_check" CHECK (("layer" = ANY (ARRAY['client'::"text", 'next'::"text", 'server_action'::"text", 'supabase'::"text", 'postgres'::"text", 'trigger'::"text", 'verification'::"text", 'cache'::"text", 'background'::"text"]))),
    CONSTRAINT "trace_steps_requiredness_check" CHECK (("requiredness" = ANY (ARRAY['required'::"text", 'conditional'::"text", 'best_effort'::"text", 'async'::"text"]))),
    CONSTRAINT "trace_steps_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'success'::"text", 'failure'::"text", 'skipped'::"text", 'missing'::"text", 'warning'::"text", 'pending'::"text"])))
);

ALTER TABLE "helm_debug"."trace_steps" OWNER TO "postgres";

ALTER TABLE "helm_debug"."trace_steps" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "helm_debug"."trace_steps_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
