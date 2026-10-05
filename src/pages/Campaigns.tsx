import { useEffect, useState } from "react";
import { Play, Pause, Plus, Users, Phone, X, Settings as SettingsIcon, Loader2, Trash2, Rocket } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { useI18n } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Campaign = {
  id: string;
  name: string;
  status: string;
  assistant_id: string | null;
  phone_number_id: string | null;
  script: string | null;
  delay_seconds: number;
  max_attempts: number;
  total_contacts: number;
  called_count: number;
};

type Contact = { id: string; name: string; phone: string; campaign_id: string | null };
type VapiNumber = { id: string; number?: string; name?: string };
type VapiAssistant = { id: string; name?: string };

export default function Campaigns() {
  const { t } = useI18n();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [numbers, setNumbers] = useState<VapiNumber[]>([]);
  const [assistants, setAssistants] = useState<VapiAssistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  // create form
  const [newName, setNewName] = useState("");
  const [newAssistant, setNewAssistant] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newScript, setNewScript] = useState("");
  const [newDelay, setNewDelay] = useState(30);
  const [newMax, setNewMax] = useState(3);

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: ct }] = await Promise.all([
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("contacts").select("id,name,phone,campaign_id"),
    ]);
    setCampaigns((cs ?? []) as Campaign[]);
    setContacts((ct ?? []) as Contact[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    supabase.functions.invoke("vapi-list-numbers").then(({ data }) => setNumbers(data?.numbers ?? []));
    supabase.functions.invoke("vapi-list-assistants").then(({ data }) => setAssistants(data?.assistants ?? []));
  }, []);

  const Badge = ({ status }: { status: string }) => {
    if (status === "active") return <StatusPill variant="success">{t("common.active")}</StatusPill>;
    if (status === "paused") return <StatusPill variant="warning">{t("common.paused")}</StatusPill>;
    if (status === "completed") return <StatusPill variant="muted">{t("common.completed")}</StatusPill>;
    return <StatusPill variant="muted">Draft</StatusPill>;
  };

  const toggle = async (c: Campaign) => {
    const next = c.status === "active" ? "paused" : "active";
    await supabase.from("campaigns").update({ status: next }).eq("id", c.id);
    if (next === "active") launch(c.id);
    else load();
  };

  const launch = async (id: string) => {
    setLaunchingId(id);
    const { data, error } = await supabase.functions.invoke("campaign-launch", { body: { campaignId: id } });
    setLaunchingId(null);
    if (error || data?.error) {
      toast.error("Launch failed: " + (data?.error ?? error?.message));
      return;
    }
    toast.success(data?.message ?? "Campaign launched");
    load();
  };

  const removeCampaign = async (id: string) => {
    await supabase.from("campaigns").delete().eq("id", id);
    setCampaigns((cs) => cs.filter((c) => c.id !== id));
    toast.success("Deleted");
  };

  const create = async () => {
    if (!newName) { toast.error("Name required"); return; }
    const { data, error } = await supabase.from("campaigns").insert({
      name: newName,
      assistant_id: newAssistant || null,
      phone_number_id: newNumber || null,
      script: newScript || null,
      delay_seconds: newDelay,
      max_attempts: newMax,
      status: "draft",
    }).select().maybeSingle();
    if (error) { toast.error(error.message); return; }
    setCreating(false);
    setNewName(""); setNewScript(""); setNewAssistant(""); setNewNumber("");
    toast.success("Campaign created. Assign contacts to it from Contacts page, then launch.");
    if (data) setCampaigns((cs) => [data as Campaign, ...cs]);
  };

  const assignContact = async (campaignId: string, contactId: string) => {
    await supabase.from("contacts").update({ campaign_id: campaignId, status: "waiting" }).eq("id", contactId);
    const total = contacts.filter((c) => c.campaign_id === campaignId).length + 1;
    await supabase.from("campaigns").update({ total_contacts: total }).eq("id", campaignId);
    load();
  };
  const unassignContact = async (contactId: string) => {
    await supabase.from("contacts").update({ campaign_id: null }).eq("id", contactId);
    load();
  };

  const campaignContacts = (cid: string) => contacts.filter((c) => c.campaign_id === cid);
  const unassigned = contacts.filter((c) => !c.campaign_id);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t("camp.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("camp.subtitle")}</p>
        </div>
        <button onClick={() => setCreating(true)} className="rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated hover:opacity-95 transition flex items-center gap-2">
          <Plus className="h-4 w-4" /> {t("camp.new")}
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <p className="font-semibold">No campaigns yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first campaign and assign contacts to it.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => {
            const total = campaignContacts(c.id).length || c.total_contacts;
            const progress = total > 0 ? Math.min(100, Math.round((c.called_count / total) * 100)) : 0;
            return (
              <div key={c.id} className="rounded-2xl border border-border/60 bg-card p-5 shadow-card hover:shadow-elevated transition">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold leading-snug">{c.name}</h3>
                  <Badge status={c.status} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" /> <span>{total} {t("dash.contacts")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" /> <span>{c.called_count} {t("camp.called")}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">{t("camp.progress")}</span>
                    <span className="font-semibold">{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gradient-primary" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <div className="mt-5 flex gap-2 flex-wrap">
                  {c.status === "draft" || c.status === "paused" ? (
                    <button onClick={() => launch(c.id)} disabled={launchingId === c.id || total === 0}
                      className="flex-1 min-w-[100px] rounded-lg bg-success-soft text-success py-2 text-sm font-semibold transition hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-1.5">
                      {launchingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                      {c.status === "paused" ? t("camp.start") : "Launch"}
                    </button>
                  ) : c.status === "active" ? (
                    <button onClick={() => toggle(c)}
                      className="flex-1 min-w-[100px] rounded-lg bg-warning-soft text-warning py-2 text-sm font-semibold transition hover:opacity-80 flex items-center justify-center gap-1.5">
                      <Pause className="h-4 w-4" /> {t("camp.pause")}
                    </button>
                  ) : null}
                  <button onClick={() => setSelected(c)}
                    className="flex-1 min-w-[100px] rounded-lg border border-border bg-card py-2 text-sm font-semibold hover:bg-muted transition flex items-center justify-center gap-1.5">
                    <SettingsIcon className="h-4 w-4" /> {t("camp.details")}
                  </button>
                  <button onClick={() => removeCampaign(c.id)}
                    className="rounded-lg border border-border p-2 hover:bg-destructive hover:text-destructive-foreground transition">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <div className="bg-card w-full max-w-xl rounded-2xl shadow-elevated p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">New Campaign</h2>
            <div className="space-y-3 mt-5">
              <div>
                <label className="text-sm font-semibold">Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Spring B2B Promo" className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold">From number</label>
                  <select value={newNumber} onChange={(e) => setNewNumber(e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm">
                    <option value="">Select…</option>
                    {numbers.map((n) => <option key={n.id} value={n.id}>{n.number ?? n.id}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold">Assistant</label>
                  <select value={newAssistant} onChange={(e) => setNewAssistant(e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm">
                    <option value="">Select…</option>
                    {assistants.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.id}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold">{t("camp.script")} (optional, for reference)</label>
                <textarea value={newScript} onChange={(e) => setNewScript(e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm min-h-[80px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold">{t("camp.delay")}</label>
                  <input type="number" value={newDelay} onChange={(e) => setNewDelay(+e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-semibold">{t("camp.maxAttempts")}</label>
                  <input type="number" value={newMax} onChange={(e) => setNewMax(+e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setCreating(false)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-muted">{t("common.cancel")}</button>
              <button onClick={create} className="flex-1 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Details modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-card w-full max-w-2xl rounded-2xl shadow-elevated max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="text-xl font-bold">{selected.name}</h2>
                <div className="mt-1"><Badge status={selected.status} /></div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <h4 className="text-sm font-bold mb-2">Contacts in campaign ({campaignContacts(selected.id).length})</h4>
                <div className="rounded-xl border border-border divide-y divide-border max-h-48 overflow-y-auto">
                  {campaignContacts(selected.id).length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">None yet — add some below.</div>
                  ) : campaignContacts(selected.id).map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-3 text-sm">
                      <div><span className="font-semibold">{c.name}</span> <span className="text-muted-foreground ml-2 font-mono text-xs">{c.phone}</span></div>
                      <button onClick={() => unassignContact(c.id)} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
                    </div>
                  ))}
                </div>
              </div>

              {unassigned.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold mb-2">Add contacts</h4>
                  <div className="rounded-xl border border-border divide-y divide-border max-h-48 overflow-y-auto">
                    {unassigned.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-3 text-sm">
                        <div><span className="font-semibold">{c.name}</span> <span className="text-muted-foreground ml-2 font-mono text-xs">{c.phone}</span></div>
                        <button onClick={() => assignContact(selected.id, c.id)} className="text-xs font-semibold text-primary hover:underline">+ Add</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
