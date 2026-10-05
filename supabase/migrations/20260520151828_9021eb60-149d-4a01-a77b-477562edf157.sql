
CREATE TABLE public.email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  call_id text NOT NULL,
  phone text NOT NULL,
  email text,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_tokens_token ON public.email_tokens(token);
CREATE INDEX idx_email_tokens_call_id ON public.email_tokens(call_id);

ALTER TABLE public.email_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read valid tokens"
  ON public.email_tokens FOR SELECT
  USING (used = false AND expires_at > now());

ALTER TABLE public.call_analyses
  ADD COLUMN IF NOT EXISTS sms_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_sent_at timestamptz;

ALTER TABLE public.email_tokens REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_tokens;
