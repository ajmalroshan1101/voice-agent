-- contacts: priority + last failure reason
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS last_failure_reason TEXT;

-- call_jobs queue
CREATE TABLE IF NOT EXISTS public.call_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  priority INT NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'queued',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_jobs_claim
  ON public.call_jobs (status, scheduled_at, priority);
CREATE INDEX IF NOT EXISTS idx_call_jobs_contact
  ON public.call_jobs (contact_id);

ALTER TABLE public.call_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read call_jobs"
  ON public.call_jobs FOR SELECT TO public USING (true);

CREATE TRIGGER update_call_jobs_updated_at
  BEFORE UPDATE ON public.call_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- system_events audit log
CREATE TABLE IF NOT EXISTS public.system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  contact_id UUID,
  vapi_call_id TEXT,
  job_id UUID,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_events_created_at
  ON public.system_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_type
  ON public.system_events (event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_severity
  ON public.system_events (severity);

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read system_events"
  ON public.system_events FOR SELECT TO public USING (true);

-- Atomic claim function
CREATE OR REPLACE FUNCTION public.claim_call_jobs(p_limit INT, p_worker TEXT)
RETURNS SETOF public.call_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.call_jobs
    WHERE status = 'queued'
      AND scheduled_at <= now()
    ORDER BY priority ASC, scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.call_jobs j
  SET status = 'processing',
      locked_at = now(),
      locked_by = p_worker,
      attempts = j.attempts + 1,
      updated_at = now()
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.*;
END;
$$;