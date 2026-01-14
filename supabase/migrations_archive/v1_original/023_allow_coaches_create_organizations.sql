-- Migration: Allow coaches to create organizations during onboarding
-- Fixes: Coaches were blocked from creating organizations due to missing RLS policy

-- Add INSERT policy for authenticated users (coaches) to create organizations
CREATE POLICY "Coaches can create organizations"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add UPDATE policy for coaches to update their own organization
CREATE POLICY "Coaches can update own organization"
  ON organizations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.user_id = auth.uid()
      AND coaches.organization_id = organizations.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.user_id = auth.uid()
      AND coaches.organization_id = organizations.id
    )
  );

-- Add comment for documentation
COMMENT ON POLICY "Coaches can create organizations" ON organizations IS 'Allows authenticated users to create organizations during coach onboarding';
COMMENT ON POLICY "Coaches can update own organization" ON organizations IS 'Allows coaches to update only their own organization';
