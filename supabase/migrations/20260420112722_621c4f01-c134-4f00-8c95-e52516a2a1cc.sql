
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_approval_reason text;

CREATE INDEX IF NOT EXISTS idx_contacts_next_call_at ON public.contacts(next_call_at) WHERE status = 'no_answer';

CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Public insert settings" ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update settings" ON public.app_settings FOR UPDATE USING (true);

CREATE TRIGGER trg_app_settings_updated
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (key, value)
VALUES ('auto_call', '{"enabled": true, "assistant_id": null, "phone_number_id": null, "retry_minutes": 60, "max_attempts": 3}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
