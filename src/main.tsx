import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initGlobalErrorHandlers } from "@/lib/errorNotifier";

// Initialize global error handlers before rendering
initGlobalErrorHandlers();

// PRE-MOUNT: only purge auth payload when JSON itself is unparseable.
// Never remove based on shape — Supabase may evolve token formats and the
// refresh_token can still recover an "odd-looking" session. Persistence is
// expected to last until the user explicitly signs out.
try {
  const STORAGE_KEY = 'sb-dxourcpvgfampcquzaqw-auth-token';
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      JSON.parse(raw);
    } catch {
      console.warn('[pre-mount] Removing unparseable auth token payload');
      localStorage.removeItem(STORAGE_KEY);
    }
  }
} catch {
  // localStorage unavailable (private mode) — let supabase-js handle it.
}

// Service worker registration is now handled by usePWAUpdate hook
// This ensures proper React lifecycle management for update notifications

createRoot(document.getElementById("root")!).render(<App />);

// Remove pre-hydration splash once React has mounted
requestAnimationFrame(() => {
  (window as any).__removeSplash?.();
});
