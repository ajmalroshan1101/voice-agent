import { useEffect, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";
import { supabase } from "@/integrations/supabase/client";
import { useAgentName } from "@/hooks/useAgentName";
import { useI18n } from "@/i18n";
import { Mic, MicOff, PhoneOff, Loader2, Sparkles } from "lucide-react";

type Status = "idle" | "connecting" | "in-call";
type AssistantOption = { id: string; name: string };

export default function GuestTalk() {
  const { t } = useI18n();
  const agentName = useAgentName();
  const vapiRef = useRef<Vapi | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [assistants, setAssistants] = useState<AssistantOption[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<string>("");

  useEffect(() => {
    // Load the list of agents and pre-select the one configured in Auto-Call settings.
    (async () => {
      const [settingsRes, listRes] = await Promise.all([
        supabase.from("app_settings").select("value").eq("key", "auto_call").maybeSingle(),
        supabase.functions.invoke("vapi-list-assistants"),
      ]);
      const configured = (settingsRes.data?.value as { assistant_id?: string } | null)?.assistant_id;
      const list: { id: string; name?: string }[] = listRes.data?.assistants ?? [];
      const options: AssistantOption[] = list
        .filter((a) => a.id)
        .map((a) => ({ id: a.id, name: a.name || a.id }));
      setAssistants(options);
      if (configured && options.some((o) => o.id === configured)) {
        setSelectedAssistant(configured);
      } else if (options.length) {
        const emma = options.find((a) => a.name.toLowerCase().includes("emma"));
        setSelectedAssistant((emma ?? options[0]).id);
      }
    })();
    return () => {
      try { vapiRef.current?.stop(); } catch { /* noop */ }
      vapiRef.current = null;
    };
  }, []);

  const resolveAssistantId = async (): Promise<string | null> => {
    if (selectedAssistant) return selectedAssistant;
    return assistants[0]?.id ?? null;
  };

  const start = async () => {
    setError(null);
    setTranscript([]);
    setStatus("connecting");

    const { data: keyData, error: keyError } = await supabase.functions.invoke("vapi-public-key");
    if (keyError || !keyData?.publicKey) {
      setError(t("login.guest.errorKey"));
      setStatus("idle");
      return;
    }

    const assistantId = await resolveAssistantId();
    if (!assistantId) {
      setError(t("login.guest.errorAssistant"));
      setStatus("idle");
      return;
    }

    try {
      const vapi = new Vapi(keyData.publicKey);
      vapiRef.current = vapi;

      vapi.on("call-start", () => setStatus("in-call"));
      vapi.on("call-end", () => { setStatus("idle"); setMuted(false); });
      vapi.on("error", (e: unknown) => {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        setError(msg);
        setStatus("idle");
      });
      vapi.on("message", (m: { type?: string; role?: string; transcript?: string; transcriptType?: string }) => {
        if (m?.type === "transcript" && m.transcriptType === "final" && m.transcript) {
          setTranscript((prev) => [...prev, { role: m.role ?? "user", text: m.transcript! }]);
        }
      });

      const nowDate = new Date();
      const romeHour = Number(
        new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(nowDate),
      );
      const greeting = romeHour < 12 ? "Good morning" : romeHour < 17 ? "Good afternoon" : "Good evening";

      await vapi.start(assistantId, {
        variableValues: {
          first_name: "",
          last_name: "",
          customer_name: "Guest",
          customer_number: "",
          business_type: "",
          notes: "",
          agent_name: agentName,
          now: nowDate.toISOString(),
          greeting,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  };

  const stop = () => {
    try { vapiRef.current?.stop(); } catch { /* noop */ }
    setStatus("idle");
    setMuted(false);
  };

  const selectedName = assistants.find((a) => a.id === selectedAssistant)?.name ?? "";

  const toggleMute = () => {
    const v = vapiRef.current;
    if (!v) return;
    const next = !muted;
    v.setMuted(next);
    setMuted(next);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-card">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Sparkles className="h-4 w-4 text-primary" />
        {t("login.guest.title")}
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        {t("login.guest.desc").replace("{agent}", selectedName || agentName)}
      </p>

      {status === "idle" && assistants.length > 0 && (
        <select
          value={selectedAssistant}
          onChange={(e) => setSelectedAssistant(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {assistants.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}

      {status === "idle" ? (
        <button
          onClick={start}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-elevated hover:opacity-95 transition"
        >
          <Mic className="h-4 w-4" /> {t("login.guest.start")}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={stop}
              className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground hover:opacity-95 transition"
            >
              <PhoneOff className="h-4 w-4" /> {t("login.guest.end")}
            </button>
            <button
              onClick={toggleMute}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted transition"
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {muted ? t("login.guest.unmute") : t("login.guest.mute")}
            </button>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              {status === "connecting" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> {t("login.guest.connecting")}</>
              ) : (
                <><span className="h-2 w-2 rounded-full bg-success animate-pulse" /> {t("login.guest.live")}</>
              )}
            </span>
          </div>

          {transcript.length > 0 && (
            <div className="rounded-xl border border-border bg-background p-4 max-h-56 overflow-y-auto space-y-2">
              {transcript.map((line, i) => (
                <div key={i} className="text-sm">
                  <span className={`font-semibold ${line.role === "assistant" ? "text-primary" : "text-foreground"}`}>
                    {line.role === "assistant" ? (selectedName || agentName) : t("login.guest.you")}:
                  </span>{" "}
                  <span className="text-muted-foreground">{line.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
