-- Create connection adapter enum
CREATE TYPE connection_adapter AS ENUM ('quickbooks', 'xero', 'netsuite', 'webhook', 'csv');

-- Create connection status enum
CREATE TYPE connection_status AS ENUM ('disconnected', 'active', 'error');

-- Create connections table
CREATE TABLE public.connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  adapter connection_adapter NOT NULL,
  status connection_status NOT NULL DEFAULT 'disconnected',
  display_name TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  last_validated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create field_maps table
CREATE TABLE public.field_maps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.connections(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  map JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, connection_id, doc_type)
);

-- Add connection_id to push_jobs
ALTER TABLE public.push_jobs 
ADD COLUMN connection_id UUID REFERENCES public.connections(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_maps ENABLE ROW LEVEL SECURITY;

-- RLS policies for connections
CREATE POLICY "Users can view connections in their org"
  ON public.connections FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Admins can manage connections"
  ON public.connections FOR ALL
  USING (has_min_role(auth.uid(), organization_id, 'admin'::user_role));

-- RLS policies for field_maps
CREATE POLICY "Users can view field maps in their org"
  ON public.field_maps FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Admins can manage field maps"
  ON public.field_maps FOR ALL
  USING (has_min_role(auth.uid(), organization_id, 'admin'::user_role));

-- Add updated_at triggers
CREATE TRIGGER update_connections_updated_at
  BEFORE UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_field_maps_updated_at
  BEFORE UPDATE ON public.field_maps
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create indexes
CREATE INDEX idx_connections_org ON public.connections(organization_id);
CREATE INDEX idx_connections_status ON public.connections(status);
CREATE INDEX idx_field_maps_org ON public.field_maps(organization_id);
CREATE INDEX idx_push_jobs_connection ON public.push_jobs(connection_id);