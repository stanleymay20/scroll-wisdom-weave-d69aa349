import { useMemo, useEffect, useRef } from "react";
import hljs from 'highlight.js/lib/core';
import DOMPurify from "dompurify";
import { StructuredCodeBlock, extractAllStructuredCodeBlocks, StructuredCodeBlockData } from "./StructuredCodeBlock";
import { ComputationalEvidencePanel } from "./ComputationalEvidencePanel";
import { parseEvidenceBlocks, type ParsedEvidenceBlock } from "@/lib/computationalEvidence";

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
  const blobUrlsRef = useRef<string[]>([]);
  
  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);
  
  // Pre-process: Extract base64 images and storage URLs
  // Convert base64 to blob URLs for efficient DOM rendering; keep storage URLs as-is
  const { processedContent, extractedImages } = useMemo(() => {
    if (!content) return { processedContent: "", extractedImages: [] as { alt: string; src: string; caption: string }[] };
    
    // Revoke previous blob URLs
    blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    blobUrlsRef.current = [];
    
    const images: { alt: string; src: string; caption: string }[] = [];
    let processed = content;
    
    // PHASE 1: Extract storage URL images first (safe regex — URLs are short)
    processed = processed.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_, alt, url) => {
      const idx = images.length;
      images.push({ alt, src: url, caption: alt });
      return `<!--BASE64_IMG_${idx}-->`;
    });
    
    // PHASE 2: Extract base64 data URI images using indexOf (regex would crash)
    let searchFrom = 0;
    let iterations = 0;
    const MAX_ITERATIONS = 200; // safety valve
    
    while (iterations++ < MAX_ITERATIONS) {
      const marker = '](data:image/';
      const markerIdx = processed.indexOf(marker, searchFrom);
      if (markerIdx === -1) break;
      
      // Find the opening ![
      const bangIdx = processed.lastIndexOf('![', markerIdx);
      if (bangIdx === -1 || bangIdx < searchFrom) { searchFrom = markerIdx + marker.length; continue; }
      
      // Verify no newline between ![ and ](
      const between = processed.substring(bangIdx, markerIdx);
      if (between.includes('\n')) { searchFrom = markerIdx + marker.length; continue; }
      
      // Find closing paren — scan for the FIRST ')' that follows a valid base64 char
      // Base64 uses A-Z a-z 0-9 + / = and the data URI header has : ; , /
      // ')' is NOT a valid base64 character, so first ')' is always the closer
      const closeIdx = processed.indexOf(')', markerIdx + marker.length);
      if (closeIdx === -1) break;
      
      const alt = processed.substring(bangIdx + 2, markerIdx);
      const dataUri = processed.substring(markerIdx + 2, closeIdx);
      
      // Convert base64 data URI to blob URL for efficient rendering
      let renderSrc = '';
      try {
        const commaIdx = dataUri.indexOf(',');
        if (commaIdx > 0 && commaIdx < 100) { // meta part should be short
          const meta = dataUri.substring(0, commaIdx);
          const mime = meta.match(/:(.*?);/)?.[1] || 'image/png';
          const b64 = dataUri.substring(commaIdx + 1);
          // Validate it looks like base64 before decoding
          if (b64.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(b64.substring(0, 100))) {
            const byteString = atob(b64);
            const ab = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) ab[i] = byteString.charCodeAt(i);
            const blob = new Blob([ab], { type: mime });
            renderSrc = URL.createObjectURL(blob);
            blobUrlsRef.current.push(renderSrc);
          }
        }
      } catch {
        // If conversion fails, skip this image entirely (don't use raw data URI)
        renderSrc = '';
      }
      
      if (renderSrc) {
        const idx = images.length;
        images.push({ alt, src: renderSrc, caption: alt });
        const placeholder = `<!--BASE64_IMG_${idx}-->`;
        processed = processed.substring(0, bangIdx) + placeholder + processed.substring(closeIdx + 1);
        searchFrom = bangIdx + placeholder.length;
      } else {
        // Remove the broken image reference to prevent rendering issues
        processed = processed.substring(0, bangIdx) + processed.substring(closeIdx + 1);
        searchFrom = bangIdx;
      }
    }
    
    return { processedContent: processed, extractedImages: images };
  }, [content]);
  
  // Extract evidence blocks first, then structured code blocks
  const { blocks: evidenceBlocks, cleanedAfterEvidence } = useMemo(() => {
    if (!processedContent) return { blocks: [] as ParsedEvidenceBlock[], cleanedAfterEvidence: "" };
    const result = parseEvidenceBlocks(processedContent);
    return { blocks: result.blocks, cleanedAfterEvidence: result.cleanedText };
  }, [processedContent]);

  const { blocks: structuredBlocks, cleanedText } = useMemo(() => {
    if (!cleanedAfterEvidence) return { blocks: [], cleanedText: "" };
    return extractAllStructuredCodeBlocks(cleanedAfterEvidence);
  }, [cleanedAfterEvidence]);

  const renderedContent = useMemo(() => {
    if (!cleanedText) return "";
    
    let html = cleanedText;

    // CRITICAL: Protect fenced code blocks BEFORE any newline normalization.
    // Uses line-by-line parsing instead of regex to handle all fence patterns reliably.
    const protectedCodeBlocks: { lang: string; code: string }[] = [];
    {
      const lines = html.split('\n');
      const result: string[] = [];
      let inCodeBlock = false;
      let codeLang = '';
      let codeLines: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!inCodeBlock && /^```(\w*)$/.test(trimmed)) {
          inCodeBlock = true;
          codeLang = trimmed.replace(/^```/, '');
          codeLines = [];
        } else if (inCodeBlock && trimmed === '```') {
          protectedCodeBlocks.push({ lang: codeLang, code: codeLines.join('\n') });
          result.push(`___FENCED_CODE_${protectedCodeBlocks.length - 1}___`);
          inCodeBlock = false;
        } else if (inCodeBlock) {
          codeLines.push(line);
        } else {
          result.push(line);
        }
      }
      // If unclosed fence, flush remaining lines as code block
      if (inCodeBlock && codeLines.length > 0) {
        protectedCodeBlocks.push({ lang: codeLang, code: codeLines.join('\n') });
        result.push(`___FENCED_CODE_${protectedCodeBlocks.length - 1}___`);
      }
      html = result.join('\n');
      if (protectedCodeBlocks.length > 0) {
        console.log(`[MarkdownRenderer] Protected ${protectedCodeBlocks.length} fenced code blocks (lines: ${protectedCodeBlocks.map(b => b.code.split('\n').length).join(', ')})`);
      }
    }

    // Pre-process: Ensure paragraphs are separated by double newlines.
    // AI-generated content often uses single newlines between paragraphs,
    // causing the entire chapter to render as ONE block (breaks audio sync).
    // PERFORMANCE: Only run on content < 500KB to avoid catastrophic backtracking
    if (html.length < 500_000) {
      html = html.replace(/([^\n])\n(?=[^\n#\-*>\d|`])/g, '$1\n\n');
    }
    
    // Pre-process: detect plain-text headings (legacy content without ## markers)
    // A line that is short (<80 chars), standalone between blank lines, 
    // contains no punctuation ending, and looks like a title = likely a heading
    html = html.replace(/\n\n([A-Z][A-Za-z0-9 :&,\-–—'()]{2,75})\n\n/g, (match, line) => {
      const trimmed = line.trim();
      if (/^#{1,6}\s/.test(trimmed) || /^[-*]\s/.test(trimmed) || /[.!?;,]$/.test(trimmed)) {
        return match;
      }
      const words = trimmed.split(/\s+/);
      if (words.length > 10) return match;
      return `\n\n## ${trimmed}\n\n`;
    });

    // Detect numbered sub-headings like "4.3. Manufacturing and Logistics" or "1.1.2. Floating-Point Numbers (float)"
    // Match with either double newline or single newline after (sub-headings often have body on next line)
    html = html.replace(/\n\n(\d+(?:\.\d+)*\.?\s+[A-Za-z][A-Za-z0-9 :&,\-–—'()*/]{2,70})\n/g, (match, line) => {
      const trimmed = line.trim();
      // Skip if it ends with sentence-ending punctuation (but allow closing parenthesis)
      if (/[.!?;,]$/.test(trimmed) && !/[)]$/.test(trimmed) && !/\.\s*$/.test(trimmed)) return match;
      const words = trimmed.split(/\s+/);
      if (words.length > 12) return match;
      // Don't convert if it looks like a regular sentence (too many words or contains "the", "is", "are" etc.)
      if (words.length > 8 && /\b(the|is|are|was|were|and|or|but|for|with|that|this|from|into|have|has)\b/i.test(trimmed)) return match;
      return `\n\n### ${trimmed}\n\n`;
    });
    
    // Pre-process: convert bullet dots (•) to standard markdown bullets
    html = html.replace(/^[\s]*•\s+/gm, '- ');
    
    // Unescape markdown escape sequences EARLY (before formatting processing)
    // AI-generated content often uses backslash-escapes for special chars like \* \_ \# etc.
    // If we unescape after formatting, escaped markers stay as raw text.
    html = html.replace(/\\([\\`*_{}[\]()#+\-.!~|$>])/g, '$1');
    
    // Protect structured code block and evidence block placeholders before HTML escaping
    html = html.replace(/<!--STRUCTURED_CODE_BLOCK_(\d+)-->/g, '___STRUCTURED_CODE_BLOCK_$1___');
    html = html.replace(/<!--EVIDENCE_BLOCK_(\d+)-->/g, '___EVIDENCE_BLOCK_$1___');
    
    // Escape HTML entities first
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Restore structured code block and evidence block placeholders after escaping
    html = html.replace(/___STRUCTURED_CODE_BLOCK_(\d+)___/g, '<!--STRUCTURED_CODE_BLOCK_$1-->');
    html = html.replace(/___EVIDENCE_BLOCK_(\d+)___/g, '<!--EVIDENCE_BLOCK_$1-->');

    // NOTE: Fenced code block placeholders (___FENCED_CODE_N___) are restored
    // AFTER paragraph splitting to prevent \n\n inside <pre> from being split.
    
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
      return `<div class="md-table-wrapper"><table class="md-table">${captionHtml}<thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div>`;
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
    html = html.replace(/\*\*\*((?:[^*]|\*(?!\*\*))+)\*\*\*/g, '<strong><em>$1</em></strong>');
    
    // Bold (**text** or __text__) — allow single * inside bold (e.g. **text *italic* more**)
    html = html.replace(/\*\*((?:[^*]|\*(?!\*))+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__((?:[^_]|_(?!_))+)__/g, '<strong>$1</strong>');
    
    // Italic (*text* or _text_)
    html = html.replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '<em>$1</em>');
    html = html.replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, '<em>$1</em>');

    // Underline (<u>text</u> - HTML tag passthrough)
    html = html.replace(/&lt;u&gt;([^<]+)&lt;\/u&gt;/g, '<u class="md-underline">$1</u>');
    
    // Subscript (<sub>text</sub>) and Superscript (<sup>text</sup>) passthrough
    html = html.replace(/&lt;sub&gt;([\s\S]*?)&lt;\/sub&gt;/g, '<sub>$1</sub>');
    html = html.replace(/&lt;sup&gt;([\s\S]*?)&lt;\/sup&gt;/g, '<sup>$1</sup>');
    
    // Mark/highlight (<mark>text</mark>) passthrough
    html = html.replace(/&lt;mark&gt;([\s\S]*?)&lt;\/mark&gt;/g, '<mark>$1</mark>');
    
    // Strikethrough (~~text~~)
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    
    // Blockquotes (> text) — match &gt; since > was already HTML-escaped
    html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

    // Horizontal rules (---, ***, ___)
    html = html.replace(/^[-*_]{3,}\s*$/gm, '<hr class="md-hr" />');
    
    // Unordered lists (- item or * item)
    html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li class="md-li">$1</li>');
    html = html.replace(/(<li class="md-li">.*?<\/li>\n?)+/g, '<ul class="md-ul">$&</ul>');
    
    // Ordered lists (1. item)
    html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="md-li-ordered">$1</li>');
    html = html.replace(/(<li class="md-li-ordered">.*?<\/li>\n?)+/g, '<ol class="md-ol">$&</ol>');
    
    // Paragraphs (double newlines) — use <div> instead of <p> to prevent browser
    // auto-correction when block elements (ol, ul, table) appear inside.
    html = html.replace(/\n\n+/g, '</div><div class="md-p">');
    html = `<div class="md-p">${html}</div>`;
    
    // Clean up empty blocks
    html = html.replace(/<div class="md-p">\s*<\/div>/g, '');
    
    // Remove <div class="md-p"> wrappers around block elements to avoid nesting issues
    html = html.replace(/<div class="md-p">\s*(<(?:h[1-6]|blockquote|table|figure|div|ul|ol|hr)[^>]*>)/g, '$1');
    html = html.replace(/(<\/(?:h[1-6]|blockquote|table|figure|div|ul|ol|hr)>)\s*<\/div>/g, '$1');
    
    // Replace base64 image placeholders with actual image tags (lazy-loaded)
    html = html.replace(/&lt;!--BASE64_IMG_(\d+)--&gt;/g, (_, idxStr) => {
      const idx = parseInt(idxStr);
      return `<!--BASE64_IMG_${idx}-->`;
    });
    
    // Note: Primary unescape step now runs early (before formatting).
    // This late pass catches any remaining escaped chars inside generated HTML.
    html = html.replace(/\\([\\`*_{}[\]()#+\-.!~|$>])/g, '$1');

    // data-sentence-index is assigned post-render via DOM useEffect (not regex)
    return html;
  }, [cleanedText]);

  // POST-RENDER: Assign sequential data-sentence-index to block-level children
  // AND wrap text nodes into word-level spans for granular audio highlighting.
  // PERFORMANCE GUARD: Skip expensive word-wrapping for content > 500KB (base64 images)
  const contentSize = (content || '').length;
  const skipWordWrapping = contentSize > 500_000;
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Remove any previous indices to avoid stale state on re-render
    container.querySelectorAll('[data-sentence-index]').forEach(el => {
      el.removeAttribute('data-sentence-index');
    });
    
    if (!skipWordWrapping) {
      container.querySelectorAll('[data-word-index]').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent || ''), el);
          parent.normalize();
        }
      });
    }

    // When content has illustrations/structured blocks, the renderer creates
    // multiple .markdown-content divs with <figure> and code block elements
    // between them as direct children of containerRef. We must index ALL
    // block-level elements in document order for audio sync to work seamlessly.
    const hasMultipleContainers = !container.classList.contains('markdown-content') 
      && container.querySelectorAll('.markdown-content').length > 0;
    
    // Collect ALL block-level elements in document order
    const allBlockElements: HTMLElement[] = [];
    
    if (hasMultipleContainers) {
      // Walk direct children of containerRef — includes .markdown-content divs,
      // <figure> elements (illustrations), and code block wrappers
      for (let i = 0; i < container.children.length; i++) {
        const child = container.children[i] as HTMLElement;
        if (child.classList.contains('markdown-content')) {
          // Expand: add each child of the markdown-content div
          for (let j = 0; j < child.children.length; j++) {
            allBlockElements.push(child.children[j] as HTMLElement);
          }
        } else {
          // Direct block element (figure, structured code block wrapper, etc.)
          allBlockElements.push(child);
        }
      }
    } else if (container.classList.contains('markdown-content')) {
      for (let i = 0; i < container.children.length; i++) {
        allBlockElements.push(container.children[i] as HTMLElement);
      }
    } else {
      // Fallback: single markdown-content or bare container
      const mc = container.querySelector('.markdown-content') || container;
      for (let i = 0; i < mc.children.length; i++) {
        allBlockElements.push(mc.children[i] as HTMLElement);
      }
    }

    let globalBlockIdx = 0;
    let globalWordIdx = 0;
    
    for (const el of allBlockElements) {
      el.setAttribute('data-sentence-index', String(globalBlockIdx++));
      
      // Skip word-level wrapping for huge content or code/table/figure elements
      if (skipWordWrapping || el.classList.contains('code-block') || el.tagName === 'TABLE' || el.tagName === 'FIGURE') {
        continue;
      }
      
      // Walk text nodes and wrap each word in a span with data-word-index
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      const textNodes: Text[] = [];
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        // Skip text inside code elements
        if (node.parentElement?.closest('code, pre, .code-block')) continue;
        if (node.textContent && node.textContent.trim().length > 0) {
          textNodes.push(node);
        }
      }
      
      for (const textNode of textNodes) {
        const text = textNode.textContent || '';
        // Split into words keeping whitespace
        const parts = text.split(/(\s+)/);
        if (parts.length <= 1 && !text.trim()) continue;
        
        const fragment = document.createDocumentFragment();
        for (const part of parts) {
          if (/^\s+$/.test(part) || part === '') {
            fragment.appendChild(document.createTextNode(part));
          } else {
            const span = document.createElement('span');
            span.setAttribute('data-word-index', String(globalWordIdx++));
            span.textContent = part;
            fragment.appendChild(span);
          }
        }
        textNode.parentNode?.replaceChild(fragment, textNode);
      }
    }
    console.log(`[MarkdownRenderer] Indexed ${globalBlockIdx} blocks, ${globalWordIdx} words${skipWordWrapping ? ' (word-wrap skipped: large content)' : ''}`);
  }, [renderedContent, structuredBlocks, skipWordWrapping]);

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

  // Render with structured code blocks and base64 images injected
  const renderWithStructuredBlocks = () => {
    // Split by structured code blocks, base64 image placeholders, and evidence blocks
    const combinedRegex = /<!--STRUCTURED_CODE_BLOCK_(\d+)-->|<!--BASE64_IMG_(\d+)-->|<!--EVIDENCE_BLOCK_(\d+)-->/;
    const parts = renderedContent.split(combinedRegex);
    const elements: React.ReactNode[] = [];
    
    // If no placeholders at all, render directly
    if (structuredBlocks.length === 0 && extractedImages.length === 0 && evidenceBlocks.length === 0) {
      return (
        <div 
          ref={containerRef}
          className={`markdown-content max-w-none ${className}`}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderedContent) }}
        />
      );
    }

    // parts array: [html, codeBlockIdx|undefined, imgIdx|undefined, evidenceIdx|undefined, html, ...]
    // Every 4 entries: html, codeBlockIdx, imgIdx, evidenceIdx
    for (let i = 0; i < parts.length; i += 4) {
      // Regular HTML content
      const htmlPart = parts[i];
      if (htmlPart && htmlPart.trim()) {
        elements.push(
          <div 
            key={`html-${i}`}
            className="markdown-content max-w-none"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlPart) }}
          />
        );
      }
      
      // Structured code block placeholder
      if (i + 1 < parts.length && parts[i + 1] !== undefined) {
        const blockIndex = parseInt(parts[i + 1], 10);
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
      
      // Base64 image placeholder
      if (i + 2 < parts.length && parts[i + 2] !== undefined) {
        const imgIndex = parseInt(parts[i + 2], 10);
        if (extractedImages[imgIndex]) {
          const img = extractedImages[imgIndex];
          elements.push(
            <figure key={`img-${imgIndex}`} className="md-figure my-6">
              <img 
                src={img.src} 
                alt={img.alt} 
                className="md-image w-full rounded-lg"
                loading="lazy"
                decoding="async"
              />
              {img.caption && <figcaption className="text-sm text-muted-foreground text-center mt-2">{img.caption}</figcaption>}
            </figure>
          );
        }
      }

      // Evidence block placeholder
      if (i + 3 < parts.length && parts[i + 3] !== undefined) {
        const evidenceIndex = parseInt(parts[i + 3], 10);
        if (evidenceBlocks[evidenceIndex]) {
          elements.push(
            <ComputationalEvidencePanel
              key={`evidence-${evidenceIndex}`}
              block={evidenceBlocks[evidenceIndex]}
              index={evidenceIndex}
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
  line-height: inherit;
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

/* Code blocks: always use light text on dark background regardless of reading theme */
.markdown-content .code-block,
.markdown-content .code-block pre,
.markdown-content .code-block code {
  color: #c9d1d9 !important;
}

.markdown-content .inline-code {
  color: inherit;
}

/* Structured code blocks: enforce readable text */
.structured-code-block pre,
.structured-code-block code {
  color: #c9d1d9 !important;
}

/* Audio sync: active block highlight */
.markdown-content [data-sentence-index].audio-active {
  background: hsl(var(--primary) / 0.08);
  border-left: 3px solid hsl(var(--primary) / 0.4);
  padding-left: 0.75rem;
  border-radius: 0.25rem;
  transition: background 0.3s ease;
}

/* Dim non-active paragraphs during audio playback for focus */
.markdown-content.audio-playing [data-sentence-index]:not(.audio-active) {
  opacity: 0.5;
  transition: opacity 0.3s ease;
}
.markdown-content.audio-playing [data-sentence-index].audio-active {
  opacity: 1;
}

/* Word-level highlight */
.markdown-content [data-word-index].audio-word-active {
  background: hsl(var(--primary) / 0.25);
  border-radius: 2px;
  padding: 1px 2px;
  box-shadow: 0 0 0 1px hsl(var(--primary) / 0.15);
  transition: background 0.1s ease;
}
`;
