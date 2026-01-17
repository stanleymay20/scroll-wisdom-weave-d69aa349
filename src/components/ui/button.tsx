/**
 * CONTRACT 5C-1: Button Tap Feedback
 * 
 * RULE: Button tap feedback must be ≤100ms
 * - active:scale-[0.98] provides instant visual feedback
 * - Pending state shows immediate acknowledgement
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        hero: "bg-gradient-gold text-scroll-indigo-deep font-semibold shadow-gold hover:shadow-gold-hover hover:scale-[1.02] hover:brightness-105",
        gold: "bg-gradient-gold text-scroll-indigo-deep font-semibold shadow-gold hover:shadow-gold-hover hover:scale-[1.02] hover:brightness-105",
        "gold-outline": "border-2 border-scroll-gold bg-transparent text-scroll-gold hover:bg-scroll-gold/10 hover:border-scroll-gold-light",
        muted: "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
        subtle: "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-8",
        xl: "h-14 rounded-xl px-10 text-lg",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * CONTRACT 5C-1: Show pending state with spinner
   * Provides immediate visual acknowledgement for async actions
   */
  isPending?: boolean;
  /**
   * CONTRACT 5C-1: Text to show while pending
   */
  pendingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isPending = false, pendingText, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    // Contract 5C-1: Immediate feedback for pending state
    if (isPending && !asChild) {
      return (
        <button
          className={cn(buttonVariants({ variant, size, className }), "relative")}
          ref={ref}
          disabled
          {...props}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendingText && <span className="ml-2">{pendingText}</span>}
          {!pendingText && <span className="opacity-0">{children}</span>}
        </button>
      );
    }
    
    return (
      <Comp 
        className={cn(buttonVariants({ variant, size, className }))} 
        ref={ref} 
        disabled={disabled || isPending}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
