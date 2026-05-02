import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Wrench, TrendingUp, DollarSign, CreditCard, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchResultItem } from "../hooks/useSearch";

const TYPE_ICONS: Record<SearchResultItem["type"], React.ReactNode> = {
  expense: <DollarSign className="w-4 h-4" />,
  repair: <Wrench className="w-4 h-4" />,
  upgrade: <TrendingUp className="w-4 h-4" />,
  loan: <CreditCard className="w-4 h-4" />,
  wishlist: <Heart className="w-4 h-4" />,
};

const TYPE_COLORS: Record<SearchResultItem["type"], string> = {
  expense: "text-orange-500 bg-orange-50 dark:bg-orange-950/40",
  repair: "text-red-500 bg-red-50 dark:bg-red-950/40",
  upgrade: "text-blue-500 bg-blue-50 dark:bg-blue-950/40",
  loan: "text-purple-500 bg-purple-50 dark:bg-purple-950/40",
  wishlist: "text-pink-500 bg-pink-50 dark:bg-pink-950/40",
};

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  results: SearchResultItem[];
  isFetching: boolean;
}

export function SearchModal({
  open,
  onClose,
  query,
  onQueryChange,
  results,
  isFetching,
}: SearchModalProps) {
  const [, navigate] = useHashLocation();
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset active index when results change
  useEffect(() => setActiveIdx(0), [results]);

  const go = (item: SearchResultItem) => {
    navigate(item.route);
    onClose();
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIdx]) {
      go(results[activeIdx]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const showEmpty = !isFetching && query.trim().length >= 2 && results.length === 0;
  const showHint = query.trim().length < 2;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-lg p-0 gap-0 overflow-hidden"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Global Search</DialogTitle>

        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          {isFetching ? (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search expenses, repairs, upgrades…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto">
          {showHint && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </p>
          )}

          {showEmpty && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}

          {results.length > 0 && (
            <ul role="listbox">
              {results.map((item, idx) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={idx === activeIdx}
                  onClick={() => go(item)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                    idx === activeIdx
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/50"
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-md shrink-0",
                      TYPE_COLORS[item.type]
                    )}
                  >
                    {TYPE_ICONS[item.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground capitalize shrink-0">
                    {item.type}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-t text-[10px] text-muted-foreground bg-muted/30">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span><kbd className="font-mono">Esc</kbd> close</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
