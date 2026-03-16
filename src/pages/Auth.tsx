import { useState, useEffect, forwardRef, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Mail, Lock, User, Wand2, AlertCircle } from "lucide-react";
import logo from "@/assets/logo.png";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { hasRecoveryTokens, isRecoveryCode, parseHashTokens } from "@/lib/authRecovery";


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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as any)?.redirectTo || "/";
  const isRecoveryRef = useRef(false);
  const modeRef = useRef(mode);
  const redirectRef = useRef(redirectTo);

  // Keep refs in sync so the auth listener always sees fresh values
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { redirectRef.current = redirectTo; }, [redirectTo]);

  // Clear error when mode changes
  useEffect(() => {
    setAuthError(null);
  }, [mode]);

  // Auth state listener — subscribe ONCE, use refs for current values
  useEffect(() => {
    const url = new URL(window.location.href);

    // Detect password-recovery session in URL hash (implicit flow) OR ?code=+type=recovery (PKCE flow)
    // IMPORTANT: plain ?code= without type/mode hint is a normal OAuth callback, NOT recovery
    isRecoveryRef.current = hasRecoveryTokens(window.location.hash) || isRecoveryCode(url);
    if (isRecoveryRef.current) {
      setMode("reset-password");
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset-password");
        setAuthError(null);
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        // If we're in recovery, stay on the reset screen.
        if (isRecoveryRef.current || modeRef.current === "reset-password") return;
        // Defer navigation to avoid potential deadlocks
        setTimeout(() => navigate(redirectRef.current), 0);
      }
    });

    // If user landed here via recovery link, restore session.
    (async () => {
      if (!isRecoveryRef.current) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (session) return;

      // PKCE: exchange ?code= for session
      const pkceCode = new URL(window.location.href).searchParams.get("code");
      if (pkceCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(pkceCode);
        if (error) console.warn("Recovery code exchange failed:", error.message);
        return;
      }

      // Implicit: restore from hash tokens
      const tokens = parseHashTokens(window.location.hash);
      if (!tokens) return;

      const { error } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (error) console.warn("Recovery session restore failed:", error.message);
    })();

    // For normal signed-in visits, redirect home.
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Stale session – clear it silently so the login form shows
        supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        return;
      }
      if (session?.user && !isRecoveryRef.current && modeRef.current !== "reset-password") {
        navigate(redirectRef.current);
      }
    }).catch(() => {
      // Network error – clear stale tokens
      supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const getErrorMessage = (error: any): string => {
    const message = error?.message || String(error);
    
    // Handle common auth errors with user-friendly messages
    if (message.includes("Invalid login credentials")) {
      return "Invalid email or password. If you don't have an account yet, please sign up first.";
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
  const normalizePassword = (value: string) => value;

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
        if (!acceptedTerms) {
          throw new Error("You must accept the Terms of Service and Privacy Policy to create an account.");
        }
        const redirectUrl = `${window.location.origin}/`;
        const { data, error } = await supabase.auth.signUp({
          email: safeEmail,
          password: safePassword,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              full_name: fullName.trim(),
              accepted_terms: true,
              newsletter_subscribed: newsletterSubscribed,
            },
          },
        });
        if (error) throw error;

        // Store consent in profiles
        if (data.user) {
          await supabase.from("profiles").update({
            accepted_terms: true,
            accepted_terms_at: new Date().toISOString(),
            newsletter_subscribed: newsletterSubscribed,
            newsletter_subscribed_at: newsletterSubscribed ? new Date().toISOString() : null,
          }).eq("user_id", data.user.id);
        }

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
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Mobile browsers often use PKCE recovery links with ?code=...
          const url = new URL(window.location.href);
          const code = url.searchParams.get("code");
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error) {
              ({ data: { session } } = await supabase.auth.getSession());
            }
          }
        }
        if (!session) throw new Error("Your reset link is missing or expired. Please request a new password reset email.");
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

      if (
        mode === "reset-password" &&
        typeof friendlyMessage === "string" &&
        friendlyMessage.toLowerCase().includes("reset link")
      ) {
        // Offer a safe escape hatch back to requesting a reset email.
        setMode("forgot-password");
      }
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
          <div className="inline-flex items-center justify-center mb-4">
            <img 
              src={logo} 
              alt="ScrollLibrary" 
              className="h-16 sm:h-20 w-auto drop-shadow-lg"
              loading="eager"
            />
          </div>
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
          
          {(mode === "login" || mode === "signup") && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 gap-2"
                onClick={async () => {
                  setIsLoading(true);
                  setAuthError(null);
                  try {
                    const result = await lovable.auth.signInWithOAuth("google", {
                      redirect_uri: `${window.location.origin}${redirectTo}`,
                    });

                    if (result?.error) {
                      throw result.error;
                    }

                    if (!result?.redirected) {
                      setIsLoading(false);
                    }
                  } catch (err) {
                    console.error("[Auth] Google OAuth error:", err);
                    setAuthError(getErrorMessage(err));
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card/80 px-2 text-muted-foreground">or</span>
                </div>
              </div>
            </>
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

            {mode === "signup" && (
              <div className="space-y-3 pt-1">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="terms"
                    checked={acceptedTerms}
                    onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                    className="mt-0.5"
                    required
                  />
                  <Label htmlFor="terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                    I agree to the{" "}
                    <a href="/terms" target="_blank" className="text-primary hover:underline">Terms of Service</a>
                    {" "}and{" "}
                    <a href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</a>
                    <span className="text-destructive ml-0.5">*</span>
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="newsletter"
                    checked={newsletterSubscribed}
                    onCheckedChange={(checked) => setNewsletterSubscribed(checked === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="newsletter" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                    Subscribe to ScrollLibrary updates and newsletters
                  </Label>
                </div>
              </div>
            )}

            {mode === "reset-password" && (
              <div className="space-y-4">
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
                <p className="text-xs text-muted-foreground">
                  If the link doesn't work, request a new one below.
                </p>
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
            ) : mode === "reset-password" ? (
              <button
                type="button"
                onClick={() => setMode("forgot-password")}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Request new reset link
              </button>
            ) : (
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