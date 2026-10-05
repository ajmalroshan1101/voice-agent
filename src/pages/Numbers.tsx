import { useEffect, useRef, useState } from "react";
import { Phone, PhoneCall, RefreshCw, Loader2, Check, Copy, PlayCircle, Sparkles, Target, TrendingUp, Mic, MicOff, PhoneOff } from "lucide-react";
import Vapi from "@vapi-ai/web";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAgentName } from "@/hooks/useAgentName";

type LeadAnalysis = {
  type: string;
  priority: "high" | "medium" | "low";
  angle: string;
  reasoning?: string;
};

type VapiNumber = {
  id: string;
  number?: string;
  name?: string;
  provider?: string;
  status?: string;
  createdAt?: string;
};

type VapiAssistant = {
  id: string;
  name?: string;
};

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
        active ? "bg-primary text-primary-foreground shadow-elevated" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

export default function Numbers() {
  const [tab, setTab] = useState<"active" | "test" | "browser">("active");
  const agentName = useAgentName();

  // Browser-call (Vapi Web SDK) state
  const vapiRef = useRef<Vapi | null>(null);
  const [publicKey, setPublicKey] = useState<string>("");
  const [browserAssistantId, setBrowserAssistantId] = useState("");
  const [browserStatus, setBrowserStatus] = useState<"idle" | "connecting" | "in-call">("idle");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);
  const [bFirstName, setBFirstName] = useState("");
  const [bLastName, setBLastName] = useState("");
  const [bBusinessType, setBBusinessType] = useState("");
  const [bNotes, setBNotes] = useState("");

  // Active numbers state
  const [numbers, setNumbers] = useState<VapiNumber[]>([]);
  const [loading, setLoading] = useState(false);

  // Test call state
  const [assistants, setAssistants] = useState<VapiAssistant[]>([]);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [notes, setNotes] = useState("");
  const [calling, setCalling] = useState(false);
  const [lastCallId, setLastCallId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<LeadAnalysis | null>(null);

  const loadNumbers = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("vapi-list-numbers");
    setLoading(false);
    if (error) {
      toast.error("Failed to load numbers: " + error.message);
      return;
    }
    setNumbers(data?.numbers ?? []);
    if (data?.numbers?.[0] && !phoneNumberId) setPhoneNumberId(data.numbers[0].id);
  };

  const loadAssistants = async () => {
    const { data, error } = await supabase.functions.invoke("vapi-list-assistants");
    if (error) {
      toast.error("Failed to load assistants: " + error.message);
      return;
    }
    const list: VapiAssistant[] = data?.assistants ?? [];
    setAssistants(list);
    if (!assistantId && list.length) {
      const emma = list.find((a) => (a.name ?? "").toLowerCase().includes("emma"));
      setAssistantId((emma ?? list[0]).id);
    }
  };

  useEffect(() => {
    loadNumbers();
    loadAssistants();
    supabase.functions.invoke("vapi-public-key").then(({ data, error }) => {
      if (error) return;
      if (data?.publicKey) setPublicKey(data.publicKey);
    });
  }, []);

  const placeTestCall = async () => {
    if (!phoneNumberId || !assistantId || !customerNumber) {
      toast.error("Please pick a phone number, assistant and enter a destination number.");
      return;
    }
    setCalling(true);
    setLastCallId(null);
    const fullName = `${firstName} ${lastName}`.trim();
    const { data, error } = await supabase.functions.invoke("vapi-create-call", {
      body: {
        phoneNumberId,
        assistantId,
        customerNumber,
        customerName: fullName,
        metadata: {
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          business_type: businessType || undefined,
          notes: notes || undefined,
          agent_name: agentName,
          ...(analysis ? { lead_type: analysis.type, lead_priority: analysis.priority, lead_angle: analysis.angle } : {}),
        },
      },
    });
    setCalling(false);
    if (error) {
      toast.error("Call failed: " + error.message);
      return;
    }
    if (data?.error) {
      toast.error("Call failed: " + JSON.stringify(data.details ?? data.error));
      return;
    }
    setLastCallId(data?.call?.id ?? null);
    toast.success("Call initiated successfully");
  };

  const analyzeLead = async () => {
    const fullName = `${firstName} ${lastName}`.trim();
    if (!fullName && !businessType && !notes) {
      toast.error("Add at least a name, business type or notes to analyze.");
      return;
    }
    setAnalyzing(true);
    setAnalysis(null);
    const { data, error } = await supabase.functions.invoke("analyze-lead", {
      body: { name: fullName, businessType, notes },
    });
    setAnalyzing(false);
    if (error) {
      toast.error("Analysis failed: " + error.message);
      return;
    }
    if (data?.error) {
      toast.error(data.error);
      return;
    }
    setAnalysis(data as LeadAnalysis);
    toast.success("Lead analyzed");
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copied");
  };

  // ---- Browser call handlers ----
  useEffect(() => {
    return () => {
      try { vapiRef.current?.stop(); } catch { /* noop */ }
      vapiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (assistantId && !browserAssistantId) setBrowserAssistantId(assistantId);
  }, [assistantId, browserAssistantId]);

  const startBrowserCall = async () => {
    if (!browserAssistantId) { toast.error("Select an assistant."); return; }

    setTranscript([]);
    setBrowserStatus("connecting");

    // Always fetch a fresh key at click time (avoids stale empty state on first load)
    let key = publicKey;
    if (!key) {
      const { data, error } = await supabase.functions.invoke("vapi-public-key");
      if (error || !data?.publicKey) {
        toast.error("Vapi public key not configured on the server.");
        setBrowserStatus("idle");
        return;
      }
      key = data.publicKey;
      setPublicKey(key);
    }

    try {
      const vapi = new Vapi(key);
      vapiRef.current = vapi;

      vapi.on("call-start", () => setBrowserStatus("in-call"));
      vapi.on("call-end", () => { setBrowserStatus("idle"); setMuted(false); });
      vapi.on("error", (e: unknown) => {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        toast.error("Vapi error: " + msg);
        setBrowserStatus("idle");
      });
      vapi.on("message", (m: { type?: string; role?: string; transcript?: string; transcriptType?: string }) => {
        if (m?.type === "transcript" && m.transcriptType === "final" && m.transcript) {
          setTranscript((prev) => [...prev, { role: m.role ?? "user", text: m.transcript! }]);
        }
      });

      const fullName = `${bFirstName} ${bLastName}`.trim();
      const nowDate = new Date();
      const romeHour = Number(
        new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(nowDate),
      );
      const greeting = romeHour < 12 ? "Good morning" : romeHour < 17 ? "Good afternoon" : "Good evening";
      await vapi.start(browserAssistantId, {
        variableValues: {
          first_name: bFirstName || "",
          last_name: bLastName || "",
          customer_name: fullName,
          customer_number: "",
          business_type: bBusinessType || "",
          notes: bNotes || "",
          agent_name: agentName,
          now: nowDate.toISOString(),
          greeting,
        },
      });
    } catch (e) {
      toast.error("Failed to start call: " + (e instanceof Error ? e.message : String(e)));
      setBrowserStatus("idle");
    }
  };

  const stopBrowserCall = () => {
    try { vapiRef.current?.stop(); } catch { /* noop */ }
    setBrowserStatus("idle");
  };

  const toggleMute = () => {
    const v = vapiRef.current;
    if (!v) return;
    const next = !muted;
    v.setMuted(next);
    setMuted(next);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Phone Numbers</h1>
        <p className="text-muted-foreground mt-1">
          Manage your Vapi numbers — outbound calls are placed from one of these numbers.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border pb-3 flex-wrap">
        <Tab active={tab === "active"} onClick={() => setTab("active")}>
          <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4" /> Active Numbers</span>
        </Tab>
        <Tab active={tab === "test"} onClick={() => setTab("test")}>
          <span className="inline-flex items-center gap-2"><PlayCircle className="h-4 w-4" /> Test Call</span>
        </Tab>
        <Tab active={tab === "browser"} onClick={() => setTab("browser")}>
          <span className="inline-flex items-center gap-2"><Mic className="h-4 w-4" /> Talk to Agent</span>
        </Tab>
      </div>

      {tab === "active" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {numbers.length} number{numbers.length !== 1 ? "s" : ""} connected to your Vapi account.
            </p>
            <button
              onClick={loadNumbers}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>

          {loading && numbers.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading numbers...
            </div>
          ) : numbers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
              <Phone className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="font-semibold">No phone numbers found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add a phone number in your Vapi dashboard, then refresh.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {numbers.map((n) => (
                <div key={n.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground shrink-0">
                        <PhoneCall className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold font-mono">{n.number ?? "—"}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {n.name ?? "Untitled"} · {n.provider ?? "vapi"}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <code className="text-[11px] text-muted-foreground">{n.id}</code>
                          <button onClick={() => copy(n.id)} className="text-muted-foreground hover:text-foreground">
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <Check className="h-3.5 w-3.5" /> Active
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "test" && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-4">
          <div>
            <h3 className="font-bold">Place a test call</h3>
            <p className="text-sm text-muted-foreground">
              Verify your Vapi setup by placing a real outbound call. Standard Vapi rates apply.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">From (your Vapi number)</label>
              <select
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select a number...</option>
                {numbers.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.number ?? n.id} {n.name ? `· ${n.name}` : ""}
                  </option>
                ))}
                
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Assistant</label>
              <select
                value={assistantId}
                onChange={(e) => setAssistantId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select an assistant...</option>
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name ?? a.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">To (destination, E.164)</label>
              <input
                value={customerNumber}
                onChange={(e) => setCustomerNumber(e.target.value)}
                placeholder="+393331234567"
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">First name (optional)</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Marco"
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Last name (optional)</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Rossi"
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Business Type</label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select business type —</option>
                <option value="b2b">B2B</option>
                <option value="b2c">B2C</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Extra context about this lead"
                rows={3}
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={analyzeLead}
              disabled={analyzing}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold hover:bg-muted transition disabled:opacity-60"
            >
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {analyzing ? "Analyzing..." : "Analyze Lead with AI"}
            </button>
            <button
              onClick={placeTestCall}
              disabled={calling}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-elevated hover:opacity-95 transition disabled:opacity-60"
            >
              {calling ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
              {calling ? "Initiating..." : "Start Call"}
            </button>
          </div>

          {analysis && (
            <div className="rounded-xl border border-border bg-accent/30 p-4 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Sparkles className="h-4 w-4 text-primary" /> AI Lead Analysis
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-card border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Target className="h-3 w-3" /> Type
                  </div>
                  <div className="mt-1 font-bold">{analysis.type}</div>
                </div>
                <div className="rounded-lg bg-card border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Priority
                  </div>
                  <div className={`mt-1 font-bold capitalize ${
                    analysis.priority === "high" ? "text-success" :
                    analysis.priority === "medium" ? "text-warning" : "text-muted-foreground"
                  }`}>{analysis.priority}</div>
                </div>
                <div className="rounded-lg bg-card border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Angle</div>
                  <div className="mt-1 font-semibold text-sm">{analysis.angle}</div>
                </div>
              </div>
              {analysis.reasoning && (
                <p className="text-xs text-muted-foreground italic">{analysis.reasoning}</p>
              )}
            </div>
          )}

          {lastCallId && (
            <div className="rounded-xl bg-success/10 border border-success/30 p-3 text-sm">
              <div className="font-semibold text-success flex items-center gap-2">
                <Check className="h-4 w-4" /> Call initiated
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Call ID: <code>{lastCallId}</code> — open the <strong>Calls</strong> page to see live status, transcript and recording.
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "browser" && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-4">
          <div>
            <h3 className="font-bold">Talk to the agent (browser)</h3>
            <p className="text-sm text-muted-foreground">
              Speak with the assistant live through your microphone — no phone number, no outbound call.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Assistant</label>
              <select
                value={browserAssistantId}
                onChange={(e) => setBrowserAssistantId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select an assistant...</option>
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>{a.name ?? a.id}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">First name (optional)</label>
              <input value={bFirstName} onChange={(e) => setBFirstName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Last name (optional)</label>
              <input value={bLastName} onChange={(e) => setBLastName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Business Type</label>
              <select
                value={bBusinessType}
                onChange={(e) => setBBusinessType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select business type —</option>
                <option value="b2b">B2B</option>
                <option value="b2c">B2C</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Notes (optional)</label>
              <textarea value={bNotes} onChange={(e) => setBNotes(e.target.value)} rows={3}
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {browserStatus === "idle" ? (
              <button
                onClick={startBrowserCall}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-elevated hover:opacity-95 transition"
              >
                <Mic className="h-4 w-4" /> Start Conversation
              </button>
            ) : (
              <>
                <button
                  onClick={stopBrowserCall}
                  className="inline-flex items-center gap-2 rounded-xl bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground hover:opacity-95 transition"
                >
                  <PhoneOff className="h-4 w-4" /> End Call
                </button>
                <button
                  onClick={toggleMute}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold hover:bg-muted transition"
                >
                  {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {muted ? "Unmute" : "Mute"}
                </button>
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  {browserStatus === "connecting" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                  ) : (
                    <><span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Live</>
                  )}
                </span>
              </>
            )}
          </div>

          {transcript.length > 0 && (
            <div className="rounded-xl border border-border bg-background p-4 max-h-72 overflow-y-auto space-y-2">
              {transcript.map((t, i) => (
                <div key={i} className="text-sm">
                  <span className={`font-semibold ${t.role === "assistant" ? "text-primary" : "text-foreground"}`}>
                    {t.role === "assistant" ? agentName : "You"}:
                  </span>{" "}
                  <span className="text-muted-foreground">{t.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
