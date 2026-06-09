import React, { createContext, useContext, useEffect, useState } from "react";

interface HomeVaultUIContextType {
  /** Whether the opt-in HomeVault personal-premium UI is enabled. */
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  toggle: () => void;
}

const HomeVaultUIContext = createContext<HomeVaultUIContextType | undefined>(
  undefined
);

const STORAGE_KEY = "homevault-ui";

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function HomeVaultUIProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defaults to false — the original design stays the default experience.
  const [enabled, setEnabledState] = useState<boolean>(() => readStored());

  useEffect(() => {
    document.documentElement.classList.toggle("hv-ui", enabled);
  }, [enabled]);

  const setEnabled = (next: boolean) => {
    setEnabledState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <HomeVaultUIContext.Provider
      value={{ enabled, setEnabled, toggle: () => setEnabled(!enabled) }}
    >
      {children}
    </HomeVaultUIContext.Provider>
  );
}

export function useHomeVaultUI() {
  const ctx = useContext(HomeVaultUIContext);
  if (!ctx)
    throw new Error("useHomeVaultUI must be used within HomeVaultUIProvider");
  return ctx;
}
