import { useEffect } from "react";
import { RefreshCw, Wifi } from "lucide-react";
import { usePWAUpdate } from "@/hooks/usePWAUpdate";
import { toast } from "sonner";

export function PWAUpdateNotification() {
  const { needRefresh, offlineReady, updateApp, dismissUpdate, dismissOfflineReady } = usePWAUpdate();

  // Show offline ready notification (once, briefly)
  useEffect(() => {
    if (offlineReady) {
      toast.success("Ready for offline reading", {
        icon: <Wifi className="h-4 w-4" />,
        duration: 3000,
        onDismiss: dismissOfflineReady,
        onAutoClose: dismissOfflineReady,
      });
    }
  }, [offlineReady, dismissOfflineReady]);

  // Show update available notification (persistent until acted on)
  useEffect(() => {
    if (needRefresh) {
      toast("A new version is available", {
        id: "pwa-update",
        icon: <RefreshCw className="h-4 w-4" />,
        duration: Infinity, // Persistent - won't auto-dismiss
        action: {
          label: "Update now",
          onClick: updateApp,
        },
        cancel: {
          label: "Later",
          onClick: dismissUpdate,
        },
        onDismiss: dismissUpdate,
      });
    }
  }, [needRefresh, updateApp, dismissUpdate]);

  // This component doesn't render anything - it uses sonner toasts
  return null;
}
