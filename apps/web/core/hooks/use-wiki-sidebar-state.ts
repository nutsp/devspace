import { useCallback, useEffect, useState } from "react";
import type { SetStateAction } from "react";
import { defaultWikiSidebarState, parseWikiSidebarState } from "@/helpers/wiki-sidebar-state";
import type { WikiSidebarState } from "@/helpers/wiki-sidebar-state";

export function useWikiSidebarState(key: string | null) {
  const [snapshot, setSnapshot] = useState<{ key: string | null; state: WikiSidebarState; restored: boolean }>(() => ({
    key: null,
    state: defaultWikiSidebarState(),
    restored: false,
  }));
  // Hydrate after mounting, before writing, to avoid SSR mismatch or overwriting saved preferences.
  useEffect(() => {
    if (!key) return;
    let saved: WikiSidebarState | undefined;
    try {
      saved = parseWikiSidebarState(window.localStorage.getItem(key));
    } catch {
      // Browser privacy settings may disable storage; the sidebar still works in memory.
    }
    setSnapshot({ key, state: saved ?? defaultWikiSidebarState(), restored: !!saved });
  }, [key]);

  useEffect(() => {
    if (!key || snapshot.key !== key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(snapshot.state));
    } catch {
      // Keep the current session usable when storage is unavailable or full.
    }
  }, [key, snapshot]);

  const update = useCallback(
    (action: SetStateAction<WikiSidebarState>) => {
      if (!key) return;
      setSnapshot((previous) =>
        previous.key !== key
          ? previous
          : {
              ...previous,
              state: typeof action === "function" ? action(previous.state) : action,
            }
      );
    },
    [key]
  );

  return {
    state: snapshot.key === key ? snapshot.state : defaultWikiSidebarState(),
    ready: !!key && snapshot.key === key,
    restored: snapshot.key === key && snapshot.restored,
    update,
  };
}
