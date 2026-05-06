import { useEffect } from "react";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { LogIn, Home, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Login() {
  const { isAuthenticated, loading } = useAuth();
  const oauthUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const isOAuthConfigured = Boolean(oauthUrl && appId);

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) window.location.replace("/dashboard");
  }, [isAuthenticated, loading]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 mb-4 shadow-lg">
            <Home className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">HomeVault</h1>
          <p className="text-muted-foreground mt-2">Your property, fully managed</p>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border p-8 space-y-6">
          {isOAuthConfigured ? (
            <>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-semibold">Welcome back</h2>
                <p className="text-sm text-muted-foreground">Sign in to access your property dashboard</p>
              </div>
              <Button className="w-full h-11 text-base" onClick={() => { window.location.href = getLoginUrl(); }}>
                <LogIn className="w-4 h-4 mr-2" />
                Sign in
              </Button>
            </>
          ) : import.meta.env.DEV ? (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-semibold">Local Development</h2>
                <p className="text-sm text-muted-foreground">Sign in with the built-in dev account</p>
              </div>
              <Button
                className="w-full h-11 text-base"
                onClick={async () => {
                  await fetch("api/dev/login", { method: "POST" });
                  window.location.reload();
                }}
              >
                <LogIn className="w-4 h-4 mr-2" />
                Dev Login
              </Button>
              <p className="text-xs text-muted-foreground text-center">Only available in development mode</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Authentication not configured</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Add <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">VITE_OAUTH_PORTAL_URL</code> and <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">VITE_APP_ID</code> to your .env file.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
