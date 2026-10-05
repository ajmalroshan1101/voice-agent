// Launches a campaign: places Vapi calls for all 'waiting' contacts in the campaign.
// Uses the campaign's assistant_id, phone_number_id, and delay_seconds.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { clampToOfficeHours } from "../_shared/office-hours.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { campaignId } = await req.json();
    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaignId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const VAPI = Deno.env.get("VAPI_API_KEY");
    if (!VAPI) {
      return new Response(JSON.stringify({ error: "VAPI_API_KEY not set" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: camp, error: cErr } = await supabase
      .from("campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (cErr || !camp) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!camp.assistant_id || !camp.phone_number_id) {
      return new Response(JSON.stringify({ error: "Campaign missing assistant_id or phone_number_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contacts } = await supabase
      .from("contacts").select("*")
      .eq("campaign_id", campaignId)
      .in("status", ["waiting"]);

    if (!contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ ok: true, queued: 0, message: "No contacts to call" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("campaigns").update({ status: "active" }).eq("id", campaignId);

    const delaySec = Math.max(0, camp.delay_seconds ?? 0);
    const maxAttempts = Math.max(1, camp.max_attempts ?? 3);
    const now = Date.now();

    // Enqueue one job per contact, staggered by delay_seconds. The
    // process-call-queue worker handles concurrency + retries.
    const jobs = contacts.map((c, idx) => ({
      contact_id: c.id,
      priority: 50,
      max_attempts: maxAttempts,
      scheduled_at: clampToOfficeHours(new Date(now + idx * delaySec * 1000)).toISOString(),
    }));

    const { error: insErr } = await supabase.from("call_jobs").insert(jobs);
    if (insErr) {
      console.error("Enqueue failed", insErr);
      return new Response(JSON.stringify({ error: "Failed to enqueue jobs", details: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("system_events").insert({
      event_type: "call_started", severity: "info",
      message: `Campaign "${camp.name}" enqueued ${jobs.length} calls`,
      metadata: { campaign_id: campaignId, total: jobs.length, stagger_seconds: delaySec },
    });

    return new Response(JSON.stringify({
      ok: true, total: contacts.length, queued: jobs.length,
      message: "Campaign queued — calls will be placed by the worker",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
