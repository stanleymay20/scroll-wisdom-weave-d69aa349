import { useState } from "react";
import { BookOpen, GraduationCap, AlertTriangle, CheckCircle2, Library, FileText, Scale } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CitationStyle } from "@/lib/citations";

export type ContentMode = 'creative' | 'academic';

interface ContentModeSelectorProps {
  mode: ContentMode;
  onModeChange: (mode: ContentMode) => void;
  citationStyle: CitationStyle;
  onCitationStyleChange: (style: CitationStyle) => void;
  disabled?: boolean;
  className?: string;
}

const CITATION_STYLES: { value: CitationStyle; label: string; description: string }[] = [
  { value: 'APA', label: 'APA 7th Edition', description: 'American Psychological Association - Most common in social sciences' },
  { value: 'Harvard', label: 'Harvard Referencing', description: 'Author-date system - Common in UK universities' },
];

export function ContentModeSelector({
  mode,
  onModeChange,
  citationStyle,
  onCitationStyleChange,
  disabled = false,
  className,
}: ContentModeSelectorProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Content Mode</Label>
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDetails ? 'Hide details' : 'Learn more'}
        </button>
      </div>
      
      <RadioGroup
        value={mode}
        onValueChange={(value) => onModeChange(value as ContentMode)}
        disabled={disabled}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {/* Creative Mode */}
        <div>
          <RadioGroupItem
            value="creative"
            id="creative-mode"
            className="peer sr-only"
          />
          <Label
            htmlFor="creative-mode"
            className={cn(
              "flex flex-col cursor-pointer rounded-xl border-2 p-4 transition-all",
              "hover:bg-muted/50 hover:border-muted-foreground/30",
              mode === 'creative' 
                ? "border-primary bg-primary/5" 
                : "border-border bg-card",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                mode === 'creative' ? "bg-primary/20" : "bg-muted"
              )}>
                <BookOpen className={cn(
                  "h-5 w-5",
                  mode === 'creative' ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">Creative / Exploratory</span>
                  <Badge variant="secondary" className="text-[10px]">Non-Academic</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  AI-generated content for learning and exploration
                </p>
              </div>
              {mode === 'creative' && (
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
              )}
            </div>
            
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span>No citation guarantees</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      <span>Best for personal learning and exploration</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Label>
        </div>

        {/* Academic Mode */}
        <div>
          <RadioGroupItem
            value="academic"
            id="academic-mode"
            className="peer sr-only"
          />
          <Label
            htmlFor="academic-mode"
            className={cn(
              "flex flex-col cursor-pointer rounded-xl border-2 p-4 transition-all",
              "hover:bg-muted/50 hover:border-muted-foreground/30",
              mode === 'academic' 
                ? "border-green-500 bg-green-500/5" 
                : "border-border bg-card",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                mode === 'academic' ? "bg-green-500/20" : "bg-muted"
              )}>
                <GraduationCap className={cn(
                  "h-5 w-5",
                  mode === 'academic' ? "text-green-500" : "text-muted-foreground"
                )} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">Academic / Referenced</span>
                  <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/50">
                    Deep Research
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Verified sources from academic databases
                </p>
              </div>
              {mode === 'academic' && (
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
              )}
            </div>
            
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <div className="flex items-center gap-2 text-xs text-green-400">
                      <Library className="h-3.5 w-3.5" />
                      <span>OpenAlex, CrossRef, Semantic Scholar, arXiv, PubMed</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-green-400">
                      <Scale className="h-3.5 w-3.5" />
                      <span>DOI-verified, peer-reviewed sources only</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Suitable for university assignments & research</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Label>
        </div>
      </RadioGroup>

      {/* Citation Style Selector (only for Academic mode) */}
      <AnimatePresence>
        {mode === 'academic' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20 space-y-3">
              <Label className="text-sm font-medium text-green-400">Citation Style</Label>
              <Select
                value={citationStyle}
                onValueChange={(value) => onCitationStyleChange(value as CitationStyle)}
                disabled={disabled}
              >
                <SelectTrigger className="bg-background border-green-500/30">
                  <SelectValue placeholder="Select citation style" />
                </SelectTrigger>
                <SelectContent>
                  {CITATION_STYLES.map((style) => (
                    <SelectItem key={style.value} value={style.value}>
                      <div className="flex flex-col">
                        <span>{style.label}</span>
                        <span className="text-xs text-muted-foreground">{style.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="flex items-start gap-2 p-2 rounded bg-green-500/10 text-xs text-green-300">
                <GraduationCap className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p>
                  Academic mode conducts real-time research before content generation. 
                  Generation will only proceed with verified sources.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
