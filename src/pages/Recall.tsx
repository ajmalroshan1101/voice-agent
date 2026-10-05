import { useEffect, useMemo, useState } from "react";
import { PhoneForwarded, Phone, X, FileText, Loader2, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { SearchInput, Pager } from "@/components/TableToolbar";
import { StatusPill } from "@/components/StatusPill";
import { useI18n } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const PAGE_SIZE = 12;

type Row = {
  id: string;
  vapi_call_id: string;
  customer_name: string | null;
  customer_number: string | null;
  recall_number: string | null;
  recall_reason: string | null;
  recall_action_summary: string | null;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  ended_reason: string | null;
  intent: string | null;
  needs_recall: boolean;
  duration_seconds: number | null;
  created_at: string;
  recall_handled: boolean;
  recall_handled_at: string | null;
};

const NOT_CONNECTED_INTENTS = ["no_answer", "connect_failed", "voicemail"];

const notConnectedLabel = (r: Row) => {
  if (r.intent === "no_answer") return "No answer — never spoke to anyone";
  if (r.intent === "connect_failed") return "Call could not be connected (carrier/Twilio issue)";
  if (r.intent === "voicemail") return "Reached voicemail / no live conversation";
  return `Call not connected (${r.ended_reason ?? "unknown"})`;
};

export default function Recall() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "handled">("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);
  useEffect(() => { setPage(1); }, [search, tab]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("call_analyses")
      .select(
        "id,vapi_call_id,customer_name,customer_number,recall_number,recall_reason,recall_action_summary,summary,transcript,recording_url,ended_reason,intent,needs_recall,duration_seconds,created_at,recall_handled,recall_handled_at",
      )
      .or(`needs_recall.eq.true,intent.in.(${NOT_CONNECTED_INTENTS.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };


  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const base = rows.filter((r) => (tab === "pending" ? !r.recall_handled : r.recall_handled));
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      (r.customer_name ?? "").toLowerCase().includes(q) ||
      (r.customer_number ?? "").toLowerCase().includes(q) ||
      (r.recall_number ?? "").toLowerCase().includes(q) ||
      (r.recall_reason ?? "").toLowerCase().includes(q) ||
      (r.recall_action_summary ?? "").toLowerCase().includes(q) ||
      (r.summary ?? "").toLowerCase().includes(q),
    );
  }, [rows, tab, search]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const pendingCount = rows.filter((r) => !r.recall_handled).length;
  const handledCount = rows.filter((r) => r.recall_handled).length;

  const setHandled = async (row: Row, handled: boolean) => {
    const { error } = await supabase
      .from("call_analyses")
      .update({
        recall_handled: handled,
        recall_handled_at: handled ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: handled ? "Marked as handled" : "Reopened" });
    setSelected(null);
    load();
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <PhoneForwarded className="h-7 w-7 text-primary" /> Recall queue
          </h1>
          <p className="text-muted-foreground mt-1">
            Calls the AI flagged as <strong>unfinished</strong> — prospect was on hold,
            interrupted, or asked to be called back. Review the summary and call them.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted transition flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("pending")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            tab === "pending"
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card hover:bg-muted"
          }`}
        >
          <Clock className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Pending {pendingCount > 0 && `(${pendingCount})`}
        </button>
        <button
          onClick={() => setTab("handled")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            tab === "handled"
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card hover:bg-muted"
          }`}
        >
          <CheckCircle2 className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Handled {handledCount > 0 && `(${handledCount})`}
        </button>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, number, reason…" />
          <span className="hidden md:inline text-sm text-muted-foreground">{filtered.length} results</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <p className="font-semibold">
            {tab === "pending" ? "No pending recalls" : "No handled recalls yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {tab === "pending"
              ? "When the AI detects an unfinished conversation, it will appear here."
              : "Once you mark a recall as handled, it will move here."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paged.map((r) => {
              const name = r.customer_name || r.customer_number || "Unknown";
              const callBackNumber = r.recall_number || r.customer_number;
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-border/60 bg-card p-5 shadow-card hover:shadow-elevated transition flex flex-col"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground font-bold shrink-0">
                        {name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold truncate">{name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                          {callBackNumber ?? "—"}
                        </div>
                      </div>
                    </div>
                    {r.recall_handled ? (
                      <StatusPill variant="success">Handled</StatusPill>
                    ) : (
                      <StatusPill variant="warning">Pending</StatusPill>
                    )}
                  </div>

                  {(r.recall_reason || !r.needs_recall) && (
                    <div className="mt-4 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-warning">
                        {r.needs_recall ? "Why recall" : "Not connected"}
                      </div>
                      <div className="text-sm mt-0.5">{r.recall_reason || notConnectedLabel(r)}</div>
                    </div>
                  )}


                  {r.recall_action_summary && (
                    <p className="mt-3 text-sm text-foreground/80 line-clamp-3 leading-relaxed">
                      {r.recall_action_summary}
                    </p>
                  )}

                  <div className="text-xs text-muted-foreground mt-3">
                    {new Date(r.created_at).toLocaleString()}
                  </div>

                  <div className="mt-auto pt-4 flex gap-2">
                    <button
                      onClick={() => setSelected(r)}
                      className="flex-1 rounded-lg border border-border py-2 text-sm font-semibold hover:bg-muted transition"
                    >
                      Details
                    </button>
                    {!r.recall_handled && (
                      <button
                        onClick={() => setHandled(r, true)}
                        className="rounded-lg bg-success text-success-foreground px-3 py-2 text-sm font-semibold hover:opacity-90 transition flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
          </div>
        </>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-card w-full max-w-2xl rounded-2xl shadow-elevated max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="text-xl font-bold">{selected.customer_name || selected.customer_number}</h2>
                <p className="text-sm text-muted-foreground mt-1 font-mono">
                  {selected.recall_number || selected.customer_number || "—"}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg p-2 hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {(selected.recall_reason || !selected.needs_recall) && (
                <div className="rounded-xl bg-warning/10 border border-warning/30 p-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-warning">
                    {selected.needs_recall ? "Why this needs a recall" : "Why this call needs a retry"}
                  </div>
                  <div className="text-sm mt-1">{selected.recall_reason || notConnectedLabel(selected)}</div>
                </div>
              )}


              {selected.recall_action_summary && (
                <div className="rounded-xl bg-accent/40 border border-border p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-accent-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> What to say on the callback
                  </h4>
                  <p className="text-sm mt-2 leading-relaxed whitespace-pre-wrap">
                    {selected.recall_action_summary}
                  </p>
                </div>
              )}

              {selected.summary && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Original call summary
                  </div>
                  <p className="text-sm mt-2 leading-relaxed whitespace-pre-wrap">
                    {selected.summary}
                  </p>
                </div>
              )}

              {selected.vapi_call_id && (
                <a
                  href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vapi-recording?callId=${encodeURIComponent(selected.vapi_call_id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded-lg bg-foreground text-background px-4 py-2 text-sm font-semibold hover:opacity-90"
                >
                  Listen to recording
                </a>
              )}

              <div className="flex gap-2 pt-2 border-t border-border">
                {(selected.recall_number || selected.customer_number) && (
                  <a
                    href={`tel:${selected.recall_number || selected.customer_number}`}
                    className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90 transition flex items-center justify-center gap-2"
                  >
                    <Phone className="h-4 w-4" /> Call now
                  </a>
                )}
                {selected.recall_handled ? (
                  <button
                    onClick={() => setHandled(selected, false)}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted transition"
                  >
                    Reopen
                  </button>
                ) : (
                  <button
                    onClick={() => setHandled(selected, true)}
                    className="rounded-lg bg-success text-success-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition flex items-center gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Mark handled
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
