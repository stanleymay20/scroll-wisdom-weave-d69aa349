import { Navigate, useLocation } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { InlineSplash } from "@/components/brand";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useSubscription();
  const location = useLocation();

  if (isLoading) {
    return <InlineSplash />;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ redirectTo: location.pathname }} replace />;
  }

  return <>{children}</>;
}
