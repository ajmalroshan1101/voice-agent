import { useEffect, useRef, useState } from "react";
import { forwardRef } from "react";
import { Key, Webhook, FileSpreadsheet, Languages, Check, BookOpen, Upload, Loader2 } from "lucide-react";
import { useI18n, Lang } from "@/i18n";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SettingCard = forwardRef<HTMLDivElement, {
  icon: any; title: string; description: string; children: React.ReactNode;
}>(function SettingCard({ icon: Icon, title, description, children }, ref) {
  return (
    <div ref={ref} className="rounded-2xl border border-border/60 bg-card p-6 shadow-card">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold">{title}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
});

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const [webhook, setWebhook] = useState("");
  const [saved, setSaved] = useState(false);

  // Knowledge base state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kbLoading, setKbLoading] = useState(true);
  const [kbFileName, setKbFileName] = useState<string | null>(null);
  const [kbUpdatedAt, setKbUpdatedAt] = useState<string | null>(null);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbStatus, setKbStatus] = useState<"idle" | "success" | "error">("idle");
  const [kbError, setKbError] = useState<string | null>(null);

  useEffect(() => {
    const w = localStorage.getItem("make_webhook_url");
    if (w) setWebhook(w);
    loadKb();
  }, []);

  const loadKb = async () => {
    setKbLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("knowledge_base_file_name, knowledge_base_updated_at")
      .eq("key", "knowledge_base")
      .maybeSingle();
    setKbFileName((data as any)?.knowledge_base_file_name ?? null);
    setKbUpdatedAt((data as any)?.knowledge_base_updated_at ?? null);
    setKbLoading(false);
  };

  const handleKbFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["txt", "pdf", "docx"].includes(ext || "")) {
      toast.error("Only .txt, .pdf, or .docx files are allowed");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File exceeds 50MB limit");
      return;
    }
    setKbUploading(true);
    setKbStatus("idle");
    setKbError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data, error } = await supabase.functions.invoke("update-knowledge-base", { body: fd });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Upload failed");
      }
      setKbStatus("success");
      setKbFileName((data as any).file_name);
      setKbUpdatedAt((data as any).updated_at);
      toast.success("Knowledge base updated");
    } catch (err: any) {
      setKbStatus("error");
      setKbError(err?.message ?? "Upload failed");
      toast.error("Upload failed");
    } finally {
      setKbUploading(false);
    }
  };

  const save = () => {
    localStorage.setItem("make_webhook_url", webhook);
    setSaved(true);
    toast.success("Settings saved locally. The Make.com webhook used by AI calls is configured server-side.");
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">{t("set.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("set.subtitle")}</p>
      </div>

      <SettingCard icon={Key} title={t("set.vapi")} description={t("set.vapiDesc")}>
        <input
          type="password"
          placeholder="vapi_xxxxxxxxxxxxxxxxxx"
          defaultValue="vapi_••••••••••••••••"
          className="w-full rounded-xl border border-border bg-background p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-2 flex items-center gap-1.5 text-xs text-success">
          <Check className="h-3.5 w-3.5" /> {t("set.connected")}
        </div>
      </SettingCard>

      <SettingCard icon={BookOpen} title="Knowledge Base" description="The document the AI calling agent uses to answer questions on every call.">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.pdf,.docx"
          className="hidden"
          onChange={handleKbFile}
        />
        <div className="rounded-xl border border-border p-3">
          {kbLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : kbFileName ? (
            <div>
              <div className="text-sm font-semibold truncate">{kbFileName}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Last uploaded: {kbUpdatedAt ? new Date(kbUpdatedAt).toLocaleString() : "—"}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No knowledge base file uploaded yet.</div>
          )}
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={kbUploading}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated hover:opacity-95 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {kbUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading and applying...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload New File
            </>
          )}
        </button>

        {kbStatus === "success" && (
          <div className="mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            Knowledge base updated — all future calls will use the new file
          </div>
        )}
        {kbStatus === "error" && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Upload failed — please try again{kbError ? ` (${kbError})` : ""}
          </div>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          Uploading a new file replaces the current one. All future calls will use the updated knowledge base immediately. Accepted: .txt, .pdf, .docx (max 50MB).
        </p>
      </SettingCard>

      <SettingCard icon={Webhook} title={t("set.webhook")} description={t("set.webhookDesc")}>
        <input
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="https://hook.eu1.make.com/..."
          className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          The active Make.com webhook is stored as a server secret (MAKE_WEBHOOK_URL). To change it, update the secret in your backend settings.
        </p>
      </SettingCard>

      <SettingCard icon={FileSpreadsheet} title={t("set.sheets")} description={t("set.sheetsDesc")}>
        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <div>
            <div className="text-sm font-semibold">{t("set.connectedAccount")}</div>
            <div className="text-xs text-muted-foreground">marco.rossi@gmail.com</div>
          </div>
          <button onClick={() => toast.message("Google Sheets is not connected yet — coming soon.")}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
            {t("set.disconnect")}
          </button>
        </div>
      </SettingCard>

      <SettingCard icon={Languages} title={t("set.lang")} description={t("set.langDesc")}>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="en">English 🇬🇧</option>
          <option value="it">Italiano 🇮🇹</option>
        </select>
      </SettingCard>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={() => { setWebhook(localStorage.getItem("make_webhook_url") ?? ""); toast.message("Reverted"); }}
          className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted">
          {t("set.cancel")}
        </button>
        <button onClick={save} className="rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated hover:opacity-95 transition">
          {saved ? t("set.saved") : t("set.save")}
        </button>
      </div>
    </div>
  );
}
