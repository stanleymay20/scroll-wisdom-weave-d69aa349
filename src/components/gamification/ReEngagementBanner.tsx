/**
 * ReEngagementBanner — Smart welcome-back banner
 * Shows contextual re-engagement when user returns after inactivity
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, BookOpen, ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

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
    // Clear dismissal so banner shows on next return
    sessionStorage.removeItem(BANNER_DISMISSED_KEY);
  } catch { /* noop */ }
}

function getInactivityMessage(hoursAgo: number, session: LastSession): string {
  if (hoursAgo >= 48) return `You left off at a powerful point in "${session.bookTitle}"`;
  if (hoursAgo >= 24) return `Pick up where you left off — you were making great progress`;
  if (hoursAgo >= 6) return `Only ${100 - Math.round(session.progress)}% left in Chapter ${session.chapterNumber}`;
  return `Welcome back — ready to continue?`;
}

export function ReEngagementBanner() {
  const [session, setSession] = useState<LastSession | null>(null);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already dismissed this browser session
    if (sessionStorage.getItem(BANNER_DISMISSED_KEY)) return;
    
    const last = getLastSession();
    if (!last) return;
    
    const hoursAgo = (Date.now() - last.timestamp) / (1000 * 60 * 60);
    
    // Only show if inactive for 6+ hours
    if (hoursAgo < 6) return;
    
    setSession(last);
    // Delay appearance for smooth UX
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
  };

  const continueReading = () => {
    if (!session) return;
    dismiss();
    navigate(`/read/${session.bookId}/${session.chapterNumber}`);
  };

  if (!session || !visible) return null;

  const hoursAgo = (Date.now() - session.timestamp) / (1000 * 60 * 60);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -60 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 right-0 z-[90] bg-gradient-to-r from-primary/95 to-primary/85 text-primary-foreground backdrop-blur-md shadow-lg"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-foreground/15 flex items-center justify-center shrink-0">
            <BookOpen className="h-4 w-4" />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {getInactivityMessage(hoursAgo, session)}
            </p>
            <p className="text-xs opacity-75 truncate">
              Chapter {session.chapterNumber}: {session.chapterTitle}
            </p>
          </div>
          
          <Button
            size="sm"
            variant="secondary"
            onClick={continueReading}
            className="shrink-0 gap-1.5 rounded-full text-xs px-4"
          >
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          
          <button onClick={dismiss} className="opacity-60 hover:opacity-100 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
