SELECT cron.schedule(
  'reconcile-stuck-calls',
  '*/2 * * * *',
  $$SELECT net.http_post(
    url := 'https://llypexmghncecpudvjgq.supabase.co/functions/v1/reconcile-stuck-calls',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxseXBleG1naG5jZWNwdWR2amdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzM1NTgsImV4cCI6MjA5MjAwOTU1OH0.pXzgyrU1K_qf7Rq3CXFGUQX6VcU3sh1lWTGnx2b7xfY"}'::jsonb,
    body := '{}'::jsonb
  );$$
);