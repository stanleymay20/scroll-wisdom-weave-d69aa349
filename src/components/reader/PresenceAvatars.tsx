import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ActiveEditor } from "@/hooks/useCollaboration";
import { motion, AnimatePresence } from "framer-motion";

interface PresenceAvatarsProps {
  editors: ActiveEditor[];
  maxVisible?: number;
}

const PRESENCE_COLORS = [
  "bg-green-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-pink-500",
];

export function PresenceAvatars({ editors, maxVisible = 5 }: PresenceAvatarsProps) {
  if (editors.length === 0) return null;

  const visible = editors.slice(0, maxVisible);
  const overflow = editors.length - maxVisible;

  return (
    <TooltipProvider>
      <div className="flex items-center -space-x-2">
        <AnimatePresence mode="popLayout">
          {visible.map((editor, i) => {
            const initials = (editor.user_name || "?")
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <Tooltip key={editor.user_id}>
                <TooltipTrigger asChild>
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="relative"
                  >
                    <Avatar className="h-7 w-7 border-2 border-background ring-2 ring-primary/20">
                      {editor.user_avatar && <AvatarImage src={editor.user_avatar} />}
                      <AvatarFallback className="text-[10px] bg-muted text-foreground">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    {/* Online pulse */}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background ${PRESENCE_COLORS[i % PRESENCE_COLORS.length]}`}
                    >
                      <span className="absolute inset-0 rounded-full animate-ping opacity-50 bg-inherit" />
                    </span>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <span className="font-medium">{editor.user_name || "Anonymous"}</span>
                  <span className="text-muted-foreground ml-1">is editing</span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </AnimatePresence>

        {overflow > 0 && (
          <div className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center">
            <span className="text-[10px] font-medium text-muted-foreground">+{overflow}</span>
          </div>
        )}

        <span className="ml-3 text-xs text-muted-foreground">
          {editors.length} editing
        </span>
      </div>
    </TooltipProvider>
  );
}
