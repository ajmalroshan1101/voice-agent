import { Users, PhoneCall, Heart, CalendarCheck, TrendingUp, Play, Pause } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from "recharts";
import { StatCard } from "@/components/StatCard";
import { StatusPill } from "@/components/StatusPill";
import { useI18n } from "@/i18n";

export default function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const exportReport = async () => {
    const { data, error } = await supabase
      .from("call_analyses")
      .select("vapi_call_id,customer_name,customer_number,intent,is_interested,meeting_confirmed,meeting_datetime,duration_seconds,summary,created_at")
      .order("created_at", { ascending: false });
    if (error) { toast.error("Export failed: " + error.message); return; }
    const header = "Call ID,Name,Number,Intent,Interested,Meeting,Meeting time,Duration (s),Summary,Date\n";
    const rows = (data ?? []).map((r: any) => [
      r.vapi_call_id, r.customer_name ?? "", r.customer_number ?? "", r.intent ?? "",
      r.is_interested ?? "", r.meeting_confirmed ?? "", r.meeting_datetime ?? "",
      r.duration_seconds ?? "", (r.summary ?? "").replace(/\n/g, " "), r.created_at,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data?.length ?? 0} calls`);
  };

  const callsData = [
    { day: t("days.mon"), calls: 120 },
    { day: t("days.tue"), calls: 168 },
    { day: t("days.wed"), calls: 142 },
    { day: t("days.thu"), calls: 196 },
    { day: t("days.fri"), calls: 220 },
    { day: t("days.sat"), calls: 88 },
    { day: t("days.sun"), calls: 54 },
  ];

  const interestData = [
    { name: t("common.interested"), value: 312, color: "hsl(var(--success))" },
    { name: t("common.notInterested"), value: 184, color: "hsl(var(--muted-foreground))" },
    { name: t("common.callback"), value: 96, color: "hsl(var(--warning))" },
  ];

  const recentCampaigns = [
    { name: t("camp.name.1"), status: "active", contacts: 420, progress: 68 },
    { name: t("camp.name.2"), status: "active", contacts: 310, progress: 42 },
    { name: t("camp.name.3"), status: "paused", contacts: 180, progress: 25 },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t("dash.greeting")}</h1>
          <p className="text-muted-foreground mt-1">{t("dash.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportReport} className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-muted transition">
            {t("dash.export")}
          </button>
          <button onClick={() => navigate("/campaigns")} className="rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated hover:opacity-95 transition">
            {t("dash.newCampaign")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label={t("dash.totalContacts")} value="1,248" delta={12} icon={Users} iconColor="info" />
        <StatCard label={t("dash.callsMade")} value="892" delta={8} icon={PhoneCall} iconColor="primary" />
        <StatCard label={t("dash.interested")} value="312" delta={15} icon={Heart} iconColor="success" />
        <StatCard label={t("dash.meetingsBooked")} value="48" delta={22} icon={CalendarCheck} iconColor="warning" />
        <StatCard label={t("dash.conversion")} value="34%" delta={-3} icon={TrendingUp} iconColor="primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-card p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold">{t("dash.dailyCalls")}</h3>
              <p className="text-xs text-muted-foreground">{t("dash.last7")}</p>
            </div>
            <StatusPill variant="success">{t("dash.vsLastWeek")}</StatusPill>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={callsData} margin={{ left: -20, right: 5 }}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area type="monotone" dataKey="calls" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#grad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card">
          <h3 className="font-bold">{t("dash.outcomes")}</h3>
          <p className="text-xs text-muted-foreground">{t("dash.outcomesSub")}</p>
          <ResponsiveContainer width="100%" height={200} className="mt-2">
            <PieChart>
              <Pie data={interestData} dataKey="value" innerRadius={55} outerRadius={80} paddingAngle={3}>
                {interestData.map((e) => (
                  <Cell key={e.name} fill={e.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {interestData.map((e) => (
              <div key={e.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.color }} />
                  <span className="text-muted-foreground">{e.name}</span>
                </div>
                <span className="font-semibold">{e.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold">{t("dash.activeCampaigns")}</h3>
            <p className="text-xs text-muted-foreground">{t("dash.realtime")}</p>
          </div>
          <button onClick={() => navigate("/campaigns")} className="text-sm font-semibold text-primary hover:underline">{t("dash.viewAll")}</button>
        </div>
        <div className="space-y-3">
          {recentCampaigns.map((c) => (
            <div
              key={c.name}
              className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 rounded-xl border border-border/60 p-4 hover:bg-muted/40 transition"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{c.name}</span>
                  {c.status === "active" ? (
                    <StatusPill variant="success">{t("common.active")}</StatusPill>
                  ) : (
                    <StatusPill variant="warning">{t("common.paused")}</StatusPill>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{c.contacts} {t("dash.contacts")}</p>
              </div>
              <div className="flex items-center gap-3 md:w-72">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-gradient-primary" style={{ width: `${c.progress}%` }} />
                </div>
                <span className="text-sm font-semibold w-10 text-right">{c.progress}%</span>
              </div>
              <button className="rounded-lg bg-muted hover:bg-accent p-2 transition">
                {c.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
