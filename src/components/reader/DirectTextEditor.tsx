/**
 * Direct Text Editor Component
 * 
 * Allows book creators to directly edit chapter text inline
 * without requiring regeneration. Rich text editing with
 * bold, italic, underline support.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  Save, 
  X, 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered,
  Heading1,
  Heading2,
  Loader2,
  Edit3
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

  useEffect(() => {
    // Focus and set cursor at end
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(localContent.length, localContent.length);
    }
  }, []);

  const insertFormatting = useCallback((prefix: string, suffix: string = prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = localContent.substring(start, end);
    
    const newContent = 
      localContent.substring(0, start) + 
      prefix + selectedText + suffix + 
      localContent.substring(end);
    
    setLocalContent(newContent);
    
    // Restore cursor position after formatting
    setTimeout(() => {
      textarea.focus();
      if (selectedText) {
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      } else {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
      }
    }, 0);
  }, [localContent]);

  const handleSave = async () => {
    if (!isOwner) {
      toast({
        title: "Permission denied",
        description: "Only the book creator can edit chapters.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const wordCount = localContent.split(/\s+/).filter(w => w.length > 0).length;
      
      const { error } = await supabase
        .from("chapters")
        .update({
          content: localContent,
          word_count: wordCount,
          updated_at: new Date().toISOString(),
          user_locked: true, // Mark as user-edited
        })
        .eq("id", chapterId);

      if (error) throw error;

      toast({
        title: "Changes saved",
        description: "Your edits have been saved successfully.",
      });
      
      onSave(localContent);
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
  };

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
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => insertFormatting('**')}
            title="Bold (Ctrl+B)"
            className="h-8 w-8 p-0"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => insertFormatting('*')}
            title="Italic (Ctrl+I)"
            className="h-8 w-8 p-0"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => insertFormatting('<u>', '</u>')}
            title="Underline"
            className="h-8 w-8 p-0"
          >
            <Underline className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => insertFormatting('## ', '')}
            title="Heading"
            className="h-8 w-8 p-0"
          >
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => insertFormatting('### ', '')}
            title="Subheading"
            className="h-8 w-8 p-0"
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => insertFormatting('- ', '')}
            title="Bullet List"
            className="h-8 w-8 p-0"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => insertFormatting('1. ', '')}
            title="Numbered List"
            className="h-8 w-8 p-0"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
          >
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
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto p-4">
        <textarea
          ref={textareaRef}
          value={localContent}
          onChange={(e) => setLocalContent(e.target.value)}
          className="w-full h-full min-h-[calc(100vh-10rem)] bg-transparent border-none outline-none resize-none font-mono text-sm leading-relaxed"
          placeholder="Start typing..."
          onKeyDown={(e) => {
            // Keyboard shortcuts
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
        {hasChanges && (
          <span className="text-amber-500">Unsaved changes</span>
        )}
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