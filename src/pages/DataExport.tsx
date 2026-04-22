/**
 * /account/data-export — GDPR Subject Access Request
 *
 * One-click export of every piece of user-owned data: profile, library,
 * highlights, bookmarks, reading sessions, SRS cards, competency profile,
 * concept states, quiz attempts, certificates, audit log entries.
 *
 * Calls the `export-user-data` edge function which assembles a JSON dump
 * server-side using the service role (so RLS policies don't truncate it).
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Shield, FileJson, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/ui/page-shell';
import { useToast } from '@/hooks/use-toast';

export default function DataExport() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const exportData = async () => {
    setLoading(true);
    setDone(false);
    try {
      const { data, error } = await supabase.functions.invoke('export-user-data', {
        body: {},
      });
      if (error) throw error;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scrolllibrary-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDone(true);
      toast({ title: 'Export ready', description: 'Your data file has been downloaded.' });
    } catch (e: any) {
      toast({
        title: 'Export failed',
        description: e?.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell pageName="data-export">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-3"
        >
          <Badge variant="secondary" className="gap-1.5 w-fit">
            <Shield className="h-3 w-3" /> Privacy · GDPR Article 15 & 20
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
            Export your data
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Download a complete machine-readable copy of everything we hold about you —
            your profile, library, reading sessions, SRS cards, mastery scores, certificates,
            and audit history. One JSON file. No questions asked.
          </p>
        </motion.div>

        <Card className="bg-card border-primary/10">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <FileJson className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">What's included</h2>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
                  <li>Profile, settings, and learning preferences</li>
                  <li>Library, bookmarks, highlights, and reading sessions</li>
                  <li>Spaced-repetition cards (FSRS state)</li>
                  <li>Quiz attempts, learning progress, and competency profile</li>
                  <li>Concept-graph mastery (per book)</li>
                  <li>Certificates issued and audit-log entries you initiated</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border/50 pt-4">
              <div className="text-xs text-muted-foreground">
                Format: <code className="text-foreground">JSON</code> · typically &lt;5 MB
              </div>
              <Button onClick={exportData} disabled={loading} className="gap-2">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : done ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {loading ? 'Preparing…' : done ? 'Downloaded' : 'Download my data'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-border/50">
          <CardContent className="p-5 text-xs text-muted-foreground space-y-2">
            <p>
              <strong className="text-foreground">Your rights.</strong> Under the GDPR you may request
              access to (Art. 15), portability of (Art. 20), and erasure of (Art. 17) your personal data.
              Use the button above for access &amp; portability. To erase, visit{' '}
              <a href="/account/delete" className="text-primary hover:underline">
                Delete account
              </a>
              .
            </p>
            <p>
              For requests we can&apos;t fulfill self-serve, contact{' '}
              <a href="/contact" className="text-primary hover:underline">privacy@scrolllibrary</a>.
              We respond within 30 days.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
