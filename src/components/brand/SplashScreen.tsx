/**
 * SPLASH SCREEN — Enterprise-grade loading screen
 * 
 * Shows branded splash during initial app load for polished first impression.
 * Uses CSS animations to minimize JS execution during critical load path.
 */

import { memo, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import logoFull from "@/assets/logo.png";

interface SplashScreenProps {
  /** Minimum display time in ms (default: 1500) */
  minDisplayTime?: number;
  /** Called when splash should hide */
  onComplete?: () => void;
  /** Force hide the splash */
  forceHide?: boolean;
  className?: string;
}

function SplashScreenComponent({
  minDisplayTime = 1500,
  onComplete,
  forceHide = false,
  className,
}: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [hasMinTimeElapsed, setHasMinTimeElapsed] = useState(false);

  // Track minimum display time
  useEffect(() => {
    const timer = setTimeout(() => {
      setHasMinTimeElapsed(true);
    }, minDisplayTime);

    return () => clearTimeout(timer);
  }, [minDisplayTime]);

  // Hide when both conditions are met
  useEffect(() => {
    if ((hasMinTimeElapsed || forceHide) && isVisible) {
      setIsVisible(false);
      onComplete?.();
    }
  }, [hasMinTimeElapsed, forceHide, isVisible, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={cn(
            "fixed inset-0 z-[100] flex flex-col items-center justify-center",
            "bg-background",
            className
          )}
        >
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-float" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl animate-float animation-delay-1000" />
          </div>

          {/* Main content */}
          <div className="relative z-10 flex flex-col items-center gap-8">
            {/* Logo with glow */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative"
            >
              {/* Glow effect */}
              <div className="absolute inset-0 -m-4 bg-primary/10 rounded-full blur-2xl animate-pulse-glow" />
              
              <img
                src={logoFull}
                alt="ScrollLibrary"
                className="h-24 sm:h-32 w-auto relative z-10 drop-shadow-lg"
                loading="eager"
              />
            </motion.div>

            {/* Loading indicator */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex flex-col items-center gap-4"
            >
              {/* Progress bar */}
              <div className="w-48 h-1 bg-border/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.2,
                    ease: "easeInOut",
                  }}
                  className="w-full h-full bg-gradient-to-r from-transparent via-primary to-transparent"
                />
              </div>

              {/* Tagline */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-muted-foreground text-sm"
              >
                AI-Powered Knowledge Platform
              </motion.p>
            </motion.div>
          </div>

          {/* Footer branding */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="absolute bottom-8 text-center"
          >
            <p className="text-muted-foreground/60 text-xs">
              © {new Date().getFullYear()} ScrollLibrary™
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const SplashScreen = memo(SplashScreenComponent);

/**
 * Simple inline splash for Suspense fallback
 * Uses minimal JS for fast initial render
 */
export function InlineSplash() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <img
          src={logoFull}
          alt="ScrollLibrary"
          className="h-20 w-auto animate-pulse"
          loading="eager"
        />
        <div className="w-32 h-1 bg-border/50 rounded-full overflow-hidden">
          <div className="w-full h-full bg-primary/50 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
