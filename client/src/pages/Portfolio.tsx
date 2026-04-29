import { trpc } from "@/lib/trpc";
import { useProperty } from "@/contexts/PropertyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Wrench, Landmark, TrendingUp, ArrowRight } from "lucide-react";

function fmt(amount: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toLocaleString()}`;
  }
}

export default function Portfolio() {
  const { data: properties, isLoading } = trpc.dashboard.portfolio.useQuery();
  const { activePropertyId, switchProperty } = useProperty();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!properties || properties.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center gap-3">
        <Building2 className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No properties yet</h2>
        <p className="text-muted-foreground text-sm">Add a property from the sidebar to get started.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {properties.length} {properties.length === 1 ? "property" : "properties"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {properties.map(prop => {
          const isActive = prop.id === activePropertyId;
          const currency = prop.currencyCode;

          return (
            <Card
              key={prop.id}
              className={`relative transition-shadow hover:shadow-md ${isActive ? "ring-2 ring-primary" : ""}`}
            >
              {isActive && (
                <Badge className="absolute top-3 right-3 text-xs" variant="default">
                  Active
                </Badge>
              )}
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-start gap-2">
                  <Building2 className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span>{prop.houseNickname || prop.houseName || "Unnamed Property"}</span>
                </CardTitle>
                {prop.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 pl-6">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {prop.address}
                  </p>
                )}
                {prop.propertyType && (
                  <p className="text-xs text-muted-foreground pl-6">{prop.propertyType}</p>
                )}
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <TrendingUp className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xs font-semibold">{fmt(prop.monthSpent, currency)}</p>
                    <p className="text-[10px] text-muted-foreground">This month</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <Wrench className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xs font-semibold">{prop.openRepairsCount}</p>
                    <p className="text-[10px] text-muted-foreground">Open repairs</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <Landmark className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xs font-semibold">{fmt(prop.outstandingLoanBalance, currency)}</p>
                    <p className="text-[10px] text-muted-foreground">Loan balance</p>
                  </div>
                </div>

                {!isActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => switchProperty(prop.id)}
                  >
                    Switch to this property
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
