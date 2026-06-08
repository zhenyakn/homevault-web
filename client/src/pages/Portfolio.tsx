import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useProperty } from "@/contexts/PropertyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AddPropertyDialog from "@/components/AddPropertyDialog";
import {
  Building2,
  MapPin,
  Wrench,
  Landmark,
  TrendingUp,
  ArrowRight,
  Plus,
} from "lucide-react";

// Amounts are stored in agorot (integer minor units), so divide by 100 to
// display the major currency unit — mirrors formatCurrency in lib/utils.ts.
function fmt(amount: number, currencyCode: string) {
  const major = amount / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `${currencyCode} ${major.toLocaleString()}`;
  }
}

export default function Portfolio() {
  const { data: properties, isLoading } = trpc.dashboard.portfolio.useQuery();
  const { activePropertyId, switchProperty } = useProperty();
  const [, navigate] = useLocation();
  const [addOpen, setAddOpen] = useState(false);

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
        <p className="text-muted-foreground text-sm">
          Add your first property to get started.
        </p>
        <Button className="mt-2" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add property
        </Button>
        <AddPropertyDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {properties.length}{" "}
          {properties.length === 1 ? "property" : "properties"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {properties.map(prop => {
          const isActive = prop.id === activePropertyId;
          const currency = prop.currencyCode;
          // A freshly-created default property ("My Home") with no details and
          // no activity — prompt the user to set it up instead of showing a
          // wall of zeros (UX-407).
          const isUnconfigured =
            !prop.address &&
            !prop.purchasePrice &&
            prop.monthSpent === 0 &&
            prop.openRepairsCount === 0 &&
            prop.outstandingLoanBalance === 0;

          return (
            <Card
              key={prop.id}
              className={`relative transition-shadow hover:shadow-md ${isActive ? "ring-2 ring-primary" : ""}`}
            >
              {isActive && (
                <Badge
                  className="absolute top-3 right-3 text-xs"
                  variant="default"
                >
                  Active
                </Badge>
              )}
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-start gap-2">
                  <Building2 className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span>
                    {prop.houseNickname || prop.houseName || "Unnamed Property"}
                  </span>
                </CardTitle>
                {prop.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 pl-6">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {prop.address}
                  </p>
                )}
                {prop.propertyType && (
                  <p className="text-xs text-muted-foreground pl-6">
                    {prop.propertyType}
                  </p>
                )}
              </CardHeader>

              <CardContent className="space-y-3">
                {isUnconfigured ? (
                  <div className="rounded-lg border border-dashed border-border p-3 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">
                      This property isn't set up yet.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        switchProperty(prop.id);
                        navigate("/settings");
                      }}
                    >
                      Set up details
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/50 p-2">
                      <TrendingUp className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-xs font-semibold">
                        {fmt(prop.monthSpent, currency)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        This month
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <Wrench className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-xs font-semibold">
                        {prop.openRepairsCount}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Open repairs
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2">
                      <Landmark className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-xs font-semibold">
                        {fmt(prop.outstandingLoanBalance, currency)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Loan balance
                      </p>
                    </div>
                  </div>
                )}

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

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground min-h-[160px]"
        >
          <Plus className="w-6 h-6" />
          <span className="text-sm font-medium">Add new property</span>
        </button>
      </div>

      <AddPropertyDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
