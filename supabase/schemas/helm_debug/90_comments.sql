COMMENT ON COLUMN "helm_debug"."db_error_events"."is_individual" IS 'True for rows written through record_db_error_event with
p_force_individual_row => true: P0/P1 occurrences that must never be folded
into an hour bucket. The unique (fingerprint, bucket_started_at) index
deliberately excludes these rows.';
