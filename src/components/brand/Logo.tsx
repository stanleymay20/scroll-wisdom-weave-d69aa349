/**
 * BRAND ASSETS — Enterprise Logo Component
 * 
 * Provides consistent logo display across all app contexts
 * with variants for different use cases (full, icon, light, dark).
 */

import { memo } from "react";
import { cn } from "@/lib/utils";
import logoFull from "@/assets/logo.png";

export type LogoVariant = "full" | "icon" | "wordmark";
export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
  showText?: boolean;
  animated?: boolean;
}

const sizeClasses: Record<LogoSize, string> = {
  xs: "h-6",
  sm: "h-8",
  md: "h-10",
  lg: "h-12",
  xl: "h-16",
  "2xl": "h-20",
};

const textSizeClasses: Record<LogoSize, string> = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
  xl: "text-2xl",
  "2xl": "text-3xl",
};

function LogoComponent({
  variant = "full",
  size = "md",
  className,
  showText = false,
  animated = false,
}: LogoProps) {
  const baseClasses = cn(
    sizeClasses[size],
    "w-auto",
    animated && "transition-transform hover:scale-105",
    className
  );

  // Icon-only variant shows just the logo image
  if (variant === "icon") {
    return (
      <img
        src={logoFull}
        alt="ScrollLibrary"
        className={baseClasses}
        loading="eager"
      />
    );
  }

  // Wordmark-only variant shows text without logo image
  if (variant === "wordmark") {
    return (
      <span
        className={cn(
          "font-display font-bold text-gradient-gold",
          textSizeClasses[size],
          className
        )}
      >
        ScrollLibrary
      </span>
    );
  }

  // Full variant with optional text beside logo
  return (
    <div className={cn("flex items-center gap-2", animated && "group")}>
      <img
        src={logoFull}
        alt="ScrollLibrary"
        className={cn(
          baseClasses,
          animated && "group-hover:scale-105 transition-transform"
        )}
        loading="eager"
      />
      {showText && (
        <span
          className={cn(
            "font-display font-bold text-gradient-gold hidden sm:inline",
            textSizeClasses[size]
          )}
        >
          ScrollLibrary
        </span>
      )}
    </div>
  );
}

export const Logo = memo(LogoComponent);

/**
 * Animated logo for splash screens and loading states
 */
interface AnimatedLogoProps {
  size?: LogoSize;
  showTagline?: boolean;
  className?: string;
}

function AnimatedLogoComponent({
  size = "xl",
  showTagline = false,
  className,
}: AnimatedLogoProps) {
  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse-glow" />
        
        {/* Logo with fade-in animation */}
        <img
          src={logoFull}
          alt="ScrollLibrary"
          className={cn(
            sizeClasses[size],
            "w-auto relative z-10 animate-fade-in drop-shadow-lg"
          )}
          loading="eager"
        />
      </div>
      
      {showTagline && (
        <p className="text-muted-foreground text-sm animate-fade-in animation-delay-300">
          AI-Powered Knowledge Platform
        </p>
      )}
    </div>
  );
}

export const AnimatedLogo = memo(AnimatedLogoComponent);

/**
 * Logo with loading spinner for async states
 */
interface LoadingLogoProps {
  size?: LogoSize;
  message?: string;
  className?: string;
}

function LoadingLogoComponent({
  size = "lg",
  message = "Loading...",
  className,
}: LoadingLogoProps) {
  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      <div className="relative">
        {/* Spinning ring */}
        <div className="absolute inset-0 -m-2">
          <div className="w-full h-full rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        </div>
        
        <img
          src={logoFull}
          alt="ScrollLibrary"
          className={cn(sizeClasses[size], "w-auto")}
          loading="eager"
        />
      </div>
      
      {message && (
        <p className="text-muted-foreground text-sm animate-pulse">
          {message}
        </p>
      )}
    </div>
  );
}

export const LoadingLogo = memo(LoadingLogoComponent);
