import { type ReactNode } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayoutSkeleton from "./DashboardLayoutSkeleton";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Wraps any route that requires authentication.
 *
 * - While the auth state is loading  → renders the full-page skeleton so
 *   there is no flash of the login redirect.
 * - Once resolved and the user IS authenticated → renders children as-is.
 * - Once resolved and the user is NOT authenticated → redirects to the login
 *   URL via useAuth's built-in redirectOnUnauthenticated mechanism, and
 *   renders the skeleton while the redirect is in-flight so there is no
 *   momentary render of protected content.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth({
    redirectOnUnauthenticated: true,
  });

  if (loading || !isAuthenticated) {
    return <DashboardLayoutSkeleton />;
  }

  return <>{children}</>;
}
