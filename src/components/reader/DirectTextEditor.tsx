/**
 * Direct Text Editor Component
 * 
 * Allows book creators to directly edit chapter text inline.
 * Uses a ref-based approach for formatting to avoid stale closures.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Save, X, Bold, Italic, Underline, 
  List, ListOrdered, Heading1, Heading2,
  Loader2, Edit3, ImagePlus, Link, Upload, Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ImproveChapterVisuals } from "./ImproveChapterVisuals";

interface DirectTextEditorProps {
  chapterId: string;
  content: string;
  isOwner: boolean;
  onSave: (newContent: string) => void;
  onCancel: () => void;
  // Optional book context — enables the AI Art Director when provided
  bookType?: string;
  bookTitle?: string;
  chapterTitle?: string;
  category?: string;
  language?: string;
}

export function DirectTextEditor({
  chapterId,
  content,
  isOwner,
  onSave,
  onCancel,
}: DirectTextEditorProps) {
  const { toast } = useToast();
  const [localContent, setLocalContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Keep a ref in sync with state to avoid stale closures in formatting
  const contentRef = useRef(content);

  useEffect(() => {
    contentRef.current = localContent;
  }, [localContent]);

  useEffect(() => {
    // Small delay to ensure textarea is rendered before focusing
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(localContent.length, localContent.length);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Determine if this is a line-start prefix (headings, lists)
  const isLinePrefix = useCallback((prefix: string) => {
    return /^(#{1,6}\s|[-*]\s|\d+\.\s)/.test(prefix);
  }, []);

  const insertFormatting = useCallback((prefix: string, suffix: string = prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentContent = textarea.value;
    const selectedText = currentContent.substring(start, end);

    let newContent: string;
    let newCursorStart: number;
    let newCursorEnd: number;

    if (isLinePrefix(prefix)) {
      // Line-start formatting: insert at beginning of current line
      const lineStart = currentContent.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = currentContent.indexOf('\n', end);
      const actualLineEnd = lineEnd === -1 ? currentContent.length : lineEnd;
      const currentLine = currentContent.substring(lineStart, actualLineEnd);

      // Toggle: if line already starts with this prefix, remove it
      if (currentLine.startsWith(prefix)) {
        newContent = currentContent.substring(0, lineStart) + currentLine.slice(prefix.length) + currentContent.substring(actualLineEnd);
        newCursorStart = start - prefix.length;
        newCursorEnd = end - prefix.length;
      } else {
        // Remove any existing line-prefix before adding new one
        const stripped = currentLine.replace(/^(#{1,6}\s|[-*]\s|\d+\.\s)/, '');
        const removedLen = currentLine.length - stripped.length;
        newContent = currentContent.substring(0, lineStart) + prefix + stripped + currentContent.substring(actualLineEnd);
        newCursorStart = start - removedLen + prefix.length;
        newCursorEnd = end - removedLen + prefix.length;
      }
    } else {
      // Wrap formatting (bold, italic, underline)
      newContent = currentContent.substring(0, start) + prefix + selectedText + suffix + currentContent.substring(end);
      if (selectedText) {
        newCursorStart = start + prefix.length;
        newCursorEnd = end + prefix.length;
      } else {
        newCursorStart = start + prefix.length;
        newCursorEnd = start + prefix.length;
      }
    }

    // Update state and ref synchronously
    setLocalContent(newContent);
    contentRef.current = newContent;

    // Restore cursor after React flush
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            Math.max(0, newCursorStart),
            Math.max(0, newCursorEnd)
          );
        }
      });
    });
  }, [isLinePrefix]);

  // Insert image markdown at cursor
  const insertImageMarkdown = useCallback((url: string, alt: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const currentContent = textarea.value;
    const markdown = `\n![${alt || 'image'}](${url})\n`;
    const newContent = currentContent.substring(0, start) + markdown + currentContent.substring(start);
    setLocalContent(newContent);
    contentRef.current = newContent;
    setImagePopoverOpen(false);
    setImageUrl("");
    setImageAlt("");
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newPos = start + markdown.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    });
  }, []);

  // Insert image by URL
  const handleInsertByUrl = useCallback(() => {
    if (!imageUrl.trim()) return;
    insertImageMarkdown(imageUrl.trim(), imageAlt.trim());
  }, [imageUrl, imageAlt, insertImageMarkdown]);

  // Upload image file to storage
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 5MB.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `chapters/${chapterId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('book-images').upload(path, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('book-images').getPublicUrl(path);
      insertImageMarkdown(publicUrl, imageAlt.trim() || file.name);
      toast({ title: "Image uploaded", description: "Image inserted into your chapter." });
    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: "Upload failed", description: "Could not upload image. Try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [chapterId, imageAlt, insertImageMarkdown, toast]);

  const handleSave = useCallback(async () => {
    if (!isOwner) {
      toast({
        title: "Permission denied",
        description: "Only the book creator can edit chapters.",
        variant: "destructive",
      });
      return;
    }

    const currentContent = contentRef.current;
    setIsSaving(true);

    try {
      const wordCount = currentContent.split(/\s+/).filter(w => w.length > 0).length;
      
      const { error } = await supabase
        .from("chapters")
        .update({
          content: currentContent,
          word_count: wordCount,
          updated_at: new Date().toISOString(),
          user_locked: true,
        })
        .eq("id", chapterId);

      if (error) throw error;

      toast({
        title: "Changes saved",
        description: "Your edits have been saved successfully.",
      });
      
      onSave(currentContent);
    } catch (error) {
      console.error("Save error:", error);
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save changes",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [isOwner, chapterId, onSave, toast]);

  const hasChanges = localContent !== content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-[70] bg-background/95 backdrop-blur-lg flex flex-col"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Toolbar */}
      <div className="flex flex-col border-b border-border/50 bg-muted/30">
        {/* Primary actions row */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </>
              )}
            </Button>
          </div>
          {hasChanges && (
            <span className="text-xs text-destructive font-medium">Unsaved</span>
          )}
        </div>
        {/* Formatting toolbar */}
        <div className="flex items-center gap-1 px-4 py-1.5 overflow-x-auto border-t border-border/30">
          <Button variant="ghost" size="sm" onClick={() => insertFormatting('**')} title="Bold (Ctrl+B)" className="h-8 w-8 p-0 shrink-0">
            <Bold className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => insertFormatting('*')} title="Italic (Ctrl+I)" className="h-8 w-8 p-0 shrink-0">
            <Italic className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => insertFormatting('<u>', '</u>')} title="Underline" className="h-8 w-8 p-0 shrink-0">
            <Underline className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1 shrink-0" />
          <Button variant="ghost" size="sm" onClick={() => insertFormatting('## ', '')} title="Heading" className="h-8 w-8 p-0 shrink-0">
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => insertFormatting('### ', '')} title="Subheading" className="h-8 w-8 p-0 shrink-0">
            <Heading2 className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1 shrink-0" />
          <Button variant="ghost" size="sm" onClick={() => insertFormatting('- ', '')} title="Bullet List" className="h-8 w-8 p-0 shrink-0">
            <List className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => insertFormatting('1. ', '')} title="Numbered List" className="h-8 w-8 p-0 shrink-0">
            <ListOrdered className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1 shrink-0" />
          {/* Image Insert */}
          <Popover open={imagePopoverOpen} onOpenChange={setImagePopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" title="Insert Image" className="h-8 w-8 p-0 shrink-0">
                <ImagePlus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-3" align="start">
              <p className="text-sm font-medium">Insert Image</p>
              <div className="space-y-2">
                <Label htmlFor="img-alt" className="text-xs">Alt text (optional)</Label>
                <Input
                  id="img-alt"
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  placeholder="Describe the image"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="img-url" className="text-xs">Image URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="img-url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-8 text-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleInsertByUrl(); }}
                  />
                  <Button size="sm" className="h-8 shrink-0" onClick={handleInsertByUrl} disabled={!imageUrl.trim()}>
                    <Link className="h-3 w-3 mr-1" />
                    Insert
                  </Button>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-popover px-2 text-muted-foreground">or</span></div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isUploading ? "Uploading..." : "Upload from device"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto p-4">
        <textarea
          ref={textareaRef}
          value={localContent}
          onChange={(e) => {
            setLocalContent(e.target.value);
            contentRef.current = e.target.value;
          }}
          className="w-full h-full min-h-[calc(100vh-10rem)] bg-transparent text-foreground border-none outline-none resize-none font-mono text-sm leading-relaxed placeholder:text-muted-foreground caret-primary"
          placeholder="Start typing..."
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey) {
              if (e.key === 'b') {
                e.preventDefault();
                insertFormatting('**');
              } else if (e.key === 'i') {
                e.preventDefault();
                insertFormatting('*');
              } else if (e.key === 's') {
                e.preventDefault();
                handleSave();
              }
            }
          }}
        />
      </div>

      {/* Status bar */}
      <div className="px-4 py-2 border-t border-border/50 bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {localContent.split(/\s+/).filter(w => w.length > 0).length} words
        </span>
      </div>
    </motion.div>
  );
}

// Edit button to trigger direct editing
interface EditButtonProps {
  onClick: () => void;
  isOwner: boolean;
}

export function DirectEditButton({ onClick, isOwner }: EditButtonProps) {
  if (!isOwner) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2"
      title="Edit chapter directly"
    >
      <Edit3 className="h-4 w-4" />
      <span className="hidden sm:inline">Edit</span>
    </Button>
  );
}
