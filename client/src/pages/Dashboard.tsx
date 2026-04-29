import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Receipt, Wrench, ShoppingCart, Loader2, MapPin, Settings } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import { useRef, useCallback } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const ACTIVITY_ICONS: Record<string, any> = {
  expense: Receipt, repair: Wrench, upgrade: ShoppingCart,
};
const EVENT_DOT: Record<string, string> = {
  Expense: "bg-blue-500", Repair: "bg-orange-500", Upgrade: "bg-green-500",
  Loan: "bg-purple-500", Other: "bg-zinc-400",
};
const ini = (n?: string | null) =>
  (n ?? "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

export default function Dashboard() {
  const [, nav] = useLocation();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: property } = trpc.property.get.useQuery();
  const { data: events } = trpc.calendar.list.useQuery({});
  const { data: activity, isLoading: actLoading } = trpc.dashboard.recentActivity.useQuery();
  const mapRef = useRef<google.maps.Map | null>(null);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    const lat = property?.latitude ? parseFloat(property.latitude as string) : null;
    const lng = property?.longitude ? parseFloat(property.longitude as string) : null;
    if (lat && lng) {
      const pos = { lat, lng };
      map.setCenter(pos); map.setZoom(15);
      new google.maps.marker.AdvancedMarkerElement({ map, position: pos, title: property?.houseName || "My Home" });
    } else if (property?.address) {
      new google.maps.Geocoder().geocode({ address: property.address }, (res, status) => {
        if (status === "OK" && res?.[0]) {
          map.setCenter(res[0].geometry.location); map.setZoom(15);
          new google.maps.marker.AdvancedMarkerElement({ map, position: res[0].geometry.location, title: property?.houseName || "My Home" });
        }
      });
    }
  }, [property]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  const s = stats || { purchaseTotal: 0, monthlyRecurring: 0, ytdExpenses: 0, pendingRepairs: 0, upgradesSpent: 0, wishlistTotal: 0 };
  const cur = property?.currencyCode ?? "ILS";
  const fmt = (c: number) => formatCurrency(c, cur);
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const upcoming = (events || [])
    .filter((e: any) => { const d = new Date(e.date); return d >= now && d <= in30; })
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">

      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{property?.houseName ?? "My Home"}</h1>
          {property?.address && (
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />{property.address}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => nav("/settings")}>
          <Settings className="h-3.5 w-3.5 mr-1.5" />Settings
        </Button>
      </div>

      {/* KPIs — flat border grid, no elevation */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border border-border rounded-lg divide-y md:divide-y-0 md:divide-x divide-border overflow-hidden">
        {[
          { label: "Total invested",    value: fmt(s.purchaseTotal)    },
          { label: "Monthly recurring", value: fmt(s.monthlyRecurring) },
          { label: "YTD expenses",      value: fmt(s.ytdExpenses)      },
          { label: "Pending repairs",   value: String(s.pendingRepairs) },
          { label: "Upgrades spent",    value: fmt(s.upgradesSpent)    },
          { label: "Wishlist",          value: fmt(s.wishlistTotal)    },
        ].map(({ label, value }) => (
          <div key={label} className="px-4 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Upcoming events */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Upcoming · 30 days</p>
            <button onClick={() => nav("/calendar")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">View calendar →</button>
          </div>
          {upcoming.length === 0 ? (
            <div className="border border-border rounded-lg px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">No upcoming events</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {upcoming.map((event: any) => (
                <div key={event.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="text-center w-10 shrink-0">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{format(new Date(event.date), "MMM")}</p>
                    <p className="text-base font-semibold tabular-nums leading-tight">{format(new Date(event.date), "dd")}</p>
                  </div>
                  <div className={cn("w-1 h-8 rounded-full shrink-0", EVENT_DOT[event.eventType] ?? "bg-zinc-400")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{event.eventType}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        <div>
          <p className="text-sm font-medium mb-3">Location</p>
          {property?.address ? (
            <div className="border border-border rounded-lg overflow-hidden">
              <MapView className="h-[220px]" initialCenter={{ lat: 32.0853, lng: 34.7818 }} initialZoom={14} onMapReady={handleMapReady} />
            </div>
          ) : (
            <div className="border border-border rounded-lg px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Set your address in{" "}
                <button className="underline hover:text-foreground" onClick={() => nav("/settings#property")}>Settings → Property</button>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <p className="text-sm font-medium mb-3">Recent activity</p>
        {actLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !activity || activity.length === 0 ? (
          <div className="border border-border rounded-lg px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">No activity yet. Add an expense, log a repair, or plan an upgrade.</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
            {activity.map((item: any) => {
              const Icon = ACTIVITY_ICONS[item.type] || Receipt;
              return (
                <div key={`${item.type}-${item.id}`} className="flex items-center gap-4 px-4 py-3">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.label}</p>
                    <p className="text-xs text-muted-foreground capitalize">{item.type}</p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[9px]">{ini(item.ownerName)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {item.createdAt ? format(new Date(item.createdAt), "MMM d") : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
