/**
 * Direct Text Editor Component
 * 
 * Allows book creators to directly edit chapter text inline.
 * Uses a ref-based approach for formatting to avoid stale closures.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  Save, X, Bold, Italic, Underline, 
  List, ListOrdered, Heading1, Heading2,
  Loader2, Edit3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DirectTextEditorProps {
  chapterId: string;
  content: string;
  isOwner: boolean;
  onSave: (newContent: string) => void;
  onCancel: () => void;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const insertFormatting = useCallback((prefix: string, suffix: string = prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentContent = contentRef.current;
    const selectedText = currentContent.substring(start, end);
    
    const newContent = 
      currentContent.substring(0, start) + 
      prefix + selectedText + suffix + 
      currentContent.substring(end);
    
    setLocalContent(newContent);
    contentRef.current = newContent;
    
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      textarea.focus();
      if (selectedText) {
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      } else {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
      }
    });
  }, []);

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
            <span className="text-xs text-amber-500 font-medium">Unsaved</span>
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
          className="w-full h-full min-h-[calc(100vh-10rem)] bg-transparent border-none outline-none resize-none font-mono text-sm leading-relaxed"
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
