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
    let mounted = true;
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const newUser = session?.user ?? null;
      // Only update if user actually changed
      if (newUser?.id !== user?.id) {
        setUser(newUser);
        if (newUser) fetchProfile(newUser.id);
        else setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
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
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/30 bg-background/90 backdrop-blur-xl shadow-sm pt-[env(safe-area-inset-top)]">
      <div className="container mx-auto px-4">
        <div className="flex h-14 md:h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img src={logo} alt="ScrollLibrary" className="h-9 w-auto md:h-11 lg:h-12 transition-transform group-hover:scale-105" />
          </Link>

          <div className="hidden md:flex items-center gap-6 lg:gap-8">
            <Link to="/explore" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">{t('nav.explore')}</Link>
            <Link to="/library" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">{t('nav.library')}</Link>
            <Link to="/generate" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">{t('nav.generate')}</Link>
            <Link to="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">{t('footer.about')}</Link>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={() => navigate('/explore')} aria-label="Search">
              <Search className="h-5 w-5" />
            </Button>
            
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full ring-2 ring-transparent hover:ring-primary/20 transition-all">
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarImage src={profile?.avatar_url || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">{getInitials(profile?.full_name)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover/95 backdrop-blur-xl">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium truncate">{profile?.full_name || "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />{t('nav.profile')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />{t('nav.settings')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/help")} className="cursor-pointer">
                    <HelpCircle className="mr-2 h-4 w-4" />{t('footer.help')}
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate("/admin")} className="cursor-pointer text-primary">
                      <Shield className="mr-2 h-4 w-4" />Admin Panel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />{t('nav.signout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="gold-outline" size="sm" onClick={() => navigate('/auth')}>
                <User className="h-4 w-4 mr-1.5" />{t('nav.signin')}
              </Button>
            )}
          </div>

          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Toggle menu">
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: "auto" }} 
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl"
          >
            <div className="container mx-auto px-4 py-4 space-y-1">
              <Link to="/explore" className="flex items-center gap-3 py-3 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>
                <Search className="h-4 w-4 text-muted-foreground" />
                {t('nav.explore')}
              </Link>
              <Link to="/library" className="flex items-center gap-3 py-3 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>
                {t('nav.library')}
              </Link>
              <Link to="/generate" className="flex items-center gap-3 py-3 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>
                {t('nav.generate')}
              </Link>
              <Link to="/about" className="flex items-center gap-3 py-3 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>
                {t('footer.about')}
              </Link>
              <Link to="/help" className="flex items-center gap-3 py-3 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                {t('footer.help')}
              </Link>
              
              <div className="border-t border-border/50 pt-3 mt-3">
                {user ? (
                  <>
                    <Link to="/profile" className="flex items-center gap-3 py-3 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>
                      <User className="h-4 w-4 text-muted-foreground" />
                      {t('nav.profile')}
                    </Link>
                    <Link to="/settings" className="flex items-center gap-3 py-3 px-3 text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors" onClick={() => setIsMenuOpen(false)}>
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      {t('nav.settings')}
                    </Link>
                    {isAdmin && (
                      <Link to="/admin" className="flex items-center gap-3 py-3 px-3 text-primary font-medium rounded-lg hover:bg-primary/5 transition-colors" onClick={() => setIsMenuOpen(false)}>
                        <Shield className="h-4 w-4" />
                        Admin Panel
                      </Link>
                    )}
                    <Button variant="outline" className="w-full mt-3" onClick={() => { setIsMenuOpen(false); handleSignOut(); }}>
                      <LogOut className="h-4 w-4 mr-2" />
                      {t('nav.signout')}
                    </Button>
                  </>
                ) : (
                  <Button variant="gold" className="w-full" onClick={() => { setIsMenuOpen(false); navigate('/auth'); }}>
                    <User className="h-4 w-4 mr-2" />
                    {t('nav.signin')}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}