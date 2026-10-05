// One-off: sanitize the default Vapi assistant tool config.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function getToolType(apiKey: string, toolId: string) {
  const res = await fetch(`https://api.vapi.ai/tool/${encodeURIComponent(toolId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  const tool = await res.json();
  return typeof tool?.type === "string" ? tool.type : null;
}

async function sanitizeToolIds(apiKey: string, toolIds: string[]) {
  const seenTypes = new Set<string>();
  const toolTypes = await Promise.all(toolIds.map(async (id) => ({ id, type: await getToolType(apiKey, id) })));
  return toolTypes.filter(({ type }) => {
    if (!type) return true;
    if (seenTypes.has(type)) return false;
    seenTypes.add(type);
    return true;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("VAPI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "VAPI_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "auto_call")
    .maybeSingle();
  const assistantId = String(asObject(setting?.value).assistant_id ?? "");
  if (!assistantId) {
    return new Response(JSON.stringify({ error: "auto_call assistant_id missing" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const getRes = await fetch(`https://api.vapi.ai/assistant/${encodeURIComponent(assistantId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const assistant = await getRes.json();
  if (!getRes.ok) {
    return new Response(JSON.stringify({ status: getRes.status, data: assistant }), {
      status: getRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const model = asObject(assistant.model);
  const toolIds = Array.isArray(model.toolIds) ? model.toolIds.filter((id) => typeof id === "string") as string[] : [];
  const sanitizedToolIds = await sanitizeToolIds(apiKey, toolIds);
  const externalTypes = new Set(sanitizedToolIds.map((tool) => tool.type).filter(Boolean));
  const inlineTools = Array.isArray(model.tools) ? model.tools.filter((tool) => typeof tool === "object" && tool !== null) as Record<string, unknown>[] : [];
  const inlineTypes = new Set<string>();
  const filteredInlineTools = inlineTools.filter((tool) => {
    if (typeof tool.type !== "string") return true;
    if (externalTypes.has(tool.type) || inlineTypes.has(tool.type)) return false;
    inlineTypes.add(tool.type);
    return true;
  });

  const payload = {
    model: {
      ...model,
      toolIds: sanitizedToolIds.map((tool) => tool.id),
      tools: filteredInlineTools,
    },
  };

  const res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return new Response(JSON.stringify({ status: res.status, data }), {
    status: res.ok ? 200 : res.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
