import { useMemo } from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Production-grade Markdown renderer for ScrollLibrary
 * Renders: headings, bold, italic, code, tables, lists, blockquotes, images
 * GFM-compatible with proper HTML output
 */
export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const renderedContent = useMemo(() => {
    if (!content) return "";
    
    let html = content;
    
    // Escape HTML entities first
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Code blocks (```language ... ```) - render with syntax highlighting support
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
      const copyBtn = `<button class="code-copy" onclick="navigator.clipboard.writeText(this.parentElement.querySelector('code').textContent).then(() => this.textContent = 'Copied!').catch(() => {})">Copy</button>`;
      return `<div class="code-block">${langLabel}${copyBtn}<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre></div>`;
    });
    
    // Inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // Tables (GFM style with proper pipe formatting)
    // Match: optional caption, then | header | header |, separator |---|---|, then data rows
    html = html.replace(/(?:(?:\*\*([^*\n]+)\*\*|([A-Za-z][^\n|]*?))\n\n?)?(\|[^\n]+\|\n\|[-:| ]+\|\n(?:\|[^\n]+\|\n?)+)/gm, (match, boldCaption, plainCaption, tableContent) => {
      const caption = (boldCaption || plainCaption || '').trim();
      const lines = (tableContent || match).trim().split('\n');
      if (lines.length < 2) return match;
      
      // Parse header
      const headerCells = lines[0].split('|').filter((c: string) => c.trim()).map((c: string) => `<th>${c.trim()}</th>`).join('');
      
      // Parse rows (skip separator line)
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
    
    // Bold (**text** or __text__)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    
    // Italic (*text* or _text_)
    html = html.replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '<em>$1</em>');
    html = html.replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, '<em>$1</em>');
    
    // Strikethrough (~~text~~)
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    
    // Blockquotes (> text)
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');
    
    // Horizontal rules (---, ***, ___)
    html = html.replace(/^[-*_]{3,}\s*$/gm, '<hr class="md-hr" />');
    
    // Unordered lists (- item or * item)
    html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li class="md-li">$1</li>');
    // Wrap consecutive <li> elements in <ul>
    html = html.replace(/(<li class="md-li">.*?<\/li>\n?)+/g, '<ul class="md-ul">$&</ul>');
    
    // Ordered lists (1. item)
    html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="md-li-ordered">$1</li>');
    // Wrap consecutive ordered <li> elements in <ol>
    html = html.replace(/(<li class="md-li-ordered">.*?<\/li>\n?)+/g, '<ol class="md-ol">$&</ol>');
    
    // Paragraphs (double newlines)
    html = html.replace(/\n\n+/g, '</p><p class="md-p">');
    html = `<p class="md-p">${html}</p>`;
    
    // Clean up empty paragraphs
    html = html.replace(/<p class="md-p">\s*<\/p>/g, '');
    html = html.replace(/<p class="md-p">(<(?:h[1-6]|ul|ol|blockquote|table|figure|div|hr))/g, '$1');
    html = html.replace(/(<\/(?:h[1-6]|ul|ol|blockquote|table|figure|div|hr)>)<\/p>/g, '$1');
    
    return html;
  }, [content]);

  return (
    <div 
      className={`markdown-content prose prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
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

/* Syntax highlighting colors */
.markdown-content .code-block code .keyword { color: hsl(280 80% 70%); }
.markdown-content .code-block code .string { color: hsl(95 60% 60%); }
.markdown-content .code-block code .number { color: hsl(35 90% 65%); }
.markdown-content .code-block code .comment { color: hsl(210 15% 55%); font-style: italic; }

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
`;
