import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initGlobalErrorHandlers } from "@/lib/errorNotifier";

// Initialize global error handlers before rendering
initGlobalErrorHandlers();

// PRE-MOUNT: Clear stale/expired Supabase auth tokens BEFORE the client initializes.
// This prevents the auto-refresh mechanism from endlessly retrying with dead tokens.
try {
  const STORAGE_KEY = 'sb-dxourcpvgfampcquzaqw-auth-token';
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    const expiresAt = parsed?.expires_at; // unix seconds
    if (expiresAt && expiresAt < Date.now() / 1000) {
      console.warn('[pre-mount] Removing expired auth token');
      localStorage.removeItem(STORAGE_KEY);
    }
    // Also remove if refresh token looks invalid (too short / missing)
    if (!parsed?.refresh_token || parsed.refresh_token.length < 20) {
      console.warn('[pre-mount] Removing invalid auth token (bad refresh_token)');
      localStorage.removeItem(STORAGE_KEY);
    }
  }
} catch {
  // If parsing fails, nuke the corrupted entry
  try { localStorage.removeItem('sb-dxourcpvgfampcquzaqw-auth-token'); } catch {}
}

// Service worker registration is now handled by usePWAUpdate hook
// This ensures proper React lifecycle management for update notifications

createRoot(document.getElementById("root")!).render(<App />);

// Remove pre-hydration splash once React has mounted
requestAnimationFrame(() => {
  (window as any).__removeSplash?.();
});
