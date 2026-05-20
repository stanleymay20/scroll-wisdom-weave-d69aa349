import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Job {
  id: string; bundle_type: string; status: string; progress: number;
  result_url: string | null; error_message: string | null; created_at: string; book_id: string;
}

export default function ExportJobsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/auth"); return; }
    const { data } = await supabase.from("export_jobs").select("*").order("created_at", { ascending: false }).limit(30);
    setJobs((data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Exports — ScrollLibrary" description="Track your export bundles." noindex />
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">Export bundles</h1>
        <p className="text-muted-foreground mt-1">KDP and Gumroad bundles you've generated.</p>
        <div className="mt-6 space-y-3">
          {loading ? <p>Loading…</p> :
           jobs.length === 0 ? <p className="text-muted-foreground">No exports yet.</p> :
           jobs.map((j) => (
            <Card key={j.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{j.bundle_type.toUpperCase()}</Badge>
                    <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "outline"}>
                      {j.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</span>
                  </div>
                  {j.status === "running" || j.status === "pending" ? (
                    <Progress value={j.progress} className="mt-3" />
                  ) : null}
                  {j.error_message && <p className="text-sm text-destructive mt-2">{j.error_message}</p>}
                </div>
                {j.status === "completed" && j.result_url && (
                  <a href={j.result_url} target="_blank" rel="noreferrer">
                    <Button size="sm">Download ZIP</Button>
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
