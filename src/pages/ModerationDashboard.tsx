import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Shield, Flag, Clock, CheckCircle, XCircle, AlertTriangle,
  Loader2, Eye, MessageSquare
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ModerationItem {
  id: string;
  content_type: string;
  content_id: string;
  flagged_reason: string;
  severity: string;
  status: string;
  created_at: string;
  notes: string | null;
}

interface ContentReport {
  id: string;
  content_type: string;
  content_id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
}

const severityColors: Record<string, string> = {
  low: "bg-green-500/10 text-green-500 border-green-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function ModerationDashboard() {
  const [queue, setQueue] = useState<ModerationItem[]>([]);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ModerationItem | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth", { state: { redirectTo: "/moderation" } });
      return;
    }

    // Check if user has moderator or admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isModerator = roles?.some(r => r.role === "moderator" || r.role === "admin");
    
    if (!isModerator) {
      toast({
        title: "Access Denied",
        description: "You need moderator permissions to access this page.",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    setHasAccess(true);
    await Promise.all([fetchQueue(), fetchReports()]);
    setIsLoading(false);
  };

  const fetchQueue = async () => {
    const { data } = await supabase
      .from("moderation_queue")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setQueue(data);
  };

  const fetchReports = async () => {
    const { data } = await supabase
      .from("content_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setReports(data);
  };

  const handleModerateItem = async (item: ModerationItem, action: string) => {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("moderation_queue")
      .update({
        status: action,
        moderator_id: user?.id,
        moderated_at: new Date().toISOString(),
        action,
        notes: actionNotes,
      })
      .eq("id", item.id);

    if (error) {
      toast({ title: "Error", description: "Failed to update item", variant: "destructive" });
    } else {
      toast({ title: "Success", description: `Item ${action}` });
      setSelectedItem(null);
      setActionNotes("");
      fetchQueue();
    }
  };

  const handleReviewReport = async (report: ContentReport, status: string) => {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("content_reports")
      .update({
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", report.id);

    if (error) {
      toast({ title: "Error", description: "Failed to update report", variant: "destructive" });
    } else {
      toast({ title: "Success", description: `Report marked as ${status}` });
      fetchReports();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) return null;

  const pendingQueue = queue.filter(q => q.status === "pending");
  const pendingReports = reports.filter(r => r.status === "pending");

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-8">
              <h1 className="text-3xl font-display font-bold text-gradient-gold mb-2 flex items-center gap-3">
                <Shield className="h-8 w-8" />
                Moderation Dashboard
              </h1>
              <p className="text-muted-foreground">Review flagged content and user reports</p>
            </div>

            {/* Stats */}
            <div className="grid sm:grid-cols-4 gap-4 mb-8">
              <Card className="bg-gradient-card border-border/50">
                <CardContent className="p-4 flex items-center gap-4">
                  <Clock className="h-8 w-8 text-yellow-500" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{pendingQueue.length}</p>
                    <p className="text-xs text-muted-foreground">Pending Review</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-card border-border/50">
                <CardContent className="p-4 flex items-center gap-4">
                  <Flag className="h-8 w-8 text-orange-500" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{pendingReports.length}</p>
                    <p className="text-xs text-muted-foreground">User Reports</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-card border-border/50">
                <CardContent className="p-4 flex items-center gap-4">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {queue.filter(q => q.status === "approved").length}
                    </p>
                    <p className="text-xs text-muted-foreground">Approved Today</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-card border-border/50">
                <CardContent className="p-4 flex items-center gap-4">
                  <XCircle className="h-8 w-8 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {queue.filter(q => q.status === "rejected").length}
                    </p>
                    <p className="text-xs text-muted-foreground">Rejected Today</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="queue" className="space-y-6">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="queue">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Moderation Queue ({pendingQueue.length})
                </TabsTrigger>
                <TabsTrigger value="reports">
                  <Flag className="h-4 w-4 mr-2" />
                  User Reports ({pendingReports.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="queue" className="space-y-4">
                {pendingQueue.length === 0 ? (
                  <Card className="bg-gradient-card border-border/50">
                    <CardContent className="py-12 text-center">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p className="text-muted-foreground">No items pending review</p>
                    </CardContent>
                  </Card>
                ) : (
                  pendingQueue.map((item) => (
                    <Card key={item.id} className="bg-gradient-card border-border/50">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className={severityColors[item.severity]}>
                                {item.severity.toUpperCase()}
                              </Badge>
                              <Badge variant="outline">{item.content_type}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(item.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm text-foreground mb-1">
                              <strong>Reason:</strong> {item.flagged_reason}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Content ID: {item.content_id}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button 
                              variant="default" 
                              size="sm"
                              onClick={() => handleModerateItem(item, "approved")}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => handleModerateItem(item, "rejected")}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="reports" className="space-y-4">
                {pendingReports.length === 0 ? (
                  <Card className="bg-gradient-card border-border/50">
                    <CardContent className="py-12 text-center">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p className="text-muted-foreground">No reports pending review</p>
                    </CardContent>
                  </Card>
                ) : (
                  pendingReports.map((report) => (
                    <Card key={report.id} className="bg-gradient-card border-border/50">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline">{report.content_type}</Badge>
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                                {report.reason.replace(/_/g, " ")}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(report.created_at).toLocaleString()}
                              </span>
                            </div>
                            {report.description && (
                              <p className="text-sm text-muted-foreground mb-2">
                                "{report.description}"
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Content ID: {report.content_id}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleReviewReport(report, "dismissed")}
                            >
                              Dismiss
                            </Button>
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => handleReviewReport(report, "actioned")}
                            >
                              Take Action
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}