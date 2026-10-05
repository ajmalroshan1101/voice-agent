import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ListChecks, Skull, RefreshCw, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StatCard } from "@/components/StatCard";

type Event = {
  id: string;
  event_type: string;
  severity: string;
  contact_id: string | null;
  vapi_call_id: string | null;
  job_id: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type Job = {
  id: string;
  contact_id: string;
  status: string;
  priority: number;
  scheduled_at: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  updated_at: string;
};

const SEVERITY_BADGE: Record<string, string> = {
  info: "bg-blue-100 text-blue-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

export default function Monitoring() {
  const [events, setEvents] = useState<Event[]>([]);
  const [deadJobs, setDeadJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [evRes, jobsRes] = await Promise.all([
      supabase.from("system_events").select("*")
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("call_jobs").select("*")
        .eq("status", "dead")
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);
    setLoading(false);
    if (evRes.error) toast.error("Failed to load events: " + evRes.error.message);
    setEvents((evRes.data ?? []) as Event[]);
    setDeadJobs((jobsRes.data ?? []) as Job[]);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const errors = events.filter((e) => e.severity === "error").length;
    const sent = events.filter((e) => e.event_type === "webhook_sent").length;
    const failed = events.filter((e) => e.event_type === "webhook_failed").length;
    const total = sent + failed;
    const failRate = total ? Math.round((failed / total) * 100) : 0;
    return { errors, failRate, dead: deadJobs.length };
  }, [events, deadJobs]);

  const [queuedCount, setQueuedCount] = useState(0);
  useEffect(() => {
    supabase.from("call_jobs").select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .then(({ count }) => setQueuedCount(count ?? 0));
  }, [events]);

  const types = useMemo(() => Array.from(new Set(events.map((e) => e.event_type))).sort(), [events]);
  const filtered = events.filter((e) =>
    (filterType === "all" || e.event_type === filterType) &&
    (filterSeverity === "all" || e.severity === filterSeverity)
  );

  const requeue = async (job: Job) => {
    const { error } = await supabase.from("call_jobs").update({
      status: "queued", attempts: 0, scheduled_at: new Date().toISOString(),
      last_error: null, locked_at: null, locked_by: null,
    }).eq("id", job.id);
    if (error) toast.error("Requeue failed: " + error.message);
    else { toast.success("Job requeued"); load(); }
  };

  const replayWebhook = async (e: Event) => {
    if (!e.vapi_call_id) return toast.error("No call id");
    const { data, error } = await supabase.functions.invoke("vapi-analyze-call", {
      body: { callId: e.vapi_call_id, forward: true },
    });
    if (error || data?.error) toast.error("Replay failed: " + (data?.error ?? error?.message));
    else { toast.success("Replay sent"); load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitoring</h1>
          <p className="text-sm text-muted-foreground">Last 24 hours of system activity</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Errors (24h)" value={String(stats.errors)} icon={AlertTriangle} />
        <StatCard label="Webhook fail rate" value={`${stats.failRate}%`} icon={Activity} />
        <StatCard label="Jobs queued" value={String(queuedCount)} icon={ListChecks} />
        <StatCard label="Dead jobs" value={String(stats.dead)} icon={Skull} />
      </div>

      {deadJobs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold text-foreground">Dead jobs (gave up)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2">Contact</th><th>Attempts</th><th>Last error</th><th>When</th><th></th>
              </tr></thead>
              <tbody>
                {deadJobs.map((j) => (
                  <tr key={j.id} className="border-t border-border">
                    <td className="py-2 font-mono text-xs">{j.contact_id.slice(0, 8)}</td>
                    <td>{j.attempts}/{j.max_attempts}</td>
                    <td className="max-w-md truncate text-muted-foreground">{j.last_error}</td>
                    <td className="text-xs text-muted-foreground">{new Date(j.updated_at).toLocaleString()}</td>
                    <td><button onClick={() => requeue(j)} className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
                      <RotateCw className="h-3 w-3" /> Requeue
                    </button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold text-foreground">Events</h2>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
            <option value="all">All types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
            <option value="all">All severities</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
          </select>
        </div>
        {loading ? <div className="py-8 text-center text-muted-foreground">Loading…</div> :
        filtered.length === 0 ? <div className="py-8 text-center text-muted-foreground">No events</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2">When</th><th>Type</th><th>Severity</th><th>Message</th><th></th>
            </tr></thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="font-mono text-xs">{e.event_type}</td>
                  <td><span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[e.severity] ?? ""}`}>{e.severity}</span></td>
                  <td className="max-w-xl text-foreground">{e.message}</td>
                  <td>{e.event_type === "webhook_failed" && e.vapi_call_id && (
                    <button onClick={() => replayWebhook(e)} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Replay</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>)}
      </div>
    </div>
  );
}
