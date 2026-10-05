import { forwardRef, useEffect, useState } from "react";
import { Phone, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const Toggle = forwardRef<HTMLButtonElement, { checked: boolean; onChange: (v: boolean) => void }>(
  function Toggle({ checked, onChange }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    );
  }
);

export default function AutoCall() {
  const { t } = useI18n();
  const [autoCalls, setAutoCalls] = useState(true);
  const [assistants, setAssistants] = useState<{ id: string; name?: string }[]>([]);
  const [numbers, setNumbers] = useState<{ id: string; number?: string; name?: string }[]>([]);
  const [acAssistantId, setAcAssistantId] = useState("");
  const [acSquadId, setAcSquadId] = useState("");
  const [acPhoneId, setAcPhoneId] = useState("");
  const [acRetryMin, setAcRetryMin] = useState(60);
  const [acMaxAttempts, setAcMaxAttempts] = useState(3);
  const [acAgentName, setAcAgentName] = useState("Matteo");
  const [acSaving, setAcSaving] = useState(false);

  useEffect(() => {
    supabase.functions.invoke("vapi-list-assistants").then(({ data }) => setAssistants(data?.assistants ?? []));
    supabase.functions.invoke("vapi-list-numbers").then(({ data }) => setNumbers(data?.numbers ?? []));
    supabase.from("app_settings").select("value").eq("key", "auto_call").maybeSingle().then(({ data }) => {
      const v = (data?.value ?? {}) as any;
      if (v.assistant_id) setAcAssistantId(v.assistant_id);
      if (v.squad_id) setAcSquadId(v.squad_id);
      if (v.phone_number_id) setAcPhoneId(v.phone_number_id);
      if (typeof v.retry_minutes === "number") setAcRetryMin(v.retry_minutes);
      if (typeof v.max_attempts === "number") setAcMaxAttempts(v.max_attempts);
      if (typeof v.enabled === "boolean") setAutoCalls(v.enabled);
      if (typeof v.agent_name === "string" && v.agent_name.trim()) setAcAgentName(v.agent_name);
    });
  }, []);

  const saveAutoCall = async () => {
    setAcSaving(true);
    const { error } = await supabase.from("app_settings").update({
      value: {
        enabled: autoCalls,
        assistant_id: acAssistantId || null,
        squad_id: acSquadId.trim() || null,
        phone_number_id: acPhoneId || null,
        retry_minutes: acRetryMin,
        max_attempts: acMaxAttempts,
        agent_name: (acAgentName || "Matteo").trim(),
      },
    }).eq("key", "auto_call");
    setAcSaving(false);
    if (error) toast.error("Failed: " + error.message);
    else toast.success("Auto-call settings saved");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">{t("set.auto")}</h1>
        <p className="text-muted-foreground mt-1">{t("set.autoDesc")}</p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground shrink-0">
            <Phone className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
              <div className="text-sm font-semibold">{autoCalls ? t("set.enabled") : t("set.disabled")}</div>
              <Toggle checked={autoCalls} onChange={setAutoCalls} />
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Agent Name</label>
                <input
                  value={acAgentName}
                  onChange={(e) => setAcAgentName(e.target.value)}
                  placeholder="e.g. Matteo or Emma"
                  className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Used everywhere the AI agent is referenced and sent to Vapi as <code>agent_name</code>.
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Default Assistant</label>
                <select value={acAssistantId} onChange={(e) => setAcAssistantId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm">
                  <option value="">— select assistant —</option>
                  {assistants.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.id}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Squad ID (optional)</label>
                <input
                  value={acSquadId}
                  onChange={(e) => setAcSquadId(e.target.value)}
                  placeholder="e.g. squad_xxxxxxxx"
                  className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  When set, calls are placed using this Vapi Squad instead of the assistant above.
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Default Phone Number</label>
                <select value={acPhoneId} onChange={(e) => setAcPhoneId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm">
                  <option value="">— select number —</option>
                  {numbers.map((n) => <option key={n.id} value={n.id}>{n.name ? `${n.name} — ` : ""}{n.number ?? n.id}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Retry after (minutes)</label>
                  <input type="number" min={1} value={acRetryMin} onChange={(e) => setAcRetryMin(Number(e.target.value) || 60)}
                    className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Max attempts before approval</label>
                  <input type="number" min={1} value={acMaxAttempts} onChange={(e) => setAcMaxAttempts(Number(e.target.value) || 3)}
                    className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm" />
                </div>
              </div>
              <button onClick={saveAutoCall} disabled={acSaving}
                className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated disabled:opacity-50 flex items-center justify-center gap-2">
                {acSaving && <RefreshCw className="h-4 w-4 animate-spin" />} Save auto-call config
              </button>
              <p className="text-xs text-muted-foreground">
                New leads will be called instantly using these settings. If unanswered (no answer / voicemail / busy),
                the call retries every {acRetryMin} min, up to {acMaxAttempts} attempts. After that the contact is marked
                <strong> Needs approval</strong> and waits for an admin to re-approve.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
