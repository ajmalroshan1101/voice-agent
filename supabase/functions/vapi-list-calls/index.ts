const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Strip heavy fields from each call so the list response stays small & fast.
// Full payload (transcript, messages, artifact, analysis) is loaded on row click via vapi-get-call.
function slimCall(c: Record<string, unknown>) {
  return {
    id: c.id,
    status: c.status,
    endedReason: c.endedReason,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    createdAt: c.createdAt,
    cost: c.cost,
    customer: c.customer,
    phoneNumberId: c.phoneNumberId,
    assistantId: c.assistantId,
    phoneNumber: c.phoneNumber,
    assistant: c.assistant,
    metadata: c.metadata,
    type: (c as any).type,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("VAPI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "VAPI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 25)));

    let res: Response | null = null;
    let lastErr = "";
    // Vapi /call can be slow on cold paths — retry a couple of times on timeouts.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(`https://api.vapi.ai/call?limit=${limit}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(55_000),
        });
        break;
      } catch (e) {
        lastErr = (e as Error).message;
        console.warn(`[vapi-list-calls] attempt ${attempt + 1} failed:`, lastErr);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    if (!res) {
      return new Response(
        JSON.stringify({ error: "Vapi fetch failed", detail: lastErr }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = await res.text().catch((e) => {
      console.error("body read failed:", e);
      return "";
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Vapi API error", status: res.status, body: text.slice(0, 500) }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let data: unknown = [];
    try {
      data = text ? JSON.parse(text) : [];
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON from Vapi", detail: (e as Error).message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const slim = Array.isArray(data) ? data.map(slimCall) : data;

    return new Response(JSON.stringify(slim), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
