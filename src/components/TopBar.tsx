import { useEffect, useRef, useState } from "react";
import { Bell, Search, ChevronDown, Wifi, X, CalendarCheck, PhoneCall, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Notif = {
  id: string;
  vapi_call_id: string;
  customer_name: string | null;
  customer_number: string | null;
  meeting_confirmed: boolean | null;
  meeting_datetime: string | null;
  intent: string | null;
  created_at: string;
};

export function TopBar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [openNotif, setOpenNotif] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [callsToday, setCallsToday] = useState(0);
  const [meetingsToday, setMeetingsToday] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from("call_analyses")
      .select("id,vapi_call_id,customer_name,customer_number,meeting_confirmed,meeting_datetime,intent,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setNotifs((data ?? []) as Notif[]);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const today = (data ?? []).filter((r: any) => new Date(r.created_at) >= todayStart);
    setCallsToday(today.length);
    setMeetingsToday(today.filter((r: any) => r.meeting_confirmed).length);
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setOpenNotif(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && search.trim()) {
      navigate(`/contacts?q=${encodeURIComponent(search.trim())}`);
    }
  };

  const unreadCount = notifs.filter((n) => n.meeting_confirmed).length;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        <div className="hidden md:flex items-center gap-2 rounded-xl bg-muted px-3 py-2 w-72">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder={t("top.search")}
            className="bg-transparent text-sm outline-none placeholder:text-muted-foreground flex-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <div className="hidden lg:flex items-center gap-4 mr-2">
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground">{t("top.callsToday")}</div>
            <div className="text-sm font-bold">{callsToday}</div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground">{t("top.meetings")}</div>
            <div className="text-sm font-bold text-success">{meetingsToday}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse-soft rounded-full bg-success opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
          </span>
          <span className="text-xs font-semibold text-success hidden sm:inline">{t("top.systemOnline")}</span>
          <Wifi className="h-3.5 w-3.5 text-success sm:hidden" />
        </div>

        <LanguageSwitcher />

        <div className="relative" ref={notifRef}>
          <button onClick={() => setOpenNotif((v) => !v)} className="relative rounded-xl p-2 hover:bg-muted transition">
            <Bell className="h-5 w-5 text-muted-foreground" />
            {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />}
          </button>
          {openNotif && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-card shadow-elevated overflow-hidden z-50">
              <div className="flex items-center justify-between border-b border-border p-3">
                <span className="text-sm font-bold">Notifications</span>
                <button onClick={() => setOpenNotif(false)} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifs.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No activity yet.</div>
                ) : notifs.map((n) => (
                  <button key={n.id} onClick={() => { setOpenNotif(false); navigate("/calls"); }}
                    className="w-full text-left flex items-start gap-3 border-b border-border/60 last:border-0 p-3 hover:bg-muted/40 transition">
                    <div className="mt-0.5">
                      {n.meeting_confirmed
                        ? <CalendarCheck className="h-4 w-4 text-success" />
                        : <PhoneCall className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">
                        {n.meeting_confirmed ? "Meeting booked" : `Call ${n.intent ?? "logged"}`}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {n.customer_name || n.customer_number || n.vapi_call_id.slice(0, 8)}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(n.created_at).toLocaleString()}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const email = user?.email ?? "";
  const initials = (email.slice(0, 2) || "U").toUpperCase();
  const name = email.split("@")[0] || "User";

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-muted transition">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground">{initials}</div>
          <div className="hidden md:block text-left">
            <div className="text-sm font-semibold leading-tight truncate max-w-[140px]">{name}</div>
            <div className="text-[11px] text-muted-foreground leading-tight">{t("top.role")}</div>
          </div>
          <ChevronDown className="hidden md:block h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
