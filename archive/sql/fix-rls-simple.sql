-- Simple RLS policy fix for golf_events
-- This allows authenticated users (players and coaches) to create events

-- First, drop ALL existing INSERT policies
DROP POLICY IF EXISTS "Users can insert events for their team" ON golf_events;
DROP POLICY IF EXISTS "Coaches can insert events" ON golf_events;
DROP POLICY IF EXISTS "Allow event creation" ON golf_events;
DROP POLICY IF EXISTS "Allow users to create events" ON golf_events;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON golf_events;

-- Create a simple policy that allows any authenticated user to insert events
-- We'll validate team ownership in the application code instead
CREATE POLICY "Enable insert for authenticated users"
ON golf_events
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Note: This is a permissive policy for now. In production, you should add
-- proper checks, but this will unblock you immediately.
