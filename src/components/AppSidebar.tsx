import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  PhoneCall,
  Phone,
  CalendarCheck,
  BarChart3,
  Activity,
  Settings,
  PhoneOutgoing,
  PhoneForwarded,
  Sparkles,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useI18n } from "@/i18n";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { t } = useI18n();

  const items = [
    { titleKey: "nav.dashboard", url: "/", icon: LayoutDashboard },
    { titleKey: "nav.campaigns", url: "/campaigns", icon: Megaphone },
    { titleKey: "nav.contacts", url: "/contacts", icon: Users },
    { titleKey: "nav.calls", url: "/calls", icon: PhoneCall },
    { titleKey: "nav.numbers", url: "/numbers", icon: Phone },
    { titleKey: "nav.meetings", url: "/meetings", icon: CalendarCheck },
    { titleKey: "nav.recall", url: "/recall", icon: PhoneForwarded },
    { titleKey: "nav.analytics", url: "/analytics", icon: BarChart3 },
    { titleKey: "nav.monitoring", url: "/monitoring", icon: Activity },
    { titleKey: "nav.autoCall", url: "/auto-call", icon: PhoneOutgoing },
    { titleKey: "nav.settings", url: "/settings", icon: Settings },
  ];

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="bg-sidebar">
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-elevated">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <div className="text-sm font-bold text-sidebar-foreground">Vocali AI</div>
              <div className="text-[11px] text-muted-foreground">{t("brand.tagline")}</div>
            </div>
          )}
        </div>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>{t("nav.menu")}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active =
                  item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.titleKey}>
                    <SidebarMenuButton asChild className="h-11">
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className={
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                        }
                      >
                        <item.icon className="h-[18px] w-[18px]" />
                        {!collapsed && <span>{t(item.titleKey)}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && (
          <div className="mx-3 mt-auto mb-4 rounded-xl bg-gradient-primary p-4 text-primary-foreground shadow-elevated">
            <div className="text-sm font-semibold">{t("sidebar.help.title")}</div>
            <p className="mt-1 text-xs opacity-90">{t("sidebar.help.desc")}</p>
            <button className="mt-3 w-full rounded-lg bg-white/15 py-2 text-xs font-medium backdrop-blur hover:bg-white/25 transition">
              {t("sidebar.help.cta")}
            </button>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
