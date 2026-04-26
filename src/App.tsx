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
import { ErrorBoundaryWithRecovery } from "@/components/ErrorBoundaryWithRecovery";
import { DiagnosticsPanel } from "@/components/system/DiagnosticsPanel";
import { ReEngagementBanner } from "@/components/gamification/ReEngagementBanner";
import { GlobalAudioPlayer } from "@/components/audio/GlobalAudioPlayer";
import { createLogger, setTraceId } from "@/lib/logger";
import { notifyError } from "@/lib/errorNotifier";
import { SkeletonPage } from "@/components/ui/page-shell";
import { InlineSplash } from "@/components/brand";
import { initContract5 } from "@/lib/contract5";
import { installChunkReloadGuard } from "@/lib/chunkReloadGuard";
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
const QuickLearn = lazy(() => import("./pages/QuickLearn"));
const ExperimentReport = lazy(() => import("./pages/ExperimentReport"));
const AdminOps = lazy(() => import("./pages/AdminOps"));
const Organizations = lazy(() => import("./pages/Organizations"));
const OrgAnalytics = lazy(() => import("./pages/OrgAnalytics"));
const VerifyLookup = lazy(() => import("./pages/VerifyLookup"));
const CitationGraph = lazy(() => import("./pages/CitationGraph"));
const StudySession = lazy(() => import("./pages/StudySession"));
const Cognition = lazy(() => import("./pages/Cognition"));
const DataExport = lazy(() => import("./pages/DataExport"));

// Lazy load legal components
const CookieConsent = lazy(() => import("./components/legal/CookieConsent").then(m => ({ default: m.CookieConsent })));
const OnboardingDialog = lazy(() => import("./components/onboarding/OnboardingDialog").then(m => ({ default: m.OnboardingDialog })));

const logger = createLogger('App');

/**
 * Wrap a route element in a recovery-enabled error boundary.
 * Isolates per-page crashes (including dynamic-import failures) so the
 * app shell, audio player, and navigation stay responsive.
 */
const withRecovery = (name: string, node: React.ReactNode): React.ReactElement => (
  <ErrorBoundaryWithRecovery context={`Route:${name}`} maxRetries={2}>
    {node}
  </ErrorBoundaryWithRecovery>
);

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

    // Auto-reload on stale lazy-chunk import failures (after deploys)
    installChunkReloadGuard();

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
              {/* Inner ErrorBoundary keeps page crashes from killing the whole shell */}
              <ErrorBoundary context="Routes">
              <Suspense fallback={<InlineSplash />}>
                <Routes>
                  {/* Critical routes - eager loaded */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  
                  {/* Feature routes - lazy loaded */}
                  <Route path="/explore" element={<Explore />} />
                  <Route path="/generate" element={withRecovery('Generate', <ProtectedRoute><Generate /></ProtectedRoute>)} />
                  <Route path="/library" element={withRecovery('Library', <ProtectedRoute><Library /></ProtectedRoute>)} />
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
                  <Route path="/book/:id" element={withRecovery('BookDetail', <BookDetail />)} />
                  <Route path="/book/:bookId/certificate" element={withRecovery('CertificateStatus', <CertificateStatus />)} />
                  <Route path="/read/:bookId/:chapterId" element={withRecovery('Reader', <Reader />)} />
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
                  <Route path="/upload" element={withRecovery('Upload', <ProtectedRoute><UploadPage /></ProtectedRoute>)} />
                  <Route path="/dashboard/mastery" element={withRecovery('MasteryDashboard', <ProtectedRoute><MasteryDashboard /></ProtectedRoute>)} />
                  <Route path="/docs/mastery-model" element={<MasteryModel />} />
                  <Route path="/quick-learn" element={withRecovery('QuickLearn', <QuickLearn />)} />
                  <Route path="/experiments" element={<AdminRoute><ExperimentReport /></AdminRoute>} />
                  <Route path="/admin/ops" element={<AdminRoute><AdminOps /></AdminRoute>} />
                  <Route path="/organizations" element={<ProtectedRoute><Organizations /></ProtectedRoute>} />
                  <Route path="/organizations/analytics" element={<ProtectedRoute><OrgAnalytics /></ProtectedRoute>} />
                  <Route path="/verify-certificate" element={<VerifyLookup />} />
                  <Route path="/book/:bookId/citation-graph" element={<ProtectedRoute><CitationGraph /></ProtectedRoute>} />
                  <Route path="/study" element={<ProtectedRoute><StudySession /></ProtectedRoute>} />
                  <Route path="/cognition" element={<ProtectedRoute><Cognition /></ProtectedRoute>} />
                  <Route path="/account/data-export" element={<ProtectedRoute><DataExport /></ProtectedRoute>} />
                  
                  {/* 404 - eager loaded */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              </ErrorBoundary>
              <ReEngagementBanner />
              <PWAInstallPrompt />
              <GlobalAudioPlayer />
              <DiagnosticsPanel />
              <Suspense fallback={null}>
                <CookieConsent />
                <OnboardingDialog />
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
            </AudioProvider>
        </SettingsProvider>
      </SubscriptionProvider>
    </LanguageProvider>
  </QueryClientProvider>
</ErrorBoundary>
);

export default App;