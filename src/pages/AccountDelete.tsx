import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2, Shield, LogIn, CheckCircle, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Logo } from "@/components/brand/Logo";

export default function AccountDelete() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    setIsLoading(false);
  };

  const handleDelete = async () => {
    if (!user) return;
    if (typedConfirmation.toLowerCase() !== "delete my account") {
      toast({
        title: "Confirmation required",
        description: "Please type 'delete my account' to confirm.",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke("delete-account", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setDeleted(true);
      
      // Sign out locally
      await supabase.auth.signOut();
      
      toast({
        title: "Account Deleted",
        description: "Your account and personal data have been permanently deleted.",
      });

    } catch (error: any) {
      console.error("Delete account error:", error);
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete account. Please contact support.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Deleted successfully state
  if (deleted) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-24 pb-16 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-md px-4"
          >
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold mb-4">Account Deleted</h1>
            <p className="text-muted-foreground mb-6">
              Your account and personal data have been permanently deleted. 
              Any certificates you had have been revoked but remain publicly verifiable 
              with a "Revoked (Account Deleted)" status.
            </p>
            <Button onClick={() => navigate("/")} variant="outline">
              Return to Home
            </Button>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex justify-center mb-8">
              <Logo variant="full" size="lg" />
            </div>

            <Card className="border-destructive/50">
              <CardHeader className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-destructive/20 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <CardTitle className="text-destructive">Delete Your Account</CardTitle>
                <CardDescription>
                  This action is permanent and cannot be undone
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !user ? (
                  // Not logged in - show login prompt
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">
                      You need to be logged in to delete your account.
                    </p>
                    <Button onClick={() => navigate("/auth")} className="w-full">
                      <LogIn className="h-4 w-4 mr-2" />
                      Log In to Continue
                    </Button>
                    <div className="pt-4 border-t border-border/50">
                      <p className="text-sm text-muted-foreground mb-3">
                        Can't access your account? Contact us for manual deletion:
                      </p>
                      <Link to="/contact">
                        <Button variant="outline" className="w-full">
                          <Mail className="h-4 w-4 mr-2" />
                          Contact Support
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  // Logged in - show deletion form
                  <>
                    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
                      <h3 className="font-semibold text-sm">What will be deleted:</h3>
                      <ul className="text-sm text-muted-foreground space-y-1.5">
                        <li>• Your profile and personal information</li>
                        <li>• All books you created</li>
                        <li>• Your library, highlights, and notes</li>
                        <li>• Quiz attempts and learning progress</li>
                        <li>• Usage data and preferences</li>
                      </ul>
                    </div>

                    <div className="bg-muted/50 border border-border/50 rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <Shield className="h-4 w-4 text-primary mt-0.5" />
                        <div>
                          <h3 className="font-semibold text-sm">Certificate Integrity</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Issued certificates will be <strong>revoked</strong>, not deleted, 
                            to preserve public verification integrity. Verification pages will 
                            show "Revoked (Account Deleted)" status.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="confirm"
                          checked={confirmed}
                          onCheckedChange={(checked) => setConfirmed(checked === true)}
                        />
                        <Label htmlFor="confirm" className="text-sm leading-relaxed cursor-pointer">
                          I understand this action is permanent and all my data will be deleted. 
                          My certificates will be revoked.
                        </Label>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirmation" className="text-sm">
                          Type <strong>delete my account</strong> to confirm:
                        </Label>
                        <Input
                          id="confirmation"
                          value={typedConfirmation}
                          onChange={(e) => setTypedConfirmation(e.target.value)}
                          placeholder="delete my account"
                          className="font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => navigate("/settings")}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={!confirmed || typedConfirmation.toLowerCase() !== "delete my account" || isDeleting}
                        className="flex-1"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          "Delete My Account"
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <p className="text-center text-xs text-muted-foreground mt-6">
              This deletion page is provided in compliance with App Store and GDPR requirements.
              <br />
              For questions, <Link to="/contact" className="underline">contact support</Link>.
            </p>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
