import * as React from "react";

// Shared section container used on the list pages (Repairs, Upgrades).
// Wraps a group of rows in a bordered, divided container under an uppercase
// label with a count. When count is 0, an optional `empty` slot is shown
// instead — useful for "no active items" placeholders.

export function ListSection({
  title,
  count,
  extra,
  empty,
  children,
}: {
  title: string;
  count: number;
  extra?: React.ReactNode;
  empty?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {title}
          </h2>
          <span className="text-xs text-muted-foreground">({count})</span>
        </div>
        {extra}
      </div>
      {count === 0 ? (
        empty
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}
