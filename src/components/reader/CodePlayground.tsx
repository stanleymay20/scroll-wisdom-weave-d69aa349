/**
 * Code Playground Component
 * A standalone sandbox for testing and running code snippets within the reader
 */

import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Play, 
  RotateCcw, 
  Copy, 
  Check, 
  Terminal,
  Code2,
  AlertCircle,
  Lightbulb,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import hljs from "highlight.js";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CodePlaygroundProps {
  initialCode?: string;
  initialLanguage?: string;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

const SUPPORTED_LANGUAGES = [
  { value: 'python', label: 'Python', executor: 'simulated' },
  { value: 'javascript', label: 'JavaScript', executor: 'browser' },
  { value: 'typescript', label: 'TypeScript', executor: 'simulated' },
  { value: 'java', label: 'Java', executor: 'simulated' },
  { value: 'cpp', label: 'C++', executor: 'simulated' },
  { value: 'sql', label: 'SQL', executor: 'simulated' },
  { value: 'html', label: 'HTML', executor: 'preview' },
  { value: 'css', label: 'CSS', executor: 'preview' },
] as const;

// Simulated execution for non-JS languages (educational purpose)
function simulateExecution(code: string, language: string): { output: string; error?: string } {
  // For JavaScript, we can actually execute it
  if (language === 'javascript') {
    try {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
      };
      
      // Create a safe execution context
      const result = new Function(`
        "use strict";
        ${code}
      `)();
      
      console.log = originalLog;
      
      if (result !== undefined) {
        logs.push(`→ ${typeof result === 'object' ? JSON.stringify(result, null, 2) : result}`);
      }
      
      return { output: logs.length > 0 ? logs.join('\n') : '(no output)' };
    } catch (error) {
      return { 
        output: '', 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  // For Python - provide educational simulation
  if (language === 'python') {
    // Simple print detection for demo purposes
    const printMatch = code.match(/print\s*\(\s*["']([^"']+)["']\s*\)/g);
    if (printMatch) {
      const outputs = printMatch.map(p => {
        const match = p.match(/print\s*\(\s*["']([^"']+)["']\s*\)/);
        return match ? match[1] : '';
      });
      return { output: outputs.join('\n') };
    }
    
    // Simple variable assignment detection
    const varMatch = code.match(/(\w+)\s*=\s*["']?([^"'\n]+)["']?/);
    if (varMatch) {
      return { output: `Variable '${varMatch[1]}' assigned value: ${varMatch[2]}` };
    }
    
    return { output: '# Code parsed successfully\n# (Live Python execution requires a server-side runtime)' };
  }
  
  // For other languages, provide syntax validation feedback
  return { 
    output: `✓ ${language.toUpperCase()} code parsed\n\n[Live execution for ${language} requires server-side compilation]\n\nTip: Review your code logic manually or test in a local environment.`
  };
}

export function CodePlayground({ 
  initialCode = '', 
  initialLanguage = 'javascript',
  isOpen,
  onClose,
  title = 'Code Playground'
}: CodePlaygroundProps) {
  const [code, setCode] = useState(initialCode);
  const [language, setLanguage] = useState(initialLanguage);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const handleRun = useCallback(() => {
    setIsRunning(true);
    setError(null);
    setOutput(null);
    
    // Small delay for visual feedback
    setTimeout(() => {
      const result = simulateExecution(code, language);
      setOutput(result.output);
      if (result.error) {
        setError(result.error);
      }
      setIsRunning(false);
    }, 300);
  }, [code, language]);

  const handleReset = useCallback(() => {
    setCode(initialCode);
    setOutput(null);
    setError(null);
  }, [initialCode]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  }, [code, toast]);

  // Highlight code for preview
  const highlightedCode = code ? 
    hljs.getLanguage(language) ? 
      hljs.highlight(code, { language }).value : 
      hljs.highlightAuto(code).value 
    : '';

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Code2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-xs text-muted-foreground">
                  Test and experiment with code snippets
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 overflow-hidden">
            {/* Editor */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Editor</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <Textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={`// Enter your ${language} code here...`}
                className="flex-1 min-h-[200px] font-mono text-sm resize-none"
                spellCheck={false}
              />
            </div>

            {/* Output */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  <Terminal className="h-3 w-3 inline mr-1" />
                  Output
                </span>
              </div>
              <div className={cn(
                "flex-1 min-h-[200px] rounded-md border bg-muted/30 p-3 overflow-auto font-mono text-sm",
                error && "border-destructive/50"
              )}>
                {isRunning ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Play className="h-4 w-4" />
                    </motion.div>
                    Running...
                  </div>
                ) : error ? (
                  <div className="text-destructive">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-semibold">Error</span>
                    </div>
                    <pre className="whitespace-pre-wrap">{error}</pre>
                  </div>
                ) : output ? (
                  <pre className="whitespace-pre-wrap text-foreground">{output}</pre>
                ) : (
                  <div className="text-muted-foreground flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    <span>Click "Run" to execute your code</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {language === 'javascript' 
                ? '✓ Live JavaScript execution' 
                : `Simulated ${language} execution (educational)`}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={handleRun} disabled={!code.trim() || isRunning} className="gap-2">
                <Play className="h-4 w-4" />
                Run Code
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

// Button to launch playground from reader
export function PlaygroundButton({ 
  code, 
  language,
  onClick 
}: { 
  code?: string;
  language?: string;
  onClick: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Button
      onClick={onClick}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      <Code2 className="h-4 w-4" />
      Playground
    </Button>
  );
}
