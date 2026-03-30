import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageCircle, Highlighter, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TextHighlighterProps {
  onAskAboutSelection: (text: string) => void;
  children: React.ReactNode;
}

export function TextHighlighter({ onAskAboutSelection, children }: TextHighlighterProps) {
  const [selectedText, setSelectedText] = useState("");
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    
    if (text && text.length > 5) {
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      
      if (rect) {
        setSelectedText(text);
        setSelectionPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        });
      }
    } else {
      setSelectedText("");
      setSelectionPosition(null);
    }
  }, []);

  const handleAskQuestion = useCallback(() => {
    if (selectedText) {
      onAskAboutSelection(selectedText);
      setSelectedText("");
      setSelectionPosition(null);
      window.getSelection()?.removeAllRanges();
    }
  }, [selectedText, onAskAboutSelection]);

  const handleDismiss = useCallback(() => {
    setSelectedText("");
    setSelectionPosition(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return (
    <div onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp}>
      {children}
      
      <AnimatePresence>
        {selectedText && selectionPosition && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="fixed z-50 flex items-center gap-1 bg-card border border-border rounded-lg shadow-lg p-1"
            style={{
              left: Math.min(Math.max(selectionPosition.x - 80, 10), window.innerWidth - 170),
              top: Math.max(selectionPosition.y - 50, 10),
            }}
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              onClick={handleAskQuestion}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Ask AI
            </Button>
            <div className="w-px h-4 bg-border" />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleDismiss}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Display component for showing highlighted text context
export function HighlightedTextContext({ text }: { text: string }) {
  if (!text) return null;
  
  const displayText = text.length > 100 ? text.slice(0, 100) + "..." : text;
  
  return (
    <div className="bg-primary/10 border border-primary/30 rounded-lg p-2 mb-2">
      <div className="flex items-center gap-1.5 text-xs text-primary mb-1">
        <Highlighter className="h-3 w-3" />
        Selected text:
      </div>
      <p className="text-xs text-muted-foreground italic line-clamp-2">
        "{displayText}"
      </p>
    </div>
  );
}
