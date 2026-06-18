import React, { createContext, useContext, useEffect, useState } from "react";
import {
  isNavKeyVisible,
  nextHiddenSet,
  parseHiddenKeys,
} from "@/lib/sidebarPrefs";

export { ALWAYS_VISIBLE_NAV_KEYS } from "@/lib/sidebarPrefs";

interface SidebarPrefsContextType {
  /** Whether a nav item (by its i18n key) should appear in the sidebar. */
  isVisible: (key: string) => boolean;
  /** Show/hide a nav item. No-op for always-visible items. */
  setVisible: (key: string, visible: boolean) => void;
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
  // Stores the set of *hidden* nav keys; everything else is visible by default
  // so new sections show up automatically without a migration.
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      return new Set(parseHiddenKeys(localStorage.getItem(STORAGE_KEY)));
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

  const isVisible = (key: string) => isNavKeyVisible(hidden, key);

  const setVisible = (key: string, visible: boolean) =>
    setHidden(prev => nextHiddenSet(prev, key, visible));

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
