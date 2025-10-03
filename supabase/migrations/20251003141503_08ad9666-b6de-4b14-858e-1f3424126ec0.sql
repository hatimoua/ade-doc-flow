-- Drop all existing SELECT policies on profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON profiles;
DROP POLICY IF EXISTS "Users can view org profiles" ON profiles;

-- Create a security definer function to get user's organization
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id 
  FROM public.profiles 
  WHERE id = _user_id
  LIMIT 1;
$$;

-- Create simple, non-recursive policies using the function
CREATE POLICY "Users can view their own profile"
ON profiles
FOR SELECT
USING (id = auth.uid());

CREATE POLICY "Users can view profiles in their organization"
ON profiles
FOR SELECT
USING (
  organization_id IS NOT NULL 
  AND organization_id = public.get_user_organization(auth.uid())
);