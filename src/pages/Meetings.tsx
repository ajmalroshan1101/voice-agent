import { useEffect, useMemo, useState } from "react";
import { Calendar, X, FileText, Loader2, Send, RefreshCw } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { SearchInput, Pager } from "@/components/TableToolbar";
import { useI18n } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 12;

type Row = {
  id: string;
  vapi_call_id: string;
  customer_name: string | null;
  customer_number: string | null;
  summary: string | null;
  meeting_datetime: string | null;
  meeting_notes: string | null;
  forwarded_to_make: boolean | null;
  created_at: string;
};

export default function Meetings() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((m) =>
      (m.customer_name ?? "").toLowerCase().includes(q) ||
      (m.customer_number ?? "").toLowerCase().includes(q) ||
      (m.summary ?? "").toLowerCase().includes(q) ||
      (m.meeting_notes ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("call_analyses")
      .select("id,vapi_call_id,customer_name,customer_number,summary,meeting_datetime,meeting_notes,forwarded_to_make,created_at")
      .eq("meeting_confirmed", true)
      .order("meeting_datetime", { ascending: true, nullsFirst: false });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t("meet.title")}</h1>
          <p className="text-muted-foreground mt-1">Meetings booked automatically from successful AI calls.</p>
        </div>
        <button onClick={load} className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted transition flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, number, summary…" />
          <span className="hidden md:inline text-sm text-muted-foreground">{filtered.length} results</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <p className="font-semibold">No meetings yet</p>
          <p className="text-sm text-muted-foreground mt-1">Once an AI call confirms a meeting, it will appear here.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <p className="font-semibold">No meetings match your search</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paged.map((m) => {
              const name = m.customer_name || m.customer_number || "Unknown";
              return (
                <div key={m.id} className="rounded-2xl border border-border/60 bg-card p-5 shadow-card hover:shadow-elevated transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground font-bold">
                        {name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold">{name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" /> {m.meeting_datetime ? new Date(m.meeting_datetime).toLocaleString() : "TBD"}
                        </div>
                      </div>
                    </div>
                    {m.forwarded_to_make ? (
                      <StatusPill variant="success">Synced</StatusPill>
                    ) : (
                      <StatusPill variant="warning">Pending</StatusPill>
                    )}
                  </div>

                  <button onClick={() => setSelected(m)} className="mt-5 w-full rounded-lg border border-border py-2 text-sm font-semibold hover:bg-muted transition">
                    {t("meet.details")}
                  </button>
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
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-card w-full max-w-2xl rounded-2xl shadow-elevated max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="text-xl font-bold">{selected.customer_name || selected.customer_number}</h2>
                <p className="text-sm text-muted-foreground mt-1">{selected.meeting_datetime ? new Date(selected.meeting_datetime).toLocaleString() : "TBD"}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-border p-4">
                  <div className="text-xs font-semibold text-muted-foreground">{t("meet.phone")}</div>
                  <div className="text-sm font-semibold mt-1 font-mono">{selected.customer_number ?? "—"}</div>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <div className="text-xs font-semibold text-muted-foreground">Make.com sync</div>
                  <div className="text-sm font-semibold mt-1 inline-flex items-center gap-1">
                    {selected.forwarded_to_make ? <><Send className="h-3.5 w-3.5 text-success" /> Sent</> : "Not sent"}
                  </div>
                </div>
              </div>

              {selected.summary && (
                <div className="rounded-xl bg-accent/40 border border-border p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-accent-foreground flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {t("meet.summary")}</h4>
                  <p className="text-sm mt-2 leading-relaxed">{selected.summary}</p>
                </div>
              )}

              {selected.meeting_notes && (
                <div>
                  <label className="text-sm font-semibold">{t("meet.notes")}</label>
                  <div className="mt-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">{selected.meeting_notes}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
