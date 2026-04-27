import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TrendingUp, AlertCircle, Home, DollarSign, Zap, ShoppingCart, Heart, Loader2, CalendarDays, MapPin, Users, Receipt, Wrench } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import { useRef, useCallback } from "react";
import { format } from "date-fns";

const ACTIVITY_ICONS: Record<string, any> = {
  expense: Receipt,
  repair: Wrench,
  upgrade: ShoppingCart,
};

const ACTIVITY_COLORS: Record<string, string> = {
  expense: "bg-blue-100 text-blue-600",
  repair: "bg-orange-100 text-orange-600",
  upgrade: "bg-green-100 text-green-600",
};

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function RecentActivitySection() {
  const { data: activity, isLoading } = trpc.dashboard.recentActivity.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin w-5 h-5" />
      </div>
    );
  }

  if (!activity || activity.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p>No recent activity yet. Start adding expenses, repairs, or upgrades.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activity.map((item: any) => {
        const Icon = ACTIVITY_ICONS[item.type] || Receipt;
        const colorClass = ACTIVITY_COLORS[item.type] || "bg-gray-100 text-gray-600";
        return (
          <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 p-3 rounded-lg border">
            <div className={`p-2 rounded-lg ${colorClass}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.label}</p>
              <p className="text-sm text-muted-foreground capitalize">{item.type}</p>
            </div>
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[9px]">
                  {getInitials(item.ownerName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">
                {item.createdAt ? format(new Date(item.createdAt), "MMM d") : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: property } = trpc.property.get.useQuery();
  const { data: events } = trpc.calendar.list.useQuery({});
  const mapRef = useRef<google.maps.Map | null>(null);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    // If property has an address, geocode it
    if (property?.address) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: property.address }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          map.setCenter(results[0].geometry.location);
          map.setZoom(16);
          new google.maps.marker.AdvancedMarkerElement({
            map,
            position: results[0].geometry.location,
            title: property.houseName || "My Home",
          });
        }
      });
    }
  }, [property?.address, property?.houseName]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  const s = stats || {
    purchaseTotal: 0,
    monthlyRecurring: 0,
    ytdExpenses: 0,
    pendingRepairs: 0,
    upgradesSpent: 0,
    wishlistTotal: 0,
  };
  const prop = property || { houseName: "My Home", address: "", purchasePrice: 0 };

  // Get upcoming events (next 30 days)
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const upcomingEvents = (events || [])
    .filter((e: any) => {
      const eventDate = new Date(e.date);
      return eventDate >= now && eventDate <= thirtyDaysFromNow;
    })
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Welcome to HomeVault. Here's your property overview.</p>
      </div>

      {/* Property Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="w-5 h-5" />
            Property Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Property Name</p>
            <p className="text-lg font-semibold">{prop.houseName || "My Home"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Address</p>
            <p className="text-lg font-semibold">{prop.address || "Not set"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Purchase Price</p>
            <p className="text-lg font-semibold">{prop.purchasePrice ? formatCurrency(prop.purchasePrice) : "Not set"}</p>
          </div>
        </CardContent>
      </Card>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Purchase Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(s.purchaseTotal)}</div>
            <p className="text-xs text-muted-foreground mt-1">Acquisition costs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Monthly Recurring
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(s.monthlyRecurring)}</div>
            <p className="text-xs text-muted-foreground mt-1">Regular expenses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              YTD Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(s.ytdExpenses)}</div>
            <p className="text-xs text-muted-foreground mt-1">Year to date</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Pending Repairs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.pendingRepairs}</div>
            <p className="text-xs text-muted-foreground mt-1">Items</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Upgrades Spent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(s.upgradesSpent)}</div>
            <p className="text-xs text-muted-foreground mt-1">In progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Heart className="w-4 h-4" />
              Wishlist Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(s.wishlistTotal)}</div>
            <p className="text-xs text-muted-foreground mt-1">Dream improvements</p>
          </CardContent>
        </Card>
      </div>

      {/* Two-column layout: Upcoming Events + Map */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Events */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Upcoming Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No upcoming events in the next 30 days.</p>
                <Button variant="outline" className="mt-3" onClick={() => setLocation("/calendar")}>
                  View Calendar
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((event: any) => (
                  <div key={event.id} className="flex items-center gap-3 p-3 rounded-lg border">
                    <div className="text-center min-w-[50px]">
                      <p className="text-xs text-muted-foreground">{format(new Date(event.date), "MMM")}</p>
                      <p className="text-lg font-bold">{format(new Date(event.date), "dd")}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{event.title}</p>
                      <p className="text-sm text-muted-foreground capitalize">{event.type}</p>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full mt-2" onClick={() => setLocation("/calendar")}>
                  View All Events
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Google Map */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Property Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            {prop.address ? (
              <MapView
                className="h-[300px] rounded-lg overflow-hidden"
                initialCenter={{ lat: 32.0853, lng: 34.7818 }}
                initialZoom={14}
                onMapReady={handleMapReady}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground h-[300px] flex flex-col items-center justify-center border rounded-lg">
                <MapPin className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>Set your property address in Settings to see it on the map.</p>
                <Button variant="outline" className="mt-3" onClick={() => setLocation("/property-settings")}>
                  Go to Settings
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Household Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Recent Household Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecentActivitySection />
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">Get started by managing your home finances:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button 
              variant="outline" 
              onClick={() => setLocation("/expenses")}
              className="w-full"
            >
              Add Expense
            </Button>
            <Button 
              variant="outline"
              onClick={() => setLocation("/repairs")}
              className="w-full"
            >
              Log Repair
            </Button>
            <Button 
              variant="outline"
              onClick={() => setLocation("/upgrades")}
              className="w-full"
            >
              Plan Upgrade
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
