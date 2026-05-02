import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "../lib/trpc";
import { useDebounce } from "./useDebounce";

export type SearchResultItem = {
  id: string;
  type: "expense" | "repair" | "upgrade" | "loan" | "wishlist";
  label: string;
  subtitle: string;
  route: string;
};

export function useSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);

  const { data, isFetching } = trpc.search.query.useQuery(
    { q: debouncedQuery },
    {
      enabled: debouncedQuery.trim().length >= 2,
      keepPreviousData: true,
      staleTime: 30_000,
    }
  );

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
    results: (data?.results ?? []) as SearchResultItem[],
    isFetching: isFetching && debouncedQuery.trim().length >= 2,
  };
}
