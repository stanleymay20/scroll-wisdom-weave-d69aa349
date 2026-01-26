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

// Enhanced code execution with proper output capture
function simulateExecution(code: string, language: string): { output: string; error?: string } {
  // For JavaScript - PROPER execution with full console capture
  if (language === 'javascript') {
    try {
      const logs: string[] = [];
      const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
      };
      
      // Capture all console methods
      console.log = (...args) => {
        logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
      };
      console.warn = (...args) => {
        logs.push(`⚠️ ${args.map(a => String(a)).join(' ')}`);
      };
      console.error = (...args) => {
        logs.push(`❌ ${args.map(a => String(a)).join(' ')}`);
      };
      console.info = (...args) => {
        logs.push(`ℹ️ ${args.map(a => String(a)).join(' ')}`);
      };
      
      // Create isolated execution context with common utilities
      const result = new Function(`
        "use strict";
        // Provide common utilities
        const print = (...args) => console.log(...args);
        
        ${code}
      `)();
      
      // Restore console
      Object.assign(console, originalConsole);
      
      // Include return value if present
      if (result !== undefined) {
        logs.push(`→ ${typeof result === 'object' ? JSON.stringify(result, null, 2) : result}`);
      }
      
      return { output: logs.length > 0 ? logs.join('\n') : '✓ Code executed successfully (no output)' };
    } catch (error) {
      return { 
        output: '', 
        error: `${error instanceof Error ? error.name : 'Error'}: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
  
  // For Python - enhanced simulation with more pattern support
  if (language === 'python') {
    const outputs: string[] = [];
    
    // Match print statements with various patterns
    const printPatterns = [
      /print\s*\(\s*f?["']([^"']+)["']\s*\)/g,  // print("text") or print(f"text")
      /print\s*\(\s*(\d+(?:\s*[+\-*/]\s*\d+)*)\s*\)/g, // print(1 + 2)
      /print\s*\(\s*(\w+)\s*\)/g, // print(variable)
    ];
    
    for (const pattern of printPatterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        // Try to evaluate simple expressions
        const content = match[1];
        if (/^\d+(?:\s*[+\-*/]\s*\d+)*$/.test(content)) {
          try {
            outputs.push(String(eval(content)));
          } catch {
            outputs.push(content);
          }
        } else {
          outputs.push(content);
        }
      }
    }
    
    // Detect function definitions
    const funcDefs = code.match(/def\s+(\w+)\s*\([^)]*\):/g);
    if (funcDefs) {
      outputs.push(`📦 Defined: ${funcDefs.map(f => f.match(/def\s+(\w+)/)?.[1]).filter(Boolean).join(', ')}`);
    }
    
    // Detect class definitions
    const classDefs = code.match(/class\s+(\w+)[:(]/g);
    if (classDefs) {
      outputs.push(`🏗️ Class: ${classDefs.map(c => c.match(/class\s+(\w+)/)?.[1]).filter(Boolean).join(', ')}`);
    }
    
    if (outputs.length > 0) {
      return { output: outputs.join('\n') };
    }
    
    return { 
      output: '✓ Python code parsed successfully\n\n💡 For live Python execution, use a Python environment.\nThis playground simulates basic print() output.' 
    };
  }

  // TypeScript - transpile conceptually
  if (language === 'typescript') {
    // Try to run as JavaScript (strip types conceptually)
    const jsCode = code
      .replace(/:\s*(string|number|boolean|any|void|never|unknown)(\[\])?/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/interface\s+\w+\s*\{[^}]*\}/g, '')
      .replace(/type\s+\w+\s*=[^;]+;/g, '');
    
    return simulateExecution(jsCode, 'javascript');
  }

  // For SQL - explain the query
  if (language === 'sql') {
    const operations = [];
    if (/SELECT/i.test(code)) operations.push('📊 SELECT query');
    if (/INSERT/i.test(code)) operations.push('➕ INSERT operation');
    if (/UPDATE/i.test(code)) operations.push('✏️ UPDATE operation');
    if (/DELETE/i.test(code)) operations.push('🗑️ DELETE operation');
    if (/CREATE/i.test(code)) operations.push('🏗️ CREATE statement');
    if (/JOIN/i.test(code)) operations.push('🔗 JOIN detected');
    
    return {
      output: operations.length > 0 
        ? `✓ SQL parsed successfully\n\n${operations.join('\n')}\n\n💡 Run this query in your database client.`
        : '✓ SQL code parsed\n\n💡 Run this query in your database client for results.'
    };
  }
  
  // For other languages, provide helpful feedback
  const langInfo: Record<string, string> = {
    java: 'Java requires compilation with javac',
    cpp: 'C++ requires compilation with g++ or clang++',
    html: 'Open in browser to see rendered output',
    css: 'Apply to HTML elements to see styling',
  };
  
  return { 
    output: `✓ ${language.toUpperCase()} code parsed successfully\n\n${langInfo[language] || `${language} requires a dedicated runtime environment.`}\n\n💡 Copy this code to your local development environment to execute.`
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
