CREATE TABLE public.call_analyses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vapi_call_id text NOT NULL UNIQUE,
  customer_number text,
  customer_name text,
  summary text,
  intent text,
  is_interested boolean,
  meeting_confirmed boolean DEFAULT false,
  meeting_datetime timestamptz,
  meeting_notes text,
  transcript text,
  recording_url text,
  ended_reason text,
  duration_seconds integer,
  forwarded_to_make boolean DEFAULT false,
  forwarded_at timestamptz,
  raw_analysis jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_analyses_vapi_call_id ON public.call_analyses(vapi_call_id);
CREATE INDEX idx_call_analyses_created_at ON public.call_analyses(created_at DESC);

ALTER TABLE public.call_analyses ENABLE ROW LEVEL SECURITY;

-- Public read access (internal single-tenant dashboard, no auth yet)
CREATE POLICY "Anyone can read call analyses"
  ON public.call_analyses FOR SELECT
  USING (true);

-- Writes only via service role (edge functions); no public insert/update/delete policies
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_call_analyses_updated_at
BEFORE UPDATE ON public.call_analyses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();