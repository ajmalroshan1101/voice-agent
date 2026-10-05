// Safety net: finds contacts stuck in "calling" status for >5 minutes,
// fetches their call from Vapi, and if ended, posts a synthesized
// end-of-call-report to vapi-webhook so status + analysis are processed.
// Intended to run via cron every few minutes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const VAPI = Deno.env.get("VAPI_API_KEY");
  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!VAPI) {
    return new Response(JSON.stringify({ error: "VAPI_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPA_URL, SERVICE);
  const cutoff = new Date(Date.now() - 90 * 1000).toISOString();

  const { data: stuck, error } = await supabase
    .from("contacts")
    .select("id, last_vapi_call_id, last_call_at")
    .eq("status", "calling")
    .lt("last_call_at", cutoff)
    .not("last_vapi_call_id", "is", null)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  let reconciled = 0;

  for (const c of stuck ?? []) {
    processed++;
    try {
      const r = await fetch(`https://api.vapi.ai/call/${c.last_vapi_call_id}`, {
        headers: { Authorization: `Bearer ${VAPI}` },
      });
      const ageMin = (Date.now() - new Date(c.last_call_at).getTime()) / 60000;

      // Vapi 404 / not found: if old enough, force-fail so the contact isn't stuck forever.
      if (r.status === 404) {
        if (ageMin > 10) {
          await supabase.from("contacts").update({
            status: "call_failed",
            last_failure_reason: "Vapi call not found (404) after reconcile",
          }).eq("id", c.id);
          await supabase.from("system_events").insert({
            event_type: "stuck_call_force_failed", severity: "warning",
            contact_id: c.id, vapi_call_id: c.last_vapi_call_id,
            message: `Force-failed: Vapi 404 after ${Math.round(ageMin)}m`,
          });
          reconciled++;
        }
        continue;
      }
      if (!r.ok) {
        console.warn("vapi fetch failed", c.last_vapi_call_id, r.status);
        continue;
      }
      const call = await r.json();

      // If Vapi never finished the call but it's been stuck >15m, force-fail to unblock.
      if (call?.status !== "ended") {
        if (ageMin > 15) {
          await supabase.from("contacts").update({
            status: "call_failed",
            last_failure_reason: `Stuck in Vapi status "${call?.status}" for ${Math.round(ageMin)}m`,
          }).eq("id", c.id);
          await supabase.from("system_events").insert({
            event_type: "stuck_call_force_failed", severity: "warning",
            contact_id: c.id, vapi_call_id: c.last_vapi_call_id,
            message: `Force-failed: Vapi status "${call?.status}" after ${Math.round(ageMin)}m`,
            metadata: { endedReason: call?.endedReason ?? null },
          });
          reconciled++;
        }
        continue;
      }

      // Vapi says "ended". Some error endings (e.g. Twilio account-not-authorized)
      // have no endedAt — fall back to updatedAt / now so we still close them out.
      const endedAt = call.endedAt ?? call.updatedAt ?? new Date().toISOString();
      const startedAt = call.startedAt ?? call.createdAt ?? endedAt;

      const payload = {
        message: {
          type: "end-of-call-report",
          call,
          transcript: call.transcript ?? "",
          recordingUrl: call.recordingUrl,
          endedReason: call.endedReason,
          startedAt,
          endedAt,
        },
      };
      const wh = await fetch(`${SUPA_URL}/functions/v1/vapi-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (wh.ok) {
        reconciled++;
        await supabase.from("system_events").insert({
          event_type: "stuck_call_reconciled", severity: "info",
          contact_id: c.id, vapi_call_id: c.last_vapi_call_id,
          message: `Reconciled stuck call (ended ${call.endedReason})`,
        });
      } else {
        console.warn("webhook replay failed", await wh.text());
      }
    } catch (e) {
      console.error("reconcile error", c.id, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed, reconciled }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
