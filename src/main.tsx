import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// Register service worker for PWA installation
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, r) {
    console.log('SW registered:', swUrl);
    // Check for updates every hour
    r && setInterval(() => {
      r.update();
    }, 60 * 60 * 1000);
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

createRoot(document.getElementById("root")!).render(<App />);
