import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { useEffect, Suspense, lazy } from "react";
import { PWAInstallPrompt, OfflineIndicator } from "@/components/pwa";
import { PWAUpdateNotification } from "@/components/pwa/PWAUpdateNotification";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { createLogger, setTraceId } from "@/lib/logger";
import { Loader2 } from "lucide-react";

// Eager load critical pages
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy load non-critical pages for performance
const Explore = lazy(() => import("./pages/Explore"));
const Library = lazy(() => import("./pages/Library"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const BookDetail = lazy(() => import("./pages/BookDetail"));
const Reader = lazy(() => import("./pages/Reader"));
const Generate = lazy(() => import("./pages/Generate"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Support = lazy(() => import("./pages/Support"));
const Help = lazy(() => import("./pages/Help"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const ModerationDashboard = lazy(() => import("./pages/ModerationDashboard"));
const Pricing = lazy(() => import("./pages/Pricing"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const Install = lazy(() => import("./pages/Install"));
const PWATest = lazy(() => import("./pages/PWATest"));
const Diagnostics = lazy(() => import("./pages/Diagnostics"));

// Lazy load legal components
const CookieConsent = lazy(() => import("./components/legal/CookieConsent").then(m => ({ default: m.CookieConsent })));

const logger = createLogger('App');

// Configure QueryClient with enterprise settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false, // Reduce unnecessary refetches
    },
    mutations: {
      retry: 1,
    },
  },
});

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function ThemeInitializer() {
  useEffect(() => {
    const themeMode = localStorage.getItem('theme-mode') || 'dark';
    const colorTheme = localStorage.getItem('color-theme') || 'gold';
    
    if (themeMode === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', colorTheme);
    }
    
    // Initialize trace ID for session correlation
    setTraceId();
    logger.info('Application initialized', { themeMode, colorTheme });
  }, []);
  return null;
}

const App = () => (
  <ErrorBoundary context="Root">
    <QueryClientProvider client={queryClient}>
      <ThemeInitializer />
      <LanguageProvider>
        <SubscriptionProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <OfflineIndicator />
            <PWAUpdateNotification />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Critical routes - eager loaded */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  
                  {/* Feature routes - lazy loaded */}
                  <Route path="/explore" element={<Explore />} />
                  <Route path="/generate" element={<Generate />} />
                  <Route path="/library" element={<Library />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/support" element={<Support />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/moderation" element={<ModerationDashboard />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/admin" element={<AdminPanel />} />
                  <Route path="/install" element={<Install />} />
                  <Route path="/pwa-test" element={<PWATest />} />
                  <Route path="/diagnostics" element={<Diagnostics />} />
                  <Route path="/book/:id" element={<BookDetail />} />
                  <Route path="/read/:bookId/:chapterId" element={<Reader />} />
                  
                  {/* 404 - eager loaded */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <PWAInstallPrompt />
              <Suspense fallback={null}>
                <CookieConsent />
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </SubscriptionProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;