/**
 * PANEL NAVIGATOR COMPONENT
 * Handles gesture-based navigation with age-adaptive haptics and animations
 */

import { useCallback, useRef, useState } from "react";
import { motion, PanInfo, useAnimation } from "framer-motion";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgeAdaptiveConfig, ComicPanelData, getRandomEncouragement } from "./types";
import { toast } from "sonner";

interface PanelNavigatorProps {
  panels: ComicPanelData[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  config: AgeAdaptiveConfig;
  children: React.ReactNode;
}

export function PanelNavigator({
  panels,
  currentIndex,
  onNavigate,
  config,
  children,
}: PanelNavigatorProps) {
  const controls = useAnimation();
  const [isDragging, setIsDragging] = useState(false);
  const lastNavigationRef = useRef<number>(0);
  
  const canGoNext = currentIndex < panels.length - 1;
  const canGoPrev = currentIndex > 0;

  // Haptic feedback (if supported)
  const triggerHaptic = useCallback(() => {
    if (config.hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, [config.hapticFeedback]);

  // Navigate with optional encouragement
  const navigate = useCallback((direction: 'next' | 'prev') => {
    const now = Date.now();
    if (now - lastNavigationRef.current < 200) return; // Debounce
    lastNavigationRef.current = now;

    triggerHaptic();
    
    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    
    if (newIndex >= 0 && newIndex < panels.length) {
      onNavigate(newIndex);
      
      // Show encouragement for children at milestones
      if (config.encouragementMessages) {
        const progress = Math.floor(((newIndex + 1) / panels.length) * 100);
        if (progress === 25 || progress === 50 || progress === 75 || progress === 100) {
          toast.success(getRandomEncouragement(), {
            icon: <Star className="h-5 w-5 text-amber-400 fill-amber-400" />,
            duration: 2000,
          });
        }
      }
    }
  }, [currentIndex, panels.length, onNavigate, config.encouragementMessages, triggerHaptic]);

  // Swipe handling
  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    setIsDragging(false);
    const threshold = 50;
    const velocity = 500;
    
    if (info.offset.x < -threshold || info.velocity.x < -velocity) {
      if (canGoNext) {
        navigate('next');
      } else {
        // Bounce back animation
        controls.start({ x: 0 });
        triggerHaptic();
      }
    } else if (info.offset.x > threshold || info.velocity.x > velocity) {
      if (canGoPrev) {
        navigate('prev');
      } else {
        controls.start({ x: 0 });
        triggerHaptic();
      }
    } else {
      controls.start({ x: 0 });
    }
  }, [canGoNext, canGoPrev, navigate, controls, triggerHaptic]);

  // Animation variants based on age
  const getAnimationProps = () => {
    switch (config.animationIntensity) {
      case 'bouncy':
        return {
          initial: { opacity: 0, scale: 0.9, x: 100, rotate: 2 },
          animate: { opacity: 1, scale: 1, x: 0, rotate: 0 },
          exit: { opacity: 0, scale: 0.9, x: -100, rotate: -2 },
          transition: { type: 'spring' as const, stiffness: 300, damping: 20 },
        };
      case 'smooth':
        return {
          initial: { opacity: 0, x: 80 },
          animate: { opacity: 1, x: 0 },
          exit: { opacity: 0, x: -80 },
          transition: { duration: 0.25, ease: 'easeInOut' as const },
        };
      default:
        return {
          initial: { opacity: 0.5 },
          animate: { opacity: 1 },
          exit: { opacity: 0.5 },
          transition: { duration: 0.15 },
        };
    }
  };

  const animationProps = getAnimationProps();

  // Arrow button styles based on age
  const getArrowButtonClasses = () => {
    switch (config.ageGroup) {
      case 'children':
        return "h-14 w-14 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-lg hover:scale-110 active:scale-95";
      case 'teen':
        return "h-12 w-12 rounded-full bg-primary/90 text-primary-foreground shadow-lg hover:bg-primary";
      default:
        return "h-10 w-10 rounded-full bg-background/80 shadow-lg hover:bg-background";
    }
  };

  return (
    <div className="relative flex-1 overflow-hidden">
      <motion.div
        key={currentIndex}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        animate={controls}
        initial={animationProps.initial}
        exit={animationProps.exit}
        transition={animationProps.transition}
        className={cn(
          "absolute inset-0",
          isDragging && "cursor-grabbing"
        )}
      >
        {children}
      </motion.div>

      {/* Navigation Arrows */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate('prev')}
        disabled={!canGoPrev}
        className={cn(
          "absolute left-2 top-1/2 -translate-y-1/2 z-30 transition-all",
          getArrowButtonClasses(),
          !canGoPrev && "opacity-30 pointer-events-none"
        )}
      >
        <ChevronLeft className={cn(
          config.ageGroup === 'children' ? "h-7 w-7" : "h-5 w-5"
        )} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate('next')}
        disabled={!canGoNext}
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 z-30 transition-all",
          getArrowButtonClasses(),
          !canGoNext && "opacity-30 pointer-events-none"
        )}
      >
        <ChevronRight className={cn(
          config.ageGroup === 'children' ? "h-7 w-7" : "h-5 w-5"
        )} />
      </Button>

      {/* Tap zones for touch navigation */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1/4 z-20 cursor-pointer"
        onClick={() => canGoPrev && navigate('prev')}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-1/4 z-20 cursor-pointer"
        onClick={() => canGoNext && navigate('next')}
      />
    </div>
  );
}
