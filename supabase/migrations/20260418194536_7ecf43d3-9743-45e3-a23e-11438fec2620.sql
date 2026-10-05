-- Contacts table
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  source text,
  business_type text,
  notes text,
  status text NOT NULL DEFAULT 'waiting',
  interest text,
  last_call_at timestamptz,
  last_vapi_call_id text,
  campaign_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Campaigns table
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft', -- draft|active|paused|completed
  assistant_id text,
  phone_number_id text,
  script text,
  delay_seconds integer NOT NULL DEFAULT 30,
  max_attempts integer NOT NULL DEFAULT 3,
  total_contacts integer NOT NULL DEFAULT 0,
  called_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_campaign_fk FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- RLS (public, matches existing call_analyses pattern; no auth in app yet)
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read contacts" ON public.contacts FOR SELECT USING (true);
CREATE POLICY "Public can insert contacts" ON public.contacts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update contacts" ON public.contacts FOR UPDATE USING (true);
CREATE POLICY "Public can delete contacts" ON public.contacts FOR DELETE USING (true);

CREATE POLICY "Public can read campaigns" ON public.campaigns FOR SELECT USING (true);
CREATE POLICY "Public can insert campaigns" ON public.campaigns FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update campaigns" ON public.campaigns FOR UPDATE USING (true);
CREATE POLICY "Public can delete campaigns" ON public.campaigns FOR DELETE USING (true);

-- updated_at triggers
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX contacts_campaign_idx ON public.contacts(campaign_id);
CREATE INDEX contacts_status_idx ON public.contacts(status);