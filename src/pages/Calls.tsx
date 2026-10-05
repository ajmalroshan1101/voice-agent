import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, X, RefreshCw, Loader2, Sparkles, CheckCircle2, CalendarCheck, Send, Mail, PhoneForwarded, Heart, Phone, Bot } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { SearchInput, Pager } from "@/components/TableToolbar";
import { useI18n } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PAGE_SIZE = 15;

interface VapiMessage {
  role: string; // "bot" | "user" | "system" | "assistant"
  message?: string;
  time?: number;
  secondsFromStart?: number;
}

interface VapiCall {
  id: string;
  status?: string;
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt?: string;
  cost?: number;
  customer?: { number?: string; name?: string };
  transcript?: string;
  summary?: string;
  recordingUrl?: string;
  analysis?: { summary?: string; structuredData?: Record<string, unknown> };
  messages?: VapiMessage[];
  phoneNumberId?: string;
  assistantId?: string;
  phoneNumber?: { number?: string; name?: string };
  assistant?: { name?: string };
  metadata?: Record<string, unknown> & { agent_name?: string };
}

interface CallAnalysisRow {
  vapi_call_id: string;
  summary: string | null;
  intent: string | null;
  is_interested: boolean | null;
  meeting_confirmed: boolean | null;
  meeting_datetime: string | null;
  meeting_notes: string | null;
  forwarded_to_make: boolean | null;
  email_collected: string | null;
  recall_number: string | null;
  sms_sent: boolean | null;
  sms_sent_at: string | null;
}

const SMS_TRIGGER_PHRASES = [
  "send you a link",
  "text you a link",
  "sms",
  "send it by text",
  "send a text",
  "text message",
  "link by text",
  "send the link",
];

function transcriptMentionsSmsLink(transcript?: string): boolean {
  if (!transcript) return false;
  const t = transcript.toLowerCase();
  return SMS_TRIGGER_PHRASES.some((p) => t.includes(p));
}

function formatDuration(start?: string, end?: string) {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusVariant(s?: string): "success" | "warning" | "muted" | "info" | "destructive" {
  if (!s) return "muted";
  if (s === "ended") return "success";
  if (s === "in-progress" || s === "ringing" || s === "queued") return "info";
  return "muted";
}

function outcomeVariant(reason?: string): "success" | "warning" | "muted" | "info" | "destructive" {
  if (!reason) return "muted";
  const r = reason.toLowerCase();
  if (r.includes("customer-ended") || r.includes("assistant-ended")) return "success";
  if (r.includes("no-answer") || r.includes("voicemail")) return "warning";
  if (r.includes("error") || r.includes("failed")) return "destructive";
  return "muted";
}

function intentVariant(i?: string | null): "success" | "warning" | "muted" | "info" | "destructive" {
  switch (i) {
    case "meeting_booked":
    case "interested":
      return "success";
    case "callback":
    case "gatekeeper":
      // partial success — treated as semi-green
      return "success";
    case "ivr_handoff":
    case "assistant_ended_call":
      return "info";
    case "not_interested":
    case "ivr_blocked":
    case "call_failed":
    case "connect_failed":
      return "destructive";
    case "voicemail":
    case "no_answer":
    case "busy":
    case "customer_ended_call":
      return "warning";
    default:
      return "muted";
  }
}

// Extra classes to visually distinguish "partial success" intents (semi-green)
function intentExtraClass(i?: string | null): string {
  switch (i) {
    case "callback":
    case "gatekeeper":
      return "opacity-70 saturate-75";
    default:
      return "";
  }
}

function intentLabel(i?: string | null): string {
  if (!i) return "—";
  switch (i) {
    case "no_answer": return "customer did not answer";
    case "busy": return "customer busy";
    case "voicemail": return "voicemail";
    case "callback": return "callback";
    case "ivr_blocked": return "ivr blocked";
    case "ivr_handoff": return "ivr handoff";
    case "customer_ended_call": return "customer ended call";
    case "assistant_ended_call": return "assistant ended call";
    case "call_failed": return "call failed";
    case "connect_failed": return "connect failed";
    case "meeting_booked": return "meeting booked";
    case "not_interested": return "not interested";
    case "gatekeeper": return "gatekeeper";
    case "interested": return "interested";
    case "unclear": return "unclear";
    default: return i.replace(/_/g, " ");
  }
}

export default function Calls() {
  const { t } = useI18n();
  const [calls, setCalls] = useState<VapiCall[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, CallAnalysisRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VapiCall | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sendingSms, setSendingSms] = useState(false);
  const [numbersMap, setNumbersMap] = useState<Record<string, { number?: string; name?: string }>>({});
  const [assistantsMap, setAssistantsMap] = useState<Record<string, { name?: string }>>({});
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { setTranslated(null); }, [selected?.id]);

  const buildTranscriptText = (c: VapiCall): string => {
    if (c.messages && c.messages.length > 0) {
      return c.messages
        .filter((m) => m.role !== "system" && m.message)
        .map((m) => {
          const who = m.role === "bot" || m.role === "assistant" ? "AI" : "Customer";
          const sec = m.secondsFromStart ?? (m.time && c.startedAt ? (m.time - new Date(c.startedAt).getTime()) / 1000 : undefined);
          const ts = typeof sec === "number" && sec >= 0
            ? `[${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, "0")}] `
            : "";
          return `${ts}${who}: ${m.message}`;
        })
        .join("\n");
    }
    return c.transcript || "";
  };

  const copyTranscript = async (c: VapiCall) => {
    const text = buildTranscriptText(c);
    if (!text) { toast.error("No transcript to copy"); return; }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Transcript copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const translateTranscript = async (c: VapiCall) => {
    const text = buildTranscriptText(c);
    if (!text) { toast.error("No transcript to translate"); return; }
    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke("translate-text", {
        body: { text, targetLanguage: "English" },
      });
      if (error) throw error;
      if (!data?.translated) throw new Error("Empty translation");
      setTranslated(data.translated);
      toast.success("Translated to English");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setTranslating(false);
    }
  };


  const fromNumber = (c: VapiCall) =>
    c.phoneNumber?.number ||
    (c.phoneNumberId && numbersMap[c.phoneNumberId]?.number) ||
    (c.phoneNumberId ? `#${c.phoneNumberId.slice(0, 6)}` : "—");

  const agentName = (c: VapiCall) =>
    (c.metadata?.agent_name as string | undefined) ||
    c.assistant?.name ||
    (c.assistantId && assistantsMap[c.assistantId]?.name) ||
    (c.assistantId ? `#${c.assistantId.slice(0, 6)}` : "—");

  const sendEmailLinkSms = async (call: VapiCall) => {
    if (!call.customer?.number) { toast.error("No phone number on this call"); return; }
    setSendingSms(true);
    const { data, error } = await supabase.functions.invoke("send-email-link-sms", {
      body: {
        call_id: call.id,
        phone: call.customer.number,
        first_name: (call.customer?.name ?? "").split(" ")[0] || "",
      },
    });
    setSendingSms(false);
    if (error || (data as any)?.error) {
      toast.error("SMS failed: " + ((data as any)?.error ?? error?.message));
      return;
    }
    toast.success(`Link sent to ${call.customer.number} ✅`);
    await loadAnalyses();
  };

  const loadAnalyses = async () => {
    const { data } = await supabase
      .from("call_analyses")
      .select("vapi_call_id,summary,intent,is_interested,meeting_confirmed,meeting_datetime,meeting_notes,forwarded_to_make,email_collected,recall_number,sms_sent,sms_sent_at");
    if (data) {
      const map: Record<string, CallAnalysisRow> = {};
      for (const r of data as CallAnalysisRow[]) map[r.vapi_call_id] = r;
      setAnalyses(map);
      try { sessionStorage.setItem("calls.analyses", JSON.stringify({ t: Date.now(), m: map })); } catch {}
    }
  };

  const loadDirectories = async () => {
    // Hydrate from localStorage cache (10 min TTL)
    try {
      const raw = localStorage.getItem("calls.directories");
      if (raw) {
        const { t, nums, asts } = JSON.parse(raw);
        if (Date.now() - t < 10 * 60 * 1000) {
          if (nums) setNumbersMap(nums);
          if (asts) setAssistantsMap(asts);
        }
      }
    } catch {}

    const [n, a] = await Promise.all([
      supabase.functions.invoke("vapi-list-numbers"),
      supabase.functions.invoke("vapi-list-assistants"),
    ]);
    const numsArr = (n.data?.numbers ?? n.data ?? []) as Array<{ id: string; number?: string; name?: string }>;
    const astsArr = (a.data?.assistants ?? a.data ?? []) as Array<{ id: string; name?: string }>;
    const nMap: Record<string, { number?: string; name?: string }> = {};
    const aMap: Record<string, { name?: string }> = {};
    if (Array.isArray(numsArr)) for (const x of numsArr) if (x?.id) nMap[x.id] = { number: x.number, name: x.name };
    if (Array.isArray(astsArr)) for (const x of astsArr) if (x?.id) aMap[x.id] = { name: x.name };
    setNumbersMap(nMap);
    setAssistantsMap(aMap);
    try { localStorage.setItem("calls.directories", JSON.stringify({ t: Date.now(), nums: nMap, asts: aMap })); } catch {}
  };

  const fetchCalls = async () => {
    setError(null);
    const { data, error } = await supabase.functions.invoke("vapi-list-calls");
    if (error) { setError(error.message); return; }
    if (Array.isArray(data)) {
      setCalls(data);
      try { sessionStorage.setItem("calls.list", JSON.stringify({ t: Date.now(), c: data })); } catch {}
    } else if ((data as any)?.error) {
      const e = (data as any).error;
      setError(typeof e === "string" ? e : JSON.stringify(e));
    } else {
      setCalls([]);
    }
  };

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    // Fire all three in parallel; don't block table render on directories/analyses
    const callsPromise = fetchCalls().finally(() => setLoading(false));
    loadAnalyses();
    loadDirectories();
    await callsPromise;
  };

  // Initial mount: hydrate from sessionStorage cache for instant render, then revalidate
  useEffect(() => {
    let hydrated = false;
    try {
      const rawCalls = sessionStorage.getItem("calls.list");
      if (rawCalls) {
        const { t, c } = JSON.parse(rawCalls);
        if (Array.isArray(c) && Date.now() - t < 60 * 1000) {
          setCalls(c);
          setLoading(false);
          hydrated = true;
        }
      }
      const rawA = sessionStorage.getItem("calls.analyses");
      if (rawA) {
        const { m } = JSON.parse(rawA);
        if (m) setAnalyses(m);
      }
    } catch {}
    load(hydrated);
  }, []);

  // Realtime: refresh analyses when an email_tokens row changes — debounced
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("email_tokens_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_tokens" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { loadAnalyses(); }, 1500);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const openCall = async (c: VapiCall) => {
    setSelected(c);
    setDetailLoading(true);
    const { data, error } = await supabase.functions.invoke("vapi-get-call", {
      body: { callId: c.id },
    });
    if (!error && data && !data.error) setSelected({ ...c, ...data });
    setDetailLoading(false);
  };

  const analyzeNow = async (callId: string) => {
    const sendEmail = window.confirm(
      "Re-analyze this call now.\n\nDo you also want to RE-SEND the HTML summary email via Make.com?\n\n• OK = analyze AND send email\n• Cancel = analyze only (no email)",
    );
    setAnalyzing(true);
    const { data, error } = await supabase.functions.invoke("vapi-analyze-call", {
      body: { callId, sendEmail },
    });
    setAnalyzing(false);
    if (error || data?.error) {
      toast.error("Analysis failed: " + (data?.error ?? error?.message));
      return;
    }
    toast.success(
      sendEmail
        ? data?.summary_email_sent
          ? "Analysis complete — summary email sent ✓"
          : "Analysis complete — but email failed: " + (data?.summary_error ?? "unknown")
        : "Analysis complete (email NOT sent)",
    );
    await loadAnalyses();
  };

  const filteredCalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return calls;
    return calls.filter((c) => {
      const a = analyses[c.id];
      return (
        (c.customer?.name ?? "").toLowerCase().includes(q) ||
        (c.customer?.number ?? "").toLowerCase().includes(q) ||
        (c.status ?? "").toLowerCase().includes(q) ||
        (c.endedReason ?? "").toLowerCase().includes(q) ||
        (a?.intent ?? "").toLowerCase().includes(q) ||
        (a?.summary ?? "").toLowerCase().includes(q)
      );
    });
  }, [calls, analyses, search]);

  const pagedCalls = useMemo(
    () => filteredCalls.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredCalls, page],
  );

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t("calls.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("calls.subtitle")}</p>
        </div>
        <button
          onClick={() => load()}
          className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted transition flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card shadow-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, number, intent…" />
          <span className="hidden md:inline text-sm text-muted-foreground">{filteredCalls.length} results</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
                <th className="p-4 font-semibold">{t("calls.col.contact")}</th>
                <th className="p-4 font-semibold">From</th>
                <th className="p-4 font-semibold">Agent</th>
                <th className="p-4 font-semibold">{t("calls.col.duration")}</th>
                <th className="p-4 font-semibold">{t("calls.col.status")}</th>
                <th className="p-4 font-semibold">AI Intent</th>
                <th className="p-4 font-semibold">Summary</th>
                <th className="p-4 font-semibold">Meeting</th>
                <th className="p-4 font-semibold">{t("calls.col.date")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading calls…
                  </td>
                </tr>
              )}
              {!loading && filteredCalls.length === 0 && !error && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-muted-foreground">
                    {calls.length === 0 ? "No calls yet." : "No calls match your search."}
                  </td>
                </tr>
              )}
              {!loading &&
                pagedCalls.map((c) => {
                  const a = analyses[c.id];
                  return (
                    <tr
                      key={c.id}
                      onClick={() => openCall(c)}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/40 transition cursor-pointer"
                    >
                      <td className="p-4 font-semibold">
                        {c.customer?.name || c.customer?.number || c.id.slice(0, 8)}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                          <Phone className="h-3.5 w-3.5" /> {fromNumber(c)}
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <Bot className="h-3.5 w-3.5" /> {agentName(c)}
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" /> {formatDuration(c.startedAt, c.endedAt)}
                        </span>
                      </td>
                      <td className="p-4">
                        <StatusPill variant={statusVariant(c.status)}>{c.status || "—"}</StatusPill>
                      </td>
                      <td className="p-4">
                        {a?.intent ? (
                          <StatusPill variant={intentVariant(a.intent)} className={intentExtraClass(a.intent)}>{intentLabel(a.intent)}</StatusPill>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4 max-w-xs">
                        {a?.summary ? (
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-snug" title={a.summary}>
                            {a.summary}
                          </p>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        {a?.meeting_confirmed ? (
                          <span className="inline-flex items-center gap-1 text-success text-xs font-semibold">
                            <CalendarCheck className="h-3.5 w-3.5" />
                            {a.meeting_datetime ? new Date(a.meeting_datetime).toLocaleString() : "Booked"}
                            {a.forwarded_to_make && <Send className="h-3 w-3 ml-1" />}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4 text-muted-foreground">{formatDate(c.startedAt || c.createdAt)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!loading && filteredCalls.length > 0 && (
          <Pager page={page} pageSize={PAGE_SIZE} total={filteredCalls.length} onPageChange={setPage} />
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-card w-full max-w-3xl rounded-2xl shadow-elevated max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-muted">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                  <h2 className="text-xl font-bold">
                    {selected.customer?.name || selected.customer?.number || selected.id}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(selected.startedAt || selected.createdAt)} ·{" "}
                    {formatDuration(selected.startedAt, selected.endedAt)}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Called from
                  </div>
                  <div className="text-sm font-semibold mt-1 font-mono">{fromNumber(selected)}</div>
                  {selected.phoneNumberId && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{selected.phoneNumberId}</div>
                  )}
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                    <Bot className="h-3 w-3" /> Agent
                  </div>
                  <div className="text-sm font-semibold mt-1">{agentName(selected)}</div>
                  {selected.assistantId && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{selected.assistantId}</div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusPill variant={statusVariant(selected.status)}>{selected.status || "—"}</StatusPill>
                <StatusPill variant={outcomeVariant(selected.endedReason)}>{selected.endedReason || "—"}</StatusPill>
                {analyses[selected.id]?.intent && (
                  <StatusPill variant={intentVariant(analyses[selected.id].intent)} className={intentExtraClass(analyses[selected.id].intent)}>
                    {intentLabel(analyses[selected.id].intent)}
                  </StatusPill>
                )}
              </div>

              {detailLoading && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading details…
                </div>
              )}

              {/* AI Analysis card */}
              <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> AI Analysis
                  </h4>
                  <button
                    onClick={() => analyzeNow(selected.id)}
                    disabled={analyzing || !selected.transcript}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {analyses[selected.id] ? "Re-analyze" : "Analyze now"}
                  </button>
                </div>
                {analyses[selected.id] ? (
                  <div className="space-y-3 text-sm">
                    {analyses[selected.id].summary && (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Summary</div>
                        <p className="leading-relaxed">{analyses[selected.id].summary}</p>
                      </div>
                    )}

                    {/* Key points extracted from the call */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Key points</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="rounded-lg bg-card border border-border p-2.5">
                          <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
                            <Heart className="h-3 w-3" /> Interest
                          </div>
                          <div className="text-sm font-semibold mt-0.5">
                            {analyses[selected.id].is_interested === true
                              ? "Interested ✓"
                              : analyses[selected.id].is_interested === false
                                ? "Not interested"
                                : "—"}
                          </div>
                        </div>
                        <div className="rounded-lg bg-card border border-border p-2.5">
                          <div className="text-[10px] uppercase font-semibold text-muted-foreground">Intent</div>
                          <div className="text-sm font-semibold mt-0.5 capitalize">
                            {intentLabel(analyses[selected.id].intent)}
                          </div>
                        </div>
                        {analyses[selected.id].email_collected && (
                          <div className="rounded-lg bg-card border border-border p-2.5">
                            <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" /> Email shared
                            </div>
                            <div className="text-sm font-semibold mt-0.5 break-all">
                              {analyses[selected.id].email_collected}
                            </div>
                          </div>
                        )}
                        {analyses[selected.id].recall_number && (
                          <div className="rounded-lg bg-card border border-border p-2.5">
                            <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
                              <PhoneForwarded className="h-3 w-3" /> Recall number
                            </div>
                            <div className="text-sm font-semibold mt-0.5">
                              {analyses[selected.id].recall_number}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {analyses[selected.id].meeting_confirmed && (
                      <div className="rounded-lg bg-success/10 border border-success/30 p-3 text-sm">
                        <div className="flex items-center gap-2 font-semibold text-success">
                          <CheckCircle2 className="h-4 w-4" /> Meeting confirmed
                          {analyses[selected.id].forwarded_to_make && (
                            <span className="ml-auto inline-flex items-center gap-1 text-xs">
                              <Send className="h-3 w-3" /> Sent to Make.com
                            </span>
                          )}
                        </div>
                        {analyses[selected.id].meeting_datetime && (
                          <div className="mt-1 text-xs">
                            <strong>When:</strong> {new Date(analyses[selected.id].meeting_datetime!).toLocaleString()}
                          </div>
                        )}
                        {analyses[selected.id].meeting_notes && (
                          <div className="mt-1 text-xs"><strong>Notes:</strong> {analyses[selected.id].meeting_notes}</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Not analyzed yet. Click <strong>Analyze now</strong> to run AI on this transcript, or wait for the
                    Vapi end-of-call webhook to process it automatically.
                  </p>
                )}
              </div>

              {/* Email collection via SMS link */}
              {(() => {
                const a = analyses[selected.id];
                const hasEmail = !!a?.email_collected;
                const smsSent = !!a?.sms_sent;
                const detected = transcriptMentionsSmsLink(selected.transcript);
                if (!hasEmail && !smsSent && !detected) return null;
                return (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <h4 className="text-sm font-bold inline-flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" /> Email collection
                    </h4>
                    {hasEmail ? (
                      <div className="text-sm inline-flex items-center gap-2 text-success font-semibold">
                        <CheckCircle2 className="h-4 w-4" /> {a!.email_collected}
                      </div>
                    ) : smsSent ? (
                      <div className="text-sm text-muted-foreground">
                        ⏳ Awaiting email{a?.sms_sent_at ? ` · sent ${new Date(a.sms_sent_at).toLocaleString()}` : ""}
                      </div>
                    ) : detected ? (
                      <button
                        onClick={() => sendEmailLinkSms(selected)}
                        disabled={sendingSms}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {sendingSms ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Send Email Collection Link
                      </button>
                    ) : null}
                  </div>
                );
              })()}



              {selected.id && (
                <div>
                  <h4 className="text-sm font-bold mb-2">Recording</h4>
                  <audio
                    controls
                    src={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vapi-recording?callId=${encodeURIComponent(selected.id)}`}
                    className="w-full"
                  />
                </div>
              )}

              {/* Transcript — chat-style, ALWAYS shown when available */}
              {selected.messages && selected.messages.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h4 className="text-sm font-bold">{t("calls.transcript")}</h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyTranscript(selected)}
                        className="text-xs px-3 py-1.5 rounded-md border border-border bg-background hover:bg-accent transition-colors"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => translateTranscript(selected)}
                        disabled={translating}
                        className="text-xs px-3 py-1.5 rounded-md border border-border bg-background hover:bg-accent transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {translating && <Loader2 className="h-3 w-3 animate-spin" />}
                        {translated ? "Re-translate to English" : "Translate to English"}
                      </button>
                    </div>
                  </div>
                  {translated && (
                    <div className="mb-3 rounded-xl bg-primary/5 p-4 text-sm max-h-96 overflow-y-auto whitespace-pre-wrap border border-primary/30">
                      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-2">🇬🇧 English translation</div>
                      {translated}
                    </div>
                  )}
                  <div className="rounded-xl bg-muted/30 p-4 max-h-96 overflow-y-auto space-y-3">
                    {selected.messages
                      .filter((m) => m.role !== "system" && m.message)
                      .map((m, i) => {
                        const isAssistant = m.role === "bot" || m.role === "assistant";
                        const seconds = m.secondsFromStart ?? (m.time && selected.startedAt ? (m.time - new Date(selected.startedAt).getTime()) / 1000 : undefined);
                        const timeLabel = typeof seconds === "number" && seconds >= 0
                          ? `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`
                          : undefined;
                        return (
                          <div key={i} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                            <div
                              className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                                isAssistant
                                  ? "bg-card border border-border text-foreground rounded-tl-sm"
                                  : "bg-primary text-primary-foreground rounded-tr-sm"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] font-semibold opacity-70 uppercase tracking-wider">
                                  {isAssistant ? "AI" : "Customer"}
                                </span>
                                {timeLabel && (
                                  <span className="text-[10px] opacity-50 font-mono">{timeLabel}</span>
                                )}
                              </div>
                              <div className="leading-relaxed whitespace-pre-wrap">{m.message}</div>
                            </div>
                          </div>
                        );
                      })}
                    {(() => {
                      const reason = (selected.endedReason ?? "").toLowerCase();
                      if (!reason) return null;
                      let endedBy: "customer" | "assistant" | "system" = "system";
                      let label = reason.replace(/-/g, " ");
                      if (reason.includes("customer-ended") || reason.includes("customer-did-not") || reason === "customer-busy") {
                        endedBy = "customer";
                        label = "Customer ended the call";
                      } else if (reason.includes("assistant-ended") || reason.includes("assistant-said-end") || reason.includes("assistant-forwarded")) {
                        endedBy = "assistant";
                        label = "AI assistant ended the call";
                      } else if (reason.includes("silence")) {
                        label = "Ended due to silence";
                      } else if (reason.includes("error") || reason.includes("failed")) {
                        label = `Call ended: ${reason.replace(/-/g, " ")}`;
                      } else {
                        label = `Call ended: ${reason.replace(/-/g, " ")}`;
                      }
                      return (
                        <div className="flex justify-center pt-2">
                          <div className="text-[11px] text-muted-foreground bg-background border border-border rounded-full px-3 py-1">
                            {endedBy === "customer" ? "📞 " : endedBy === "assistant" ? "🤖 " : "ⓘ "}
                            {label}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : selected.transcript ? (
                <div>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h4 className="text-sm font-bold">{t("calls.transcript")}</h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyTranscript(selected)}
                        className="text-xs px-3 py-1.5 rounded-md border border-border bg-background hover:bg-accent transition-colors"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => translateTranscript(selected)}
                        disabled={translating}
                        className="text-xs px-3 py-1.5 rounded-md border border-border bg-background hover:bg-accent transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {translating && <Loader2 className="h-3 w-3 animate-spin" />}
                        {translated ? "Re-translate to English" : "Translate to English"}
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-4 text-sm max-h-64 overflow-y-auto whitespace-pre-wrap">
                    {selected.transcript}
                  </div>
                  {translated && (
                    <div className="mt-3 rounded-xl bg-muted/40 p-4 text-sm max-h-64 overflow-y-auto whitespace-pre-wrap border border-dashed border-border">
                      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-2">English translation</div>
                      {translated}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
