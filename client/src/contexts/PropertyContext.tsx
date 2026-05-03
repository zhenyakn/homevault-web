import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { trpc } from "@/lib/trpc";

const COOKIE_KEY = "hv_pid";

// ---------------------------------------------------------------------------
// In-memory primary store — survives re-renders, zero-cost reads.
// Cookie is the persistence layer that survives a full page reload.
// localStorage is intentionally NOT used: it is blocked in sandboxed iframes
// (Home Assistant addon environment).
// ---------------------------------------------------------------------------
let _memPropertyId: number | null = null;

function readCookie(): number | null {
  try {
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith(COOKIE_KEY + "="));
    if (!match) return null;
    const v = parseInt(match.split("=")[1], 10);
    return isNaN(v) || v <= 0 ? null : v;
  } catch {
    return null;
  }
}

function writeCookie(id: number) {
  try {
    // Session cookie — no Max-Age so it expires when the tab closes.
    // Use SameSite=Lax which works inside same-origin iframes.
    document.cookie = `${COOKIE_KEY}=${id}; path=/; SameSite=Lax`;
  } catch {
    // Cookie writes can fail in very locked-down environments; the in-memory
    // variable will still carry the correct value for this session.
  }
}

/** Returns the best-known propertyId for the current session. */
export function getStoredPropertyId(): number {
  if (_memPropertyId !== null) return _memPropertyId;
  const fromCookie = readCookie();
  if (fromCookie !== null) {
    _memPropertyId = fromCookie;
    return fromCookie;
  }
  return 1; // safe server-side default; bootstrap hook will correct this
}

function persistPropertyId(id: number) {
  _memPropertyId = id;
  writeCookie(id);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PropertyContextType {
  activePropertyId: number;
  switchProperty: (id: number) => void;
}

const PropertyContext = createContext<PropertyContextType>({
  activePropertyId: 1,
  switchProperty: () => {},
});

/**
 * On mount, fetches the user's real property list from the API and updates
 * the active property id to the first result. This corrects any stale or
 * wrong value that came from a cookie (or the 1-fallback) before the server
 * had a chance to respond.
 */
function useBootstrapProperty(
  setActivePropertyId: (id: number) => void
) {
  const { data: properties } = trpc.property.list.useQuery(undefined, {
    // Only run once on mount; don't refetch in the background.
    staleTime: Infinity,
    retry: 2,
  });

  useEffect(() => {
    if (!properties || properties.length === 0) return;

    const stored = getStoredPropertyId();
    const ownedIds = properties.map((p: { id: number }) => p.id);

    // If the stored id is valid and owned, keep it. Otherwise use the first.
    const resolved = ownedIds.includes(stored) ? stored : ownedIds[0];

    if (resolved !== stored || _memPropertyId === null) {
      persistPropertyId(resolved);
      setActivePropertyId(resolved);
    }
  }, [properties, setActivePropertyId]);
}

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [activePropertyId, setActivePropertyId] = useState<number>(
    getStoredPropertyId
  );

  // Auto-correct the propertyId from the real API response on mount.
  useBootstrapProperty(setActivePropertyId);

  const switchProperty = useCallback((id: number) => {
    persistPropertyId(id);
    setActivePropertyId(id);
    // Reload so all tRPC queries re-fetch with the updated x-property-id header.
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
