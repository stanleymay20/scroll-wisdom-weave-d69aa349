import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackRouteChange } from "@/lib/observability";

/**
 * Emits a structured route-change log on every navigation.
 * Mounted inside <BrowserRouter> so it has access to react-router's location.
 * Renders nothing.
 */
export function RouteTelemetry() {
  const location = useLocation();

  useEffect(() => {
    trackRouteChange(location.pathname);
  }, [location.pathname]);

  return null;
}
