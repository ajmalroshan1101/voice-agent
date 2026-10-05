import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { call_id, phone, first_name } = await req.json();
    if (!call_id || !phone) {
      return new Response(JSON.stringify({ error: "call_id and phone required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");
    const APP_URL = Deno.env.get("APP_URL") ?? "https://viva-chiamate-pro.lovable.app";

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
      return new Response(JSON.stringify({ error: "Twilio credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { data: tokenRow, error: insErr } = await supabase
      .from("email_tokens")
      .insert({ call_id, phone, expires_at: expiresAt })
      .select("token")
      .single();

    if (insErr || !tokenRow) {
      return new Response(JSON.stringify({ error: insErr?.message ?? "Token insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const link = `${APP_URL.replace(/\/$/, "")}/email-confirm?token=${tokenRow.token}`;
    const greeting = first_name ? `Hi ${first_name}, ` : "Hi, ";
    const body = `${greeting}here is the link to confirm your email for your Gransol Media Group meeting:\n${link}\n— Gransol Media Group`;

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phone, From: TWILIO_FROM_NUMBER, Body: body }),
      },
    );

    const twilioData = await twilioRes.json();
    if (!twilioRes.ok) {
      return new Response(JSON.stringify({ error: twilioData?.message ?? "Twilio send failed", twilioData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("call_analyses")
      .update({ sms_sent: true, sms_sent_at: new Date().toISOString() })
      .eq("vapi_call_id", call_id);

    return new Response(JSON.stringify({ ok: true, sid: twilioData.sid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
