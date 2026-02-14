/**
 * PMF Validation Dashboard (Admin only)
 * 
 * Tracks: DAU, retention, conversion, funnel completion
 */

import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useNavigate } from "react-router-dom";
import { Users, BookOpen, GraduationCap, Award, TrendingUp, DollarSign } from "lucide-react";

interface MetricCard {
  label: string;
  value: string | number;
  icon: typeof Users;
  target?: string;
}

export default function PMFDashboard() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    totalBooks: 0,
    totalQuizzes: 0,
    totalCertificates: 0,
    paidUsers: 0,
    secondBookUsers: 0,
    dau7: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate("/");
      return;
    }
    if (isAdmin) fetchMetrics();
  }, [isAdmin, adminLoading]);

  const fetchMetrics = async () => {
    try {
      // Total users
      const { count: totalUsers } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });

      // Total books generated
      const { count: totalBooks } = await supabase
        .from("books")
        .select("id", { count: "exact", head: true });

      // Total quiz attempts
      const { count: totalQuizzes } = await supabase
        .from("quiz_attempts")
        .select("id", { count: "exact", head: true });

      // Total certificates
      const { count: totalCertificates } = await supabase
        .from("competency_certificates")
        .select("id", { count: "exact", head: true });

      // Paid users (active subscriptions)
      const { count: paidUsers } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");

      // Users with 2+ books (retention signal)
      const { data: bookCounts } = await supabase
        .from("books")
        .select("user_id");
      
      const userBookCounts: Record<string, number> = {};
      bookCounts?.forEach(b => {
        userBookCounts[b.user_id] = (userBookCounts[b.user_id] || 0) + 1;
      });
      const secondBookUsers = Object.values(userBookCounts).filter(c => c >= 2).length;

      // DAU last 7 days (unique users who generated or read)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data: recentSessions } = await supabase
        .from("reading_sessions")
        .select("user_id")
        .gte("created_at", sevenDaysAgo.toISOString());
      
      const uniqueActiveUsers = new Set(recentSessions?.map(s => s.user_id) || []);

      setMetrics({
        totalUsers: totalUsers || 0,
        totalBooks: totalBooks || 0,
        totalQuizzes: totalQuizzes || 0,
        totalCertificates: totalCertificates || 0,
        paidUsers: paidUsers || 0,
        secondBookUsers,
        dau7: uniqueActiveUsers.size,
      });
    } catch (error) {
      console.error("Failed to fetch metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (adminLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading metrics...</p>
      </div>
    );
  }

  const cards: MetricCard[] = [
    { label: "Total Users", value: metrics.totalUsers, icon: Users, target: "100" },
    { label: "Books Generated", value: metrics.totalBooks, icon: BookOpen },
    { label: "Quiz Attempts", value: metrics.totalQuizzes, icon: GraduationCap, target: "20% completion" },
    { label: "Certificates Issued", value: metrics.totalCertificates, icon: Award },
    { label: "Paying Users", value: metrics.paidUsers, icon: DollarSign, target: "10" },
    { label: "Return Users (2+ books)", value: metrics.secondBookUsers, icon: TrendingUp },
    { label: "Active Users (7d)", value: metrics.dau7, icon: Users },
  ];

  const conversionRate = metrics.totalUsers > 0 
    ? ((metrics.paidUsers / metrics.totalUsers) * 100).toFixed(1) 
    : "0";
  
  const quizCompletionRate = metrics.totalBooks > 0 
    ? ((metrics.totalQuizzes / metrics.totalBooks) * 100).toFixed(1) 
    : "0";

  const retentionRate = metrics.totalUsers > 0
    ? ((metrics.secondBookUsers / metrics.totalUsers) * 100).toFixed(1)
    : "0";

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="mb-8">
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">
              PMF Validation Dashboard
            </h1>
            <p className="text-muted-foreground">
              60-day sprint metrics. No new features until targets are hit.
            </p>
          </div>

          {/* Key Rates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground">Conversion Rate</p>
                <p className="text-4xl font-bold text-foreground">{conversionRate}%</p>
                <Badge variant="outline" className="mt-2">Target: 10%</Badge>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground">Quiz Completion</p>
                <p className="text-4xl font-bold text-foreground">{quizCompletionRate}%</p>
                <Badge variant="outline" className="mt-2">Target: 20%</Badge>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground">Retention (2+ books)</p>
                <p className="text-4xl font-bold text-foreground">{retentionRate}%</p>
                <Badge variant="outline" className="mt-2">Target: 15%</Badge>
              </CardContent>
            </Card>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        {card.label}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-foreground">{card.value}</p>
                    {card.target && (
                      <p className="text-xs text-muted-foreground mt-1">Target: {card.target}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* PMF Gate */}
          <Card className="mt-8 border-destructive/30">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-foreground mb-2">🚫 Feature Gate</h3>
              <p className="text-sm text-muted-foreground">
                No new features until: <strong>100 users</strong>, <strong>10 paying users</strong>, 
                and <strong>20% quiz completion rate</strong>. Current progress:
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Users: {metrics.totalUsers}/100</span>
                  <span className={metrics.totalUsers >= 100 ? "text-primary" : "text-muted-foreground"}>
                    {metrics.totalUsers >= 100 ? "✅" : "❌"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Paying: {metrics.paidUsers}/10</span>
                  <span className={metrics.paidUsers >= 10 ? "text-primary" : "text-muted-foreground"}>
                    {metrics.paidUsers >= 10 ? "✅" : "❌"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Quiz Rate: {quizCompletionRate}%/20%</span>
                  <span className={parseFloat(quizCompletionRate) >= 20 ? "text-primary" : "text-muted-foreground"}>
                    {parseFloat(quizCompletionRate) >= 20 ? "✅" : "❌"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
