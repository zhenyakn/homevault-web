import { Loader2, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function price(cents: number, currency: string, interval: string): string {
  if (cents === 0) return "Free";
  const amount = (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: (currency || "ils").toUpperCase(),
  });
  return interval === "none" ? amount : `${amount}/${interval}`;
}

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {used}
        {max != null ? ` / ${max}` : " / ∞"}
      </span>
    </div>
  );
}

export default function Plan() {
  const billing = trpc.billing.current.useQuery();

  if (billing.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const data = billing.data;
  const current = data?.plan;
  const upgrades = data?.availablePlans ?? [];

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plan &amp; usage</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your workspace's current plan and what it includes.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            {current?.name ?? "—"}{" "}
            {current && (
              <Badge variant="secondary" className="ms-1">
                {price(current.priceCents, current.currency, current.interval)}
              </Badge>
            )}
            {data?.status && data.status !== "active" && (
              <Badge variant="destructive" className="ms-1">
                {data.status}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Usage
            label="Properties"
            used={data?.usage.properties ?? 0}
            max={data?.usage.maxProperties ?? null}
          />
          <Usage
            label="Members"
            used={data?.usage.members ?? 0}
            max={data?.usage.maxMembers ?? null}
          />
          {current?.capabilities && current.capabilities.length > 0 && (
            <div className="pt-2 flex flex-wrap gap-1.5">
              {current.capabilities.map(c => (
                <Badge key={c} variant="outline" className="gap-1">
                  <Check className="w-3 h-3" />
                  {c}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {upgrades.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Other plans
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {upgrades.map(p => (
              <Card key={p.key}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    {p.name}
                    <Badge variant="secondary">
                      {price(p.priceCents, p.currency, p.interval)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {p.maxProperties ?? "∞"} properties · {p.maxMembers ?? "∞"}{" "}
                    members
                  </p>
                  {p.isPaid ? (
                    p.checkoutUrl ? (
                      <Button
                        className="w-full"
                        onClick={() => {
                          window.location.href = p.checkoutUrl!;
                        }}
                      >
                        Upgrade
                      </Button>
                    ) : (
                      <Button className="w-full" variant="outline" disabled>
                        Contact us to upgrade
                      </Button>
                    )
                  ) : (
                    <Button className="w-full" variant="outline" disabled>
                      Downgrade via support
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
