-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'member', 'readonly');
CREATE TYPE public.doc_status AS ENUM ('uploaded', 'parsing', 'extracting', 'ready', 'pushed', 'error');
CREATE TYPE public.record_status AS ENUM ('pending_review', 'approved', 'rejected');
CREATE TYPE public.job_status AS ENUM ('queued', 'running', 'success', 'failed');

-- Organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(id, organization_id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  role user_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, organization_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID, _org_id UUID)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles 
  WHERE user_id = _user_id AND organization_id = _org_id
$$;

-- Helper function to check if user has minimum role level
CREATE OR REPLACE FUNCTION public.has_min_role(_user_id UUID, _org_id UUID, _min_role user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN _min_role = 'readonly' THEN role IN ('readonly', 'member', 'admin', 'owner')
    WHEN _min_role = 'member' THEN role IN ('member', 'admin', 'owner')
    WHEN _min_role = 'admin' THEN role IN ('admin', 'owner')
    WHEN _min_role = 'owner' THEN role = 'owner'
    ELSE false
  END
  FROM public.user_roles 
  WHERE user_id = _user_id AND organization_id = _org_id
$$;

-- Documents table
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT,
  doc_type TEXT DEFAULT 'invoice',
  status doc_status DEFAULT 'uploaded' NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_documents_org_status ON public.documents(organization_id, status);
CREATE INDEX idx_documents_created ON public.documents(created_at DESC);

-- ADE Results table
CREATE TABLE public.ade_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL UNIQUE,
  ade_json JSONB NOT NULL,
  markdown_content TEXT,
  metadata JSONB,
  confidence_score DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.ade_results ENABLE ROW LEVEL SECURITY;

-- Records table (normalized extracted data)
CREATE TABLE public.records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  record_type TEXT DEFAULT 'invoice' NOT NULL,
  normalized_data JSONB NOT NULL,
  validation_result JSONB,
  status record_status DEFAULT 'pending_review' NOT NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_records_org_status ON public.records(organization_id, status);
CREATE INDEX idx_records_document ON public.records(document_id);

-- Adapter configs table
CREATE TABLE public.adapter_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  adapter_type TEXT DEFAULT 'webhook' NOT NULL,
  name TEXT NOT NULL,
  webhook_url TEXT,
  webhook_secret TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(organization_id, name)
);

ALTER TABLE public.adapter_configs ENABLE ROW LEVEL SECURITY;

-- Push jobs table
CREATE TABLE public.push_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  record_id UUID REFERENCES public.records(id) ON DELETE CASCADE NOT NULL,
  adapter_id UUID REFERENCES public.adapter_configs(id) ON DELETE CASCADE NOT NULL,
  status job_status DEFAULT 'queued' NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.push_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_push_jobs_status ON public.push_jobs(status, created_at);
CREATE INDEX idx_push_jobs_record ON public.push_jobs(record_id);

-- Audit log table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  diff JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_audit_logs_org ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_target ON public.audit_logs(target_type, target_id);

-- RLS Policies

-- Organizations: users can view their own org
CREATE POLICY "Users can view their organization"
  ON public.organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Profiles: users can view profiles in their org
CREATE POLICY "Users can view profiles in their org"
  ON public.profiles FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- User roles: users can view roles in their org
CREATE POLICY "Users can view roles in their org"
  ON public.user_roles FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Documents: org members can view, members+ can insert, admins+ can update
CREATE POLICY "Users can view documents in their org"
  ON public.documents FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Members can create documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    public.has_min_role(auth.uid(), organization_id, 'member')
  );

CREATE POLICY "Admins can update documents"
  ON public.documents FOR UPDATE
  USING (
    public.has_min_role(auth.uid(), organization_id, 'admin')
  );

-- ADE Results: same as documents
CREATE POLICY "Users can view ade results in their org"
  ON public.ade_results FOR SELECT
  USING (
    document_id IN (
      SELECT id FROM public.documents WHERE organization_id IN (
        SELECT organization_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "System can insert ade results"
  ON public.ade_results FOR INSERT
  WITH CHECK (true);

-- Records: org members can view, admins+ can update
CREATE POLICY "Users can view records in their org"
  ON public.records FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Members can create records"
  ON public.records FOR INSERT
  WITH CHECK (
    public.has_min_role(auth.uid(), organization_id, 'member')
  );

CREATE POLICY "Admins can update records"
  ON public.records FOR UPDATE
  USING (
    public.has_min_role(auth.uid(), organization_id, 'admin')
  );

-- Adapter configs: admins+ can manage
CREATE POLICY "Users can view adapters in their org"
  ON public.adapter_configs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage adapters"
  ON public.adapter_configs FOR ALL
  USING (
    public.has_min_role(auth.uid(), organization_id, 'admin')
  );

-- Push jobs: users can view jobs for their org records
CREATE POLICY "Users can view push jobs in their org"
  ON public.push_jobs FOR SELECT
  USING (
    record_id IN (
      SELECT id FROM public.records WHERE organization_id IN (
        SELECT organization_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "System can manage push jobs"
  ON public.push_jobs FOR ALL
  USING (true);

-- Audit logs: users can view logs in their org
CREATE POLICY "Users can view audit logs in their org"
  ON public.audit_logs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_documents
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_records
  BEFORE UPDATE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_adapters
  BEFORE UPDATE ON public.adapter_configs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create a default organization for new users
  INSERT INTO public.organizations (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'organization_name', 'My Organization'))
  RETURNING id INTO NEW.raw_user_meta_data;
  
  -- Create profile
  INSERT INTO public.profiles (id, organization_id, email, full_name)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'organization_id')::UUID,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  
  -- Assign owner role
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'organization_id')::UUID,
    'owner'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;