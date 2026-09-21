BEGIN;

SELECT plan(10);

SELECT has_column(
    'public', 'golf_round_course_bindings', 'binding_snapshot',
    'Immutable snapshot extends the existing round binding'
);
SELECT ok(
    (
        SELECT relrowsecurity FROM pg_class
        WHERE oid = 'public.golf_round_course_bindings'::regclass
    ),
    'Bindings retain row-level security'
);
SELECT ok(
    NOT has_table_privilege(
        'authenticated', 'public.golf_round_course_bindings', 'INSERT'
    ), 'Browser cannot forge its own scoring snapshot'
);
SELECT ok(
    NOT has_table_privilege(
        'authenticated', 'public.golf_round_course_bindings', 'UPDATE'
    ), 'Browser cannot replace a pinned world'
);
SELECT ok(
    NOT has_table_privilege(
        'authenticated', 'public.golf_round_course_bindings', 'DELETE'
    ), 'Browser cannot erase binding evidence'
);
SELECT ok(
    NOT (
        SELECT prosecdef FROM pg_proc
        WHERE
            proname = 'resolve_golf_round_course_binding'
            AND pronamespace = 'public'::regnamespace
    ),
    'Exposed RPC uses invoker security'
);
SELECT ok(
    NOT has_function_privilege(
        'anon', 'public.resolve_golf_round_course_binding(uuid,jsonb)',
        'EXECUTE'
    ), 'Anonymous callers cannot resolve a binding'
);
SELECT ok(
    NOT has_function_privilege(
        'anon', 'helm_private.resolve_golf_round_course_binding(uuid,jsonb)',
        'EXECUTE'
    ), 'Anonymous callers cannot reach the private helper'
);
SELECT ok(
    has_function_privilege(
        'authenticated', 'public.resolve_golf_round_course_binding(uuid,jsonb)',
        'EXECUTE'
    ), 'Authenticated callers reach the owner/reader checks'
);
SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE
            tgrelid = 'public.golf_round_course_bindings'::regclass
            AND tgname = 'golf_round_geometry_binding_immutable'
            AND tgenabled = 'O'
    ),
    'An enabled trigger protects versions even against privileged updates'
);

SELECT finish();
ROLLBACK;
