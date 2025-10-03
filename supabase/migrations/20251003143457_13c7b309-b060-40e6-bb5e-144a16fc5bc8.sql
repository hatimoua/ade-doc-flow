-- Fix existing users without organizations
DO $$
DECLARE
  orphan_profile RECORD;
  new_org_id UUID;
BEGIN
  -- Loop through all profiles without organizations
  FOR orphan_profile IN 
    SELECT id, email 
    FROM public.profiles 
    WHERE organization_id IS NULL
  LOOP
    -- Create organization for this user
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(orphan_profile.email || '''s Organization', 'My Organization'))
    RETURNING id INTO new_org_id;
    
    -- Update profile with organization
    UPDATE public.profiles
    SET organization_id = new_org_id
    WHERE id = orphan_profile.id;
    
    -- Assign owner role
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (orphan_profile.id, new_org_id, 'owner')
    ON CONFLICT DO NOTHING;
    
    RAISE NOTICE 'Created organization % for user %', new_org_id, orphan_profile.email;
  END LOOP;
END $$;

-- Create demo organization for testing
DO $$
DECLARE
  demo_org_id UUID;
BEGIN
  -- Check if demo org already exists
  SELECT id INTO demo_org_id FROM public.organizations WHERE name = 'Demo Corporation';
  
  IF demo_org_id IS NULL THEN
    -- Create demo organization
    INSERT INTO public.organizations (name)
    VALUES ('Demo Corporation')
    RETURNING id INTO demo_org_id;
    
    RAISE NOTICE 'Created demo organization: %', demo_org_id;
  END IF;
END $$;