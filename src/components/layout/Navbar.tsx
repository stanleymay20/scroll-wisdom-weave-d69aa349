import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, User, Menu, X, Settings, LogOut, HelpCircle, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsAdmin } from "@/hooks/useAdmin";
import logo from "@/assets/logo.png";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { isAdmin } = useIsAdmin();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle();
    if (data) setProfile(data);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out", description: "You have been signed out successfully." });
    navigate("/");
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img src={logo} alt="ScrollLibrary" className="h-10 w-auto" />
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link to="/explore" className="text-muted-foreground hover:text-foreground transition-colors font-medium">{t('nav.explore')}</Link>
            <Link to="/library" className="text-muted-foreground hover:text-foreground transition-colors font-medium">{t('nav.library')}</Link>
            <Link to="/generate" className="text-muted-foreground hover:text-foreground transition-colors font-medium">{t('nav.generate')}</Link>
            <Link to="/about" className="text-muted-foreground hover:text-foreground transition-colors font-medium">{t('footer.about')}</Link>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={() => navigate('/explore')}><Search className="h-5 w-5" /></Button>
            
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar className="h-10 w-10 border border-primary/50">
                      <AvatarImage src={profile?.avatar_url || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary">{getInitials(profile?.full_name)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{profile?.full_name || "User"}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/profile")}><User className="mr-2 h-4 w-4" />{t('nav.profile')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")}><Settings className="mr-2 h-4 w-4" />{t('nav.settings')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/help")}><HelpCircle className="mr-2 h-4 w-4" />{t('footer.help')}</DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate("/admin")}><Shield className="mr-2 h-4 w-4" />Admin Panel</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}><LogOut className="mr-2 h-4 w-4" />{t('nav.signout')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="gold-outline" onClick={() => navigate('/auth')}><User className="h-4 w-4 mr-2" />{t('nav.signin')}</Button>
            )}
          </div>

          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="md:hidden border-t border-border bg-background">
            <div className="container mx-auto px-4 py-4 space-y-3">
              <Link to="/explore" className="block py-2.5 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>{t('nav.explore')}</Link>
              <Link to="/library" className="block py-2.5 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>{t('nav.library')}</Link>
              <Link to="/generate" className="block py-2.5 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>{t('nav.generate')}</Link>
              <Link to="/about" className="block py-2.5 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>{t('footer.about')}</Link>
              <Link to="/help" className="block py-2.5 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>{t('footer.help')}</Link>
              {user ? (
                <>
                  <Link to="/profile" className="block py-2.5 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>{t('nav.profile')}</Link>
                  <Link to="/settings" className="block py-2.5 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>{t('nav.settings')}</Link>
                  {isAdmin && (
                    <Link to="/admin" className="flex items-center gap-2 py-2.5 px-3 text-scroll-gold font-medium rounded-lg hover:bg-scroll-gold/10 transition-colors" onClick={() => setIsMenuOpen(false)}>
                      <Shield className="h-4 w-4" />
                      Admin Panel
                    </Link>
                  )}
                  <Button variant="outline" className="w-full mt-2" onClick={() => { setIsMenuOpen(false); handleSignOut(); }}>{t('nav.signout')}</Button>
                </>
              ) : (
                <Button variant="gold" className="w-full mt-2" onClick={() => { setIsMenuOpen(false); navigate('/auth'); }}>{t('nav.signin')}</Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}