import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Crown, Users, Lock, Loader2, Check, X, UserPlus, Trash2, Key } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";

interface UserRole {
  id: string;
  user_id: string;
  role: "admin" | "moderator" | "user";
  created_at: string;
  email?: string;
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user } = useSubscription();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { toast } = useToast();
  
  const [claimCode, setClaimCode] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);

  // Fetch all user roles if admin
  useEffect(() => {
    if (isAdmin) {
      fetchUserRoles();
    } else {
      setLoadingRoles(false);
    }
  }, [isAdmin]);

  const fetchUserRoles = async () => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUserRoles(data || []);
    } catch (error) {
      console.error("Error fetching roles:", error);
    } finally {
      setLoadingRoles(false);
    }
  };

  const handleClaimAdmin = async () => {
    if (!claimCode.trim()) {
      toast({
        title: "Enter Claim Code",
        description: "Please enter the admin claim code.",
        variant: "destructive",
      });
      return;
    }

    setIsClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke("claim-admin", {
        body: { code: claimCode },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Admin Access Granted",
          description: "You now have admin privileges. Refreshing...",
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        throw new Error(data?.error || "Unknown error");
      }
    } catch (error: any) {
      toast({
        title: "Claim Failed",
        description: error.message || "Invalid claim code or error.",
        variant: "destructive",
      });
    } finally {
      setIsClaiming(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) return;
    
    setIsAddingAdmin(true);
    try {
      // Find user by email (admin must have access to profiles)
      // For security, we'd need a server function for this
      toast({
        title: "Feature Coming Soon",
        description: "Adding admins by email requires additional backend setup.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);

      if (error) throw error;

      setUserRoles(prev => prev.filter(r => r.id !== roleId));
      toast({
        title: "Role Removed",
        description: "User role has been removed.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Loading state
  if (adminLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-24 pb-16 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-scroll-gold" />
        </main>
        <Footer />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-lg text-center">
            <Card className="bg-gradient-card border-border/50">
              <CardContent className="pt-8 pb-8">
                <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-display font-bold mb-2">Sign In Required</h2>
                <p className="text-muted-foreground mb-6">
                  Please sign in to access admin features.
                </p>
                <Button variant="hero" onClick={() => navigate("/auth")}>
                  Sign In
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Not admin - show claim form
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-lg">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="bg-gradient-card border-border/50">
                <CardHeader className="text-center">
                  <div className="mx-auto p-3 rounded-xl bg-scroll-gold/20 w-fit mb-4">
                    <Key className="h-8 w-8 text-scroll-gold" />
                  </div>
                  <CardTitle className="text-2xl font-display">Claim Admin Access</CardTitle>
                  <CardDescription>
                    Enter the admin claim code to become an administrator.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="claimCode">Claim Code</Label>
                    <Input
                      id="claimCode"
                      type="password"
                      placeholder="Enter claim code..."
                      value={claimCode}
                      onChange={(e) => setClaimCode(e.target.value)}
                      className="bg-muted/50"
                    />
                  </div>
                  <Button
                    variant="hero"
                    className="w-full"
                    onClick={handleClaimAdmin}
                    disabled={isClaiming}
                  >
                    {isClaiming ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Claiming...
                      </>
                    ) : (
                      <>
                        <Crown className="h-4 w-4 mr-2" />
                        Claim Admin
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    The claim code is set as a backend secret (ADMIN_CLAIM_CODE).
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Admin panel
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 rounded-xl bg-scroll-gold/20">
                <Shield className="h-8 w-8 text-scroll-gold" />
              </div>
              <div>
                <h1 className="text-3xl font-display font-bold">Admin Panel</h1>
                <p className="text-muted-foreground">Manage users, roles, and system settings</p>
              </div>
              <Badge className="ml-auto bg-scroll-gold/20 text-scroll-gold border-scroll-gold/30">
                <Crown className="h-3 w-3 mr-1" />
                Admin
              </Badge>
            </div>

            <Tabs defaultValue="roles" className="space-y-6">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="roles" className="data-[state=active]:bg-scroll-gold/20">
                  <Users className="h-4 w-4 mr-2" />
                  User Roles
                </TabsTrigger>
                <TabsTrigger value="settings" className="data-[state=active]:bg-scroll-gold/20">
                  <Shield className="h-4 w-4 mr-2" />
                  Settings
                </TabsTrigger>
              </TabsList>

              <TabsContent value="roles" className="space-y-6">
                {/* Current Admins */}
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-scroll-gold" />
                      User Roles
                    </CardTitle>
                    <CardDescription>
                      Manage admin and moderator roles
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingRoles ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : userRoles.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        No special roles assigned yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {userRoles.map((role) => (
                          <div
                            key={role.id}
                            className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${
                                role.role === 'admin' ? 'bg-scroll-gold/20' : 'bg-primary/20'
                              }`}>
                                {role.role === 'admin' ? (
                                  <Crown className="h-4 w-4 text-scroll-gold" />
                                ) : (
                                  <Shield className="h-4 w-4 text-primary" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-sm">
                                  {role.user_id.slice(0, 8)}...
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {role.role.charAt(0).toUpperCase() + role.role.slice(1)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize">
                                {role.role}
                              </Badge>
                              {role.user_id !== user.id && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => handleRemoveRole(role.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle>Admin Settings</CardTitle>
                    <CardDescription>
                      System configuration and preferences
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 rounded-lg bg-scroll-gold/10 border border-scroll-gold/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Check className="h-4 w-4 text-scroll-gold" />
                        <span className="font-medium">Admin bypass active</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        As admin, you bypass all subscription limits, generation caps, and feature gates.
                      </p>
                    </div>
                    <div className="grid gap-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <span className="text-sm">Your Role</span>
                        <Badge className="bg-scroll-gold/20 text-scroll-gold">Admin</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <span className="text-sm">User ID</span>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{user.id.slice(0, 16)}...</code>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
