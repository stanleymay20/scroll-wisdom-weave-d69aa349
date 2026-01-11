import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Book, Github, Twitter, Mail } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export const Footer = forwardRef<HTMLElement>(function Footer(_, ref) {
  const { t } = useLanguage();

  return (
    <footer ref={ref} className="border-t border-border/50 bg-background/50 backdrop-blur-sm">
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
              {t('footer.tagline')}
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/contact"
                aria-label="Twitter"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Twitter className="h-5 w-5" />
              </Link>
              <Link
                to="/contact"
                aria-label="GitHub"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github className="h-5 w-5" />
              </Link>
              <a
                href="mailto:support@scrolllibrary.com"
                aria-label="Email"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">{t('footer.library')}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/explore" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('nav.explore')}
                </Link>
              </li>
              <li>
                <Link to="/generate" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('nav.generate')}
                </Link>
              </li>
              <li>
                <Link to="/library" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('nav.library')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">{t('footer.legal')}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('footer.privacy')}
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link to="/support" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('footer.support')}
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('footer.help')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border/50 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>{t('footer.copyright')}</p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground transition-colors">{t('footer.privacy')}</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">{t('footer.terms')}</Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">{t('footer.contact')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
});

Footer.displayName = "Footer";
