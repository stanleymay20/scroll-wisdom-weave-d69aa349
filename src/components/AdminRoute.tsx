import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useIsAdmin } from "@/hooks/useAdmin";
import { InlineSplash } from "@/components/brand";
import { toast } from "@/hooks/use-toast";

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isLoading: authLoading } = useSubscription();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const location = useLocation();
  const toastedRef = useRef(false);

  const blocked = !authLoading && !adminLoading && user && !isAdmin;

  useEffect(() => {
    if (blocked && !toastedRef.current) {
      toastedRef.current = true;
      toast({
        title: "Admin access required",
        description: "You don't have permission to view that page.",
        variant: "destructive",
      });
    }
  }, [blocked]);

  if (authLoading || adminLoading) {
    return <InlineSplash />;
  }

  if (!user) {
    return <Navigate to="/auth" state={{ redirectTo: location.pathname }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

