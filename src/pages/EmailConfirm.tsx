import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailConfirm() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "done">("loading");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) { setStatus("invalid"); return; }
      const { data } = await supabase
        .from("email_tokens")
        .select("id")
        .eq("token", token)
        .maybeSingle();
      setStatus(data ? "valid" : "invalid");
    })();
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email)) { setError("Please enter a valid email"); return; }
    setSubmitting(true);
    const { data, error: invErr } = await supabase.functions.invoke("submit-email", {
      body: { token, email },
    });
    setSubmitting(false);
    if (invErr || (data as any)?.error) {
      setError((data as any)?.error ?? invErr?.message ?? "Submission failed");
      return;
    }
    setStatus("done");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-elevated p-8">
        {status === "loading" && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        )}

        {status === "invalid" && (
          <div className="text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-base font-semibold">This link has expired or has already been used.</p>
          </div>
        )}

        {status === "done" && (
          <div className="text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <p className="text-lg font-semibold">✅ Thank you! Your email has been saved.</p>
          </div>
        )}

        {status === "valid" && (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <h1 className="text-xl font-bold">Enter your email to confirm your meeting</h1>
              <p className="text-sm text-muted-foreground mt-1">Gransol Media Group</p>
            </div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-primary text-primary-foreground px-4 py-3 font-semibold hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
