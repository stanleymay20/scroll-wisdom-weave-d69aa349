import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { AudioProvider } from "@/contexts/AudioContext";
import { useEffect, Suspense, lazy } from "react";
import { PWAInstallPrompt, OfflineIndicator } from "@/components/pwa";
import { PWAUpdateNotification } from "@/components/pwa/PWAUpdateNotification";
import { ErrorBoundary, SectionErrorBoundary } from "@/components/ErrorBoundary";
import { DiagnosticsPanel } from "@/components/system/DiagnosticsPanel";
import { createLogger, setTraceId } from "@/lib/logger";
import { notifyError } from "@/lib/errorNotifier";
import { SkeletonPage } from "@/components/ui/page-shell";
import { InlineSplash } from "@/components/brand";
import { initContract5 } from "@/lib/contract5";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";

// Eager load critical pages
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import BookDetail from "./pages/BookDetail";

// Lazy load non-critical pages for performance
const Explore = lazy(() => import("./pages/Explore"));
const Library = lazy(() => import("./pages/Library"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
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
const CertificateVerify = lazy(() => import("./pages/CertificateVerify"));
const CertificateStatus = lazy(() => import("./pages/CertificateStatus"));
const Certificates = lazy(() => import("./pages/Certificates"));
const OrganizationVerify = lazy(() => import("./pages/OrganizationVerify"));
const VerificationDocs = lazy(() => import("./pages/VerificationDocs"));
const TrustWhitepaper = lazy(() => import("./pages/TrustWhitepaper"));
const AccountDelete = lazy(() => import("./pages/AccountDelete"));
const CertificateTest = lazy(() => import("./pages/CertificateTest"));
const LaunchChecklist = lazy(() => import("./pages/LaunchChecklist"));
const HowCertificationWorks = lazy(() => import("./pages/HowCertificationWorks"));
const InstitutionalReadiness = lazy(() => import("./pages/InstitutionalReadiness"));
const HealthCheck = lazy(() => import("./pages/HealthCheck"));
const AdminRecovery = lazy(() => import("./pages/AdminRecovery"));
const PMFDashboard = lazy(() => import("./pages/PMFDashboard"));
const AuditDashboard = lazy(() => import("./pages/AuditDashboard"));
const UploadPage = lazy(() => import("./pages/Upload"));
const MasteryDashboard = lazy(() => import("./pages/MasteryDashboard"));
const MasteryModel = lazy(() => import("./pages/MasteryModel"));

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
      onError: (error) => {
        notifyError(error);
      },
    },
  },
});

function AppInitializer() {
  useEffect(() => {
    // Initialize trace ID for session correlation
    setTraceId();
    
    // CONTRACT 5: Initialize performance monitoring
    initContract5();
    
    logger.info('Application initialized');
  }, []);
  return null;
}

const App = () => (
  <ErrorBoundary context="Root">
    <QueryClientProvider client={queryClient}>
      <AppInitializer />
      <LanguageProvider>
        <SubscriptionProvider>
          <SettingsProvider>
            <AudioProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
            <OfflineIndicator />
            <PWAUpdateNotification />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              {/* PERFORMANCE: Use InlineSplash for branded visual feedback during lazy load */}
              <Suspense fallback={<InlineSplash />}>
                <Routes>
                  {/* Critical routes - eager loaded */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  
                  {/* Feature routes - lazy loaded */}
                  <Route path="/explore" element={<Explore />} />
                  <Route path="/generate" element={<ProtectedRoute><Generate /></ProtectedRoute>} />
                  <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                  <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/moderation" element={<AdminRoute><ModerationDashboard /></AdminRoute>} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
                  <Route path="/install" element={<Install />} />
                  <Route path="/pwa-test" element={<PWATest />} />
                  <Route path="/diagnostics" element={<AdminRoute><Diagnostics /></AdminRoute>} />
                  <Route path="/book/:id" element={<BookDetail />} />
                  <Route path="/book/:bookId/certificate" element={<CertificateStatus />} />
                  <Route path="/read/:bookId/:chapterId" element={<Reader />} />
                  <Route path="/certificate/:certificateNumber" element={<CertificateVerify />} />
                  <Route path="/verify" element={<OrganizationVerify />} />
                  <Route path="/docs/verification" element={<VerificationDocs />} />
                  <Route path="/docs/how-certification-works" element={<HowCertificationWorks />} />
                  <Route path="/docs/trust-whitepaper" element={<TrustWhitepaper />} />
                  <Route path="/account/delete" element={<ProtectedRoute><AccountDelete /></ProtectedRoute>} />
                  <Route path="/delete-account" element={<ProtectedRoute><AccountDelete /></ProtectedRoute>} />
                  <Route path="/certificate-test" element={<CertificateTest />} />
                  <Route path="/certificates" element={<Certificates />} />
                  <Route path="/launch-checklist" element={<AdminRoute><LaunchChecklist /></AdminRoute>} />
                  <Route path="/docs/institutional-readiness" element={<InstitutionalReadiness />} />
                  <Route path="/health-check" element={<AdminRoute><HealthCheck /></AdminRoute>} />
                  <Route path="/admin-recovery" element={<ProtectedRoute><AdminRecovery /></ProtectedRoute>} />
                  <Route path="/pmf" element={<AdminRoute><PMFDashboard /></AdminRoute>} />
                  <Route path="/audit-dashboard" element={<AdminRoute><AuditDashboard /></AdminRoute>} />
                  <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
                  <Route path="/dashboard/mastery" element={<ProtectedRoute><MasteryDashboard /></ProtectedRoute>} />
                  <Route path="/docs/mastery-model" element={<MasteryModel />} />
                  
                  {/* 404 - eager loaded */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <PWAInstallPrompt />
              <DiagnosticsPanel />
              <Suspense fallback={null}>
                <CookieConsent />
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </SettingsProvider>
      </SubscriptionProvider>
    </LanguageProvider>
  </QueryClientProvider>
</ErrorBoundary>
);

export default App;