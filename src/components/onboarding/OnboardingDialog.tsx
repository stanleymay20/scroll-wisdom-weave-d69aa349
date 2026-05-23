/**
 * FIRST-TIME ONBOARDING FLOW
 * 
 * 3-step guided tour: Generate → Read → Learn
 * Shows once after first login, stored in localStorage.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { BookOpen, Brain, GraduationCap, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ONBOARDING_KEY = 'sl_onboarding_completed';

interface OnboardingStep {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  route: string;
}

const STEPS: OnboardingStep[] = [
  {
    icon: <Sparkles className="h-10 w-10 text-primary" />,
    title: 'Generate Your First Book',
    description: 'Tell us a topic, and our AI will create a full, structured book with chapters, exercises, and references — in seconds.',
    cta: 'Start Generating',
    route: '/generate',
  },
  {
    icon: <BookOpen className="h-10 w-10 text-primary" />,
    title: 'Read & Listen',
    description: 'Read with a premium reader featuring audio narration, highlights, bookmarks, and adaptive learning tools.',
    cta: 'Explore Library',
    route: '/library',
  },
  {
    icon: <Brain className="h-10 w-10 text-primary" />,
    title: 'Test Your Mastery',
    description: 'Take quizzes, flashcards, and competency checks to prove what you\'ve learned — and earn certificates.',
    cta: 'View Dashboard',
    route: '/dashboard/mastery',
  },
];

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    // Only show onboarding for authenticated users who haven't completed it.
    // Public landing-page visitors must never be interrupted by this modal.
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

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setOpen(false);
  };

  const handleCTA = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setOpen(false);
    navigate(STEPS[step].route);
  };

  const currentStep = STEPS[step];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleComplete(); setOpen(v); }}>
      <DialogContent className="sm:max-w-md">
        <VisuallyHidden>
          <DialogTitle>{currentStep.title}</DialogTitle>
          <DialogDescription>{currentStep.description}</DialogDescription>
        </VisuallyHidden>
        <div className="flex flex-col items-center text-center space-y-6 py-4">
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  i === step ? 'w-8 bg-primary' : 'w-2 bg-muted'
                )}
              />
            ))}
          </div>

          {/* Icon */}
          <div className="p-4 rounded-2xl bg-primary/10">
            {currentStep.icon}
          </div>

          {/* Content */}
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">
              {currentStep.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {currentStep.description}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 w-full">
            <Button onClick={handleCTA} className="w-full gap-2">
              {currentStep.cta}
              <ArrowRight className="h-4 w-4" />
            </Button>
            {step < STEPS.length - 1 ? (
              <Button variant="ghost" size="sm" onClick={handleNext} className="text-muted-foreground">
                Next
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={handleComplete} className="text-muted-foreground">
                Skip for now
              </Button>
            )}
          </div>

          {/* Welcome badge */}
          {step === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <GraduationCap className="h-3 w-3" />
              <span>Welcome to ScrollLibrary</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
