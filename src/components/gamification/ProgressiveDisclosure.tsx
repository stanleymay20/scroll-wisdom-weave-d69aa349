/**
 * ProgressiveDisclosure — Section locking engine
 * Locks future content sections until previous ones are completed
 * Creates curiosity tension: "What's next?"
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Lock, ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Section {
  id: string;
  title: string;
  content: string;
  index: number;
}

interface ProgressiveDisclosureProps {
  /** Raw markdown content split into sections */
  content: string;
  /** Called when a section is completed (scrolled past) */
  onSectionComplete?: (sectionIndex: number) => void;
  /** Current highest unlocked section (0-based) */
  unlockedUpTo?: number;
  /** Storage key for persistence */
  storageKey?: string;
  /** Render the content for a section */
  renderContent: (sectionContent: string) => React.ReactNode;
  /** Whether progressive disclosure is enabled */
  enabled?: boolean;
}

function splitIntoSections(content: string): Section[] {
  if (!content) return [];
  
  // Split by markdown headers (## or ###)
  const parts = content.split(/(?=^#{2,3}\s)/m);
  
  return parts
    .map((part, i) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      
      // Extract title from first line if it's a header
      const firstLine = trimmed.split('\n')[0];
      const headerMatch = firstLine.match(/^#{2,3}\s+(.+)/);
      const title = headerMatch ? headerMatch[1].trim() : `Section ${i + 1}`;
      
      return {
        id: `section-${i}`,
        title,
        content: trimmed,
        index: i,
      };
    })
    .filter(Boolean) as Section[];
}

export function ProgressiveDisclosure({
  content,
  onSectionComplete,
  unlockedUpTo: externalUnlocked,
  storageKey,
  renderContent,
  enabled = true,
}: ProgressiveDisclosureProps) {
  const sections = useMemo(() => splitIntoSections(content), [content]);
  
  // Load unlocked state from storage or use external prop
  const [unlockedUpTo, setUnlockedUpTo] = useState(() => {
    if (externalUnlocked !== undefined) return externalUnlocked;
    if (storageKey) {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) return parseInt(saved, 10);
      } catch { /* noop */ }
    }
    return 0;
  });

  // Sync external prop
  useEffect(() => {
    if (externalUnlocked !== undefined) {
      setUnlockedUpTo(prev => Math.max(prev, externalUnlocked));
    }
  }, [externalUnlocked]);

  // Persist to session storage
  useEffect(() => {
    if (storageKey) {
      try { sessionStorage.setItem(storageKey, String(unlockedUpTo)); } catch { /* noop */ }
    }
  }, [unlockedUpTo, storageKey]);

  const unlockNext = useCallback((sectionIndex: number) => {
    setUnlockedUpTo(prev => {
      const next = Math.max(prev, sectionIndex + 1);
      onSectionComplete?.(sectionIndex);
      return next;
    });
  }, [onSectionComplete]);

  if (!enabled || sections.length <= 1) {
    return <>{renderContent(content)}</>;
  }

  return (
    <div className="space-y-0">
      {sections.map((section, i) => {
        const isUnlocked = i <= unlockedUpTo;
        const isNext = i === unlockedUpTo + 1;
        const isLocked = i > unlockedUpTo;
        
        if (isUnlocked) {
          return (
            <motion.div
              key={section.id}
              initial={i === unlockedUpTo && i > 0 ? { opacity: 0, y: 20 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {renderContent(section.content)}
              
              {/* Unlock trigger for next section */}
              {i === unlockedUpTo && i < sections.length - 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex justify-center py-6"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => unlockNext(i)}
                    className="gap-2 rounded-full px-6 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Continue to next section
                    <Sparkles className="h-3.5 w-3.5" />
                  </Button>
                </motion.div>
              )}
            </motion.div>
          );
        }

        // Locked section preview
        return (
          <motion.div
            key={section.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative my-4"
          >
            <div className="relative overflow-hidden rounded-xl border border-border/30 bg-muted/30 p-6">
              {/* Blurred preview */}
              <div className="blur-sm opacity-40 pointer-events-none select-none max-h-24 overflow-hidden">
                <p className="text-sm text-muted-foreground">{section.content.slice(0, 200)}...</p>
              </div>
              
              {/* Lock overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  {section.title}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Complete the previous section to unlock
                </p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
