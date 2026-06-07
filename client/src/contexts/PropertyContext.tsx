import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "hv_active_property_id";

// Routes that render a single property-scoped entity looked up by id. After
// switching property these ids won't exist under the newly selected property,
// so we bounce back to the parent list instead of stranding the user on a
// dead-end "not found" page.
const DETAIL_ROUTE = /^#\/(repairs|upgrades)\/.+/;

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
  const queryClient = useQueryClient();
  const [activePropertyId, setActivePropertyId] =
    useState<number>(getStoredPropertyId);

  const switchProperty = useCallback(
    (id: number) => {
      if (id === getStoredPropertyId()) return;
      localStorage.setItem(STORAGE_KEY, String(id));
      setActivePropertyId(id);

      // If we're on a detail route, leave it for the parent list — the entity
      // in the URL belongs to the previous property and would 404 otherwise.
      const detail = window.location.hash.match(DETAIL_ROUTE);
      if (detail) window.location.hash = `/${detail[1]}`;

      // Refetch every query with the new x-property-id header (read from
      // localStorage on each request) — no full page reload required, which
      // avoids the white flash and keeps the user on their current section.
      queryClient.invalidateQueries();
    },
    [queryClient]
  );

  return (
    <PropertyContext.Provider value={{ activePropertyId, switchProperty }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  return useContext(PropertyContext);
}
