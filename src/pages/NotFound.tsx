import { useLocation, Link, Navigate } from "react-router-dom";
import { useEffect } from "react";

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
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <Link to="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
