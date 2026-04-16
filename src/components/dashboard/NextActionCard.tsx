/**
 * PHASE 2 — Next Best Action Card
 *
 * Surfaces the single most impactful next learning action for the user:
 *   1. SRS reviews due today  → highest priority (consolidates memory)
 *   2. Resume current book    → keeps streak alive
 *   3. Generate first book    → empty-state activation
 *
 * Drives daily return and closes the learning loop on the dashboard.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Brain, BookOpen, Sparkles, ArrowRight, Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface NextActionCardProps {
  userId: string;
}

interface NextAction {
  type: "review" | "resume" | "generate";
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  icon: typeof Brain;
  badge?: string;
}

export function NextActionCard({ userId }: NextActionCardProps) {
  const navigate = useNavigate();
  const [action, setAction] = useState<NextAction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const computeNextAction = async () => {
      try {
        const now = new Date().toISOString();

        // Priority 1: SRS reviews due
        const { data: dueCards } = await supabase
          .from("spaced_repetition_cards")
          .select("id, book_id")
          .eq("user_id", userId)
          .lte("next_review_at", now)
          .limit(50);

        if (mounted && dueCards && dueCards.length > 0) {
          const firstBookId = dueCards[0].book_id;
          setAction({
            type: "review",
            title: `${dueCards.length} ${dueCards.length === 1 ? "card" : "cards"} ready for review`,
            subtitle: "5 minutes of review locks in long-term memory",
            cta: "Start review",
            href: firstBookId ? `/book/${firstBookId}` : "/dashboard/mastery",
            icon: Brain,
            badge: "Due now",
          });
          setLoading(false);
          return;
        }

        // Priority 2: Resume in-progress book
        const { data: library } = await supabase
          .from("user_library" as any)
          .select("book_id, last_read_chapter, progress_percent")
          .eq("user_id", userId)
          .gt("progress_percent", 0)
          .lt("progress_percent", 100)
          .order("updated_at" as any, { ascending: false })
          .limit(1);

        const inProgress = library?.[0] as any;
        if (mounted && inProgress?.book_id) {
          const { data: book } = await supabase
            .from("books")
            .select("title")
            .eq("id", inProgress.book_id)
            .maybeSingle();

          setAction({
            type: "resume",
            title: book?.title ? `Continue "${book.title}"` : "Continue reading",
            subtitle: `${Math.round(inProgress.progress_percent)}% complete · keep your streak going`,
            cta: "Resume",
            href: `/read/${inProgress.book_id}/${inProgress.last_read_chapter || 1}`,
            icon: BookOpen,
            badge: "In progress",
          });
          setLoading(false);
          return;
        }

        // Priority 3: Empty state
        if (mounted) {
          setAction({
            type: "generate",
            title: "Start your learning journey",
            subtitle: "Generate a book on any topic and begin mastering it today",
            cta: "Generate a book",
            href: "/generate",
            icon: Sparkles,
          });
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };

    computeNextAction();
    return () => {
      mounted = false;
    };
  }, [userId]);

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
        <CardContent className="p-6">
          <Skeleton className="h-5 w-32 mb-3" />
          <Skeleton className="h-7 w-2/3 mb-2" />
          <Skeleton className="h-4 w-1/2 mb-5" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (!action) return null;

  const Icon = action.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="bg-gradient-to-br from-primary/5 via-background to-accent/5 border-primary/20 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Next best action
                </span>
                {action.badge && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {action.type === "review" && <Flame className="h-3 w-3 mr-1" />}
                    {action.badge}
                  </Badge>
                )}
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-1 truncate">
                {action.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">{action.subtitle}</p>
              <Button onClick={() => navigate(action.href)} className="gap-2">
                {action.cta}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
