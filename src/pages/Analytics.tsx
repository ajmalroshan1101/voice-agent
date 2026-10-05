import { Phone, Clock, Heart, CalendarCheck } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { useI18n } from "@/i18n";

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
};

export default function Analytics() {
  const { t } = useI18n();

  const trend = [
    { week: "W1", answers: 62, meetings: 8 },
    { week: "W2", answers: 71, meetings: 11 },
    { week: "W3", answers: 68, meetings: 9 },
    { week: "W4", answers: 82, meetings: 15 },
    { week: "W5", answers: 78, meetings: 13 },
    { week: "W6", answers: 91, meetings: 18 },
  ];

  const perCampaign = [
    { name: t("an.camp.spring"), interested: 84, meetings: 18 },
    { name: t("an.camp.react"), interested: 56, meetings: 9 },
    { name: t("an.camp.cons"), interested: 32, meetings: 5 },
    { name: t("an.camp.rest"), interested: 70, meetings: 14 },
    { name: t("an.camp.web"), interested: 102, meetings: 22 },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-3xl font-bold">{t("an.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("an.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("an.answerRate")} value="72%" delta={6} icon={Phone} iconColor="info" />
        <StatCard label={t("an.avgDuration")} value="2:48" delta={4} icon={Clock} iconColor="primary" />
        <StatCard label={t("an.pctInterested")} value="38%" delta={9} icon={Heart} iconColor="success" />
        <StatCard label={t("an.meetingConv")} value="14%" delta={2} icon={CalendarCheck} iconColor="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card">
          <h3 className="font-bold">{t("an.weeklyTrend")}</h3>
          <p className="text-xs text-muted-foreground">{t("an.weeklyTrendSub")}</p>
          <ResponsiveContainer width="100%" height={300} className="mt-4">
            <LineChart data={trend} margin={{ left: -15, right: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="answers" name={t("an.answers")} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="meetings" name={t("an.meetings")} stroke="hsl(var(--success))" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card">
          <h3 className="font-bold">{t("an.campPerf")}</h3>
          <p className="text-xs text-muted-foreground">{t("an.campPerfSub")}</p>
          <ResponsiveContainer width="100%" height={300} className="mt-4">
            <BarChart data={perCampaign} margin={{ left: -15, right: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="interested" name={t("an.interested")} fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              <Bar dataKey="meetings" name={t("an.meetings")} fill="hsl(var(--success))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
