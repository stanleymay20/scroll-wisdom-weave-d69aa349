/**
 * Certificates — Lists all earned certificates for the logged-in user.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Award, BookOpen, ExternalLink, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { SEO } from "@/components/SEO";
interface Certificate {
  id: string;
  certificate_number: string;
  competency_level: string;
  overall_competency_score: number | null;
  issued_at: string;
  book_id: string;
  book_title?: string;
}

export default function Certificates() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchCertificates(session.user.id);
      } else {
        setLoading(false);
      }
    });
  }, []);

  const fetchCertificates = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("competency_certificates")
        .select("id, certificate_number, competency_level, overall_competency_score, issued_at, book_id")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("issued_at", { ascending: false });

      if (data && data.length > 0) {
        // Fetch book titles
        const bookIds = [...new Set(data.map((c) => c.book_id))];
        const { data: books } = await supabase
          .from("books")
          .select("id, title")
          .in("id", bookIds);

        const bookMap = new Map(books?.map((b) => [b.id, b.title]) || []);
        setCertificates(
          data.map((c) => ({ ...c, book_title: bookMap.get(c.book_id) || "Unknown Book" }))
        );
      }
    } catch (err) {
      console.error("Failed to fetch certificates:", err);
    } finally {
      setLoading(false);
    }
  };

  const levelLabel = (level: string) => {
    const map: Record<string, string> = {
      knowledge_verified: "Knowledge Verified",
      applied_competency: "Applied Competency",
      professional_integration: "Professional Integration",
      mastery: "Mastery",
    };
    return map[level] || level;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="My Certificates | ScrollLibrary"
        description="Your earned ScrollLibrary mastery certificates with verification links and cognitive level breakdowns."
        noindex
      />
      <Navbar />
      <main className="flex-1 pt-20 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-3 mb-8">
            <Award className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-display font-bold text-foreground">
              My Certificates
            </h1>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : !user ? (
            <Card className="text-center py-16">
              <CardContent className="space-y-4">
                <LogIn className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">Sign in to view your certificates.</p>
                <Button onClick={() => navigate("/auth", { state: { redirectTo: "/certificates" } })}>Sign In</Button>
              </CardContent>
            </Card>
          ) : certificates.length === 0 ? (
            <Card className="text-center py-16">
              <CardContent className="space-y-4">
                <Award className="h-12 w-12 text-muted-foreground mx-auto" />
                <h2 className="text-xl font-semibold text-foreground">No certificates yet</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Complete reading and pass quizzes on your books to earn mastery certificates.
                </p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={() => navigate("/library")} variant="outline">
                    <BookOpen className="h-4 w-4 mr-2" />
                    My Library
                  </Button>
                  <Button onClick={() => navigate("/generate")}>
                    Generate Study Guide
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {certificates.map((cert) => (
                <Card key={cert.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Award className="h-6 w-6 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">
                          {cert.book_title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {levelLabel(cert.competency_level)}
                          </Badge>
                          {cert.overall_competency_score != null && (
                            <span className="text-sm text-primary font-medium">
                              {cert.overall_competency_score}%
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Issued {new Date(cert.issued_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Link
                      to={`/certificate/${cert.certificate_number}`}
                      className="flex items-center gap-1 text-sm text-primary hover:underline flex-shrink-0"
                    >
                      View
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
