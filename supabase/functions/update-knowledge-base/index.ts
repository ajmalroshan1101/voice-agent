import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SETTINGS_KEY = "knowledge_base";
const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXT = ["txt", "pdf", "docx"];
const KB_TOOL_NAME = "knowledge_base_query";
const KB_TOOL_DESCRIPTION =
  "Current uploaded client knowledge base. Use it for service details, offers, pricing, FAQs, processes, and objection answers.";

function err(step: string, message: string, status = 500) {
  return new Response(JSON.stringify({ error: `[${step}] ${message}` }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function deleteVapi(path: string, apiKey: string) {
  await fetch(`https://api.vapi.ai${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => {});
}

async function getVapiToolType(apiKey: string, toolId: string) {
  const res = await fetch(`https://api.vapi.ai/tool/${encodeURIComponent(toolId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  const tool = await res.json();
  return typeof tool?.type === "string" ? tool.type : null;
}

async function getUniqueToolIdsByType(apiKey: string, toolIds: string[]) {
  const seenTypes = new Set<string>();
  const toolTypes = await Promise.all(toolIds.map(async (id) => ({ id, type: await getVapiToolType(apiKey, id) })));
  return toolTypes.filter(({ type }) => {
    if (!type) return true;
    if (seenTypes.has(type)) return false;
    seenTypes.add(type);
    return true;
  });
}

function withKnowledgeBaseInstruction(messages: unknown) {
  if (!Array.isArray(messages)) return messages;
  if (messages.some((msg) => asObject(msg).content?.toString().includes(KB_TOOL_NAME))) return messages;

  let added = false;
  const instruction = `\n\nKnowledge base: when you need accurate company, service, pricing, process, FAQ, or objection details, use the ${KB_TOOL_NAME} tool before answering.`;
  const next = messages.map((msg) => {
    const item = asObject(msg);
    if (!added && item.role === "system" && typeof item.content === "string") {
      added = true;
      return { ...item, content: `${item.content}${instruction}` };
    }
    return msg;
  });

  return added ? next : [{ role: "system", content: instruction.trim() }, ...messages];
}

function buildModelPatch(currentModel: Record<string, unknown>, newToolId: string, oldToolId: string | null, existingToolIds: string[], externalToolTypes: Set<string>) {
  const toolIds = [...new Set(existingToolIds.filter((id) => id !== oldToolId).concat(newToolId))];

  const nextModel: Record<string, unknown> = {
    provider: currentModel.provider ?? "openai",
    model: currentModel.model ?? "gpt-4o-mini",
    toolIds,
  };

  if (currentModel.messages) nextModel.messages = withKnowledgeBaseInstruction(currentModel.messages);
  if (Array.isArray(currentModel.tools)) {
    nextModel.tools = currentModel.tools.filter((tool) => {
      const type = asObject(tool).type;
      return !(typeof type === "string" && externalToolTypes.has(type));
    });
  }
  if (typeof currentModel.temperature === "number") nextModel.temperature = currentModel.temperature;
  if (typeof currentModel.maxTokens === "number") nextModel.maxTokens = currentModel.maxTokens;
  if (typeof currentModel.emotionRecognitionEnabled === "boolean") nextModel.emotionRecognitionEnabled = currentModel.emotionRecognitionEnabled;

  return nextModel;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const VAPI_KEY = Deno.env.get("VAPI_API_KEY") ?? Deno.env.get("VAPI_PRIVATE_KEY");
    const ASSISTANT_ID = Deno.env.get("VAPI_ASSISTANT_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!VAPI_KEY) return err("config", "Missing VAPI API key", 500);
    if (!ASSISTANT_ID) return err("config", "Missing VAPI_ASSISTANT_ID", 500);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return err("input", "No file provided", 400);

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return err("input", "Only .txt, .pdf, .docx allowed", 400);
    if (file.size > MAX_BYTES) return err("input", "File exceeds 50MB", 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: existing } = await supabase
      .from("app_settings")
      .select("id, value, knowledge_base_file_id")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    const oldFileId: string | null = existing?.knowledge_base_file_id ?? null;
    const existingValue = asObject(existing?.value);
    const oldToolId = typeof existingValue.vapi_query_tool_id === "string" ? existingValue.vapi_query_tool_id : null;

    // Step 1 - Upload to VAPI
    const upForm = new FormData();
    upForm.append("file", file, file.name);
    const upRes = await fetch("https://api.vapi.ai/file", {
      method: "POST",
      headers: { Authorization: `Bearer ${VAPI_KEY}` },
      body: upForm,
    });
    const upText = await upRes.text();
    if (!upRes.ok) return err("upload", `VAPI upload failed: ${upRes.status} ${upText}`);
    const upJson = JSON.parse(upText);
    const newFileId: string = upJson.id;
    if (!newFileId) return err("upload", "VAPI did not return file id");

    // Step 2 - Create a VAPI Query Tool for this uploaded knowledge base file.
    // File-based knowledge bases belong on a Query Tool, then the assistant model references the toolId.
    const toolRes = await fetch("https://api.vapi.ai/tool", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "query",
        function: { name: KB_TOOL_NAME },
        knowledgeBases: [
          {
            provider: "google",
            name: "client-knowledge-base",
            description: KB_TOOL_DESCRIPTION,
            fileIds: [newFileId],
          },
        ],
      }),
    });
    const toolText = await toolRes.text();
    if (!toolRes.ok) {
      await deleteVapi(`/file/${newFileId}`, VAPI_KEY);
      return err("create-tool", `VAPI query tool creation failed: ${toolRes.status} ${toolText}`);
    }
    const toolJson = JSON.parse(toolText);
    const newToolId: string = toolJson.id;
    if (!newToolId) {
      await deleteVapi(`/file/${newFileId}`, VAPI_KEY);
      return err("create-tool", "VAPI did not return query tool id");
    }

    // Step 3 - Fetch existing assistant to preserve model provider/model
    const getRes = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      headers: { Authorization: `Bearer ${VAPI_KEY}` },
    });
    if (!getRes.ok) {
      const t = await getRes.text();
      await deleteVapi(`/tool/${newToolId}`, VAPI_KEY);
      await deleteVapi(`/file/${newFileId}`, VAPI_KEY);
      return err("fetch-assistant", `Assistant fetch failed: ${getRes.status} ${t}`);
    }
    const assistant = await getRes.json();
    const currentModel = asObject(assistant.model);
    const existingToolIds = Array.isArray(currentModel.toolIds) ? currentModel.toolIds.filter((id) => typeof id === "string") as string[] : [];
    const uniqueToolsByType = await getUniqueToolIdsByType(VAPI_KEY, existingToolIds);
    const uniqueToolIds = uniqueToolsByType.map((tool) => tool.id);
    const externalToolTypes = new Set(uniqueToolsByType.map((tool) => tool.type).filter((type): type is string => Boolean(type)));
    const newModel = buildModelPatch(currentModel, newToolId, oldToolId, uniqueToolIds, externalToolTypes);

    console.log("[update-kb] currentModel:", JSON.stringify(currentModel));
    console.log("[update-kb] PATCH model:", JSON.stringify(newModel));

    const patchRes = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${VAPI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: newModel }),
    });
    if (!patchRes.ok) {
      const t = await patchRes.text();
      // rollback uploaded file
      await deleteVapi(`/tool/${newToolId}`, VAPI_KEY);
      await deleteVapi(`/file/${newFileId}`, VAPI_KEY);
      return err("attach", `Assistant update failed: ${patchRes.status} ${t}`);
    }

    // Step 4 - Delete old VAPI resources after the assistant points at the new tool.
    if (oldToolId && oldToolId !== newToolId) await deleteVapi(`/tool/${oldToolId}`, VAPI_KEY);
    if (oldFileId && oldFileId !== newFileId) {
      await deleteVapi(`/file/${oldFileId}`, VAPI_KEY);
    }

    // Step 5 - Save
    const nowIso = new Date().toISOString();
    const payload = {
      key: SETTINGS_KEY,
      value: { file_name: file.name, file_size: file.size, vapi_query_tool_id: newToolId },
      knowledge_base_file_id: newFileId,
      knowledge_base_file_name: file.name,
      knowledge_base_updated_at: nowIso,
      updated_at: nowIso,
    };

    if (existing?.id) {
      const { error } = await supabase.from("app_settings").update(payload).eq("id", existing.id);
      if (error) return err("save", error.message);
    } else {
      const { error } = await supabase.from("app_settings").insert(payload);
      if (error) return err("save", error.message);
    }

    // Step 6
    return new Response(
      JSON.stringify({
        success: true,
        file_name: file.name,
        updated_at: nowIso,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return err("unexpected", e instanceof Error ? e.message : String(e));
  }
});
