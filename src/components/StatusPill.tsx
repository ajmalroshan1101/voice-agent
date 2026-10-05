import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "info" | "destructive" | "muted";

const styles: Record<Variant, string> = {
  default: "bg-accent text-accent-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  destructive: "bg-destructive-soft text-destructive",
  muted: "bg-muted text-muted-foreground",
};

export function StatusPill({
  children,
  variant = "default",
  dot = true,
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        styles[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", {
            "bg-success": variant === "success",
            "bg-warning": variant === "warning",
            "bg-info": variant === "info",
            "bg-destructive": variant === "destructive",
            "bg-primary": variant === "default",
            "bg-muted-foreground": variant === "muted",
          })}
        />
      )}
      {children}
    </span>
  );
}
