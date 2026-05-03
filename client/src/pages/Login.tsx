import { useEffect } from "react";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Login page — redirects unauthenticated users to the OAuth provider.
 * Authenticated users are bounced straight to /dashboard.
 */
export default function Login() {
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) {
      window.location.replace("/dashboard");
    } else {
      window.location.href = getLoginUrl();
    }
  }, [isAuthenticated, loading]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    </div>
  );
}
