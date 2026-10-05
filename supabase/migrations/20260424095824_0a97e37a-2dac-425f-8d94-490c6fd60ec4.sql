CREATE POLICY "Public can insert call_jobs"
  ON public.call_jobs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public can update call_jobs"
  ON public.call_jobs FOR UPDATE TO public USING (true);
CREATE POLICY "Public can insert system_events"
  ON public.system_events FOR INSERT TO public WITH CHECK (true);