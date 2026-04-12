/**
 * ProgressiveDisclosure v2 — Scroll-aware section locking with time estimates
 * Auto-unlock via IntersectionObserver, reading time estimates, XP per section
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, ChevronDown, Sparkles, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Section {
  id: string;
  title: string;
  content: string;
  index: number;
  wordCount: number;
}

interface ProgressiveDisclosureProps {
  content: string;
  onSectionComplete?: (sectionIndex: number) => void;
  unlockedUpTo?: number;
  storageKey?: string;
  renderContent: (sectionContent: string) => React.ReactNode;
  enabled?: boolean;
  xpPerSection?: number;
}

function splitIntoSections(content: string): Section[] {
  if (!content) return [];
  const parts = content.split(/(?=^#{2,3}\s)/m);
  
  return parts
    .map((part, i) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const firstLine = trimmed.split('\n')[0];
      const headerMatch = firstLine.match(/^#{2,3}\s+(.+)/);
      const title = headerMatch ? headerMatch[1].trim() : `Section ${i + 1}`;
      const wordCount = trimmed.split(/\s+/).length;
      
      return { id: `section-${i}`, title, content: trimmed, index: i, wordCount };
    })
    .filter(Boolean) as Section[];
}

export function ProgressiveDisclosure({
  content, onSectionComplete, unlockedUpTo: externalUnlocked,
  storageKey, renderContent, enabled = true, xpPerSection = 10,
}: ProgressiveDisclosureProps) {
  const sections = useMemo(() => splitIntoSections(content), [content]);
  const sectionEndRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  
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

  const [justUnlocked, setJustUnlocked] = useState<number | null>(null);

  useEffect(() => {
    if (externalUnlocked !== undefined) {
      setUnlockedUpTo(prev => Math.max(prev, externalUnlocked));
    }
  }, [externalUnlocked]);

  useEffect(() => {
    if (storageKey) {
      try { sessionStorage.setItem(storageKey, String(unlockedUpTo)); } catch { /* noop */ }
    }
  }, [unlockedUpTo, storageKey]);

  // Scroll-based auto-unlock: when user reads 80% of current section
  useEffect(() => {
    if (!enabled || sections.length <= 1) return;
    
    const observers: IntersectionObserver[] = [];
    sectionEndRefs.current.forEach((el, idx) => {
      if (idx > unlockedUpTo) return; // Only observe unlocked sections
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && idx === unlockedUpTo && idx < sections.length - 1) {
            // User scrolled to bottom of current section — auto-unlock next
            setUnlockedUpTo(prev => {
              if (prev <= idx) {
                setJustUnlocked(idx + 1);
                onSectionComplete?.(idx);
                return idx + 1;
              }
              return prev;
            });
          }
        },
        { threshold: 0.5 }
      );
      observer.observe(el);
      observers.push(observer);
    });
    
    return () => observers.forEach(o => o.disconnect());
  }, [enabled, sections.length, unlockedUpTo, onSectionComplete]);

  // Clear justUnlocked animation after delay
  useEffect(() => {
    if (justUnlocked === null) return;
    const t = setTimeout(() => setJustUnlocked(null), 2000);
    return () => clearTimeout(t);
  }, [justUnlocked]);

  const unlockNext = useCallback((sectionIndex: number) => {
    setUnlockedUpTo(prev => {
      const next = Math.max(prev, sectionIndex + 1);
      setJustUnlocked(sectionIndex + 1);
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
        const readingMins = Math.max(1, Math.round(section.wordCount / 250));
        
        if (isUnlocked) {
          return (
            <motion.div
              key={section.id}
              initial={i === justUnlocked ? { opacity: 0, y: 30 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, type: "spring" }}
            >
              {renderContent(section.content)}
              
              {/* Scroll sentinel for auto-unlock */}
              <div ref={(el) => { if (el) sectionEndRefs.current.set(i, el); }} className="h-1" />
              
              {/* Manual unlock button (shown if auto-unlock hasn't fired) */}
              {i === unlockedUpTo && i < sections.length - 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
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
                    <span className="text-[10px] text-muted-foreground ml-1">+{xpPerSection} XP</span>
                  </Button>
                </motion.div>
              )}
            </motion.div>
          );
        }

        // Locked section
        return (
          <motion.div
            key={section.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 * Math.min(i, 3) }}
            className="relative my-4"
          >
            <div className="relative overflow-hidden rounded-xl border border-border/30 bg-muted/20 p-6">
              {/* Blurred preview */}
              <div className="blur-[6px] opacity-30 pointer-events-none select-none max-h-20 overflow-hidden">
                <p className="text-sm text-muted-foreground">{section.content.slice(0, 250)}...</p>
              </div>
              
              {/* Lock overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/50 backdrop-blur-sm">
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-10 h-10 rounded-full bg-muted/80 flex items-center justify-center"
                >
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </motion.div>
                <p className="text-xs text-muted-foreground font-semibold">{section.title}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                  <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" /> ~{readingMins} min</span>
                  <span className="flex items-center gap-0.5"><Zap className="h-2.5 w-2.5" /> +{xpPerSection} XP</span>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
