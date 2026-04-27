import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, AlertCircle, Home, DollarSign, Zap, Heart, ShoppingCart } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

export default function Dashboard() {
  const { data: stats, isLoading, error } = trpc.dashboard.stats.useQuery();

  // Fallback data for display
  const displayStats = stats || {
    propertyName: "My Home",
    propertyAddress: "Loading...",
    propertyPrice: 0,
    purchaseTotal: 0,
    monthlyRecurring: 0,
    ytdExpenses: 0,
    pendingRepairs: 0,
    upgradesSpent: 0,
    wishlistTotal: 0,
  };

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">Welcome to HomeVault. Here's your property overview.</p>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Error loading dashboard</p>
                <p className="text-sm text-red-700 mt-1">{error.message}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
            <p className="text-lg font-semibold">{isLoading ? "Loading..." : displayStats.propertyName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Address</p>
            <p className="text-lg font-semibold">{isLoading ? "Loading..." : displayStats.propertyAddress || "Not set"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Purchase Price</p>
            <p className="text-lg font-semibold">{isLoading ? "Loading..." : displayStats.propertyPrice ? formatCurrency(displayStats.propertyPrice) : "Not set"}</p>
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
            <div className="text-2xl font-bold">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : formatCurrency(displayStats.purchaseTotal)}
            </div>
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
            <div className="text-2xl font-bold">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : formatCurrency(displayStats.monthlyRecurring)}
            </div>
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
            <div className="text-2xl font-bold">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : formatCurrency(displayStats.ytdExpenses)}
            </div>
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
            <div className="text-2xl font-bold">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : displayStats.pendingRepairs}
            </div>
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
            <div className="text-2xl font-bold">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : formatCurrency(displayStats.upgradesSpent)}
            </div>
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
            <div className="text-2xl font-bold">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : formatCurrency(displayStats.wishlistTotal)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Dream improvements</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Get started by adding your first expense, repair, or upgrade from the navigation menu.</p>
        </CardContent>
      </Card>
    </div>
  );
}
