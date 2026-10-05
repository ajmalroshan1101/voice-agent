// Public proxy for Vapi call recordings.
// Vapi now requires API-key auth to download recordings; browsers and
// email clients cannot send that header. This function accepts a callId,
// hits Vapi's authenticated /mono-recording endpoint, follows the 302,
// and redirects the caller to the short-lived signed URL.
//
// Usage:
//   GET /functions/v1/vapi-recording?callId=<uuid>&kind=mono
//   kind: mono (default) | stereo | customer | assistant | video
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

const KIND_MAP: Record<string, string> = {
  mono: "mono-recording",
  stereo: "stereo-recording",
  customer: "customer-recording",
  assistant: "assistant-recording",
  video: "video-recording",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("VAPI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "VAPI_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const callId = url.searchParams.get("callId");
  const kindParam = (url.searchParams.get("kind") ?? "mono").toLowerCase();
  const kind = KIND_MAP[kindParam] ?? "mono-recording";

  if (!callId) {
    return new Response(JSON.stringify({ error: "callId is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Ask Vapi for the short-lived signed URL. Do NOT auto-follow the redirect —
  // we want to hand the signed URL back to the browser so audio streams from
  // Vapi's CDN directly (no proxying multi-MB payloads through the function).
  const vapiRes = await fetch(
    `https://api.vapi.ai/call/${encodeURIComponent(callId)}/${kind}`,
    { method: "GET", headers: { Authorization: `Bearer ${apiKey}` }, redirect: "manual" },
  );

  if (vapiRes.status === 302 || vapiRes.status === 301 || vapiRes.status === 307) {
    const signed = vapiRes.headers.get("location");
    if (signed) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: signed, "Cache-Control": "no-store" },
      });
    }
  }

  // Some clients may not surface the Location on manual redirect — fall back
  // to following it and streaming the response body.
  if (!vapiRes.ok && vapiRes.status !== 200) {
    const body = await vapiRes.text().catch(() => "");
    const expired = /retention window|last 14 days/i.test(body);
    return new Response(
      JSON.stringify({
        error: expired
          ? "This recording is no longer available — Vapi only keeps call recordings for the last 14 days."
          : "Vapi recording fetch failed",
        status: vapiRes.status,
        body,
      }),
      { status: vapiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }


  const contentType = vapiRes.headers.get("content-type") ?? "audio/mpeg";
  return new Response(vapiRes.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
});
