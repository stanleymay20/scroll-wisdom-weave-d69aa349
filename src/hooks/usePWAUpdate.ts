import { useEffect, useState, useCallback } from "react";
import { registerSW } from "virtual:pwa-register";

interface UpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
}

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
let pwaRegistered = false;

function shouldBypassServiceWorker() {
  if (typeof window === "undefined") return true;

  const host = window.location.hostname;
  const path = window.location.pathname;

  return host.includes("lovable.app") || path.startsWith("/auth") || path.startsWith("/~oauth");
}

export function usePWAUpdate() {
  const [updateState, setUpdateState] = useState<UpdateState>({
    needRefresh: false,
    offlineReady: false,
  });

  useEffect(() => {
    if (pwaRegistered || shouldBypassServiceWorker()) return;

    pwaRegistered = true;
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdateState((prev) => ({ ...prev, needRefresh: true }));
      },
      onOfflineReady() {
        setUpdateState((prev) => ({ ...prev, offlineReady: true }));
        console.log("ScrollLibrary ready for offline use");
      },
      onRegisteredSW(swUrl, registration) {
        console.log("Service worker registered:", swUrl);

        if (registration) {
          setInterval(() => {
            registration.update();
          }, 15 * 60 * 1000);
        }
      },
      onRegisterError(error) {
        pwaRegistered = false;
        console.error("Service worker registration error:", error);
      },
    });
  }, []);

  const updateApp = useCallback(() => {
    if (updateSW) {
      updateSW(true);
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

