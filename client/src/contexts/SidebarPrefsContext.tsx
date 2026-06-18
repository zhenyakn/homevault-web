import React, { createContext, useContext, useEffect, useState } from "react";

/**
 * Nav items the user can never hide from the hamburger sidebar. Settings must
 * always be reachable so the visibility controls themselves can't lock the user
 * out of the very page that manages them.
 */
export const ALWAYS_VISIBLE_NAV_KEYS = ["nav.settings"] as const;

const ALWAYS_VISIBLE_SET = new Set<string>(ALWAYS_VISIBLE_NAV_KEYS);

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

function readStored(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === "string")
      : [];
  } catch {
    return [];
  }
}

export function SidebarPrefsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Stores the set of *hidden* nav keys; everything else is visible by default
  // so new sections show up automatically without a migration.
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(readStored())
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(hidden)));
    } catch {
      /* ignore */
    }
  }, [hidden]);

  const isVisible = (key: string) =>
    ALWAYS_VISIBLE_SET.has(key) || !hidden.has(key);

  const setVisible = (key: string, visible: boolean) => {
    if (ALWAYS_VISIBLE_SET.has(key)) return;
    setHidden(prev => {
      const next = new Set(prev);
      if (visible) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
