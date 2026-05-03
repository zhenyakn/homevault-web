import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProperty } from "@/contexts/PropertyContext";
import { trpc } from "@/lib/trpc";
import {
  Bell,
  Calendar,
  Check,
  ChevronDown,
  Clock3,
  DatabaseBackup,
  DollarSign,
  FileText,
  HelpCircle,
  Home,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Plus,
  Receipt,
  Search,
  Settings,
  Shield,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: Clock3, label: "Timeline", path: "/timeline" },
  { icon: Receipt, label: "Expenses", path: "/expenses" },
  { icon: Wrench, label: "Repairs", path: "/repairs" },
  { icon: TrendingUp, label: "Upgrades", path: "/upgrades" },
  { icon: DollarSign, label: "Loans", path: "/loans" },
  { icon: FileText, label: "Documents", path: "/documents" },
  { icon: Calendar, label: "Calendar", path: "/calendar" },
  { icon: DatabaseBackup, label: "Backups", path: "/backups" },
  { icon: Shield, label: "Security", path: "/security" },
];

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .map(word => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function PropertySwitcher() {
  const { activePropertyId, switchProperty } = useProperty();
  const { data: properties } = trpc.property.list.useQuery();
  const utils = trpc.useUtils();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  const createMutation = trpc.property.create.useMutation({
    onSuccess: (data: any) => {
      utils.property.list.invalidate();
      if (data?.insertId) switchProperty(data.insertId);
    },
  });

  const activeProperty =
    properties?.find(property => property.id === activePropertyId) ?? properties?.[0];

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await createMutation.mutateAsync({ houseName: newName.trim() });
    setNewName("");
    setShowAdd(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-blue-900 dark:hover:bg-blue-950/20">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
              <Home className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeProperty?.houseName ?? "Lakeview House"}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {activeProperty?.address || "Private property workspace"}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {properties?.map(property => (
            <DropdownMenuItem
              key={property.id}
              onClick={() => switchProperty(property.id)}
              className="cursor-pointer"
            >
              <Home className="mr-2 h-4 w-4 text-blue-500" />
              <span className="flex-1 truncate">{property.houseName}</span>
              {property.id === activePropertyId && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowAdd(true)} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Add property
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add property</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <input
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
              placeholder="Property name"
              value={newName}
              onChange={event => setNewName(event.target.value)}
              onKeyDown={event => event.key === "Enter" && handleAdd()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || createMutation.isPending}>
                {createMutation.isPending ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HomeVaultLogo() {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm">
        <Shield className="h-4 w-4" />
      </div>
      <div>
        <p className="text-base font-bold tracking-tight text-slate-950 dark:text-white">HomeVault</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Self-hosted</p>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
  onSearchOpen,
}: {
  children: ReactNode;
  onSearchOpen?: () => void;
}) {
  const { loading, user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur xl:flex xl:flex-col dark:border-slate-800 dark:bg-slate-950/95">
        <HomeVaultLogo />

        <nav className="mt-8 flex-1 space-y-1">
          {menuItems.map(item => {
            const isActive =
              item.path === "/"
                ? location === "/"
                : location === item.path || location.startsWith(`${item.path}/`);
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-50"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <PropertySwitcher />
          <div className="space-y-1">
            <button
              onClick={() => setLocation("/settings")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-50"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-50">
              <HelpCircle className="h-4 w-4" />
              Help
            </button>
          </div>
        </div>
      </aside>

      <div className="xl:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85 sm:px-6">
          <div className="flex items-center gap-3 xl:hidden">
            <HomeVaultLogo />
          </div>
          <div className="hidden min-w-0 flex-1 xl:block">
            <button
              type="button"
              onClick={onSearchOpen}
              className="relative h-10 w-full max-w-lg rounded-xl border border-slate-200 bg-slate-50 text-left text-sm text-slate-400 transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-950"
            >
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <span className="pl-9">Search HomeVault…</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 sm:flex">
              <Lock className="h-3.5 w-3.5" />
              Private files
            </div>
            <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900">
              <Bell className="h-4 w-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 pr-3 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-emerald-600 text-xs font-bold text-white">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium sm:inline">{user?.name || "Kevin"}</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium">{user?.name || "HomeVault User"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email || "admin@local"}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
