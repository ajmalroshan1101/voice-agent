// Places an outbound Vapi call for a contact using default settings.
// Updates the contact row with calling status + vapi call id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const normalizeE164 = (raw: string, defaultCc = "39"): string => {
  let s = String(raw).trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return "+" + s.slice(2);
  if (defaultCc === "39" && s.startsWith("0")) s = s.replace(/^0+/, "");
  return "+" + defaultCc + s;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { contactId } = await req.json();
    if (!contactId) {
      return new Response(JSON.stringify({ error: "contactId required" }), {
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

    const { data: contact } = await supabase
      .from("contacts").select("*").eq("id", contactId).maybeSingle();
    if (!contact) {
      return new Response(JSON.stringify({ error: "Contact not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedNumber = normalizeE164(contact.phone ?? "");
    if (!/^\+[1-9]\d{6,14}$/.test(normalizedNumber)) {
      const reason = `Invalid phone number: ${contact.phone}`;
      await supabase.from("contacts").update({
        status: "call_failed",
        last_failure_reason: reason,
      }).eq("id", contact.id);
      return new Response(JSON.stringify({ error: reason }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: setting } = await supabase
      .from("app_settings").select("value").eq("key", "auto_call").maybeSingle();
    const cfg = (setting?.value ?? {}) as {
      assistant_id?: string; squad_id?: string; phone_number_id?: string;
      enabled?: boolean; max_attempts?: number; retry_minutes?: number;
      agent_name?: string;
    };

    const squadId = (cfg.squad_id ?? "").trim();
    const assistantId = (cfg.assistant_id ?? "").trim();

    if ((!squadId && !assistantId) || !cfg.phone_number_id) {
      return new Response(JSON.stringify({ error: "Default squad_id/assistant_id and phone_number_id must be configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const agentName = (cfg.agent_name ?? "").trim() || "Matteo";

    const nameParts = (contact.name ?? "").trim().split(/\s+/);
    const firstName = nameParts.shift() ?? "";
    const lastName = nameParts.join(" ");

    const nowDate = new Date();
    const romeHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(nowDate));
    const greeting = romeHour < 12 ? "Good morning" : romeHour < 17 ? "Good afternoon" : "Good evening";

    const variables: Record<string, string> = {
      contact_id: contact.id,
      first_name: firstName,
      last_name: lastName,
      customer_name: contact.name ?? "",
      customer_number: normalizedNumber,
      business_type: contact.business_type ?? "",
      company_name: contact.company ?? "",
      notes: contact.notes ?? "",
      agent_name: agentName,
      now: nowDate.toISOString(),
      greeting,
    };

    const res = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: { Authorization: `Bearer ${VAPI}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneNumberId: cfg.phone_number_id,
        ...(squadId ? { squadId } : { assistantId }),
        customer: { number: normalizedNumber, ...(contact.name ? { name: contact.name } : {}) },
        metadata: variables,
        assistantOverrides: {
          variableValues: variables,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Vapi error", data);
      await supabase.from("system_events").insert({
        event_type: "call_failed", severity: "error",
        contact_id: contact.id,
        message: `Vapi rejected call (status ${res.status})`,
        metadata: { status: res.status, details: data },
      });
      await supabase.from("contacts").update({
        status: "call_failed",
        last_failure_reason: `Vapi ${res.status}: ${JSON.stringify(data).slice(0, 300)}`,
      }).eq("id", contact.id);
      return new Response(JSON.stringify({ error: "Vapi error", details: data }), {
        status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("contacts").update({
      status: "calling",
      attempt_count: (contact.attempt_count ?? 0) + 1,
      last_vapi_call_id: data.id ?? null,
      last_call_at: new Date().toISOString(),
      next_call_at: null,
    }).eq("id", contact.id);

    return new Response(JSON.stringify({ ok: true, call: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
