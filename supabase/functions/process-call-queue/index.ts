// Cron worker: atomically claims due call_jobs, runs each via contact-auto-call,
// applies exponential backoff on failure, and writes system_events.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { clampToOfficeHours } from "../_shared/office-hours.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const DEFAULT_BATCH = 5;
const DEFAULT_RETRY_MIN = 5;
const MAX_DELAY_MIN = 1440;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: setting } = await supabase
    .from("app_settings").select("value").eq("key", "auto_call").maybeSingle();
  const cfg = (setting?.value ?? {}) as {
    queue_batch_size?: number; retry_minutes?: number;
  };
  const batch = Math.max(1, Math.min(cfg.queue_batch_size ?? DEFAULT_BATCH, 20));
  const retryMin = cfg.retry_minutes ?? DEFAULT_RETRY_MIN;

  const workerId = `w-${crypto.randomUUID().slice(0, 8)}`;
  const { data: claimed, error: claimErr } = await supabase
    .rpc("claim_call_jobs", { p_limit: batch, p_worker: workerId });

  if (claimErr) {
    console.error("claim error", claimErr);
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!claimed || claimed.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let success = 0, failed = 0, dead = 0;

  for (const job of claimed) {
    await supabase.from("system_events").insert({
      event_type: "job_claimed", severity: "info",
      job_id: job.id, contact_id: job.contact_id,
      message: `Worker ${workerId} claimed job (attempt ${job.attempts}/${job.max_attempts})`,
    });

    try {
      const r = await fetch(`${supaUrl}/functions/v1/contact-auto-call`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contactId: job.contact_id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? `HTTP ${r.status}`);

      await supabase.from("call_jobs").update({
        status: "done", last_error: null,
      }).eq("id", job.id);

      await supabase.from("system_events").insert({
        event_type: "call_started", severity: "info",
        job_id: job.id, contact_id: job.contact_id,
        vapi_call_id: data?.call?.id ?? null,
        message: "Call placed via Vapi",
      });
      success++;
    } catch (e) {
      const msg = String(e);
      console.error("Job failed", job.id, msg);

      if (job.attempts >= job.max_attempts) {
        await supabase.from("call_jobs").update({
          status: "dead", last_error: msg,
        }).eq("id", job.id);
        await supabase.from("contacts").update({
          status: "needs_approval",
          last_failure_reason: msg.slice(0, 500),
          needs_approval_reason: `Queue gave up after ${job.attempts} attempts: ${msg.slice(0, 200)}`,
        }).eq("id", job.contact_id);
        await supabase.from("system_events").insert({
          event_type: "job_dead", severity: "error",
          job_id: job.id, contact_id: job.contact_id,
          message: msg.slice(0, 500),
        });
        dead++;
      } else {
        const delayMin = Math.min(retryMin * Math.pow(2, job.attempts), MAX_DELAY_MIN);
        const next = clampToOfficeHours(new Date(Date.now() + delayMin * 60 * 1000)).toISOString();
        await supabase.from("call_jobs").update({
          status: "queued", scheduled_at: next, last_error: msg,
          locked_at: null, locked_by: null,
        }).eq("id", job.id);
        await supabase.from("system_events").insert({
          event_type: "retry_scheduled", severity: "warning",
          job_id: job.id, contact_id: job.contact_id,
          message: `Retry in ${delayMin}m: ${msg.slice(0, 200)}`,
          metadata: { delay_minutes: delayMin, attempt: job.attempts },
        });
        failed++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, claimed: claimed.length, success, failed, dead }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
