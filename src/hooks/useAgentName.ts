import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_AGENT_NAME = "Matteo";

/**
 * Reads the agent name from app_settings.auto_call.agent_name (single source of truth).
 * Falls back to "Matteo". Subscribes to realtime updates so changes propagate everywhere.
 */
export function useAgentName(): string {
  const [name, setName] = useState<string>(DEFAULT_AGENT_NAME);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "auto_call")
        .maybeSingle();
      if (!active) return;
      const v = (data?.value ?? {}) as { agent_name?: string };
      if (v.agent_name && v.agent_name.trim()) setName(v.agent_name.trim());
    };
    load();

    const channel = supabase
      .channel("app_settings_agent_name")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: "key=eq.auto_call" },
        (payload) => {
          const v = ((payload.new as any)?.value ?? {}) as { agent_name?: string };
          if (v.agent_name && v.agent_name.trim()) setName(v.agent_name.trim());
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return name;
}
