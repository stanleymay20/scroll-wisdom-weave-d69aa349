import { useState, useEffect, forwardRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Book, Loader2, Mail, Lock, User, Wand2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Alert, AlertDescription } from "@/components/ui/alert";

type AuthMode = "login" | "signup" | "forgot-password" | "magic-link" | "reset-password";

const Auth = forwardRef<HTMLDivElement>(function Auth(_, ref) {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") as AuthMode || "login";
  const { t } = useLanguage();
  
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Clear error when mode changes
  useEffect(() => {
    setAuthError(null);
  }, [mode]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          setMode("reset-password");
          setAuthError(null);
        } else if (event === "SIGNED_IN" && session?.user) {
          // Defer navigation to avoid potential deadlocks
          setTimeout(() => {
            navigate("/");
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && mode !== "reset-password") {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, mode]);

  const getErrorMessage = (error: any): string => {
    const message = error?.message || String(error);
    
    // Handle common auth errors with user-friendly messages
    if (message.includes("Invalid login credentials")) {
      return "Invalid email or password. Please check your credentials and try again.";
    }
    if (message.includes("Email not confirmed")) {
      return "Please verify your email before signing in. Check your inbox for a confirmation link.";
    }
    if (message.includes("User already registered")) {
      return "An account with this email already exists. Try signing in instead.";
    }
    if (message.includes("rate limit") || message.includes("429")) {
      return "Too many requests. Please wait a moment before trying again.";
    }
    if (message.includes("Email link is invalid or has expired")) {
      return "This password reset link has expired. Please request a new one.";
    }
    if (message.includes("Password should be at least")) {
      return "Password must be at least 6 characters long.";
    }
    if (message.includes("Unable to validate email")) {
      return "Please enter a valid email address.";
    }
    
    return message;
  };

  const normalizeEmail = (value: string) => value.trim().toLowerCase();
  const normalizePassword = (value: string) => value.trim();

  const handleSendMagicLink = async (targetEmail?: string) => {
    const safeEmail = normalizeEmail(targetEmail ?? email);
    if (!safeEmail) return;

    setIsLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: safeEmail,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
      toast({ title: "Magic link sent!", description: "Check your email for the login link." });
    } catch (error: any) {
      const friendlyMessage = getErrorMessage(error);
      setAuthError(friendlyMessage);
      toast({ title: "Authentication Error", description: friendlyMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPasswordReset = async (targetEmail?: string) => {
    const safeEmail = normalizeEmail(targetEmail ?? email);
    if (!safeEmail) return;

    setIsLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(safeEmail, {
        redirectTo: `${window.location.origin}/auth?mode=reset-password`,
      });
      if (error) throw error;
      toast({ title: "Reset email sent!", description: "Check your email for a password reset link." });
      setMode("login");
    } catch (error: any) {
      const friendlyMessage = getErrorMessage(error);
      setAuthError(friendlyMessage);
      toast({ title: "Authentication Error", description: friendlyMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError(null);

    const safeEmail = normalizeEmail(email);
    const safePassword = normalizePassword(password);
    const safeNewPassword = normalizePassword(newPassword);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: safeEmail, password: safePassword });
        if (error) throw error;
        toast({ title: "Welcome back!", description: "You have successfully signed in." });
      } else if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/`;
        const { data, error } = await supabase.auth.signUp({
          email: safeEmail,
          password: safePassword,
          options: {
            emailRedirectTo: redirectUrl,
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;

        // Check if user was actually created (not just returned existing)
        if (data.user && !data.session) {
          toast({
            title: "Check your email",
            description: "We sent you a confirmation link to complete signup.",
          });
        } else {
          toast({ title: "Account created!", description: "Welcome to ScrollLibrary." });
        }
      } else if (mode === "forgot-password") {
        await handleSendPasswordReset(safeEmail);
      } else if (mode === "magic-link") {
        await handleSendMagicLink(safeEmail);
      } else if (mode === "reset-password") {
        if (safeNewPassword.length < 6) {
          throw new Error("Password must be at least 6 characters long.");
        }
        const { error } = await supabase.auth.updateUser({ password: safeNewPassword });
        if (error) throw error;
        toast({ title: "Password updated!", description: "You can now sign in with your new password." });
        await supabase.auth.signOut();
        setMode("login");
      }
    } catch (error: any) {
      const friendlyMessage = getErrorMessage(error);
      // Avoid logging full auth error objects (may contain sensitive metadata)
      console.warn("Auth error:", friendlyMessage);
      setAuthError(friendlyMessage);
      toast({
        title: "Authentication Error",
        description: friendlyMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case "login": return t('auth.welcome');
      case "signup": return t('auth.create');
      case "forgot-password": return t('auth.forgot');
      case "magic-link": return t('auth.magic');
      case "reset-password": return "Set new password";
    }
  };

  const getButtonText = () => {
    if (isLoading) {
      switch (mode) {
        case "login": return t('common.loading');
        case "signup": return t('common.loading');
        case "forgot-password": return t('common.loading');
        case "magic-link": return t('common.loading');
        case "reset-password": return t('common.loading');
      }
    }
    switch (mode) {
      case "login": return t('auth.signin');
      case "signup": return t('auth.signup');
      case "forgot-password": return t('auth.forgot');
      case "magic-link": return t('auth.magic');
      case "reset-password": return "Update Password";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="absolute inset-0 bg-hero-pattern opacity-20" />
      <div className="absolute top-1/4 left-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-80 sm:h-80 bg-accent/5 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="bg-gradient-gold p-2.5 sm:p-3 rounded-xl shadow-gold">
              <Book className="h-6 w-6 sm:h-8 sm:w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-gradient-gold">ScrollLibrary</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">{getTitle()}</p>
        </div>

        <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-border/50 p-5 sm:p-8 shadow-card">
          {authError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-3">
                  <p className="text-sm">{authError}</p>
                  {authError.includes("Invalid email or password") && email.trim().length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendPasswordReset(email)}
                        disabled={isLoading}
                        className="text-xs"
                      >
                        Forgot password
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendMagicLink(email)}
                        disabled={isLoading}
                        className="text-xs"
                      >
                        Send magic link
                      </Button>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm">{t('auth.fullname')}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder={t('auth.fullname')}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10 bg-background/50 border-border focus:border-primary h-11"
                    required
                  />
                </div>
              </div>
            )}

            {mode !== "reset-password" && (
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">{t('auth.email')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('auth.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-background/50 border-border focus:border-primary h-11"
                    required
                  />
                </div>
              </div>
            )}

            {(mode === "login" || mode === "signup") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm">{t('auth.password')}</Label>
                  {mode === "login" && (
                    <button type="button" onClick={() => setMode("forgot-password")} className="text-xs text-primary hover:underline font-medium">
                      {t('auth.forgot')}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={t('auth.password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 bg-background/50 border-border focus:border-primary h-11"
                    required
                    minLength={6}
                  />
                </div>
              </div>
            )}

            {mode === "reset-password" && (
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 bg-background/50 border-border focus:border-primary h-11"
                    required
                    minLength={6}
                  />
                </div>
              </div>
            )}

            <Button type="submit" variant="gold" className="w-full h-11" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {getButtonText()}
            </Button>
          </form>

          {/* Magic Link Option */}
          {mode === "login" && (
            <Button
              type="button"
              variant="ghost"
              className="w-full mt-3 text-muted-foreground hover:text-foreground"
              onClick={() => setMode("magic-link")}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              {t('auth.magic')}
            </Button>
          )}

          <div className="mt-6 text-center space-y-2">
            {mode === "forgot-password" || mode === "magic-link" ? (
              <button type="button" onClick={() => setMode("login")} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                ← {t('common.back')}
              </button>
            ) : mode !== "reset-password" && (
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {mode === "login" ? t('auth.noaccount') : t('auth.hasaccount')}
              </button>
            )}
          </div>
        </div>

        <div className="text-center mt-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground">
            ← {t('auth.backhome')}
          </Button>
        </div>
      </motion.div>
    </div>
  );
});

export default Auth;