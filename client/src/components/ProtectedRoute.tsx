import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <DashboardLayoutSkeleton />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
