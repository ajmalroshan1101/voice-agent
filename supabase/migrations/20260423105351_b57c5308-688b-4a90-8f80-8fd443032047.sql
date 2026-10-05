ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email_collected text,
  ADD COLUMN IF NOT EXISTS recall_number text,
  ADD COLUMN IF NOT EXISTS recall_number_acknowledged boolean NOT NULL DEFAULT false;

ALTER TABLE public.call_analyses
  ADD COLUMN IF NOT EXISTS email_collected text,
  ADD COLUMN IF NOT EXISTS recall_number text;