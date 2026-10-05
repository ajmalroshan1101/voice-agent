import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2,
  ArrowRight,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  PhoneCall,
  Activity,
  CalendarCheck,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/i18n";
import GuestTalk from "@/components/GuestTalk";

export default function Login() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Sign in — Vocali AI";
  }, []);

  if (authLoading) return null;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back");
    navigate("/", { replace: true });
  };

  const features = [
    { icon: PhoneCall, label: t("login.feature.agents") },
    { icon: Zap, label: t("login.feature.queue") },
    { icon: Activity, label: t("login.feature.monitoring") },
    { icon: CalendarCheck, label: t("login.feature.crm") },
  ];

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-background">
      {/* LEFT — Brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-primary p-12 text-primary-foreground">
        {/* Decorative glows */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-20 h-[28rem] w-[28rem] rounded-full bg-primary-glow/40 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Top: logo */}
        <div className="relative z-10 flex items-center gap-3 animate-fade-in">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur shadow-elevated">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-bold leading-tight">Vocali AI</div>
            <div className="text-xs opacity-80">{t("brand.tagline")}</div>
          </div>
        </div>

        {/* Middle: pitch + features */}
        <div className="relative z-10 space-y-8 animate-fade-in">
          <div className="space-y-3">
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.1]">
              {t("login.brand.title")}
            </h1>
            <p className="text-base xl:text-lg opacity-90 max-w-md leading-relaxed">
              {t("login.brand.desc")}
            </p>
          </div>

          <ul className="space-y-3 max-w-md">
            {features.map((f) => (
              <li key={f.label} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                  <f.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-sm xl:text-base font-medium opacity-95">
                  {f.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom: stat chips */}
        <div className="relative z-10 flex flex-wrap gap-3 animate-fade-in">
          <div className="flex items-center gap-2 rounded-2xl bg-white/10 backdrop-blur px-4 py-3 border border-white/15">
            <PhoneCall className="h-4 w-4 opacity-80" />
            <div>
              <div className="text-base font-bold leading-none">1,240</div>
              <div className="text-[11px] opacity-80 mt-0.5">{t("login.stat.calls")}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-white/10 backdrop-blur px-4 py-3 border border-white/15">
            <CalendarCheck className="h-4 w-4 opacity-80" />
            <div>
              <div className="text-base font-bold leading-none">38%</div>
              <div className="text-[11px] opacity-80 mt-0.5">{t("login.stat.conv")}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT — Form panel */}
      <section className="relative flex flex-col min-h-screen">
        {/* Top bar (mobile logo + lang switcher) */}
        <div className="flex items-center justify-between p-5 lg:p-6">
          <div className="flex items-center gap-2 lg:invisible">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-elevated">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold">Vocali AI</span>
          </div>
          <LanguageSwitcher />
        </div>

        {/* Form */}
        <div className="flex-1 flex items-center justify-center px-5 pb-10">
          <div className="w-full max-w-md animate-fade-in">
            <div className="mb-8 space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">
                {t("login.welcome")}
              </h2>
              <p className="text-muted-foreground">{t("login.subtitle")}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">
                  {t("login.email")}
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("login.emailPlaceholder")}
                    className="h-11 pl-10 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm">
                  {t("login.password")}
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("login.passwordPlaceholder")}
                    className="h-11 pl-10 pr-11 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl bg-gradient-primary shadow-elevated hover:opacity-95 hover:bg-gradient-primary text-primary-foreground font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("login.signingIn")}
                  </>
                ) : (
                  <>
                    {t("login.submit")}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {t("login.guest.divider")}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <GuestTalk />

            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{t("login.secured")}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
