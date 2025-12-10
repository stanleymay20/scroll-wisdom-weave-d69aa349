import { Link } from "react-router-dom";
import { Book, Github, Twitter, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-background/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-3 mb-4">
              <div className="bg-gradient-gold p-2 rounded-lg">
                <Book className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-semibold text-gradient-gold">
                ScrollLibrary
              </span>
            </Link>
            <p className="text-muted-foreground text-sm max-w-sm mb-4">
              The world's first AI-powered infinite library. Generate unlimited books 
              with scroll-aligned accuracy and academic rigor.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-muted-foreground hover:text-scroll-gold transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-scroll-gold transition-colors">
                <Github className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-scroll-gold transition-colors">
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Library</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/explore" className="text-muted-foreground hover:text-scroll-gold transition-colors">
                  Explore Books
                </Link>
              </li>
              <li>
                <Link to="/generate" className="text-muted-foreground hover:text-scroll-gold transition-colors">
                  Generate Book
                </Link>
              </li>
              <li>
                <Link to="/library" className="text-muted-foreground hover:text-scroll-gold transition-colors">
                  My Library
                </Link>
              </li>
          </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/privacy" className="text-muted-foreground hover:text-scroll-gold transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-muted-foreground hover:text-scroll-gold transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/support" className="text-muted-foreground hover:text-scroll-gold transition-colors">
                  Support
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-muted-foreground hover:text-scroll-gold transition-colors">
                  Help Center
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border/50 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} ScrollLibrary™. Scroll-aligned wisdom for the ages.</p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-scroll-gold transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-scroll-gold transition-colors">Terms</Link>
            <Link to="/contact" className="hover:text-scroll-gold transition-colors">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
