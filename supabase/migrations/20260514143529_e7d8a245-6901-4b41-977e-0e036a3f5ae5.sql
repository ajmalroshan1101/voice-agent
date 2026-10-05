
ALTER TABLE public.call_analyses
  ADD COLUMN IF NOT EXISTS needs_recall boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recall_reason text,
  ADD COLUMN IF NOT EXISTS recall_action_summary text,
  ADD COLUMN IF NOT EXISTS recall_handled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recall_handled_at timestamptz;

CREATE INDEX IF NOT EXISTS call_analyses_recall_idx
  ON public.call_analyses (needs_recall, recall_handled, created_at DESC);

DROP POLICY IF EXISTS "Public can update call_analyses" ON public.call_analyses;
CREATE POLICY "Public can update call_analyses"
  ON public.call_analyses FOR UPDATE
  USING (true) WITH CHECK (true);
