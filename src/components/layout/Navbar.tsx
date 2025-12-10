import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Book, Search, Library, User, Menu, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-gold rounded-lg blur-md opacity-50 group-hover:opacity-75 transition-opacity" />
              <div className="relative bg-gradient-gold p-2 rounded-lg">
                <Book className="h-5 w-5 text-primary-foreground" />
              </div>
            </div>
            <span className="font-display text-xl font-semibold text-gradient-gold">
              ScrollLibrary
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link 
              to="/explore" 
              className="text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              Explore
            </Link>
            <Link 
              to="/library" 
              className="text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              My Library
            </Link>
            <Link 
              to="/generate" 
              className="text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              Generate Book
            </Link>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/explore')}>
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="gold-outline" onClick={() => navigate('/auth')}>
              <User className="h-4 w-4 mr-2" />
              Sign In
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border bg-background"
          >
            <div className="container mx-auto px-4 py-4 space-y-4">
              <Link 
                to="/explore" 
                className="block py-2 text-foreground font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                Explore Library
              </Link>
              <Link 
                to="/library" 
                className="block py-2 text-foreground font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                My Library
              </Link>
              <Link 
                to="/generate" 
                className="block py-2 text-foreground font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                Generate Book
              </Link>
              <Button 
                variant="gold" 
                className="w-full" 
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/auth');
                }}
              >
                Sign In
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
