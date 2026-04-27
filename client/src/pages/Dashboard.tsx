import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, AlertCircle, Home, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function Dashboard() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  if (!stats) {
    return <div>No data available</div>;
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
            <p className="text-lg font-semibold">{stats.propertyName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Address</p>
            <p className="text-lg font-semibold">{stats.propertyAddress || "Not set"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Purchase Price</p>
            <p className="text-lg font-semibold">{stats.propertyPrice ? formatCurrency(stats.propertyPrice) : "Not set"}</p>
          </div>
        </CardContent>
      </Card>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Purchase Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.purchaseTotal)}</div>
            <p className="text-xs text-muted-foreground mt-1">Acquisition costs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Recurring</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.monthlyRecurring)}</div>
            <p className="text-xs text-muted-foreground mt-1">Regular expenses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">YTD Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.ytdExpenses)}</div>
            <p className="text-xs text-muted-foreground mt-1">Year to date</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upgrades Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.upgradesSpent)}</div>
            <p className="text-xs text-muted-foreground mt-1">Improvements</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Invested</span>
              <span className="font-semibold">{formatCurrency(stats.totalInvested)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Borrowed</span>
              <span className="font-semibold">{formatCurrency(stats.totalBorrowed)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Repaid</span>
              <span className="font-semibold">{formatCurrency(stats.totalRepaid)}</span>
            </div>
            <div className="border-t pt-4 flex justify-between">
              <span className="font-semibold">Outstanding Balance</span>
              <span className="font-bold text-lg">{formatCurrency(stats.totalOwed)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Quick Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pending Repairs</span>
              <span className="font-semibold text-orange-600">{stats.pendingRepairs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Wishlist Items</span>
              <span className="font-semibold">{stats.wishlistTotal ? `${formatCurrency(stats.wishlistTotal)}` : "0"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly Obligation</span>
              <span className="font-semibold">{formatCurrency(stats.monthlyRecurring)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
