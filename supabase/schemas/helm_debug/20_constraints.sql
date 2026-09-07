ALTER TABLE ONLY "helm_debug"."db_error_events"
    ADD CONSTRAINT "db_error_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "helm_debug"."db_health_samples"
    ADD CONSTRAINT "db_health_samples_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "helm_debug"."db_lock_incidents"
    ADD CONSTRAINT "db_lock_incidents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "helm_debug"."db_platform_samples"
    ADD CONSTRAINT "db_platform_samples_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "helm_debug"."db_stat_deltas"
    ADD CONSTRAINT "db_stat_deltas_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "helm_debug"."db_stat_prior_state"
    ADD CONSTRAINT "db_stat_prior_state_pkey" PRIMARY KEY ("queryid");

ALTER TABLE ONLY "helm_debug"."db_table_samples"
    ADD CONSTRAINT "db_table_samples_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "helm_debug"."trace_runs"
    ADD CONSTRAINT "trace_runs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "helm_debug"."trace_runs"
    ADD CONSTRAINT "trace_runs_trace_id_key" UNIQUE ("trace_id");

ALTER TABLE ONLY "helm_debug"."trace_steps"
    ADD CONSTRAINT "trace_steps_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "helm_debug"."trace_steps"
    ADD CONSTRAINT "trace_steps_trace_id_step_key_key" UNIQUE ("trace_id", "step_key");

ALTER TABLE ONLY "helm_debug"."trace_steps"
    ADD CONSTRAINT "trace_steps_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "helm_debug"."trace_runs"("trace_id") ON DELETE CASCADE;
