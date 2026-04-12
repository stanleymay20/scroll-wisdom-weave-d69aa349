/**
 * ReEngagementBanner v2 — Smart welcome-back with personalized stats
 * Time-away formatting, XP display, progress bar, animated entrance
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, BookOpen, ArrowRight, Flame, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { loadLocalState } from "@/lib/gamificationEngine";
import { trackFunnelEvent } from "@/lib/readingFunnel";

const INACTIVITY_KEY = 'scroll_last_session';
const BANNER_DISMISSED_KEY = 'scroll_reengagement_dismissed';

interface LastSession {
  bookId: string;
  bookTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  progress: number;
  timestamp: number;
}

function getLastSession(): LastSession | null {
  try {
    const raw = localStorage.getItem(INACTIVITY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function saveLastSession(session: Omit<LastSession, 'timestamp'>): void {
  try {
    localStorage.setItem(INACTIVITY_KEY, JSON.stringify({ ...session, timestamp: Date.now() }));
    sessionStorage.removeItem(BANNER_DISMISSED_KEY);
  } catch { /* noop */ }
}

function formatTimeAgo(hours: number): string {
  if (hours < 24) return `${Math.round(hours)} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function getInactivityMessage(hoursAgo: number, session: LastSession): string {
  const remaining = 100 - Math.round(session.progress);
  if (hoursAgo >= 72) return `Don't let "${session.bookTitle}" slip away — you were making incredible progress`;
  if (hoursAgo >= 48) return `You left off at a powerful point in "${session.bookTitle}"`;
  if (hoursAgo >= 24) return `Pick up where you left off — only ${remaining}% left in this chapter`;
  if (hoursAgo >= 6) return `Just ${remaining}% remaining in Chapter ${session.chapterNumber}. Finish it!`;
  return `Welcome back — ready to continue?`;
}

export function ReEngagementBanner() {
  const [session, setSession] = useState<LastSession | null>(null);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (sessionStorage.getItem(BANNER_DISMISSED_KEY)) return;
    const last = getLastSession();
    if (!last) return;
    const hoursAgo = (Date.now() - last.timestamp) / (1000 * 60 * 60);
    if (hoursAgo < 6) return;
    setSession(last);
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
  };

  const continueReading = () => {
    if (!session) return;
    dismiss();
    trackFunnelEvent('resumed_from_banner', {
      bookId: session.bookId,
      chapterNumber: session.chapterNumber,
    });
    navigate(`/read/${session.bookId}/${session.chapterNumber}`);
  };

  if (!session || !visible) return null;

  const hoursAgo = (Date.now() - session.timestamp) / (1000 * 60 * 60);
  const gamState = loadLocalState();
  const remaining = 100 - Math.round(session.progress);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -70 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -70 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="fixed top-0 left-0 right-0 z-[90] bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-2xl shadow-primary/20"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-foreground/15 flex items-center justify-center shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {getInactivityMessage(hoursAgo, session)}
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                <p className="text-xs opacity-75 truncate">
                  Ch. {session.chapterNumber} · {formatTimeAgo(hoursAgo)}
                </p>
                {gamState.streakCurrent > 0 && (
                  <span className="flex items-center gap-0.5 text-xs opacity-80">
                    <Flame className="h-3 w-3" /> {gamState.streakCurrent}d
                  </span>
                )}
                {gamState.xp > 0 && (
                  <span className="flex items-center gap-0.5 text-xs opacity-80">
                    <Zap className="h-3 w-3" /> {gamState.xp} XP
                  </span>
                )}
              </div>
            </div>
            
            <Button
              size="sm"
              variant="secondary"
              onClick={continueReading}
              className="shrink-0 gap-1.5 rounded-full text-xs px-4 font-semibold"
            >
              Continue <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            
            <button onClick={dismiss} className="opacity-50 hover:opacity-100 shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mini progress bar */}
          <div className="mt-2 h-1 bg-primary-foreground/15 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${session.progress}%` }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="h-full bg-primary-foreground/40 rounded-full"
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
