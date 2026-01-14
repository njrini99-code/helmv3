-- Datadog PostgreSQL Monitoring Setup for Supabase
-- Run this in Supabase Dashboard > SQL Editor

-- Step 1: Create the datadog user with a strong password
-- IMPORTANT: Replace 'YOUR_SECURE_PASSWORD' with a strong, unique password
CREATE USER datadog WITH PASSWORD 'YOUR_SECURE_PASSWORD';

-- Step 2: Grant monitoring permissions
GRANT pg_monitor TO datadog;
GRANT USAGE ON SCHEMA public TO datadog;

-- Step 3: Grant SELECT on pg_stat_statements for query metrics
-- (pg_stat_statements should already be enabled in Supabase)
GRANT SELECT ON pg_stat_statements TO datadog;

-- Step 4: Create function for Datadog to explain queries (optional but recommended)
CREATE OR REPLACE FUNCTION datadog.explain_statement(
  l_query TEXT,
  OUT explain JSON
)
RETURNS SETOF JSON AS
$$
DECLARE
  curs REFCURSOR;
  plan JSON;
BEGIN
  OPEN curs FOR EXECUTE 'EXPLAIN (FORMAT JSON) ' || l_query;
  LOOP
    FETCH curs INTO plan;
    EXIT WHEN NOT FOUND;
    explain := plan;
    RETURN NEXT;
  END LOOP;
  CLOSE curs;
  RETURN;
END;
$$
LANGUAGE plpgsql
RETURNS NULL ON NULL INPUT
SECURITY DEFINER;

-- Step 5: Verify the setup
SELECT 'Datadog user created successfully!' as status;
SELECT usename, usesuper, usecreatedb FROM pg_user WHERE usename = 'datadog';
