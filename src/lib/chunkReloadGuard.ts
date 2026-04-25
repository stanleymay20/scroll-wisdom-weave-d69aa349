/**
 * CHUNK RELOAD GUARD
 *
 * After a deploy/PWA update, the user's loaded HTML may reference
 * lazy chunks that no longer exist. The browser throws
 * "Importing a module script failed" / "Failed to fetch dynamically imported module".
 *
 * This guard catches those errors globally and triggers a one-shot
 * reload (with a session-storage flag to avoid reload loops).
 */

const RELOAD_FLAG = "sl_chunk_reload_attempted";

const CHUNK_ERROR_PATTERNS = [
  /Importing a module script failed/i,
  /Failed to fetch dynamically imported module/i,
  /Loading chunk \d+ failed/i,
  /Loading CSS chunk \d+ failed/i,
  /error loading dynamically imported module/i,
];

function isChunkError(message: unknown): boolean {
  if (typeof message !== "string") return false;
  return CHUNK_ERROR_PATTERNS.some((rx) => rx.test(message));
}

function tryReload(reason: string) {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) {
      // Already attempted once — give up to avoid loop
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, "1");
    // eslint-disable-next-line no-console
    console.warn("[ChunkGuard] Reloading due to stale chunk:", reason);
    window.location.reload();
  } catch {
    /* noop */
  }
}

export function installChunkReloadGuard() {
  if (typeof window === "undefined") return;

  // Clear flag on successful navigation (next tick)
  setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* noop */
    }
  }, 5_000);

  window.addEventListener("error", (event) => {
    if (isChunkError(event?.message) || isChunkError((event?.error as Error)?.message)) {
      tryReload(event.message);
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const msg = (event?.reason as Error)?.message ?? String(event?.reason ?? "");
    if (isChunkError(msg)) {
      tryReload(msg);
    }
  });
}
