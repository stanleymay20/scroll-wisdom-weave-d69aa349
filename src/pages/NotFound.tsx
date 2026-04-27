import { useLocation, Link, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Home, ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

import { SEO } from "@/components/SEO";
// UUID v4 pattern
const UUID_REGEX = /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

const NotFound = () => {
  const location = useLocation();
  const uuidMatch = location.pathname.match(UUID_REGEX);

  useEffect(() => {
    if (!uuidMatch) {
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    }
  }, [location.pathname, uuidMatch]);

  // If the path is a bare UUID, redirect to /book/:id
  if (uuidMatch) {
    return <Navigate to={`/book/${uuidMatch[1]}`} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SEO
        title="Page Not Found | ScrollLibrary"
        description="The page you're looking for doesn't exist or has been moved."
        noindex
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md mx-auto px-6"
      >
        <div className="text-8xl font-bold text-primary/20 mb-4 font-display">404</div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Page not found</h1>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild>
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/explore">
              <Search className="h-4 w-4 mr-2" />
              Explore Books
            </Link>
          </Button>
          <Button variant="ghost" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
