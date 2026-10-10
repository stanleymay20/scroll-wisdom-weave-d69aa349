/**
 * FIRST-TIME ONBOARDING FLOW
 *
 * Outcome-first onboarding: get an authenticated first-time user to a useful
 * artifact instead of asking them to click through a product tour. The
 * dashboard and product surfaces can teach reading, mastery and publishing in
 * context after a book exists.
 *
 * Completion is still browser-local. Server-side onboarding state remains a
 * separate follow-up so this change does not add a blocking data dependency.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ONBOARDING_KEY = 'sl_onboarding_completed';

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Public landing-page visitors must never be interrupted by onboarding.
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (completed) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session?.user) return;
      timer = setTimeout(() => setOpen(true), 2000);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setOpen(false);
  };

  const startCreating = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setOpen(false);
    navigate('/generate?type=text');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) completeOnboarding();
        else setOpen(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center text-center gap-6 py-4">
          <div className="p-4 rounded-2xl bg-primary/10" aria-hidden="true">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>

          <div className="space-y-2">
            <DialogTitle className="text-2xl font-bold text-foreground">
              Create something useful first
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              Start with one structured book. Once it exists, ScrollLibrary can guide you through reading, mastery checks, and publishing preparation in context.
            </DialogDescription>
          </div>

          <div className="w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left space-y-3">
            {[
              'Create a structured book',
              'Read and assess learning',
              'Prepare qualified work for publishing',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 w-full">
            <Button onClick={startCreating} className="w-full gap-2">
              Create my first book
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={completeOnboarding}
              className="text-muted-foreground"
            >
              Skip for now
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
