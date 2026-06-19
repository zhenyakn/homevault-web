import React, { createContext, useContext, useEffect, useState } from "react";
import {
  isNavPathVisible,
  nextHiddenSet,
  parseHiddenPaths,
} from "@/lib/sidebarPrefs";

export { ALWAYS_VISIBLE_NAV_PATHS } from "@/lib/sidebarPrefs";

interface SidebarPrefsContextType {
  /** Whether a nav route (by its path) should appear in the sidebar. */
  isVisible: (path: string) => boolean;
  /** Show/hide a nav route. No-op for always-visible routes. */
  setVisible: (path: string, visible: boolean) => void;
}

const SidebarPrefsContext = createContext<SidebarPrefsContextType | undefined>(
  undefined
);

const STORAGE_KEY = "homevault-sidebar-hidden";

export function SidebarPrefsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Stores the set of *hidden* route paths; everything else is visible by
  // default so new sections show up automatically without a migration.
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      return new Set(parseHiddenPaths(localStorage.getItem(STORAGE_KEY)));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(hidden)));
    } catch {
      /* ignore */
    }
  }, [hidden]);

  const isVisible = (path: string) => isNavPathVisible(hidden, path);

  const setVisible = (path: string, visible: boolean) =>
    setHidden(prev => nextHiddenSet(prev, path, visible));

  return (
    <SidebarPrefsContext.Provider value={{ isVisible, setVisible }}>
      {children}
    </SidebarPrefsContext.Provider>
  );
}

export function useSidebarPrefs() {
  const ctx = useContext(SidebarPrefsContext);
  if (!ctx)
    throw new Error("useSidebarPrefs must be used within SidebarPrefsProvider");
  return ctx;
}
