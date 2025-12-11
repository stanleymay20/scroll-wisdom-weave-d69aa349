import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Book, Loader2, Mail, Lock, User, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type AuthMode = "login" | "signup" | "forgot-password" | "magic-link" | "reset-password";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") as AuthMode || "login";
  
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          setMode("reset-password");
        } else if (session?.user && mode !== "reset-password") {
          navigate("/");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "Welcome back!", description: "You have successfully signed in." });
      } else if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast({ title: "Account created!", description: "Welcome to ScrollLibrary." });
      } else if (mode === "forgot-password") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?mode=reset-password`,
        });
        if (error) throw error;
        toast({ title: "Reset email sent!", description: "Check your email for a password reset link." });
        setMode("login");
      } else if (mode === "magic-link") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast({ title: "Magic link sent!", description: "Check your email for the login link." });
      } else if (mode === "reset-password") {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        toast({ title: "Password updated!", description: "You can now sign in with your new password." });
        navigate("/");
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      toast({
        title: "Authentication Error",
        description: error.message || "An error occurred during authentication.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case "login": return "Welcome back";
      case "signup": return "Create your account";
      case "forgot-password": return "Reset your password";
      case "magic-link": return "Sign in with email";
      case "reset-password": return "Set new password";
    }
  };

  const getButtonText = () => {
    if (isLoading) {
      switch (mode) {
        case "login": return "Signing in...";
        case "signup": return "Creating account...";
        case "forgot-password": return "Sending reset link...";
        case "magic-link": return "Sending magic link...";
        case "reset-password": return "Updating password...";
      }
    }
    switch (mode) {
      case "login": return "Sign In";
      case "signup": return "Create Account";
      case "forgot-password": return "Send Reset Link";
      case "magic-link": return "Send Magic Link";
      case "reset-password": return "Update Password";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-hero-pattern opacity-30" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-scroll-gold/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-scroll-bronze/10 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="bg-gradient-gold p-3 rounded-xl">
              <Book className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="font-display text-3xl font-bold text-gradient-gold">ScrollLibrary</h1>
          <p className="text-muted-foreground mt-2">{getTitle()}</p>
        </div>

        <div className="bg-gradient-card rounded-2xl border border-border/50 p-8 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10 bg-muted/50 border-border/50 focus:border-scroll-gold"
                    required
                  />
                </div>
              </div>
            )}

            {mode !== "reset-password" && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-muted/50 border-border/50 focus:border-scroll-gold"
                    required
                  />
                </div>
              </div>
            )}

            {(mode === "login" || mode === "signup") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "login" && (
                    <button type="button" onClick={() => setMode("forgot-password")} className="text-xs text-scroll-gold hover:underline">
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 bg-muted/50 border-border/50 focus:border-scroll-gold"
                    required
                    minLength={6}
                  />
                </div>
              </div>
            )}

            {mode === "reset-password" && (
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 bg-muted/50 border-border/50 focus:border-scroll-gold"
                    required
                    minLength={6}
                  />
                </div>
              </div>
            )}

            <Button type="submit" variant="hero" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {getButtonText()}
            </Button>
          </form>

          {/* Magic Link Option */}
          {mode === "login" && (
            <Button
              type="button"
              variant="ghost"
              className="w-full mt-3"
              onClick={() => setMode("magic-link")}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Sign in with Magic Link
            </Button>
          )}

          <div className="mt-6 text-center space-y-2">
            {mode === "forgot-password" || mode === "magic-link" ? (
              <button type="button" onClick={() => setMode("login")} className="text-sm text-muted-foreground hover:text-scroll-gold transition-colors">
                ← Back to sign in
              </button>
            ) : mode !== "reset-password" && (
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="text-sm text-muted-foreground hover:text-scroll-gold transition-colors"
              >
                {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            )}
          </div>
        </div>

        <div className="text-center mt-6">
          <Button variant="ghost" onClick={() => navigate("/")}>← Back to Home</Button>
        </div>
      </motion.div>
    </div>
  );
}