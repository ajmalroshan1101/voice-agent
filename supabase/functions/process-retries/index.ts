// Cron-invoked: finds contacts whose retry is due and re-invokes auto-call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auto-retry is disabled. This worker is a no-op until re-enabled.
  return new Response(
    JSON.stringify({ ok: true, processed: 0, disabled: true, reason: "auto-retry disabled" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
