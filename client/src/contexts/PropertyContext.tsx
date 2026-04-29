import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const STORAGE_KEY = "hv_active_property_id";

export function getStoredPropertyId(): number {
  const v = localStorage.getItem(STORAGE_KEY);
  return v ? parseInt(v, 10) || 1 : 1;
}

interface PropertyContextType {
  activePropertyId: number;
  switchProperty: (id: number) => void;
}

const PropertyContext = createContext<PropertyContextType>({
  activePropertyId: 1,
  switchProperty: () => {},
});

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [activePropertyId, setActivePropertyId] = useState<number>(getStoredPropertyId);

  const switchProperty = useCallback((id: number) => {
    localStorage.setItem(STORAGE_KEY, String(id));
    setActivePropertyId(id);
    // Reload the page so all tRPC queries re-fetch with the new property header
    window.location.reload();
  }, []);

  return (
    <PropertyContext.Provider value={{ activePropertyId, switchProperty }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  return useContext(PropertyContext);
}
