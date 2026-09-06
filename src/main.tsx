import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initGlobalErrorHandlers } from "@/lib/errorNotifier";

interface ScrollLibraryWindow extends Window {
  __removeSplash?: () => void;
}

function getSupabaseProjectRef(): string | null {
  const explicitRef = import.meta.env.VITE_SUPABASE_PROJECT_ID?.trim();
  if (explicitRef) return explicitRef;

  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!url) return null;

  try {
    const [projectRef] = new URL(url).hostname.split('.');
    return projectRef || null;
  } catch {
    return null;
  }
}

initGlobalErrorHandlers();

// Purge only an unparseable auth payload for the active environment.
try {
  const projectRef = getSupabaseProjectRef();
  if (projectRef) {
    const storageKey = `sb-${projectRef}-auth-token`;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        JSON.parse(raw);
      } catch {
        console.warn('[pre-mount] Removing unparseable auth token payload');
        localStorage.removeItem(storageKey);
      }
    }
  }
} catch {
  // localStorage unavailable — let supabase-js handle it.
}

createRoot(document.getElementById("root")!).render(<App />);

requestAnimationFrame(() => {
  (window as ScrollLibraryWindow).__removeSplash?.();
});
