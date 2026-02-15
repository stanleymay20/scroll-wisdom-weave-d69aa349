import { useMemo, useEffect, useRef, useState } from "react";
import hljs from 'highlight.js/lib/core';
import { StructuredCodeBlock, extractAllStructuredCodeBlocks, StructuredCodeBlockData } from "./StructuredCodeBlock";

// Import common languages for syntax highlighting
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
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import dart from 'highlight.js/lib/languages/dart';
import scala from 'highlight.js/lib/languages/scala';
import r from 'highlight.js/lib/languages/r';
import elixir from 'highlight.js/lib/languages/elixir';
import haskell from 'highlight.js/lib/languages/haskell';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c++', cpp);
hljs.registerLanguage('c', cpp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rb', ruby);
hljs.registerLanguage('php', php);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('dart', dart);
hljs.registerLanguage('scala', scala);
hljs.registerLanguage('r', r);
hljs.registerLanguage('elixir', elixir);
hljs.registerLanguage('ex', elixir);
hljs.registerLanguage('haskell', haskell);
hljs.registerLanguage('hs', haskell);

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Production-grade Markdown renderer for ScrollLibrary
 * Renders: headings, bold, italic, code, tables, lists, blockquotes, images
 * GFM-compatible with proper HTML output and syntax highlighting
 */
export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Extract structured code blocks first
  const { blocks: structuredBlocks, cleanedText } = useMemo(() => {
    if (!content) return { blocks: [], cleanedText: "" };
    return extractAllStructuredCodeBlocks(content);
  }, [content]);

  const renderedContent = useMemo(() => {
    if (!cleanedText) return "";
    
    let html = cleanedText;
    
    // Pre-process: detect plain-text headings (legacy content without ## markers)
    // A line that is short (<80 chars), standalone between blank lines, 
    // contains no punctuation ending, and looks like a title = likely a heading
    html = html.replace(/\n\n([A-Z][A-Za-z0-9 :&,\-–—']{2,75})\n\n/g, (match, line) => {
      const trimmed = line.trim();
      if (/^#{1,6}\s/.test(trimmed) || /^[-*]\s/.test(trimmed) || /[.!?;,]$/.test(trimmed)) {
        return match;
      }
      const words = trimmed.split(/\s+/);
      if (words.length > 10) return match;
      return `\n\n## ${trimmed}\n\n`;
    });

    // Detect numbered sub-headings like "4.3. Manufacturing and Logistics"
    html = html.replace(/\n\n(\d+(?:\.\d+)*\.?\s+[A-Z][A-Za-z0-9 :&,\-–—']{2,70})\n\n/g, (match, line) => {
      const trimmed = line.trim();
      if (/[.!?;,]$/.test(trimmed) && !/\.\s*$/.test(trimmed)) return match;
      const words = trimmed.split(/\s+/);
      if (words.length > 12) return match;
      return `\n\n### ${trimmed}\n\n`;
    });
    
    // Pre-process: convert bullet dots (•) to standard markdown bullets
    html = html.replace(/^[\s]*•\s+/gm, '- ');
    
    // Protect structured code block placeholders before HTML escaping
    html = html.replace(/<!--STRUCTURED_CODE_BLOCK_(\d+)-->/g, '___STRUCTURED_CODE_BLOCK_$1___');
    
    // Escape HTML entities first
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Restore structured code block placeholders after escaping
    html = html.replace(/___STRUCTURED_CODE_BLOCK_(\d+)___/g, '<!--STRUCTURED_CODE_BLOCK_$1-->');
    
    // Code blocks (```language ... ```) - render with syntax highlighting support
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
      const copyBtn = `<button class="code-copy" data-code="${encodeURIComponent(code.trim())}">Copy</button>`;
      
      // Apply syntax highlighting if language is supported
      let highlightedCode = code.trim();
      if (lang && hljs.getLanguage(lang.toLowerCase())) {
        try {
          highlightedCode = hljs.highlight(code.trim(), { 
            language: lang.toLowerCase(),
            ignoreIllegals: true 
          }).value;
        } catch {
          // Fallback to plain text
        }
      }
      
      return `<div class="code-block">${langLabel}${copyBtn}<pre><code class="hljs language-${lang || 'text'}">${highlightedCode}</code></pre></div>`;
    });
    
    // Inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // Tables (GFM style with proper pipe formatting)
    html = html.replace(/(?:(?:\*\*([^*\n]+)\*\*|([A-Za-z][^\n|]*?))\n\n?)?(\|[^\n]+\|\n\|[-:| ]+\|\n(?:\|[^\n]+\|\n?)+)/gm, (match, boldCaption, plainCaption, tableContent) => {
      const caption = (boldCaption || plainCaption || '').trim();
      const lines = (tableContent || match).trim().split('\n');
      if (lines.length < 2) return match;
      
      const headerCells = lines[0].split('|').filter((c: string) => c.trim()).map((c: string) => `<th>${c.trim()}</th>`).join('');
      const rows = lines.slice(2).map((row: string) => {
        if (!row.includes('|')) return '';
        const cells = row.split('|').filter((c: string) => c.trim()).map((c: string) => `<td>${c.trim()}</td>`).join('');
        return cells ? `<tr>${cells}</tr>` : '';
      }).filter(r => r).join('');
      
      const captionHtml = caption ? `<caption><strong>${caption}</strong></caption>` : '';
      return `<table class="md-table">${captionHtml}<thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table>`;
    });
    
    // Images ![alt](url)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      return `<figure class="md-figure"><img src="${url}" alt="${alt}" class="md-image" loading="lazy" /><figcaption>${alt}</figcaption></figure>`;
    });
    
    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');
    
    // Headings (## Heading)
    html = html.replace(/^######\s+(.+)$/gm, '<h6 class="md-h6">$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="md-h5">$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1 class="md-h1">$1</h1>');
    
    // Bold + Italic (***text*** or ___text___)
    html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    
    // Bold (**text** or __text__)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    
    // Italic (*text* or _text_)
    html = html.replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '<em>$1</em>');
    html = html.replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, '<em>$1</em>');
    
    // Underline (<u>text</u> - HTML tag passthrough)
    html = html.replace(/&lt;u&gt;([^<]+)&lt;\/u&gt;/g, '<u class="md-underline">$1</u>');
    
    // Strikethrough (~~text~~)
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    
    // Blockquotes (> text)
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');
    
    // Horizontal rules (---, ***, ___)
    html = html.replace(/^[-*_]{3,}\s*$/gm, '<hr class="md-hr" />');
    
    // Unordered lists (- item or * item)
    html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li class="md-li">$1</li>');
    html = html.replace(/(<li class="md-li">.*?<\/li>\n?)+/g, '<ul class="md-ul">$&</ul>');
    
    // Ordered lists (1. item)
    html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="md-li-ordered">$1</li>');
    html = html.replace(/(<li class="md-li-ordered">.*?<\/li>\n?)+/g, '<ol class="md-ol">$&</ol>');
    
    // Paragraphs (double newlines) — add data-sentence-index for audio sync
    let sentenceIdx = 0;
    html = html.replace(/\n\n+/g, () => `</p><p class="md-p" data-sentence-index="${sentenceIdx++}">`);
    html = `<p class="md-p" data-sentence-index="${sentenceIdx++}">${html}</p>`;
    
    // Clean up empty paragraphs
    html = html.replace(/<p class="md-p">\s*<\/p>/g, '');
    html = html.replace(/<p class="md-p">(<(?:h[1-6]|ul|ol|blockquote|table|figure|div|hr))/g, '$1');
    html = html.replace(/(<\/(?:h[1-6]|ul|ol|blockquote|table|figure|div|hr)>)<\/p>/g, '$1');
    
    return html;
  }, [cleanedText]);

  // Handle copy button clicks for legacy code blocks
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleCopyClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('code-copy')) {
        const code = decodeURIComponent(target.getAttribute('data-code') || '');
        navigator.clipboard.writeText(code).then(() => {
          target.textContent = 'Copied!';
          setTimeout(() => { target.textContent = 'Copy'; }, 2000);
        }).catch(() => {
          target.textContent = 'Failed';
          setTimeout(() => { target.textContent = 'Copy'; }, 2000);
        });
      }
    };

    container.addEventListener('click', handleCopyClick);
    return () => container.removeEventListener('click', handleCopyClick);
  }, [renderedContent]);

  // Render with structured code blocks injected
  const renderWithStructuredBlocks = () => {
    if (structuredBlocks.length === 0) {
      return (
        <div 
          ref={containerRef}
          className={`markdown-content prose prose-invert max-w-none ${className}`}
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
      );
    }

    // Split rendered content by placeholders and inject structured blocks
    const parts = renderedContent.split(/<!--STRUCTURED_CODE_BLOCK_(\d+)-->/);
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        // Regular HTML content
        if (parts[i].trim()) {
          elements.push(
            <div 
              key={`html-${i}`}
              className="markdown-content prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: parts[i] }}
            />
          );
        }
      } else {
        // Structured code block placeholder
        const blockIndex = parseInt(parts[i], 10);
        if (structuredBlocks[blockIndex]) {
          elements.push(
            <StructuredCodeBlock 
              key={`block-${blockIndex}`}
              data={structuredBlocks[blockIndex]}
              className="my-6"
            />
          );
        }
      }
    }

    return (
      <div ref={containerRef} className={className}>
        {elements}
      </div>
    );
  };

  return renderWithStructuredBlocks();
}

// Add CSS for markdown rendering
export const markdownStyles = `
.markdown-content {
  line-height: 1.7;
  color: hsl(var(--foreground));
}

.markdown-content .md-h1 {
  font-size: 2rem;
  font-weight: 700;
  margin: 1.5rem 0 1rem;
  border-bottom: 1px solid hsl(var(--border) / 0.3);
  padding-bottom: 0.5rem;
}

.markdown-content .md-h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 1.25rem 0 0.75rem;
}

.markdown-content .md-h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 1rem 0 0.5rem;
}

.markdown-content .md-h4, .markdown-content .md-h5, .markdown-content .md-h6 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0.75rem 0 0.5rem;
}

.markdown-content .md-p {
  margin: 0.75rem 0;
}

.markdown-content .md-blockquote {
  border-left: 3px solid hsl(var(--primary));
  padding-left: 1rem;
  margin: 1rem 0;
  font-style: italic;
  color: hsl(var(--muted-foreground));
}

.markdown-content .md-ul, .markdown-content .md-ol {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.markdown-content .md-li, .markdown-content .md-li-ordered {
  margin: 0.25rem 0;
}

.markdown-content .md-table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.9rem;
}

.markdown-content .md-table th, .markdown-content .md-table td {
  border: 1px solid hsl(var(--border));
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.markdown-content .md-table th {
  background: hsl(var(--muted) / 0.5);
  font-weight: 600;
}

.markdown-content .md-table tr:nth-child(even) {
  background: hsl(var(--muted) / 0.2);
}

.markdown-content .code-block {
  position: relative;
  background: hsl(220 15% 13%);
  border-radius: 0.5rem;
  margin: 1rem 0;
  overflow: hidden;
  border: 1px solid hsl(var(--border) / 0.3);
}

.markdown-content .code-block .code-lang {
  position: absolute;
  top: 0;
  left: 0;
  background: hsl(var(--muted) / 0.8);
  color: hsl(var(--muted-foreground));
  padding: 0.25rem 0.75rem;
  font-size: 0.7rem;
  text-transform: lowercase;
  border-bottom-right-radius: 0.25rem;
}

.markdown-content .code-block .code-copy {
  position: absolute;
  top: 0.25rem;
  right: 0.5rem;
  background: hsl(var(--primary) / 0.2);
  color: hsl(var(--primary));
  border: none;
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.2s;
}

.markdown-content .code-block .code-copy:hover {
  background: hsl(var(--primary) / 0.3);
}

.markdown-content .code-block pre {
  margin: 0;
  padding: 2.5rem 1rem 1rem;
  overflow-x: auto;
}

.markdown-content .code-block code {
  font-family: 'Fira Code', 'Monaco', 'Consolas', 'Liberation Mono', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  color: hsl(210 40% 96%);
}

/* Highlight.js syntax highlighting - GitHub Dark theme */
.markdown-content .hljs {
  color: #c9d1d9;
  background: transparent;
}

.markdown-content .hljs-doctag,
.markdown-content .hljs-keyword,
.markdown-content .hljs-meta .hljs-keyword,
.markdown-content .hljs-template-tag,
.markdown-content .hljs-template-variable,
.markdown-content .hljs-type,
.markdown-content .hljs-variable.language_ {
  color: #ff7b72;
}

.markdown-content .hljs-title,
.markdown-content .hljs-title.class_,
.markdown-content .hljs-title.class_.inherited__,
.markdown-content .hljs-title.function_ {
  color: #d2a8ff;
}

.markdown-content .hljs-attr,
.markdown-content .hljs-attribute,
.markdown-content .hljs-literal,
.markdown-content .hljs-meta,
.markdown-content .hljs-number,
.markdown-content .hljs-operator,
.markdown-content .hljs-selector-attr,
.markdown-content .hljs-selector-class,
.markdown-content .hljs-selector-id,
.markdown-content .hljs-variable {
  color: #79c0ff;
}

.markdown-content .hljs-meta .hljs-string,
.markdown-content .hljs-regexp,
.markdown-content .hljs-string {
  color: #a5d6ff;
}

.markdown-content .hljs-built_in,
.markdown-content .hljs-symbol {
  color: #ffa657;
}

.markdown-content .hljs-code,
.markdown-content .hljs-comment,
.markdown-content .hljs-formula {
  color: #8b949e;
}

.markdown-content .hljs-name,
.markdown-content .hljs-quote,
.markdown-content .hljs-selector-pseudo,
.markdown-content .hljs-selector-tag {
  color: #7ee787;
}

.markdown-content .hljs-subst {
  color: #c9d1d9;
}

.markdown-content .hljs-section {
  color: #1f6feb;
  font-weight: bold;
}

.markdown-content .hljs-bullet {
  color: #f2cc60;
}

.markdown-content .hljs-emphasis {
  color: #c9d1d9;
  font-style: italic;
}

.markdown-content .hljs-strong {
  color: #c9d1d9;
  font-weight: bold;
}

.markdown-content .hljs-addition {
  color: #aff5b4;
  background-color: #033a16;
}

.markdown-content .hljs-deletion {
  color: #ffdcd7;
  background-color: #67060c;
}

.markdown-content .inline-code {
  background: hsl(var(--muted));
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 0.85em;
}

.markdown-content .md-figure {
  margin: 1.5rem 0;
  text-align: center;
}

.markdown-content .md-image {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px hsl(var(--foreground) / 0.1);
}

.markdown-content .md-figure figcaption {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: hsl(var(--muted-foreground));
  font-style: italic;
}

.markdown-content .md-link {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-underline-offset: 2px;
}

.markdown-content .md-link:hover {
  color: hsl(var(--primary) / 0.8);
}

.markdown-content .md-hr {
  border: none;
  border-top: 1px solid hsl(var(--border));
  margin: 2rem 0;
}

.markdown-content .md-underline {
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: hsl(var(--primary) / 0.6);
}

.markdown-content strong {
  font-weight: 700;
  color: inherit;
}

.markdown-content em {
  font-style: italic;
  color: inherit;
}

.markdown-content del {
  text-decoration: line-through;
  opacity: 0.7;
}

/* Audio sync: active paragraph highlight */
.markdown-content [data-sentence-index].audio-active {
  background: hsl(var(--primary) / 0.15);
  border-left: 3px solid hsl(var(--primary));
  padding-left: 0.75rem;
  border-radius: 0.25rem;
  transition: background 0.3s ease, border-color 0.3s ease;
}
`;
