import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import Index from "./pages/Index";
import Explore from "./pages/Explore";
import Auth from "./pages/Auth";
import Library from "./pages/Library";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import BookDetail from "./pages/BookDetail";
import Reader from "./pages/Reader";
import Generate from "./pages/Generate";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Support from "./pages/Support";
import Help from "./pages/Help";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import ModerationDashboard from "./pages/ModerationDashboard";
import Pricing from "./pages/Pricing";
import AdminPanel from "./pages/AdminPanel";
import { CookieConsent } from "./components/legal/CookieConsent";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <SubscriptionProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/generate" element={<Generate />} />
              <Route path="/auth" element={<Auth />} />
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
              <Route path="/book/:id" element={<BookDetail />} />
              <Route path="/read/:bookId/:chapterId" element={<Reader />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <CookieConsent />
          </BrowserRouter>
        </TooltipProvider>
      </SubscriptionProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;