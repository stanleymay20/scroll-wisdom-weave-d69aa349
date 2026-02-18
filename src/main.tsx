import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initGlobalErrorHandlers } from "@/lib/errorNotifier";

// Initialize global error handlers before rendering
initGlobalErrorHandlers();

// Service worker registration is now handled by usePWAUpdate hook
// This ensures proper React lifecycle management for update notifications

createRoot(document.getElementById("root")!).render(<App />);
