import { useCallback, useEffect, useState } from "react";
import { trpc } from "../lib/trpc";
import { useDebounce } from "./useDebounce";
import { useProperty } from "../contexts/PropertyContext";

export type SearchResultItem = {
  id: string;
  type: "expense" | "repair" | "upgrade" | "loan" | "wishlist";
  label: string;
  subtitle: string;
  route: string;
};

function toResultItems(data: ReturnType<typeof trpc.search.global.useQuery>["data"]): SearchResultItem[] {
  if (!data) return [];
  const items: SearchResultItem[] = [];

  for (const r of data.expenses ?? []) {
    items.push({ id: String(r.id), type: "expense", label: r.label, subtitle: r.category ?? "", route: "/expenses" });
  }
  for (const r of data.repairs ?? []) {
    items.push({ id: String(r.id), type: "repair", label: r.label, subtitle: r.status ?? "", route: "/repairs" });
  }
  for (const r of data.upgrades ?? []) {
    items.push({ id: String(r.id), type: "upgrade", label: r.label, subtitle: r.status ?? "", route: "/upgrades" });
  }
  for (const r of data.loans ?? []) {
    items.push({ id: String(r.id), type: "loan", label: r.label, subtitle: r.loanType ?? "", route: "/loans" });
  }
  for (const r of data.wishlist ?? []) {
    items.push({ id: String(r.id), type: "wishlist", label: r.label, subtitle: r.priority ?? "", route: "/wishlist" });
  }

  return items;
}

export function useSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const { activePropertyId } = useProperty();

  const { data, isFetching } = trpc.search.global.useQuery(
    { query: debouncedQuery, propertyId: activePropertyId },
    {
      enabled: debouncedQuery.trim().length >= 2,
      keepPreviousData: true,
      staleTime: 30_000,
    }
  );

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.tagName === "SELECT");
      if (isEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  return {
    open,
    setOpen,
    close,
    query,
    setQuery,
    results: toResultItems(data) as SearchResultItem[],
    isFetching: isFetching && debouncedQuery.trim().length >= 2,
  };
}
