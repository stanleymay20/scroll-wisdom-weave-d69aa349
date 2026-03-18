import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initGlobalErrorHandlers } from "@/lib/errorNotifier";

// Initialize global error handlers before rendering
initGlobalErrorHandlers();

// PRE-MOUNT: only clear obviously corrupted auth payloads.
// Do NOT remove sessions just because the access token is expired — the refresh token can still recover them.
try {
  const STORAGE_KEY = 'sb-dxourcpvgfampcquzaqw-auth-token';
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    const hasUsableShape =
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.access_token === 'string' &&
      typeof parsed.refresh_token === 'string' &&
      parsed.refresh_token.length >= 20;

    if (!hasUsableShape) {
      console.warn('[pre-mount] Removing corrupted auth token payload');
      localStorage.removeItem(STORAGE_KEY);
    }
  }
} catch {
  try { localStorage.removeItem('sb-dxourcpvgfampcquzaqw-auth-token'); } catch {}
}

// Service worker registration is now handled by usePWAUpdate hook
// This ensures proper React lifecycle management for update notifications

createRoot(document.getElementById("root")!).render(<App />);

// Remove pre-hydration splash once React has mounted
requestAnimationFrame(() => {
  (window as any).__removeSplash?.();
});
