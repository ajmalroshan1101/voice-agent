import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Plus, Search, Phone, Check, Trash2, Download, Loader2, PhoneCall, Copy, BellRing, X, Pencil, ArrowRight } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { Pager } from "@/components/TableToolbar";
import { useI18n } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PAGE_SIZE = 15;

type Contact = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string | null;
  business_type: string | null;
  company: string | null;
  notes: string | null;
  status: string;
  interest: string | null;
  last_call_at: string | null;
  last_vapi_call_id: string | null;
  last_failure_reason?: string | null;
  campaign_id: string | null;
  attempt_count?: number | null;
  next_call_at?: string | null;
  needs_approval_reason?: string | null;
  email_collected?: string | null;
  recall_number?: string | null;
  recall_number_acknowledged?: boolean | null;
  is_gatekeeper?: boolean | null;
  decision_maker_name?: string | null;
  decision_maker_phone?: string | null;
};

type VapiNumber = { id: string; number?: string; name?: string };
type VapiAssistant = { id: string; name?: string };

export default function Contacts() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [summaries, setSummaries] = useState<Record<string, { summary: string | null; tone: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search]);

  const [callingId, setCallingId] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<VapiNumber[]>([]);
  const [assistants, setAssistants] = useState<VapiAssistant[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<Contact | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editBusinessType, setEditBusinessType] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (c: Contact) => {
    const parts = (c.name ?? "").trim().split(/\s+/);
    const fn = parts.shift() ?? "";
    const ln = parts.join(" ");
    setEditFirstName(fn);
    setEditLastName(ln);
    setEditPhone(c.phone ?? "");
    setEditEmail(c.email ?? "");
    setEditCompany(c.company ?? "");
    setEditBusinessType(c.business_type ?? "");
    setEditNotes(c.notes ?? "");
    setEditing(c);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editFirstName.trim() || !editPhone.trim()) {
      toast.error("First name and phone required");
      return;
    }
    setSavingEdit(true);
    const fullName = `${editFirstName} ${editLastName}`.trim();
    const { data, error } = await supabase
      .from("contacts")
      .update({
        name: fullName,
        phone: editPhone.trim(),
        email: editEmail.trim() || null,
        company: editCompany.trim() || null,
        business_type: editBusinessType || null,
        notes: editNotes.trim() || null,
      })
      .eq("id", editing.id)
      .select()
      .maybeSingle();
    setSavingEdit(false);
    if (error) {
      toast.error("Update failed: " + error.message);
      return;
    }
    if (data) {
      setContacts((cs) => cs.map((x) => (x.id === editing.id ? (data as Contact) : x)));
    }
    toast.success("Contact updated");
    setEditing(null);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contacts").select("*").order("last_call_at", { ascending: false, nullsFirst: false });
    setLoading(false);
    if (error) {
      toast.error("Failed to load contacts: " + error.message);
      return;
    }
    const rows = (data ?? []) as Contact[];
    setContacts(rows);

    const ids = rows.map((r) => r.last_vapi_call_id).filter(Boolean) as string[];
    if (ids.length > 0) {
      const { data: an } = await supabase
        .from("call_analyses")
        .select("vapi_call_id, summary, tone")
        .in("vapi_call_id", ids);
      const map: Record<string, { summary: string | null; tone: string | null }> = {};
      (an ?? []).forEach((a: any) => { map[a.vapi_call_id] = { summary: a.summary, tone: a.tone }; });
      setSummaries(map);
    }
  };

  useEffect(() => {
    load();
    supabase.functions.invoke("vapi-list-numbers").then(({ data }) => setNumbers(data?.numbers ?? []));
    supabase.functions.invoke("vapi-list-assistants").then(({ data }) => setAssistants(data?.assistants ?? []));

    // Live updates: refresh whenever a contact row changes (status, last_call_at, etc.)
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => load(), 500);
    };
    const channel = supabase
      .channel("contacts-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "call_analyses" }, scheduleReload)
      .subscribe();

    // Safety-net polling so the page is never stale, even if realtime drops.
    const poll = setInterval(() => load(), 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (debounce) clearTimeout(debounce);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, []);

  const matchesSearch = (c: Contact) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    (c.recall_number ?? "").includes(search);

  // Contacts that need a recall on a NEW number
  const recallContacts = contacts.filter(
    (c) =>
      !!c.recall_number &&
      c.recall_number !== c.phone &&
      !c.recall_number_acknowledged &&
      matchesSearch(c),
  );
  const recallIds = new Set(recallContacts.map((c) => c.id));
  const filtered = contacts.filter((c) => matchesSearch(c) && !recallIds.has(c.id));
  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const copyNumber = async (num: string) => {
    try {
      await navigator.clipboard.writeText(num);
      toast.success("Number copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const acknowledgeRecall = async (c: Contact) => {
    const { error } = await supabase
      .from("contacts")
      .update({ recall_number_acknowledged: true })
      .eq("id", c.id);
    if (error) {
      toast.error("Failed: " + error.message);
      return;
    }
    setContacts((cs) =>
      cs.map((x) => (x.id === c.id ? { ...x, recall_number_acknowledged: true } : x)),
    );
    toast.success("Moved back to regular list");
  };

  const callOnRecallNumber = async (c: Contact) => {
    setCallingId(c.id);
    // Pull the configured default assistant + number so we never accidentally
    // dial with the English test agent (which used to be `assistants[0]`).
    const { data: setting } = await supabase
      .from("app_settings").select("value").eq("key", "auto_call").maybeSingle();
    const cfg = (setting?.value ?? {}) as { assistant_id?: string; phone_number_id?: string };
    if (!cfg.assistant_id || !cfg.phone_number_id) {
      setCallingId(null);
      toast.error("Default assistant / number not configured. Set them in Auto Call.");
      return;
    }
    const target = c.recall_number ?? c.phone;
    const parts = (c.name ?? "").trim().split(/\s+/);
    const fName = parts.shift() ?? "";
    const lName = parts.join(" ");
    const { data, error } = await supabase.functions.invoke("vapi-create-call", {
      body: {
        phoneNumberId: cfg.phone_number_id,
        assistantId: cfg.assistant_id,
        customerNumber: target,
        customerName: c.name,
        metadata: {
          contact_id: c.id,
          first_name: fName || undefined,
          last_name: lName || undefined,
          business_type: c.business_type ?? undefined,
          notes: c.notes ?? undefined,
        },
      },
    });
    setCallingId(null);
    if (error || data?.error) {
      toast.error("Call failed: " + (data?.error ?? error?.message));
      return;
    }
    await supabase.from("contacts").update({
      status: "calling",
      last_vapi_call_id: data?.call?.id ?? null,
      last_call_at: new Date().toISOString(),
    }).eq("id", c.id);
    toast.success(`Calling ${c.name} on new number…`);
    load();
  };

  const interestPill = (i: string | null) => {
    if (!i) return <span className="text-xs text-muted-foreground">—</span>;
    const v = i.toLowerCase();
    if (v === "meeting_booked") return <StatusPill variant="success">Meeting booked</StatusPill>;
    if (v === "yes" || v === "interested") return <StatusPill variant="success">{t("common.interested")}</StatusPill>;
    if (v === "callback") return <StatusPill variant="warning">{t("common.callback")}</StatusPill>;
    if (v === "voicemail") return <StatusPill variant="muted">Voicemail</StatusPill>;
    if (v === "gatekeeper") return <StatusPill variant="info">Gatekeeper</StatusPill>;
    if (v === "ivr_blocked") return <StatusPill variant="warning">IVR blocked</StatusPill>;
    if (v === "unclear") return <StatusPill variant="muted">Unclear</StatusPill>;
    if (v === "no" || v === "not_interested") return <StatusPill variant="destructive">{t("common.notInterested")}</StatusPill>;
    return <StatusPill variant="muted">{i}</StatusPill>;
  };

  const isTwilioPermissionIssue = (reason?: string | null) => {
    if (!reason) return false;
    const r = reason.toLowerCase();
    return (
      r.includes("not authorized to call") ||
      r.includes("geo-permission") ||
      r.includes("geo permission") ||
      r.includes("geographic permission") ||
      r.includes("twilio") && r.includes("permission") ||
      r.includes("21215") // Twilio geo-permission error code
    );
  };

  const statusPill = (s: string, reason?: string | null) => {
    if (s === "calling") return <StatusPill variant="info">{t("contacts.status.calling")}</StatusPill>;
    if (s === "done" || s === "completed") return <StatusPill variant="success">{t("contacts.status.done")}</StatusPill>;
    if (s === "no_answer") return <StatusPill variant="warning">No answer · retrying</StatusPill>;
    if (s === "needs_approval") return <StatusPill variant="destructive">Needs approval</StatusPill>;
    if (s === "gatekeeper") return <StatusPill variant="info">Gatekeeper · DM pending</StatusPill>;
    if (s === "ivr_blocked") return <StatusPill variant="warning">Switchboard · manual call</StatusPill>;
    if (s === "call_failed") {
      if (isTwilioPermissionIssue(reason)) {
        return <StatusPill variant="destructive">Twilio number permission issue</StatusPill>;
      }
      return <StatusPill variant="destructive">Call failed</StatusPill>;
    }
    return <StatusPill variant="muted">{t("contacts.status.waiting")}</StatusPill>;
  };

  const addContact = async () => {
    if (!firstName || !phone) {
      toast.error("First name and phone required");
      return;
    }
    const fullName = `${firstName} ${lastName}`.trim();
    const { data, error } = await supabase
      .from("contacts").insert({
        name: fullName,
        phone,
        email: email || null,
        business_type: businessType || null,
        company: company || null,
        notes: notes || null,
      }).select().maybeSingle();
    if (error) {
      toast.error("Failed: " + error.message);
      return;
    }
    setFirstName(""); setLastName(""); setPhone(""); setEmail("");
    setBusinessType(""); setCompany(""); setNotes("");
    setAdding(false);
    toast.success("Contact added — calling now…");
    if (data) setContacts((c) => [data as Contact, ...c]);

    if (data) {
      const { data: res, error: callErr } = await supabase.functions.invoke("contact-auto-call", {
        body: { contactId: (data as Contact).id },
      });
      if (callErr || res?.error) {
        toast.error("Auto-call failed: " + (res?.error ?? callErr?.message));
      } else {
        toast.success(`Calling ${(data as Contact).name}…`);
      }
      load();
    }
  };

  const approveAndCall = async (c: Contact) => {
    setCallingId(c.id);
    await supabase.from("contacts").update({
      attempt_count: 0, status: "waiting", needs_approval_reason: null,
    }).eq("id", c.id);
    const { data: res, error } = await supabase.functions.invoke("contact-auto-call", {
      body: { contactId: c.id },
    });
    setCallingId(null);
    if (error || res?.error) toast.error("Call failed: " + (res?.error ?? error?.message));
    else toast.success(`Re-calling ${c.name}…`);
    load();
  };

  const callContact = async (c: Contact) => {
    setCallingId(c.id);
    // Route through contact-auto-call so the configured default assistant
    // (app_settings.auto_call) is always used — never assistants[0].
    const { data: res, error } = await supabase.functions.invoke("contact-auto-call", {
      body: { contactId: c.id },
    });
    setCallingId(null);
    if (error || res?.error) {
      toast.error("Call failed: " + (res?.error ?? error?.message));
      return;
    }
    toast.success(`Calling ${c.name}…`);
    load();
  };

  const removeContact = async (id: string) => {
    await supabase.from("contacts").delete().eq("id", id);
    setContacts((cs) => cs.filter((c) => c.id !== id));
    toast.success("Deleted");
  };

  const exportCsv = () => {
    const header = "First name,Last name,Phone,Email,Business,Status,Interest,Last call\n";
    const rows = contacts.map((c) => {
      const parts = (c.name ?? "").trim().split(/\s+/);
      const fn = parts.shift() ?? "";
      const ln = parts.join(" ");
      return [fn, ln, c.phone, c.email ?? "", c.business_type ?? "", c.status, c.interest ?? "",
        c.last_call_at ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `contacts-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported");
  };

  const downloadTemplate = () => {
    const csv = "first_name,last_name,phone,email,business_type\nAjmal,Khan,+917994506059,ajmal@example.com,b2b\nMaria,Rossi,+393331234567,,b2c\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contacts-template.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { toast.error("Empty CSV"); return; }
    const header = lines[0].toLowerCase().split(",").map((h) => h.replace(/"/g, "").trim());
    const fi = header.findIndex((h) => h.includes("first"));
    const li = header.findIndex((h) => h.includes("last"));
    const ni = header.findIndex((h) => h === "name" || (h.includes("name") && !h.includes("first") && !h.includes("last")));
    const pi = header.findIndex((h) => h.includes("phone"));
    const ei = header.findIndex((h) => h.includes("email"));
    const bi = header.findIndex((h) => h.includes("business"));
    if ((fi < 0 && ni < 0) || pi < 0) { toast.error("CSV needs 'first_name' (or 'name') and 'phone' columns"); return; }
    const parseRow = (line: string) => {
      const out: string[] = []; let cur = ""; let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === "," && !q) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    };
    const rows = lines.slice(1).map(parseRow).map((r) => {
      const fn = fi >= 0 ? (r[fi]?.trim() ?? "") : "";
      const ln = li >= 0 ? (r[li]?.trim() ?? "") : "";
      const combined = (fn || ln) ? `${fn} ${ln}`.trim() : (ni >= 0 ? r[ni]?.trim() ?? "" : "");
      return {
        name: combined,
        phone: r[pi]?.trim(),
        email: ei >= 0 ? r[ei]?.trim() || null : null,
        business_type: bi >= 0 ? r[bi]?.trim() || null : null,
      };
    }).filter((r) => r.name && r.phone);
    if (rows.length === 0) { toast.error("No valid rows"); return; }
    const { error } = await supabase.from("contacts").insert(rows);
    if (error) { toast.error("Import failed: " + error.message); return; }
    toast.success(`Imported ${rows.length} contacts`);
    load();
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t("contacts.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("contacts.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted transition flex items-center gap-2">
            <Upload className="h-4 w-4" /> {t("contacts.import")}
          </button>
          <button onClick={downloadTemplate}
            className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted transition flex items-center gap-2">
            <Download className="h-4 w-4" /> Template
          </button>
          <button onClick={exportCsv}
            className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted transition flex items-center gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button onClick={() => setAdding(true)} className="rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated hover:opacity-95 transition flex items-center gap-2">
            <Plus className="h-4 w-4" /> {t("contacts.add")}
          </button>
        </div>
      </div>

      {recallContacts.length > 0 && (
        <div className="rounded-2xl border-2 border-warning/50 bg-warning/5 shadow-card overflow-hidden">
          <button
            type="button"
            onClick={() => navigate("/recall")}
            className="w-full flex items-center justify-between gap-3 p-4 border-b border-warning/30 bg-warning/10 hover:bg-warning/20 transition text-left"
            title="Open Recall section"
          >
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-warning" />
              <div>
                <h2 className="font-bold flex items-center gap-1.5">
                  Da richiamare su nuovo numero
                  <ArrowRight className="h-4 w-4" />
                </h2>
                <p className="text-xs text-muted-foreground">
                  Il prospect ha fornito un numero di richiamata diverso. Click to open Recall.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-warning/20 text-warning px-3 py-1 text-xs font-bold">
              {recallContacts.length}
            </span>
          </button>
          <div className="divide-y divide-warning/20">
            {recallContacts.map((c) => (
              <div key={c.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 hover:bg-warning/5 transition">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    {c.name}
                    {c.business_type && (
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        c.business_type.toLowerCase() === "b2b"
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "bg-accent text-accent-foreground border border-border"
                      }`}>{c.business_type.toUpperCase()}</span>
                    )}
                  </div>
                  {c.email_collected && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      Email: <span className="font-mono">{c.email_collected}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                  <div className="rounded-lg border border-border bg-card px-3 py-2 min-w-[160px]">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Originale</div>
                    <div className="font-mono text-xs line-through text-muted-foreground">{c.phone}</div>
                  </div>
                  <div className="rounded-lg border-2 border-warning/60 bg-warning/10 px-3 py-2 min-w-[180px]">
                    <div className="text-[10px] uppercase tracking-wider text-warning font-bold">Nuovo numero</div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">{c.recall_number}</span>
                      <button
                        onClick={() => copyNumber(c.recall_number!)}
                        title="Copy number"
                        className="rounded-md border border-warning/40 bg-card p-1 hover:bg-warning/20 transition"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => callOnRecallNumber(c)}
                    disabled={callingId === c.id}
                    title="Call new number"
                    className="rounded-lg bg-gradient-primary text-primary-foreground px-3 py-2 text-xs font-semibold shadow-elevated hover:opacity-95 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {callingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />}
                    Call
                  </button>
                  <button
                    onClick={() => acknowledgeRecall(c)}
                    title="Acknowledge — move back to regular list"
                    className="rounded-lg border border-border bg-card p-2 hover:bg-muted transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card shadow-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 w-full md:w-80">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t("contacts.search")}
              className="bg-transparent text-sm outline-none flex-1" />
          </div>
          <span className="hidden md:inline text-sm text-muted-foreground">{filtered.length} {t("contacts.count")}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
                <th className="p-4 font-semibold">{t("contacts.col.name")}</th>
                <th className="p-4 font-semibold">Company</th>
                <th className="p-4 font-semibold">{t("contacts.col.phone")}</th>
                <th className="p-4 font-semibold">Email</th>
                <th className="p-4 font-semibold">Type</th>
                <th className="p-4 font-semibold">{t("contacts.col.status")}</th>
                <th className="p-4 font-semibold">{t("contacts.col.interest")}</th>
                <th className="p-4 font-semibold">Notes</th>
                <th className="p-4 font-semibold">{t("contacts.col.last")}</th>
                <th className="p-4 font-semibold">Last Call Report</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} className="p-10 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={11} className="p-10 text-center text-muted-foreground">No contacts yet. Add one or import a CSV.</td></tr>
              )}
              {paged.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition align-top">
                  <td className="p-4 font-semibold">
                    {c.name}
                    {c.status === "needs_approval" && c.needs_approval_reason && (
                      <div className="text-xs text-destructive font-normal mt-0.5">{c.needs_approval_reason}</div>
                    )}
                    {c.status === "no_answer" && c.next_call_at && (
                      <div className="text-xs text-muted-foreground font-normal mt-0.5">
                        Next retry: {new Date(c.next_call_at).toLocaleString()} (attempt {(c.attempt_count ?? 0) + 1})
                      </div>
                    )}
                    {(c.is_gatekeeper || c.status === "gatekeeper") && (c.decision_maker_name || c.decision_maker_phone) && (
                      <div className="text-xs text-info font-normal mt-0.5">
                        Decision-maker: <span className="font-semibold">{c.decision_maker_name ?? "—"}</span>
                        {c.decision_maker_phone ? <span className="font-mono ml-1">({c.decision_maker_phone})</span> : null}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-sm">
                    {c.company ? c.company : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="p-4 text-muted-foreground font-mono text-xs">{c.phone}</td>
                  <td className="p-4 text-xs">
                    {c.email_collected ? (
                      <div className="inline-flex flex-col gap-1 rounded-lg border-2 border-success/60 bg-success/10 px-2.5 py-1.5">
                        <span className="font-mono text-sm font-bold text-success break-all">{c.email_collected}</span>
                        <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-success font-bold">
                          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                          Recovered from audio
                        </span>
                        {c.email && c.email !== c.email_collected && (
                          <span className="text-[10px] text-muted-foreground">manual: {c.email}</span>
                        )}
                      </div>
                    ) : c.email ? (
                      <span className="font-mono">{c.email}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    {c.business_type ? (
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                        c.business_type.toLowerCase() === "b2b"
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "bg-accent text-accent-foreground border border-border"
                      }`}>
                        {c.business_type.toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    {statusPill(c.status, c.last_failure_reason)}
                    {c.status === "call_failed" && c.last_failure_reason && (
                      <div className="mt-1 max-w-[220px] text-xs text-destructive line-clamp-3" title={c.last_failure_reason}>
                        {c.last_failure_reason}
                      </div>
                    )}
                  </td>
                  <td className="p-4">{interestPill(c.interest)}</td>
                  <td className="p-4 text-xs text-muted-foreground max-w-[220px]">
                    {c.notes ? (
                      <span className="line-clamp-3 whitespace-pre-wrap" title={c.notes}>{c.notes}</span>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  <td className="p-4 text-xs">
                    {c.last_call_at ? (
                      <span className="text-muted-foreground whitespace-nowrap">{new Date(c.last_call_at).toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-4 text-xs max-w-[300px]">
                    {(() => {
                      const s = c.last_vapi_call_id ? summaries[c.last_vapi_call_id] : null;
                      if (!s?.summary && !s?.tone) {
                        return <span className="text-muted-foreground">—</span>;
                      }
                      return (
                        <div className="space-y-1.5">
                          {s?.tone && (
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border border-border">
                              {s.tone}
                            </span>
                          )}
                          {s?.summary && (
                            <p className="line-clamp-3 whitespace-pre-wrap text-foreground/80 leading-snug" title={s.summary}>
                              {s.summary}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-1">
                      {c.status === "needs_approval" && (
                        <button onClick={() => approveAndCall(c)} disabled={callingId === c.id}
                          className="rounded-lg bg-success/10 text-success border border-success/30 px-2.5 py-1.5 text-xs font-semibold hover:bg-success/20 disabled:opacity-50 flex items-center gap-1" title="Approve and call again">
                          {callingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Approve
                        </button>
                      )}
                      <button onClick={() => openEdit(c)}
                        className="rounded-lg border border-border p-2 hover:bg-muted" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => callContact(c)} disabled={callingId === c.id}
                        className="rounded-lg border border-border p-2 hover:bg-muted disabled:opacity-50" title="Call now">
                        {callingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                      </button>
                      <button onClick={() => removeContact(c.id)}
                        className="rounded-lg border border-border p-2 hover:bg-destructive hover:text-destructive-foreground" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
        )}
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAdding(false)}>
          <div className="bg-card w-full max-w-md rounded-2xl shadow-elevated p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{t("contacts.modal.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              <Phone className="inline h-3.5 w-3.5 mr-1" /> Saved to your contacts list.
            </p>
            <div className="space-y-3 mt-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold">First name</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Marco" className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-semibold">Last name</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold">Company name</label>
                <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme S.r.l." className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm font-semibold">{t("contacts.field.phone")}</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1234567" className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm font-semibold">Email (optional)</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@example.com" className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm font-semibold">Business Type</label>
                <select value={businessType} onChange={(e) => setBusinessType(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Select business type —</option>
                  <option value="b2b">B2B</option>
                  <option value="b2c">B2C</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">Notes (optional)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Extra context about this lead (company, role, pain points...)"
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setAdding(false)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-muted">{t("common.cancel")}</button>
              <button onClick={addContact} className="flex-1 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated">Save</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-card w-full max-w-md rounded-2xl shadow-elevated p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Edit contact</h2>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1 hover:bg-muted" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Update contact details. Changes are saved immediately.</p>
            <div className="space-y-3 mt-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold">First name</label>
                  <input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-semibold">Last name</label>
                  <input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold">Company name</label>
                <input value={editCompany} onChange={(e) => setEditCompany(e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm font-semibold">{t("contacts.field.phone")}</label>
                <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm font-semibold">Email</label>
                <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm font-semibold">Business Type</label>
                <select value={editBusinessType} onChange={(e) => setEditBusinessType(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Select business type —</option>
                  <option value="b2b">B2B</option>
                  <option value="b2c">B2C</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">Notes</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-muted">{t("common.cancel")}</button>
              <button onClick={saveEdit} disabled={savingEdit} className="flex-1 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated disabled:opacity-50 flex items-center justify-center gap-2">
                {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
