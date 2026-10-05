// Manual re-analyze endpoint: pass { callId } to fetch the call from Vapi,
// run AI analysis, persist, optionally forward to Make.com, and ALWAYS
// re-send the HTML call summary email via the Make.com webhook.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUMMARY_WEBHOOK_URL = "https://hook.eu2.make.com/b9zyvvjty9mp6xjb2e4lkr1mwrsqjgq1";
const SUMMARY_EMAIL_TO = "jan.kadlecik@gransol.eu";
const SUMMARY_EMAIL_FROM = "media@gransol.eu";

const TONE_LABELS: Record<string, string> = {
  meeting_booked: "Meeting booked",
  interested: "Interested",
  confused: "Confused",
  angry: "Angry",
  not_interested: "Not interested",
  neutral: "Neutral",
  voicemail: "Voicemail",
};
const TONE_COLORS: Record<string, string> = {
  meeting_booked: "#16a34a",
  interested: "#2563eb",
  confused: "#d97706",
  angry: "#dc2626",
  not_interested: "#6b7280",
  neutral: "#6b7280",
  voicemail: "#6b7280",
};
const TONES_WITH_REASON = new Set(["not_interested", "angry", "confused"]);

function esc(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtRome(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

type OutcomeKey =
  | "MEETING_BOOKED" | "INTERESTED" | "GATEKEEPER" | "NOT_INTERESTED"
  | "ANGRY" | "CONFUSED" | "VOICEMAIL" | "IVR_HANDOFF" | "IVR_BLOCKED"
  | "NO_ANSWER" | "TWILIO_FAILED" | "NEEDS_REVIEW" | "CALL_SUMMARY";

const OUTCOME_META: Record<OutcomeKey, { tag: string; emoji: string; title: string; color: string; bg: string }> = {
  MEETING_BOOKED: { tag: "MEETING BOOKED", emoji: "🟢", title: "Meeting Confirmed"     ,              color: "#16a34a", bg: "#f0fdf4" },
  INTERESTED:     { tag: "INTERESTED",     emoji: "🟡", title: "Interested Customer"    ,             color: "#ca8a04", bg: "#fefce8" },
  GATEKEEPER:     { tag: "GATEKEEPER",     emoji: "🟠", title: "Gatekeeper Reached"     ,            color: "#ea580c", bg: "#fff7ed" },
  NOT_INTERESTED: { tag: "NOT INTERESTED", emoji: "🔴", title: "Not Interested"       ,                 color: "#dc2626", bg: "#fef2f2" },
  ANGRY:          { tag: "ANGRY",          emoji: "🔴", title: "Angry Customer"        ,              color: "#dc2626", bg: "#fef2f2" },
  CONFUSED:       { tag: "CONFUSED",       emoji: "🟠", title: "Confused Customer"     ,                 color: "#ea580c", bg: "#fff7ed" },
  VOICEMAIL:      { tag: "VOICEMAIL",      emoji: "⚪", title: "Voicemail"              ,           color: "#6b7280", bg: "#f9fafb" },
  IVR_HANDOFF:    { tag: "IVR HANDOFF",    emoji: "🔵", title: "IVR Handoff to Agent"   ,    color: "#2563eb", bg: "#eff6ff" },
  IVR_BLOCKED:    { tag: "IVR BLOCKED",    emoji: "🔵", title: "Blocked by IVR"         ,                 color: "#2563eb", bg: "#eff6ff" },
  NO_ANSWER:      { tag: "NO ANSWER",      emoji: "⚫", title: "No Answer"              ,                color: "#374151", bg: "#f9fafb" },
  TWILIO_FAILED:  { tag: "NEEDS REVIEW",   emoji: "⚠️", title: "Call Not Connected"     ,           color: "#d97706", bg: "#fffbeb" },
  NEEDS_REVIEW:   { tag: "NEEDS REVIEW",   emoji: "⚠️", title: "Call Needs Manual Review", color: "#d97706", bg: "#fffbeb" },
  CALL_SUMMARY:   { tag: "CALL SUMMARY",   emoji: "📄", title: "Call Summary"           ,              color: "#6b7280", bg: "#f9fafb" },
};

function outcomeKey(opts: {
  analysisFailed?: boolean;
  tone: string | null;
  gatekeeperDetected?: boolean;
  meetingConfirmed?: boolean;
  endedReason?: string | null;
  durationSeconds?: number | null;
}): OutcomeKey {
  const er = (opts.endedReason || "").toLowerCase();
  if (er.includes("twilio") || er.includes("failed-to-connect") || er.includes("pipeline-error-twilio")) return "TWILIO_FAILED";
  if (er.includes("no-answer") || er.includes("did-not-answer") || er.includes("customer-busy") || er.includes("customer-did-not-answer")) return "NO_ANSWER";
  if (opts.meetingConfirmed) return "MEETING_BOOKED";
  const t = opts.tone ?? "";
  if (t === "meeting_booked") return "MEETING_BOOKED";
  if (t === "voicemail" || er.includes("voicemail")) return "VOICEMAIL";
  if (t === "interested") return "INTERESTED";
  if (opts.gatekeeperDetected) return "GATEKEEPER";
  if (t === "not_interested") return "NOT_INTERESTED";
  if (t === "angry") return "ANGRY";
  if (t === "confused") return "CONFUSED";
  if (opts.analysisFailed) return "NEEDS_REVIEW";
  return "CALL_SUMMARY";
}

function outcomeTag(opts: Parameters<typeof outcomeKey>[0]): string {
  return OUTCOME_META[outcomeKey(opts)].tag;
}

function buildSubject(opts: {
  analysisFailed?: boolean;
  tone: string | null;
  toneReason: string | null;
  customerName: string | null;
  customerNumber: string | null;
  emailCollected: string | null;
  meetingConfirmed?: boolean;
  meetingDatetime?: string | null;
  gatekeeperDetected?: boolean;
  endedReason?: string | null;
  durationSeconds?: number | null;
}): string {
  const key = outcomeKey(opts);
  const meta = OUTCOME_META[key];
  const who = opts.customerName?.trim() || "Unknown";
  const phone = opts.customerNumber ? ` ${opts.customerNumber}` : "";
  let extra = "";
  switch (key) {
    case "MEETING_BOOKED":
      if (opts.meetingDatetime) extra = ` — meeting ${fmtRome(opts.meetingDatetime) ?? opts.meetingDatetime}`;
      else if (opts.emailCollected) extra = ` — email: ${opts.emailCollected}`;
      break;
    case "INTERESTED":
    case "GATEKEEPER":
      if (opts.emailCollected) extra = ` — email: ${opts.emailCollected}`;
      break;
    case "NOT_INTERESTED":
    case "ANGRY":
    case "CONFUSED":
      if (opts.toneReason?.trim()) extra = ` — ${opts.toneReason.trim()}`;
      break;
    case "TWILIO_FAILED":
      extra = " — twilio failed to connect";
      break;
    case "NO_ANSWER":
      extra = " — nessuna risposta";
      break;
    case "VOICEMAIL":
      extra = " — segreteria telefonica";
      break;
    case "IVR_HANDOFF":
      extra = " — trasferito a operatore";
      break;
    case "IVR_BLOCKED":
      extra = " — bloccato da menù IVR";
      break;
    case "NEEDS_REVIEW":
      if (opts.durationSeconds != null && opts.durationSeconds < 15)
        extra = ` — chiamata breve (${opts.durationSeconds}s)`;
      else if (opts.endedReason)
        extra = ` — ${opts.endedReason.replace(/-/g, " ")}`;
      break;
    default:
      if (opts.emailCollected) extra = ` — email: ${opts.emailCollected}`;
      else if (opts.endedReason) extra = ` — ${opts.endedReason.replace(/-/g, " ")}`;
  }
  return `[${meta.tag}] ${who}${phone}${extra}`;
}

function buildHtml(opts: {
  tone: string | null;
  toneReason: string | null;
  customerName: string | null;
  customerNumber: string | null;
  recallNumber: string | null;
  emailCollected: string | null;
  businessType: string | null;
  companyName: string | null;
  meetingConfirmed: boolean;
  meetingDatetime: string | null;
  meetingNotes: string | null;
  summary: string | null;
  transcript?: string | null;
  recordingUrl: string | null;
  durationSeconds: number | null;
  endedReason: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  analysisFailed?: boolean;
  gatekeeperDetected?: boolean;
  decisionMakerName?: string | null;
  decisionMakerPhone?: string | null;
}): string {
  const key = outcomeKey({
    analysisFailed: opts.analysisFailed,
    tone: opts.tone,
    gatekeeperDetected: opts.gatekeeperDetected,
    meetingConfirmed: opts.meetingConfirmed,
    endedReason: opts.endedReason,
    durationSeconds: opts.durationSeconds,
  });
  const meta = OUTCOME_META[key];
  const recallDifferent = opts.recallNumber && opts.recallNumber !== opts.customerNumber;
  const showReason = TONES_WITH_REASON.has(opts.tone ?? "") && opts.toneReason;
  const meetingDt = fmtRome(opts.meetingDatetime);
  const startedFmt = fmtRome(opts.startedAt);
  const endedFmt = fmtRome(opts.endedAt);
  const dur = fmtDuration(opts.durationSeconds);

  const row = (lbl: string, val: string) =>
    `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;width:180px;vertical-align:top;">${esc(lbl)}</td><td style="padding:6px 12px;color:#111827;font-size:14px;">${val}</td></tr>`;

  // Per-outcome subtitle line under the title
  let subtitle = "";
  if (key === "MEETING_BOOKED" && meetingDt) subtitle = `📅 Appuntamento: <strong>${esc(meetingDt)}</strong>`;
  else if ((key === "INTERESTED" || key === "GATEKEEPER") && opts.emailCollected) subtitle = `✉️ Email raccolta: <strong>${esc(opts.emailCollected)}</strong>`;
  else if (key === "TWILIO_FAILED") subtitle = "La chiamata non è stata stabilita. Verificare numero o permessi geografici Twilio.";
  else if (key === "NO_ANSWER") subtitle = "Il cliente non ha risposto alla chiamata.";
  else if (key === "VOICEMAIL") subtitle = "La chiamata è finita in segreteria telefonica.";
  else if (key === "IVR_HANDOFF") subtitle = "L'IVR ha trasferito la chiamata a un operatore umano.";
  else if (key === "IVR_BLOCKED") subtitle = "La chiamata si è bloccata sul menù IVR aziendale.";
  else if (key === "NEEDS_REVIEW") subtitle = "Analisi automatica non riuscita — controllare manualmente registrazione e trascrizione.";

  const reviewNote = key === "NEEDS_REVIEW" || key === "TWILIO_FAILED"
    ? `<tr><td style="padding:14px 24px;background:#fffbeb;border-top:1px solid #fef3c7;border-bottom:1px solid #fef3c7;">
        <div style="font-size:12px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">⚠️ Review reason</div>
        <div style="margin-top:4px;font-size:14px;color:#78350f;">${esc(
          opts.durationSeconds != null && opts.durationSeconds < 15
            ? `Durata troppo breve (${opts.durationSeconds}s) per estrarre informazioni utili.`
            : (opts.endedReason || "Da verificare")
        )}</div>
      </td></tr>`
    : "";

  const meetingBlock = opts.meetingConfirmed
    ? `<tr><td style="padding:14px 24px;background:#f0fdf4;border-top:1px solid #dcfce7;border-bottom:1px solid #dcfce7;">
        <div style="font-size:12px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">📅 Meeting confirmed</div>
        ${meetingDt ? `<div style="margin-top:6px;font-size:15px;color:#14532d;"><strong>${esc(meetingDt)}</strong></div>` : ""}
        ${opts.meetingNotes ? `<div style="margin-top:4px;font-size:13px;color:#166534;">Notes: ${esc(opts.meetingNotes)}</div>` : ""}
      </td></tr>`
    : "";

  const gatekeeperBlock = opts.gatekeeperDetected
    ? `<tr><td style="padding:14px 24px;background:#fff7ed;border-top:1px solid #fed7aa;border-bottom:1px solid #fed7aa;">
        <div style="font-size:12px;color:#9a3412;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">🚪 Decision Maker (to call back)</div>
        <div style="margin-top:6px;font-size:14px;color:#7c2d12;">
          ${opts.decisionMakerName ? `<div>Name: <strong>${esc(opts.decisionMakerName)}</strong></div>` : ""}
          ${opts.decisionMakerPhone ? `<div>Phone: <strong>${esc(opts.decisionMakerPhone)}</strong></div>` : ""}
          ${!opts.decisionMakerName && !opts.decisionMakerPhone ? "Dati decision maker non raccolti — verificare trascrizione." : ""}
        </div>
      </td></tr>`
    : "";

  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
  <tr><td style="padding:22px 24px;background:${meta.bg};border-bottom:1px solid #e5e7eb;">
    <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${meta.color};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.4px;">${esc(meta.tag)}</div>
    <h1 style="margin:10px 0 0 0;font-size:20px;color:#111827;">${meta.emoji} ${esc(meta.title)}</h1>
    <div style="margin-top:6px;font-size:15px;color:#111827;"><strong>${esc(opts.customerName || "Unknown")}</strong>${opts.customerNumber ? ` <span style="color:#6b7280;">• ${esc(opts.customerNumber)}</span>` : ""}</div>
    ${opts.companyName ? `<div style="margin-top:2px;font-size:13px;color:#6b7280;">${esc(opts.companyName)}</div>` : ""}
    ${subtitle ? `<div style="margin-top:10px;font-size:14px;color:#111827;">${subtitle}</div>` : ""}
  </td></tr>
  ${reviewNote}
  ${meetingBlock}
  ${gatekeeperBlock}
  ${showReason ? `<tr><td style="padding:14px 24px;background:#fef2f2;border-bottom:1px solid #fee2e2;">
    <div style="font-size:12px;color:#991b1b;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">Reason</div>
    <div style="margin-top:4px;font-size:14px;color:#7f1d1d;">${esc(opts.toneReason)}</div>
  </td></tr>` : ""}
  <tr><td style="padding:12px 12px 4px 12px;">
    <div style="padding:0 12px;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">Call details</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
      ${row("Contact", esc(opts.customerName || "—"))}
      ${opts.companyName ? row("Company", esc(opts.companyName)) : ""}
      ${row("Phone", esc(opts.customerNumber || "—"))}
      ${row("Email collected", opts.emailCollected ? `<strong>${esc(opts.emailCollected)}</strong>` : "—")}
      ${recallDifferent ? row("Call back at", `<strong style="color:#dc2626;">${esc(opts.recallNumber)}</strong> <span style="color:#6b7280;font-size:12px;">(different from main)</span>`) : ""}
      ${opts.businessType ? row("Business type", esc(opts.businessType)) : ""}
      ${row("Call started", startedFmt ? `${esc(startedFmt)} <span style="color:#6b7280;">(Europe/Rome)</span>` : "—")}
      ${row("Call ended", endedFmt ? esc(endedFmt) : "—")}
      ${row("Duration", esc(dur))}
      ${row("End reason", esc(opts.endedReason || "—"))}
    </table>
  </td></tr>
  ${opts.summary ? `<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
    <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">📝 Summary</div>
    <div style="margin-top:8px;font-size:14px;color:#111827;line-height:1.55;white-space:pre-wrap;">${esc(opts.summary)}</div>
  </td></tr>` : ""}
  ${opts.transcript ? `<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
    <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">🎙️ Full transcript</div>
    <pre style="margin:8px 0 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#111827;line-height:1.5;white-space:pre-wrap;word-break:break-word;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">${esc(opts.transcript)}</pre>
  </td></tr>` : ""}
  ${opts.recordingUrl ? `<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
    <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">🔗 Recording</div>
    <a href="${esc(opts.recordingUrl)}" style="display:inline-block;margin-top:8px;padding:10px 16px;background:#111827;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;">Listen to recording</a>
  </td></tr>` : ""}
</table>
</body></html>`;
}
// Extract email directly from the call AUDIO (Gemini supports audio input).
// Useful when the prospect spelled it out and the text transcript garbled it.
// Vapi now requires API-key auth to download recordings — we hit the
// authenticated /mono-recording endpoint instead of the public recordingUrl.
async function extractEmailFromAudio(callId: string, recordingUrl: string | null, lovableKey: string): Promise<string | null> {
  const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY");
  if (!VAPI_API_KEY || !callId) return null;
  try {
    const audioRes = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}/mono-recording`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      redirect: "follow",
    });
    if (!audioRes.ok) {
      console.warn("[email-from-audio] failed to download recording:", audioRes.status);
      return null;
    }
    const ct = audioRes.headers.get("content-type") || "";
    let format = "mp3";
    if (ct.includes("wav")) format = "wav";
    else if (ct.includes("mpeg") || ct.includes("mp3")) format = "mp3";
    else if (recordingUrl?.endsWith(".wav")) format = "wav";

    const buf = new Uint8Array(await audioRes.arrayBuffer());
    // 8MB cap — edge functions have a 150MB memory ceiling and base64 + intermediate
    // strings balloon memory ~5-6x the raw size. 25MB blew the limit.
    if (buf.byteLength > 8 * 1024 * 1024) {
      console.warn("[email-from-audio] recording too large, skipping audio extraction:", buf.byteLength);
      return null;
    }
    // Memory-efficient base64: build per 32KB chunk, never accumulate a giant binary string.
    const CHUNK = 0x8000;
    const parts: string[] = [];
    for (let i = 0; i < buf.length; i += CHUNK) {
      const slice = buf.subarray(i, Math.min(i + CHUNK, buf.length));
      let s = "";
      for (let j = 0; j < slice.length; j++) s += String.fromCharCode(slice[j]);
      parts.push(btoa(s));
    }
    const b64 = parts.join("");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content:
              "You listen to a sales call audio recording and extract ONLY the email address that the PROSPECT (not the AI agent) gave for receiving information. The prospect typically SPELLS it letter by letter. Listen very carefully to each letter, including dots, dashes, underscores, and the domain (gmail.com, outlook.com, libero.it, etc.). Return ONLY the email in lowercase, nothing else. If no clear email was given by the prospect, return exactly: NONE",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the prospect's email address from this call recording. Reply with only the email or NONE." },
              { type: "input_audio", input_audio: { data: b64, format } },
            ],
          },
        ],
      }),
    });
    if (!aiRes.ok) {
      console.warn("[email-from-audio] AI error:", aiRes.status, await aiRes.text());
      return null;
    }
    const data = await aiRes.json();
    const raw = (data?.choices?.[0]?.message?.content || "").trim();
    if (!raw || /^none$/i.test(raw)) return null;
    // Pull first email-shaped token out of the response
    const m = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return m ? m[0].toLowerCase() : null;
  } catch (e) {
    console.error("[email-from-audio] exception:", e);
    return null;
  }
}

const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "record_call_analysis",
    description: "Record the analysis of a sales call transcript.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        intent: {
          type: "string",
          enum: ["interested", "not_interested", "callback", "meeting_booked", "voicemail", "unclear", "gatekeeper", "ivr_blocked", "ivr_handoff", "customer_ended_call"],
          description: "Use 'ivr_blocked' ONLY when an IVR / switchboard answered and the agent never reached a human (no transfer/handoff tool was used). Use 'ivr_handoff' when the transcript shows a transfer/handoff tool was invoked (e.g. transferCall, handoff, transfer_to_human) — the IVR was successfully handled. Use 'customer_ended_call' when a real human customer answered and hung up themselves and no other intent clearly applies.",
        },
        is_interested: { type: "boolean", description: "STRICT: true ONLY when the prospect themself spoke an explicit positive interest signal. Politeness / passive listening / agreeing to receive an email / 'ci penso' is NOT interest. When in doubt, false." },
        is_interested_evidence: { type: "string", description: "Verbatim quote (in original language, max ~120 chars) from the PROSPECT's own turn proving is_interested=true. Empty string when false." },
        meeting_confirmed: { type: "boolean" },
        meeting_datetime: { type: "string" },
        meeting_notes: { type: "string" },
        email_collected: { type: "string", description: "Email the prospect spelled out / gave during the call. Empty string if none." },
        recall_number: { type: "string", description: "Preferred callback phone number the prospect gave. Empty string if none." },
        tone: {
          type: "string",
          enum: ["meeting_booked", "interested", "confused", "angry", "not_interested", "neutral", "voicemail"],
          description: "Overall emotional tone / outcome of the prospect during the call.",
        },
        tone_reason: {
          type: "string",
          description: "ONE short sentence explaining WHY the prospect was not_interested, angry, or confused. Empty string for any other tone.",
        },
        company_name: {
          type: "string",
          description: "The prospect's company / business name as mentioned during the call (e.g. 'Gran Solmedia'). Empty string if not mentioned.",
        },
        gatekeeper_detected: {
          type: "boolean",
          description: "SCENARIO D: True if the person who answered is NOT the decision-maker and the agent collected the decision-maker's name and phone number.",
        },
        decision_maker_name: { type: "string", description: "When gatekeeper_detected=true: full name of the decision-maker. Empty string otherwise." },
        decision_maker_phone: { type: "string", description: "When gatekeeper_detected=true: phone number of the decision-maker (E.164 if possible). Empty string otherwise." },
        needs_recall: {
          type: "boolean",
          description: "True when the conversation ended UNFINISHED while the prospect was still warm — they asked the agent to hold/wait, asked to be called back later, were busy/distracted, or the call dropped mid-discussion. False if the call ended cleanly (meeting booked, clear refusal, voicemail, IVR, gatekeeper handoff).",
        },
        recall_reason: { type: "string", description: "Short phrase (max 8 words) explaining WHY a recall is needed. Empty string when needs_recall=false." },
        recall_action_summary: { type: "string", description: "When needs_recall=true: 2-3 sentences for the human owner explaining what happened and what to say on the callback. Empty string otherwise." },
      },
      required: ["summary", "intent", "is_interested", "is_interested_evidence", "meeting_confirmed", "meeting_datetime", "meeting_notes", "email_collected", "recall_number", "tone", "tone_reason", "company_name", "gatekeeper_detected", "decision_maker_name", "decision_maker_phone", "needs_recall", "recall_reason", "recall_action_summary"],
      additionalProperties: false,
    },
  },
};

function toDbTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    console.warn("[analysis] invalid meeting_datetime from AI:", trimmed);
    return null;
  }
  return date.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { callId, forward = true, sendEmail = false, force = false } = await req.json();
    if (!callId) {
      return new Response(JSON.stringify({ error: "callId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const VAPI = Deno.env.get("VAPI_API_KEY");
    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    if (!VAPI || !LOVABLE) {
      return new Response(JSON.stringify({ error: "Missing API keys" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callRes = await fetch(`https://api.vapi.ai/call/${callId}`, {
      headers: { Authorization: `Bearer ${VAPI}` },
    });
    const call = await callRes.json();
    if (!callRes.ok) {
      return new Response(JSON.stringify({ error: "Vapi error", details: call }), {
        status: callRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript: string = call.transcript ?? "";
    const hasTranscript = transcript && transcript.trim().length >= 5;

    if (!hasTranscript && !force) {
      return new Response(JSON.stringify({ error: "No transcript available yet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default analysis stub for force-mode with no transcript (e.g. twilio-failed calls)
    let analysis: Record<string, unknown> = {
      summary: `Call did not complete. Ended reason: ${call.endedReason ?? "unknown"}. No transcript was produced.`,
      intent: call.endedReason === "twilio-failed-to-connect-call" ? "twilio_failed" : "customer_ended_call",
      is_interested: false,
      is_interested_evidence: "",
      meeting_confirmed: false,
      meeting_datetime: "",
      meeting_notes: "",
      email_collected: "",
      recall_number: "",
      company_name: "",
      tone: "neutral",
      tone_reason: "",
      gatekeeper_detected: false,
      decision_maker_name: "",
      decision_maker_phone: "",
      needs_recall: false,
      recall_reason: "",
      recall_action_summary: "",
    };

    if (hasTranscript) {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            {
              role: "system",
              content:
                "You analyze sales-call transcripts. Extract whether the prospect is interested and whether a meeting was explicitly confirmed (with at least an approximate time). Be conservative: only set meeting_confirmed=true if the user clearly agreed to a time/demo. Also extract any email address the prospect gave (email_collected), any preferred callback phone number (recall_number), the prospect's company / business name (company_name), the overall emotional tone (tone), and a short reason for negative tones (tone_reason). Use empty string if not mentioned. IS_INTERESTED RULE: Set is_interested=true ONLY if the prospect themself spoke an explicit positive interest signal (e.g. 'sì mi interessa', 'volentieri', 'fissiamo l\\'appuntamento'). Politeness ('certo', 'va bene', 'okay', 'mhm'), passive listening, asking a clarifying question, agreeing to receive an email/brochure, 'ci penso', 'magari più avanti', 'ora non posso', voicemail/IVR/gatekeeper are NOT interest. When in doubt, false. You MUST also fill is_interested_evidence with a verbatim quote from the PROSPECT's own turn proving the interest; if you cannot quote one, is_interested MUST be false. SCENARIO D — GATEKEEPER: If the person who answered is NOT the decision-maker (assistant, secretary, receptionist, family member, etc.) and the agent collected the decision-maker's name and phone number, set gatekeeper_detected=true, intent='gatekeeper', meeting_confirmed=false, is_interested=false, and fill decision_maker_name and decision_maker_phone with the values confirmed via repeat-back. IVR RULES: Use intent='ivr_blocked' ONLY when the call hit an automated switchboard / IVR menu AND the agent NEVER reached a human (no transfer/handoff tool was used). If the transcript contains evidence that a transfer / handoff tool was invoked (e.g. 'transferCall', 'handoff', 'transfer_to_human', '[tool: transferCall]', or the agent says 'I'm transferring you now' and the call continues), the IVR was HANDLED — set intent='ivr_handoff' (never 'ivr_blocked'). If a real human customer answered and they themselves hung up / ended the call and no other intent fits (interested / not_interested / callback / meeting_booked / gatekeeper), use intent='customer_ended_call' — never 'ivr_blocked'. RECALL DETECTION: Set needs_recall=true when the conversation ended UNFINISHED while the prospect was still warm — asked to hold/wait, asked to be called back later, was busy/distracted, or the line dropped mid-discussion. Set false on clean endings (meeting booked, clear refusal, voicemail, IVR, ivr_handoff/transfer, gatekeeper). When true, fill recall_reason (short phrase) and recall_action_summary (2-3 sentences for the owner explaining what happened and what to say on callback).",
            },
            { role: "user", content: `Vapi endedReason for this call: ${call.endedReason ?? "unknown"}.\n\nAnalyze this transcript:\n\n${transcript}` },
          ],
          tools: [ANALYSIS_TOOL],
          tool_choice: { type: "function", function: { name: "record_call_analysis" } },
        }),
      });
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const aiData = await aiRes.json();
      const args = aiData?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) {
        return new Response(JSON.stringify({ error: "AI returned no analysis" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      analysis = JSON.parse(args);

      // Validate is_interested against transcript
      if (analysis.is_interested === true) {
        const norm = (s: string) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        const ev = norm(String(analysis.is_interested_evidence || "")).slice(0, 80);
        const haystack = norm(transcript || "");
        const tone = String(analysis.tone || "");
        const intent = String(analysis.intent || "");
        const quoteOk = ev.length >= 4 && haystack.includes(ev);
        const toneOk = ["interested", "meeting_booked"].includes(tone) || intent === "meeting_booked" || analysis.meeting_confirmed === true;
        if (!quoteOk || !toneOk) {
          console.log(`[validation] downgraded is_interested for ${callId}: quoteOk=${quoteOk} toneOk=${toneOk} ev="${ev}"`);
          analysis.is_interested = false;
          analysis.is_interested_evidence = "";
        }
      }

      // Fallback: extract email from audio if not found in transcript
      const recordingUrlEarly: string | null = call.recordingUrl ?? null;
      if ((!analysis.email_collected || !String(analysis.email_collected).trim()) && callId) {
        const fromAudio = await extractEmailFromAudio(callId, recordingUrlEarly, LOVABLE);
        if (fromAudio) {
          console.log("[email-from-audio] recovered:", fromAudio);
          analysis.email_collected = fromAudio;
        }
      }
    }


    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const startedAt = call.startedAt;
    const endedAt = call.endedAt;
    const duration =
      startedAt && endedAt
        ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
        : null;

    const customerNumber: string | null = call.customer?.number ?? null;
    const customerName: string | null = call.customer?.name ?? null;
    const recordingUrl: string | null = call.recordingUrl ?? null;
    // Authenticated proxy URL — Vapi's raw recordingUrl now requires an
    // API key, so we route playback through our vapi-recording function.
    const recordingProxyUrl: string | null = callId
      ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/vapi-recording?callId=${encodeURIComponent(callId)}`
      : null;
    const endedReason: string | null = call.endedReason ?? null;

    await supabase.from("call_analyses").upsert(
      {
        vapi_call_id: callId,
        customer_number: customerNumber,
        customer_name: customerName,
        transcript,
        recording_url: recordingUrl,
        ended_reason: endedReason,
        duration_seconds: duration,
        summary: analysis.summary,
        intent: analysis.intent,
        is_interested: analysis.is_interested,
        meeting_confirmed: analysis.meeting_confirmed,
        meeting_datetime: toDbTimestamp(analysis.meeting_datetime),
        meeting_notes: analysis.meeting_notes || null,
        email_collected: analysis.email_collected || null,
        recall_number: analysis.recall_number || null,
        tone: analysis.tone ?? null,
        tone_reason: analysis.tone_reason || null,
        gatekeeper_detected: !!analysis.gatekeeper_detected,
        decision_maker_name: analysis.decision_maker_name || null,
        decision_maker_phone: analysis.decision_maker_phone || null,
        needs_recall: !!analysis.needs_recall,
        recall_reason: analysis.recall_reason || null,
        recall_action_summary: analysis.recall_action_summary || null,
        raw_analysis: analysis,
      },
      { onConflict: "vapi_call_id" },
    );

    // Mirror email/recall_number onto the matching contact, and look up company fallback
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, business_type, notes")
      .eq("last_vapi_call_id", callId)
      .maybeSingle();

    const contactPatch: Record<string, unknown> = {};
    if (analysis.email_collected) contactPatch.email_collected = analysis.email_collected;
    if (analysis.recall_number) {
      contactPatch.recall_number = analysis.recall_number;
      contactPatch.recall_number_acknowledged = false;
    }
    if (analysis.gatekeeper_detected) {
      contactPatch.is_gatekeeper = true;
      contactPatch.status = "gatekeeper";
      contactPatch.interest = "gatekeeper";
      if (analysis.decision_maker_name) contactPatch.decision_maker_name = analysis.decision_maker_name;
      if (analysis.decision_maker_phone) contactPatch.decision_maker_phone = analysis.decision_maker_phone;
    }
    if (Object.keys(contactPatch).length > 0 && contact?.id) {
      await supabase.from("contacts").update(contactPatch).eq("id", contact.id);
    }

    // Company: AI value first, fallback to contact's stored notes
    const companyName: string | null =
      (analysis.company_name && String(analysis.company_name).trim()) ||
      (contact?.notes ? String(contact.notes).trim() : null) ||
      null;

    // Note: Make.com meeting forwarding removed — summary email below is the
    // single notification we send (it already contains meeting details).
    const forwarded = false;

    // ---- Re-send the HTML summary email ONLY when explicitly requested ----
    let summaryEmailSent = false;
    let summaryError: string | null = null;
    const tone = analysis.tone ?? null;
    const toneReason = analysis.tone_reason || null;
    const subject = buildSubject({
      tone,
      toneReason,
      customerName,
      customerNumber,
      emailCollected: analysis.email_collected || null,
      meetingConfirmed: !!analysis.meeting_confirmed,
      meetingDatetime: analysis.meeting_datetime || null,
      gatekeeperDetected: !!analysis.gatekeeper_detected,
      endedReason,
      durationSeconds: duration,
    });
    const html = buildHtml({
      tone,
      toneReason,
      customerName,
      customerNumber,
      recallNumber: analysis.recall_number || null,
      emailCollected: analysis.email_collected || null,
      businessType: contact?.business_type ?? null,
      companyName,
      meetingConfirmed: !!analysis.meeting_confirmed,
      meetingDatetime: analysis.meeting_datetime || null,
      meetingNotes: analysis.meeting_notes || null,
      summary: analysis.summary || null,
      transcript: transcript || null,
      recordingUrl: recordingProxyUrl,
      durationSeconds: duration,
      endedReason,
      startedAt: startedAt ?? null,
      endedAt: endedAt ?? null,
      gatekeeperDetected: !!analysis.gatekeeper_detected,
      decisionMakerName: analysis.decision_maker_name || null,
      decisionMakerPhone: analysis.decision_maker_phone || null,
    });

    if (sendEmail) try {
      const sumRes = await fetch(SUMMARY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          html,
          to: SUMMARY_EMAIL_TO,
          from: SUMMARY_EMAIL_FROM,
          tone,
          tone_reason: toneReason,
          call_id: callId,
          customer_name: customerName,
          customer_number: customerNumber,
          recall_number: analysis.recall_number || null,
          email_collected: analysis.email_collected || null,
          business_type: contact?.business_type ?? null,
          company_name: companyName,
          meeting_confirmed: !!analysis.meeting_confirmed,
          meeting_datetime: analysis.meeting_datetime || null,
          meeting_notes: analysis.meeting_notes || null,
          summary: analysis.summary || null,
          transcript: transcript || null,
          recording_url: recordingProxyUrl,
          duration_seconds: duration,
          ended_reason: endedReason,
          started_at: startedAt ?? null,
          ended_at: endedAt ?? null,
          resent: true,
        }),
      });
      summaryEmailSent = sumRes.ok;
      if (!sumRes.ok) {
        summaryError = `${sumRes.status}: ${await sumRes.text()}`;
        console.error("Summary webhook error", summaryError);
      } else {
        await supabase
          .from("call_analyses")
          .update({ summary_email_sent_at: new Date().toISOString() })
          .eq("vapi_call_id", callId);
      }
    } catch (e) {
      summaryError = String(e);
      console.error("Summary webhook fetch failed:", e);
    }

    return new Response(
      JSON.stringify({ ok: true, analysis, forwarded, summary_email_sent: summaryEmailSent, summary_error: summaryError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
