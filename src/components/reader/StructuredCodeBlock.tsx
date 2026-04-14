import { useState, useMemo } from "react";
import { Copy, Check, ChevronDown, ChevronUp, AlertTriangle, Terminal, BookOpen, Lightbulb } from "lucide-react";
import hljs from 'highlight.js/lib/core';
import DOMPurify from "dompurify";

// Import common languages
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import cpp from 'highlight.js/lib/languages/cpp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import dart from 'highlight.js/lib/languages/dart';
import scala from 'highlight.js/lib/languages/scala';
import r from 'highlight.js/lib/languages/r';

// Register languages
const languages: Record<string, any> = {
  javascript, js: javascript, typescript, ts: typescript, python, py: python,
  java, csharp, cs: csharp, cpp, 'c++': cpp, c: cpp, go, rust, ruby, rb: ruby,
  php, swift, kotlin, sql, bash, sh: bash, shell: bash, json, xml, html: xml,
  css, dart, scala, r
};

Object.entries(languages).forEach(([name, lang]) => {
  if (!hljs.getLanguage(name)) {
    hljs.registerLanguage(name, lang);
  }
});

export interface StructuredCodeBlockData {
  language: string;
  title?: string;
  purpose?: string;
  code: string;
  output?: string;
  explanation?: string;
  commonMistake?: string;
}

interface StructuredCodeBlockProps {
  data: StructuredCodeBlockData;
  className?: string;
}

/**
 * ChatGPT-level structured code block component
 * Renders code as a first-class content object with:
 * - Language tag + syntax highlighting
 * - Purpose statement
 * - Copy-safe code block
 * - Expected output panel
 * - Explanation section
 * - Common mistake warning
 */
export function StructuredCodeBlock({ data, className = "" }: StructuredCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(true);

  const highlightedCode = useMemo(() => {
    const lang = data.language?.toLowerCase() || 'text';
    if (hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(data.code.trim(), { 
          language: lang,
          ignoreIllegals: true 
        }).value;
      } catch {
        return data.code.trim();
      }
    }
    return data.code.trim();
  }, [data.code, data.language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.code.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = data.code.trim();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasMetadata = data.purpose || data.explanation || data.commonMistake || data.output;

  return (
    <div className={`structured-code-block rounded-lg border border-border/50 overflow-hidden bg-card/30 ${className}`}>
      {/* Header: Language + Title + Actions */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border/30">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 text-xs font-mono font-medium bg-primary/20 text-primary rounded">
            {data.language?.toUpperCase() || 'CODE'}
          </span>
          {data.title && (
            <span className="text-sm font-medium text-foreground/90">{data.title}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasMetadata && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded"
              title={showDetails ? "Hide details" : "Show details"}
            >
              {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-background/50 hover:bg-background/80 rounded transition-all"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check size={14} className="text-green-500" />
                <span className="text-green-500">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Purpose Statement */}
      {data.purpose && showDetails && (
        <div className="px-4 py-2 bg-muted/20 border-b border-border/20 flex items-start gap-2">
          <BookOpen size={14} className="text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">Purpose:</span> {data.purpose}
          </p>
        </div>
      )}

      {/* Code Block */}
      <div className="relative">
        <pre className="p-4 overflow-x-auto bg-[hsl(220,15%,13%)]">
          <code 
            className={`hljs language-${data.language || 'text'} text-sm font-mono leading-relaxed`}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightedCode) }}
          />
        </pre>
      </div>

      {/* Output Panel */}
      {data.output && showDetails && (
        <div className="border-t border-border/30">
          <div className="px-4 py-2 bg-muted/30 flex items-center gap-2 border-b border-border/20">
            <Terminal size={14} className="text-green-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Output</span>
          </div>
          <pre className="px-4 py-3 text-sm font-mono bg-[hsl(220,15%,10%)] text-green-400 overflow-x-auto">
            {data.output.trim()}
          </pre>
        </div>
      )}

      {/* Explanation Section */}
      {data.explanation && showDetails && (
        <div className="px-4 py-3 bg-muted/10 border-t border-border/30 flex items-start gap-2">
          <Lightbulb size={14} className="text-yellow-500 mt-0.5 shrink-0" />
          <div className="text-sm text-foreground/80">
            <span className="font-medium text-foreground">Explanation:</span>{' '}
            {data.explanation}
          </div>
        </div>
      )}

      {/* Common Mistake Warning */}
      {data.commonMistake && showDetails && (
        <div className="px-4 py-3 bg-destructive/10 border-t border-destructive/20 flex items-start gap-2">
          <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />
          <div className="text-sm text-destructive/90">
            <span className="font-medium text-destructive">Common Mistake:</span>{' '}
            {data.commonMistake}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Parse structured code block format from text
 * Supports format:
 * [CODE_BLOCK]
 * language: python
 * title: "Title"
 * purpose: "Purpose"
 * code:
 * ```python
 * code here
 * ```
 * output:
 * output here
 * explanation:
 * explanation here
 * common_mistake:
 * mistake here
 * [/CODE_BLOCK]
 */
export function parseStructuredCodeBlock(text: string): StructuredCodeBlockData | null {
  const blockMatch = text.match(/\[CODE_BLOCK\]([\s\S]*?)\[\/CODE_BLOCK\]/);
  if (!blockMatch) return null;

  const content = blockMatch[1];
  
  // Check if this is a structured format (has field: value pairs) or raw code
  const hasStructuredFields = /^(?:language|title|purpose|code):\s/mi.test(content);
  
  if (!hasStructuredFields) {
    // Raw code format: [CODE_BLOCK]\ncode here\n[/CODE_BLOCK]
    const rawCode = content.trim();
    if (!rawCode) return null;
    
    // Auto-detect language from code content
    let detectedLang = 'python';
    if (/^\s*(import|from)\s+\w+/m.test(rawCode) || /def\s+\w+\(/.test(rawCode) || /class\s+\w+.*:/.test(rawCode)) {
      detectedLang = 'python';
    } else if (/^\s*(const|let|var|function|import)\s/m.test(rawCode) || /=>\s*{/.test(rawCode)) {
      detectedLang = 'javascript';
    } else if (/^\s*(public|private|protected)\s+(static\s+)?(void|int|String|class)/m.test(rawCode)) {
      detectedLang = 'java';
    } else if (/^\s*#include\s/m.test(rawCode)) {
      detectedLang = 'cpp';
    } else if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\s/mi.test(rawCode)) {
      detectedLang = 'sql';
    }
    
    return {
      language: detectedLang,
      code: rawCode,
    };
  }
  
  // Structured format with field: value pairs
  const extractField = (field: string): string | undefined => {
    const regex = new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, 'mi');
    const match = content.match(regex);
    return match?.[1]?.trim();
  };

  const extractMultilineField = (field: string): string | undefined => {
    const regex = new RegExp(`^${field}:\\s*\\n([\\s\\S]*?)(?=^(?:language|title|purpose|code|output|explanation|common_mistake):|\\[\\/)`, 'mi');
    const match = content.match(regex);
    return match?.[1]?.trim();
  };

  // Extract code: prefer the full multiline field (captures everything between code: and next field)
  // then strip any fenced code block markers (```lang / ```) that may appear inside
  let code = '';
  const rawCodeField = extractMultilineField('code');
  if (rawCodeField) {
    code = rawCodeField
      .replace(/^`{3,}\s*["']?\s*\w*\s*["']?\s*\n?/gm, '')  // opening fences (flexible)
      .replace(/^`{3,}\s*$/gm, '')     // closing fences
      .trim();
  }
  if (!code) {
    const codeMatch = content.match(/code:\s*\n`{3,}\s*\w*\n([\s\S]*?)`{3,}/);
    code = codeMatch?.[1]?.trim() || '';
  }

  const outputMatch = content.match(/output:\s*\n([\s\S]*?)(?=^(?:explanation|common_mistake):|$)/mi);
  const output = outputMatch?.[1]?.trim();

  return {
    language: extractField('language') || 'text',
    title: extractField('title'),
    purpose: extractField('purpose') || extractMultilineField('purpose'),
    code,
    output,
    explanation: extractMultilineField('explanation'),
    commonMistake: extractMultilineField('common_mistake'),
  };
}

/**
 * Check if text contains structured code blocks
 */
export function hasStructuredCodeBlocks(text: string): boolean {
  return /\[CODE_BLOCK\][\s\S]*?\[\/CODE_BLOCK\]/.test(text);
}

/**
 * Extract all structured code blocks from text
 */
export function extractAllStructuredCodeBlocks(text: string): { blocks: StructuredCodeBlockData[]; cleanedText: string } {
  const blocks: StructuredCodeBlockData[] = [];
  let cleanedText = text;

  const blockRegex = /\[CODE_BLOCK\]([\s\S]*?)\[\/CODE_BLOCK\]/g;
  let match;

  while ((match = blockRegex.exec(text)) !== null) {
    const parsed = parseStructuredCodeBlock(match[0]);
    if (parsed) {
      blocks.push(parsed);
      cleanedText = cleanedText.replace(match[0], `<!--STRUCTURED_CODE_BLOCK_${blocks.length - 1}-->`);
    }
  }

  // Remove orphaned code fences that now only wrap a placeholder
  cleanedText = cleanedText.replace(/```\w*\s*\n\s*<!--STRUCTURED_CODE_BLOCK_(\d+)-->\s*\n\s*```/g, '<!--STRUCTURED_CODE_BLOCK_$1-->');
  // Also handle single-line variants
  cleanedText = cleanedText.replace(/```\w*\s*<!--STRUCTURED_CODE_BLOCK_(\d+)-->\s*```/g, '<!--STRUCTURED_CODE_BLOCK_$1-->');

  return { blocks, cleanedText };
}
