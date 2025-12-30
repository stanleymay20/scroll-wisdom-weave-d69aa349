import { useEffect, useState, useCallback } from "react";
import { registerSW } from "virtual:pwa-register";

interface UpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
}

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

export function usePWAUpdate() {
  const [updateState, setUpdateState] = useState<UpdateState>({
    needRefresh: false,
    offlineReady: false,
  });

  useEffect(() => {
    // Only register once
    if (updateSW) return;

    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // New content available - show non-blocking notification
        setUpdateState((prev) => ({ ...prev, needRefresh: true }));
      },
      onOfflineReady() {
        // App ready to work offline
        setUpdateState((prev) => ({ ...prev, offlineReady: true }));
        console.log("ScrollLibrary ready for offline use");
      },
      onRegisteredSW(swUrl, registration) {
        console.log("Service worker registered:", swUrl);
        
        // Check for updates every hour (silent background check)
        if (registration) {
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);
        }
      },
      onRegisterError(error) {
        console.error("Service worker registration error:", error);
      },
    });
  }, []);

  const updateApp = useCallback(() => {
    if (updateSW) {
      updateSW(true); // Reload page to apply update
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setUpdateState((prev) => ({ ...prev, needRefresh: false }));
  }, []);

  const dismissOfflineReady = useCallback(() => {
    setUpdateState((prev) => ({ ...prev, offlineReady: false }));
  }, []);

  return {
    needRefresh: updateState.needRefresh,
    offlineReady: updateState.offlineReady,
    updateApp,
    dismissUpdate,
    dismissOfflineReady,
  };
}
