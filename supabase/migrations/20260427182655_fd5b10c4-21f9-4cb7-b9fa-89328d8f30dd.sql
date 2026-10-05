
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_gatekeeper boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS decision_maker_name text,
  ADD COLUMN IF NOT EXISTS decision_maker_phone text,
  ADD COLUMN IF NOT EXISTS decision_maker_contact_id uuid;

ALTER TABLE public.call_analyses
  ADD COLUMN IF NOT EXISTS gatekeeper_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS decision_maker_name text,
  ADD COLUMN IF NOT EXISTS decision_maker_phone text;

CREATE INDEX IF NOT EXISTS idx_contacts_is_gatekeeper ON public.contacts(is_gatekeeper) WHERE is_gatekeeper = true;
