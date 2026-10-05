ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS knowledge_base_file_id text,
  ADD COLUMN IF NOT EXISTS knowledge_base_updated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS knowledge_base_file_name text;