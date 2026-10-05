// Vapi server webhook — receives end-of-call reports, runs AI analysis,
// stores result, and forwards confirmed meetings to Make.com.
// Public endpoint (Vapi has no JWT). Configure this URL in Vapi assistant > Server URL.

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

const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "record_call_analysis",
    description: "Record the analysis of a sales call transcript.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "1-2 sentence summary of what happened on the call." },
        intent: {
          type: "string",
          enum: ["interested", "not_interested", "callback", "meeting_booked", "voicemail", "unclear", "gatekeeper", "ivr_blocked", "ivr_handoff", "customer_ended_call"],
          description: "The customer's overall stance after this call. Use 'gatekeeper' when the person who answered was not the decision-maker (Scenario D). Use 'ivr_blocked' ONLY when the call hit an automated switchboard / IVR menu AND the agent never reached a human (no transfer / handoff tool was used). Use 'ivr_handoff' when the call started with an IVR menu but the agent successfully navigated it and a transfer/handoff tool (e.g. transferCall, handoff, transfer_to_human) was invoked in the transcript — the IVR was HANDLED, not blocked. Use 'customer_ended_call' when a real human customer answered and they themselves ended/hung up the call (the call was NOT blocked by an IVR) and no other intent (interested / not_interested / meeting_booked / callback / gatekeeper) clearly applies.",
        },
        is_interested: {
          type: "boolean",
          description:
            "STRICT: True ONLY when the prospect explicitly expressed positive interest in the product/service in their OWN words — e.g. 'sì mi interessa', 'volentieri', 'va bene mandami informazioni / fissiamo un appuntamento', 'sounds good', 'yes I'm interested'. " +
            "Politeness ('certo', 'va bene', 'okay', 'mhm', 'ho capito'), simply listening without objecting, asking a clarifying question, agreeing to be called back, asking for the email/brochure to forward to someone else, or saying 'ci penso' / 'magari più avanti' / 'ora non posso' is NOT interest — set false. " +
            "If the prospect hung up, refused, was a gatekeeper, voicemail, IVR, or the signal is ambiguous → false. When in doubt, set false.",
        },
        is_interested_evidence: {
          type: "string",
          description: "Direct quote (verbatim, max ~120 chars) from the prospect's own turn that proves is_interested=true. Empty string when is_interested=false.",
        },
        meeting_confirmed: {
          type: "boolean",
          description: "True ONLY if the customer explicitly agreed to a meeting/demo with a specific or approximate time.",
        },
        meeting_datetime: {
          type: "string",
          description: "ISO 8601 datetime of the agreed meeting in UTC. Empty string if no meeting was confirmed or no specific time given.",
        },
        meeting_notes: { type: "string", description: "Any extra context about the meeting, prep needed, or topics to cover. Empty string if none." },
        email_collected: {
          type: "string",
          description: "Email address the prospect provided during the call (look for spelled-out letters, phrases like 'la mia email è', 'mi mandi una mail a', or a standard email format spoken aloud). Empty string if none was given.",
        },
        recall_number: {
          type: "string",
          description: "Phone number the prospect provided as their preferred callback number (look for phrases like 'mi chiami su questo numero', 'preferisco essere richiamato al', 'il numero migliore è'). Return in international E.164 format if possible. Empty string if none was given.",
        },
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
          description: "SCENARIO D: True if the person who answered is NOT the decision-maker (e.g. assistant, secretary, receptionist, family member, employee) and the agent collected the decision-maker's name and phone number to call back later. False otherwise.",
        },
        decision_maker_name: {
          type: "string",
          description: "When gatekeeper_detected=true: the FULL NAME of the actual decision-maker the agent should call back, as confirmed by the gatekeeper (repeat-back). Empty string otherwise.",
        },
        decision_maker_phone: {
          type: "string",
          description: "When gatekeeper_detected=true: the PHONE NUMBER of the actual decision-maker, as confirmed by the gatekeeper (repeat-back). Return in international E.164 format if possible. Empty string otherwise.",
        },
        needs_recall: {
          type: "boolean",
          description: "True when the conversation ended UNFINISHED while the prospect was still warm — e.g. they asked the agent to hold/wait ('un attimo', 'aspetti', 'mi richiami tra 5 minuti', 'sono in macchina', 'non posso adesso'), they showed interest but got interrupted (someone calling them, doorbell, baby crying, lost signal), the call dropped mid-discussion, or they said 'richiamami più tardi/dopo' / 'call me back later'. False if the call ended cleanly (meeting booked, clearly not interested, voicemail with no human, IVR, gatekeeper handoff already captured).",
        },
        recall_reason: {
          type: "string",
          description: "ONE short phrase (max 8 words) describing WHY a recall is needed (e.g. 'asked to be called back later', 'was driving', 'connection dropped during pricing'). Empty string when needs_recall=false.",
        },
        recall_action_summary: {
          type: "string",
          description: "When needs_recall=true: 2-3 sentences for the human owner explaining what happened, what the prospect was interested in, and what to say when calling back. Empty string when needs_recall=false.",
        },
      },
      required: ["summary", "intent", "is_interested", "is_interested_evidence", "meeting_confirmed", "meeting_datetime", "meeting_notes", "email_collected", "recall_number", "tone", "tone_reason", "company_name", "gatekeeper_detected", "decision_maker_name", "decision_maker_phone", "needs_recall", "recall_reason", "recall_action_summary"],
      additionalProperties: false,
    },
  },
};

// Listen to the call AUDIO and extract the prospect's email. Used as a fallback
// when the text transcript missed the spelled-out email.
// Vapi now requires API-key auth to download recordings — we hit the
// authenticated /mono-recording endpoint (which 302-redirects to a signed URL)
// instead of the public recordingUrl.
async function extractEmailFromAudio(callId: string, recordingUrl: string | null): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY");
  if (!LOVABLE_API_KEY || !VAPI_API_KEY || !callId) return null;
  try {
    const audioRes = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}/mono-recording`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      redirect: "follow",
    });
    if (!audioRes.ok) {
      console.warn("[email-from-audio] download failed:", audioRes.status);
      return null;
    }
    const ct = audioRes.headers.get("content-type") || "";
    let format = "mp3";
    if (ct.includes("wav") || (recordingUrl?.endsWith(".wav") ?? false)) format = "wav";
    const buf = new Uint8Array(await audioRes.arrayBuffer());
    // 6MB cap — edge functions OOM at ~150MB and base64 + JSON body amplify a lot.
    if (buf.byteLength > 6 * 1024 * 1024) {
      console.warn("[email-from-audio] recording too large, skipping:", buf.byteLength);
      return null;
    }
    // Memory-efficient chunked base64 — never materialize a giant binary string.
    const CHUNK = 32 * 1024;
    let b64 = "";
    for (let i = 0; i < buf.length; i += CHUNK) {
      const slice = buf.subarray(i, Math.min(i + CHUNK, buf.length));
      let bin = "";
      for (let j = 0; j < slice.length; j++) bin += String.fromCharCode(slice[j]);
      b64 += btoa(bin);
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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
    const m = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return m ? m[0].toLowerCase() : null;
  } catch (e) {
    console.error("[email-from-audio] exception:", e);
    return null;
  }
}

async function analyzeTranscript(transcript: string, endedReason?: string | null) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const nowUtc = new Date();
  const nowIso = nowUtc.toISOString();
  const todayHuman = nowUtc.toUTCString();

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        {
          role: "system",
          content:
            `You analyze sales-call transcripts. The current date and time is ${todayHuman} (ISO: ${nowIso}). ` +
            `When the prospect mentions relative times like "tomorrow", "next Monday", "in 2 days", "this evening", etc., ` +
            `you MUST resolve them against this current date and output an absolute ISO 8601 datetime in UTC. ` +
            `Never invent a date in the past. If the resolved meeting datetime would be earlier than the current date, ` +
            `assume the prospect meant the next future occurrence. ` +
            `Extract whether the prospect is interested and whether a meeting was explicitly confirmed (with at least an approximate time). ` +
            `Be conservative: only set meeting_confirmed=true if the user clearly agreed to a time/demo. ` +
            `If the user said "maybe" or "send info", that is NOT a confirmed meeting. ` +
            `If no specific time was given, leave meeting_datetime as an empty string. ` +
            `SCENARIO D — GATEKEEPER: If the person who answered is NOT the decision-maker (e.g. an assistant, secretary, receptionist, spouse, family member, colleague who says "il titolare non c'è", "non sono io", "le passo il responsabile non disponibile", etc.), and the agent collected the decision-maker's name and phone number, set gatekeeper_detected=true, intent="gatekeeper", tone="neutral", and fill decision_maker_name and decision_maker_phone with the values confirmed via repeat-back. In that case meeting_confirmed MUST be false and is_interested MUST be false. ` +
            `IVR / SWITCHBOARD: If the transcript shows an automated phone menu (phrases like "digitare 1 per...", "premere 0 per parlare con un operatore", "press 1 for sales", repeated identical robotic prompts) and the agent NEVER reached a human (no transfer/handoff tool was invoked), set intent="ivr_blocked", tone="neutral", is_interested=false, meeting_confirmed=false, gatekeeper_detected=false, and put a short note in summary explaining the call hit a switchboard. ` +
            `IVR HANDOFF (NOT blocked): If the transcript contains evidence that a transfer / handoff tool was used by the agent — e.g. a tool call line like "[tool: transferCall]", "transferCall", "handoff", "transfer_to_human", "transferToOperator", or the agent says something like "I'm transferring you now" and the call clearly continues to a human or a target number — then the IVR was successfully HANDLED. In that case set intent="ivr_handoff" (NEVER "ivr_blocked"), tone="neutral", and note in summary that the IVR was navigated and the call was transferred. ` +
            `CUSTOMER ENDED THE CALL: If a real human customer answered (it is NOT an IVR / switchboard / voicemail / gatekeeper) and the customer themself hung up / ended the call (endedReason hints: "customer-ended-call", or the customer's last turn was a goodbye / hang-up / "non mi interessa, ciao"), do NOT classify this as "ivr_blocked". Pick the most accurate human-conversation intent (interested / not_interested / callback / meeting_booked). If none of those clearly fit, use "customer_ended_call". ` +
            `IS_INTERESTED RULE: Set is_interested=true ONLY if the prospect themself spoke an explicit positive interest signal (e.g. "sì mi interessa", "volentieri", "fissiamo l'appuntamento", "yes I'm interested"). Politeness ("certo", "va bene", "okay", "mhm"), passive listening, asking a clarifying question, agreeing to receive an email, "ci penso", "magari più avanti", "ora non posso", and gatekeeper/IVR/voicemail are NOT interest. When in doubt, return false. You MUST also fill is_interested_evidence with a verbatim quote (in the original language) from the PROSPECT's own turn proving the interest; if you cannot quote one, is_interested MUST be false. ` +
            `RECALL DETECTION: Carefully judge whether the conversation ended UNFINISHED while the prospect was still potentially interested. Set needs_recall=true when the prospect explicitly asked to be called back later, asked the agent to hold/wait, was busy or distracted ("sono al volante", "aspetti un attimo", "mi richiami tra mezz'ora"), the line dropped mid-discussion, or they showed interest but the call ended without resolution. Set needs_recall=false when a meeting was booked, the prospect clearly refused, it was voicemail/IVR, an ivr_handoff/transfer happened, or it was already handled as a gatekeeper handoff. When needs_recall=true, fill recall_reason with a short phrase and recall_action_summary with 2-3 sentences telling the owner what happened and what to say on the callback.`,
        },
        { role: "user", content: `Today is ${todayHuman}.\nVapi endedReason for this call: ${endedReason ?? "unknown"}.\n\nAnalyze this transcript:\n\n${transcript}` },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "function", function: { name: "record_call_analysis" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t}`);
  }
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("No tool call in AI response");
  return JSON.parse(args);
}

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

// Map Vapi endedReason to a meaningful intent label, used when the AI didn't
// produce one (or returned "unclear"). This way the UI shows "no answer" /
// "busy" / "voicemail" / "call failed" instead of a generic "unclear" pill.
function intentFromEndedReason(endedReason?: string | null): string | null {
  if (!endedReason) return null;
  const r = endedReason.toLowerCase();
  if (r.includes("customer-did-not-answer") || r.includes("no-answer")) return "no_answer";
  if (r.includes("customer-busy") || r === "busy") return "busy";
  if (r.includes("voicemail")) return "voicemail";
  if (r.includes("twilio-failed") || r.includes("provider-closed-websocket") || r.includes("failed-to-connect")) return "connect_failed";
  if (r.startsWith("call.start.error") || r.includes("error")) return "call_failed";
  if (r.includes("customer-ended-call")) return "customer_ended_call";
  if (r.includes("assistant-ended-call")) return "assistant_ended_call";
  return null;
}

function deriveIntent(aiIntent: unknown, endedReason?: string | null): string | null {
  const ai = typeof aiIntent === "string" ? aiIntent.trim() : "";
  if (ai && ai !== "unclear") return ai;
  const fromReason = intentFromEndedReason(endedReason);
  if (fromReason) return fromReason;
  return ai || null; // keep "unclear" or null as last resort
}


async function postWithRetry(
  url: string,
  payload: unknown,
  opts: { tries?: number; baseMs?: number; label: string },
): Promise<{ ok: boolean; status: number; body: string; attempts: number }> {
  const tries = opts.tries ?? 3;
  const base = opts.baseMs ?? 500;
  let lastStatus = 0;
  let lastBody = "";
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      lastStatus = res.status;
      lastBody = await res.text();
      if (res.ok) return { ok: true, status: res.status, body: lastBody, attempts: i + 1 };
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { ok: false, status: res.status, body: lastBody, attempts: i + 1 };
      }
    } catch (e) {
      lastBody = String(e);
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, base * Math.pow(2, i)));
  }
  console.error(`${opts.label} failed after ${tries} tries:`, lastStatus, lastBody);
  return { ok: false, status: lastStatus, body: lastBody, attempts: tries };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    // Vapi sends: { message: { type, call, ... } }
    const message = body?.message ?? body;
    const type = message?.type;

    // Only act on end-of-call reports
    if (type !== "end-of-call-report") {
      return new Response(JSON.stringify({ ok: true, skipped: type }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const call = message.call ?? {};
    const callId: string = call.id ?? message.callId;
    const transcript: string = message.transcript ?? call.transcript ?? "";
    const recordingUrl: string | undefined = message.recordingUrl ?? call.recordingUrl;
    const endedReason: string | undefined = message.endedReason ?? call.endedReason;
    const customerNumber: string | undefined = call.customer?.number ?? message.customer?.number;
    const customerName: string | undefined = call.customer?.name ?? message.customer?.name;
    const startedAt = call.startedAt ?? message.startedAt;
    const endedAt = call.endedAt ?? message.endedAt;
    const duration =
      startedAt && endedAt
        ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
        : null;

    // Proxy URL for playback in emails / browsers. Vapi's raw recordingUrl now
    // requires API-key auth; the vapi-recording function 302-redirects to the
    // short-lived signed URL after authenticating server-side.
    const recordingProxyUrl = callId
      ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/vapi-recording?callId=${encodeURIComponent(callId)}`
      : null;

    if (!callId) {
      return new Response(JSON.stringify({ error: "Missing call.id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let analysis: any = null;
    if (transcript && transcript.trim().length > 5) {
      try {
        analysis = await analyzeTranscript(transcript, endedReason);
      } catch (e) {
        console.error("Analysis failed:", e);
      }
    }

    // NOTE: email-from-audio fallback runs AFTER the upsert below, so an OOM /
    // failure inside audio extraction can no longer prevent the analysis from
    // being persisted. See the second pass further down.


    // Validate is_interested against transcript to prevent hallucinated "interested" reports.
    // The model must provide a verbatim quote from the prospect; if the quote isn't actually
    // in the transcript, downgrade is_interested to false.
    if (analysis && analysis.is_interested === true) {
      const norm = (s: string) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const ev = norm(analysis.is_interested_evidence || "").slice(0, 80);
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

    // Build a fallback summary so EVERY call has a readable summary,
    // even when the AI analyzer couldn't process the transcript
    // (too short, garbled, customer hung up immediately, etc.)
    const transcriptPreview = (transcript || "").trim().slice(0, 400);
    const fallbackDbSummary = !analysis
      ? `⚠️ Automatic analysis could not be generated (transcript too short or AI error). ` +
        `Ended reason: ${endedReason ?? "unknown"}. ` +
        `Duration: ${duration ?? 0}s.` +
        (transcriptPreview ? `\n\nTranscript preview:\n${transcriptPreview}` : "\n\nNo transcript available.")
      : null;

    const row: Record<string, unknown> = {
      vapi_call_id: callId,
      customer_number: customerNumber ?? null,
      customer_name: customerName ?? null,
      transcript: transcript || null,
      recording_url: recordingUrl ?? null,
      ended_reason: endedReason ?? null,
      duration_seconds: duration,
      summary: analysis?.summary ?? fallbackDbSummary,
      intent: deriveIntent(analysis?.intent, endedReason),
      is_interested: analysis?.is_interested ?? null,
      meeting_confirmed: analysis?.meeting_confirmed ?? false,
      meeting_datetime: toDbTimestamp(analysis?.meeting_datetime),
      meeting_notes: analysis?.meeting_notes || null,
      email_collected: analysis?.email_collected || null,
      recall_number: analysis?.recall_number || null,
      tone: analysis?.tone ?? (analysis === null ? "neutral" : null),
      tone_reason: analysis?.tone_reason || null,
      gatekeeper_detected: analysis?.gatekeeper_detected ?? false,
      decision_maker_name: analysis?.decision_maker_name || null,
      decision_maker_phone: analysis?.decision_maker_phone || null,
      needs_recall: !!analysis?.needs_recall,
      recall_reason: analysis?.recall_reason || null,
      recall_action_summary: analysis?.recall_action_summary || null,
      raw_analysis: analysis ?? { fallback: true, reason: "ai_analysis_failed", ended_reason: endedReason },
    };

    const { error: upsertErr } = await supabase
      .from("call_analyses")
      .upsert(row, { onConflict: "vapi_call_id" });
    if (upsertErr) console.error("DB upsert error:", upsertErr);

    if (!analysis) {
      await supabase.from("system_events").insert({
        event_type: "analysis_failed", severity: "warning",
        vapi_call_id: callId, message: "AI analysis returned no data",
      });
    }

    // ---- Email-from-audio fallback (runs AFTER upsert so OOM/failure here
    // can't lose the analysis). Only attempted when we still don't have an email.
    const hasEmail = !!(analysis?.email_collected && String(analysis.email_collected).trim());
    if (callId && !hasEmail) {
      try {
        const fromAudio = await extractEmailFromAudio(callId, recordingUrl ?? null);
        if (fromAudio) {
          console.log("[email-from-audio] recovered:", fromAudio);
          await supabase
            .from("call_analyses")
            .update({ email_collected: fromAudio })
            .eq("vapi_call_id", callId);
          if (!analysis) analysis = {};
          analysis.email_collected = fromAudio;
        }
      } catch (e) {
        console.error("[email-from-audio] outer exception:", e);
      }
    }

    // ---- Retry / approval workflow ----
    const NO_ANSWER_REASONS = new Set([
      "customer-did-not-answer",
      "voicemail",
      "customer-busy",
      "no-answer",
      "twilio-failed-to-connect-call",
      "phone-call-provider-closed-websocket",
    ]);
    const isNoAnswer = endedReason ? NO_ANSWER_REASONS.has(endedReason) : false;

    const { data: contact } = await supabase
      .from("contacts").select("*").eq("last_vapi_call_id", callId).maybeSingle();

    if (contact) {
      if (isNoAnswer) {
        // Auto-retry disabled: do not reschedule. Mark needs_approval so a human decides.
        const attempts = contact.attempt_count ?? 0;
        await supabase.from("contacts").update({
          status: "needs_approval",
          needs_approval_reason: `Call not connected (${endedReason ?? "unknown"}) — auto-retry disabled`,
          next_call_at: null,
        }).eq("id", contact.id);
        await supabase.from("system_events").insert({
          event_type: "retry_disabled", severity: "info",
          contact_id: contact.id, vapi_call_id: callId,
          message: `Auto-retry disabled — needs approval (attempts: ${attempts}, reason: ${endedReason ?? "unknown"})`,
        });
      } else if (analysis?.gatekeeper_detected) {
        // SCENARIO D — gatekeeper. Mark contact, store DM info,
        // and create a NEW contact for the decision-maker (if phone given).
        const dmName = (analysis.decision_maker_name || "").trim() || null;
        const dmPhone = (analysis.decision_maker_phone || "").trim() || null;

        let dmContactId: string | null = null;
        if (dmPhone) {
          // Avoid duplicate decision-maker contacts
          const { data: existingDm } = await supabase
            .from("contacts").select("id").eq("phone", dmPhone).maybeSingle();
          if (existingDm?.id) {
            dmContactId = existingDm.id;
          } else {
            const { data: newDm } = await supabase
              .from("contacts").insert({
                name: dmName || `Decision maker (${contact.name})`,
                phone: dmPhone,
                source: "gatekeeper_referral",
                business_type: contact.business_type,
                notes: `Referred by ${contact.name} (${contact.phone}) via Scenario D gatekeeper call.`,
                status: "waiting",
                priority: 30,
              })
              .select("id").maybeSingle();
            dmContactId = newDm?.id ?? null;
          }
        }

        await supabase.from("contacts").update({
          status: "gatekeeper",
          is_gatekeeper: true,
          decision_maker_name: dmName,
          decision_maker_phone: dmPhone,
          decision_maker_contact_id: dmContactId,
          interest: "gatekeeper",
          next_call_at: null,
        }).eq("id", contact.id);

        await supabase.from("system_events").insert({
          event_type: "gatekeeper_detected", severity: "info",
          contact_id: contact.id, vapi_call_id: callId,
          message: `Gatekeeper — decision-maker: ${dmName ?? "unknown"} ${dmPhone ?? ""}`,
          metadata: { decision_maker_name: dmName, decision_maker_phone: dmPhone, decision_maker_contact_id: dmContactId },
        });
      } else if (analysis?.intent === "ivr_blocked") {
        await supabase.from("contacts").update({
          status: "ivr_blocked",
          interest: "ivr_blocked",
          needs_approval_reason: "Hit automated switchboard — needs manual call",
          next_call_at: null,
        }).eq("id", contact.id);
        await supabase.from("system_events").insert({
          event_type: "ivr_blocked", severity: "warning",
          contact_id: contact.id, vapi_call_id: callId,
          message: "Call answered by automated switchboard (IVR) — agent could not reach a human",
        });
      } else {
        const contactUpdate: Record<string, unknown> = {
          status: "done",
          interest: analysis?.intent ?? contact.interest,
          next_call_at: null,
        };
        if (analysis?.email_collected) contactUpdate.email_collected = analysis.email_collected;
        if (analysis?.recall_number) {
          contactUpdate.recall_number = analysis.recall_number;
          contactUpdate.recall_number_acknowledged = false;
        }
        await supabase.from("contacts").update(contactUpdate).eq("id", contact.id);
      }
    }

    // Note: Make.com meeting forwarding removed — summary email below already
    // includes meeting details and is the single notification we send.
    const forwarded = false;

    // ---- Send call summary email (ALWAYS — even when analysis failed) ----
    let summaryEmailSent = false;
    {
      // Idempotency: only send if not already sent
      const { data: existing } = await supabase
        .from("call_analyses")
        .select("summary_email_sent_at")
        .eq("vapi_call_id", callId)
        .maybeSingle();

      if (!existing?.summary_email_sent_at) {
        const analysisFailed = !analysis;
        const tone = analysis?.tone ?? (analysisFailed ? "neutral" : null);
        const toneReason = analysis?.tone_reason || null;
        const fallbackSummary = analysisFailed
          ? `⚠️ Automatic analysis could not be generated for this call (transcript too short or AI error). Ended reason: ${endedReason ?? "unknown"}. Please review the recording / transcript manually.`
          : (analysis.summary || null);
        const fallbackSubject = buildSubject({
          analysisFailed,
          tone,
          toneReason,
          customerName: customerName ?? null,
          customerNumber: customerNumber ?? null,
          emailCollected: analysis?.email_collected || null,
          meetingConfirmed: !!analysis?.meeting_confirmed,
          meetingDatetime: analysis?.meeting_datetime || null,
          gatekeeperDetected: !!analysis?.gatekeeper_detected,
          endedReason: endedReason ?? null,
          durationSeconds: duration,
        });

        const html = buildHtml({
          tone,
          toneReason,
          customerName: customerName ?? null,
          customerNumber: customerNumber ?? null,
          recallNumber: analysis?.recall_number || null,
          emailCollected: analysis?.email_collected || null,
          businessType: contact?.business_type ?? null,
          companyName: analysis?.company_name || null,
          meetingConfirmed: !!analysis?.meeting_confirmed,
          meetingDatetime: analysis?.meeting_datetime || null,
          meetingNotes: analysis?.meeting_notes || null,
          summary: fallbackSummary,
          transcript: transcript || null,
          recordingUrl: recordingProxyUrl,
          durationSeconds: duration,
          endedReason: endedReason ?? null,
          startedAt: startedAt ?? null,
          endedAt: endedAt ?? null,
          analysisFailed,
          gatekeeperDetected: !!analysis?.gatekeeper_detected,
          decisionMakerName: analysis?.decision_maker_name || null,
          decisionMakerPhone: analysis?.decision_maker_phone || null,
        });

        const result = await postWithRetry(SUMMARY_WEBHOOK_URL, {
          subject: fallbackSubject,
          html,
          to: SUMMARY_EMAIL_TO,
          from: SUMMARY_EMAIL_FROM,
          tone,
          tone_reason: toneReason,
          call_id: callId,
          analysis_failed: analysisFailed,
          customer_name: customerName ?? null,
          customer_number: customerNumber ?? null,
          recall_number: analysis?.recall_number || null,
          email_collected: analysis?.email_collected || null,
          business_type: contact?.business_type ?? null,
          company_name: analysis?.company_name || null,
          meeting_confirmed: !!analysis?.meeting_confirmed,
          meeting_datetime: analysis?.meeting_datetime || null,
          meeting_notes: analysis?.meeting_notes || null,
          summary: fallbackSummary,
          transcript: transcript || null,
          recording_url: recordingProxyUrl,
          duration_seconds: duration,
          ended_reason: endedReason ?? null,
          started_at: startedAt ?? null,
          ended_at: endedAt ?? null,
          gatekeeper_detected: !!analysis?.gatekeeper_detected,
          decision_maker_name: analysis?.decision_maker_name || null,
          decision_maker_phone: analysis?.decision_maker_phone || null,
        }, { label: "make-summary-webhook" });
        summaryEmailSent = result.ok;
        if (result.ok) {
          await supabase
            .from("call_analyses")
            .update({ summary_email_sent_at: new Date().toISOString() })
            .eq("vapi_call_id", callId);
          await supabase.from("system_events").insert({
            event_type: "webhook_sent", severity: "info",
            contact_id: contact?.id ?? null, vapi_call_id: callId,
            message: `Summary email sent (${result.attempts} attempt${result.attempts > 1 ? "s" : ""})`,
            metadata: { tone, subject: fallbackSubject },
          });
        } else {
          await supabase.from("system_events").insert({
            event_type: "webhook_failed", severity: "error",
            contact_id: contact?.id ?? null, vapi_call_id: callId,
            message: `Summary webhook failed (status ${result.status})`,
            metadata: { status: result.status, body: result.body.slice(0, 500), attempts: result.attempts, tone },
          });
        }
      } else {
        summaryEmailSent = true;
      }
    }

    return new Response(JSON.stringify({ ok: true, analyzed: !!analysis, forwarded, summary_email_sent: summaryEmailSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("vapi-webhook error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
