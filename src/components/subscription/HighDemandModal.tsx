/**
 * HighDemandModal — shown when a premium service (TTS, AI) is temporarily
 * exhausted at the *system* level (provider quota / outage), NOT because the
 * user hit their personal limit.
 *
 * Distinct from UsageGateModal:
 *   - never blames the user
 *   - offers Retry + Continue Reading
 *   - optionally promotes upgrade for "priority access"
 */
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw, BookOpen, Crown } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Free-text reason from the server, if any. Optional — copy is generic. */
  reason?: string;
  /** Called when user clicks Retry. */
  onRetry?: () => void;
  /** Called when user clicks Continue Reading (close + dismiss audio). */
  onContinueReading?: () => void;
  /** Show "Upgrade for priority access" CTA. */
  showUpgrade?: boolean;
  /** Where to send the user on Upgrade. */
  upgradeHref?: string;
}

export function HighDemandModal({
  open,
  onOpenChange,
  reason,
  onRetry,
  onContinueReading,
  showUpgrade = true,
  upgradeHref = "/pricing",
}: Props) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-gradient-card border-border/50">
        <DialogHeader>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="mx-auto mb-2 rounded-full bg-amber-500/15 p-3 w-fit text-amber-500"
          >
            <Activity className="h-7 w-7" aria-hidden />
          </motion.div>
          <DialogTitle className="text-center text-xl">
            High demand right now
          </DialogTitle>
          <DialogDescription className="text-center pt-1 text-base">
            Premium audio is temporarily slowed by very high demand. Your usage
            has not been counted. You can keep reading, retry in a moment, or
            switch to your device voice.
          </DialogDescription>
        </DialogHeader>

        {reason && (
          <p className="text-xs text-muted-foreground text-center -mt-1">
            {reason}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
          <Button
            variant="ghost"
            onClick={() => {
              onContinueReading?.();
              onOpenChange(false);
            }}
          >
            <BookOpen className="h-4 w-4 mr-2" />
            Continue reading
          </Button>
          {onRetry && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onRetry();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}
          {showUpgrade && (
            <Button
              variant="hero"
              onClick={() => {
                onOpenChange(false);
                navigate(upgradeHref);
              }}
            >
              <Crown className="h-4 w-4 mr-2" />
              Priority access
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
