-- Fix infinite recursion in profiles RLS policy
DROP POLICY IF EXISTS "Users can view profiles in their org" ON profiles;

-- Create a non-recursive policy for viewing profiles
-- Users can view their own profile
CREATE POLICY "Users can view their own profile"
ON profiles
FOR SELECT
USING (id = auth.uid());

-- Users can view other profiles in their organization
-- This avoids recursion by checking organization_id directly
CREATE POLICY "Users can view org profiles"
ON profiles
FOR SELECT
USING (
  organization_id IS NOT NULL 
  AND organization_id = (
    SELECT organization_id 
    FROM profiles 
    WHERE id = auth.uid()
    LIMIT 1
  )
);