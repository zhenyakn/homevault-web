import { useCallback, useEffect, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import { useDebounce } from "./useDebounce";
import { useProperty } from "../contexts/PropertyContext";

export type SearchResultItem = {
  id: string;
  type: "expense" | "repair" | "upgrade" | "loan" | "wishlist" | "purchaseCost";
  label: string;
  subtitle: string;
  route: string;
};

type SearchData = ReturnType<typeof trpc.search.global.useQuery>["data"];

function toResultItems(data: SearchData): SearchResultItem[] {
  if (!data) return [];
  const items: SearchResultItem[] = [];

  for (const r of data.expenses ?? []) {
    items.push({
      id: String(r.id),
      type: "expense",
      label: r.label,
      subtitle: r.category ?? "",
      route: "/expenses",
    });
  }
  for (const r of data.repairs ?? []) {
    items.push({
      id: String(r.id),
      type: "repair",
      label: r.label,
      subtitle: r.status ?? "",
      route: "/repairs",
    });
  }
  for (const r of data.upgrades ?? []) {
    items.push({
      id: String(r.id),
      type: "upgrade",
      label: r.label,
      subtitle: r.status ?? "",
      route: "/upgrades",
    });
  }
  for (const r of data.loans ?? []) {
    items.push({
      id: String(r.id),
      type: "loan",
      label: r.label,
      subtitle: r.loanType ?? "",
      route: "/loans",
    });
  }
  for (const r of data.wishlist ?? []) {
    items.push({
      id: String(r.id),
      type: "wishlist",
      label: r.label,
      subtitle: r.priority ?? "",
      route: "/wishlist",
    });
  }
  for (const r of data.purchaseCosts ?? []) {
    items.push({
      id: String(r.id),
      type: "purchaseCost",
      label: r.label,
      subtitle: r.date ?? "",
      route: "/purchase-costs",
    });
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
      // keepPreviousData was removed in TanStack Query v5.
      // Use placeholderData with the keepPreviousData helper instead so
      // stale results are shown while a new fetch is in flight.
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    }
  );

  // ⌘K / Ctrl+K — open from anywhere except inside text inputs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "k") return;
      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.tagName === "SELECT");
      if (isEditable) return;
      e.preventDefault();
      setOpen((v) => !v);
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
    results: toResultItems(data),
    isFetching: isFetching && debouncedQuery.trim().length >= 2,
  };
}
