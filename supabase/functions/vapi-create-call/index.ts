import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("VAPI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "VAPI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { phoneNumberId, assistantId, customerNumber, customerName, metadata } = body ?? {};

    if (!phoneNumberId || !assistantId || !customerNumber) {
      return new Response(
        JSON.stringify({ error: "phoneNumberId, assistantId, and customerNumber are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Normalize to E.164. Default country = Italy (+39) if no country code present.
    const normalizeE164 = (raw: string, defaultCc = "39"): string => {
      let s = String(raw).trim().replace(/[\s\-().]/g, "");
      if (s.startsWith("+")) return s;
      if (s.startsWith("00")) return "+" + s.slice(2);
      // Strip Italian trunk leading 0 only when prefixing CC 39
      if (defaultCc === "39" && s.startsWith("0")) s = s.replace(/^0+/, "");
      return "+" + defaultCc + s;
    };
    const normalizedNumber = normalizeE164(customerNumber);
    if (!/^\+[1-9]\d{6,14}$/.test(normalizedNumber)) {
      return new Response(
        JSON.stringify({ error: `Invalid phone number: ${customerNumber}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Keep empty strings so Vapi substitutes {{var}} with "" instead of leaving
    // the literal "{{var}}" in the prompt. Only drop undefined / null.
    const cleanVars: Record<string, string> =
      metadata && typeof metadata === "object"
        ? Object.fromEntries(
            Object.entries(metadata)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => [k, String(v)]),
          )
        : {};

    // Ensure the standard variables always exist (as "" if missing) so the
    // assistant prompt never renders an unresolved {{placeholder}}.
    const REQUIRED_VARS = [
      "first_name",
      "last_name",
      "customer_name",
      "customer_number",
      "company_name",
      "business_type",
      "notes",
      "agent_name",
    ];
    for (const k of REQUIRED_VARS) {
      if (!(k in cleanVars)) cleanVars[k] = "";
    }

    // Inject current time + greeting (Europe/Rome)
    const nowDate = new Date();
    const romeHour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(nowDate),
    );
    cleanVars.now = nowDate.toISOString();
    cleanVars.greeting = romeHour < 12 ? "Good morning" : romeHour < 17 ? "Good afternoon" : "Good evening";

    if (customerName) cleanVars.customer_name = customerName;
    cleanVars.customer_number = normalizedNumber;
    if (customerName && !cleanVars.first_name && !cleanVars.last_name) {
      const parts = String(customerName).trim().split(/\s+/);
      const fn = parts.shift() ?? "";
      const ln = parts.join(" ");
      if (fn) cleanVars.first_name = fn;
      if (ln) cleanVars.last_name = ln;
    }

    // Always inject the configured agent_name (single source of truth)
    if (!cleanVars.agent_name) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data: setting } = await supabase
          .from("app_settings").select("value").eq("key", "auto_call").maybeSingle();
        const cfg = (setting?.value ?? {}) as { agent_name?: string };
        cleanVars.agent_name = (cfg.agent_name ?? "").trim() || "Matteo";
      } catch {
        cleanVars.agent_name = "Matteo";
      }
    }

    const payload: Record<string, unknown> = {
      phoneNumberId,
      assistantId,
      customer: {
        number: normalizedNumber,
        ...(customerName ? { name: customerName } : {}),
      },
      ...(Object.keys(cleanVars).length
        ? {
            metadata: cleanVars,
            assistantOverrides: {
              variableValues: cleanVars,
            },
          }
        : {}),
    };

    const res = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Vapi error", details: data }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ call: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
