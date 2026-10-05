import { ArrowUpRight, ArrowDownRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  delta?: number;
  icon: LucideIcon;
  iconColor?: "primary" | "success" | "warning" | "info";
  hint?: string;
}

const iconStyles = {
  primary: "bg-accent text-accent-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  iconColor = "primary",
  hint,
}: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", iconStyles[iconColor])}>
          <Icon className="h-5 w-5" />
        </div>
        {delta !== undefined && (
          <div
            className={cn(
              "flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-semibold",
              positive ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"
            )}
          >
            {positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-bold tracking-tight">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}
