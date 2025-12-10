import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, BookOpen, File, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ExportDialogProps {
  bookId: string;
  title: string;
  hasGeneratedChapters: boolean;
}

type ExportFormat = "pdf" | "epub" | "docx" | "markdown";

export function ExportDialog({ bookId, title, hasGeneratedChapters }: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);
  const { toast } = useToast();

  const handleExport = async (format: ExportFormat) => {
    if (!hasGeneratedChapters) {
      toast({
        title: "No chapters generated",
        description: "Please generate at least one chapter before exporting.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(format);

    try {
      const response = await supabase.functions.invoke("export-book", {
        body: { bookId, format },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const { content, filename, contentType, metadata } = response.data;

      // Create blob and download
      const blob = new Blob([content], { type: contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export complete!",
        description: `${metadata.totalChapters} chapters (${metadata.totalWords.toLocaleString()} words) exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export book",
        variant: "destructive",
      });
    } finally {
      setIsExporting(null);
    }
  };

  const formats: { format: ExportFormat; label: string; icon: typeof FileText; description: string }[] = [
    {
      format: "pdf",
      label: "PDF",
      icon: FileText,
      description: "Print-ready format with styling",
    },
    {
      format: "epub",
      label: "EPUB",
      icon: BookOpen,
      description: "E-reader compatible format",
    },
    {
      format: "docx",
      label: "Word (RTF)",
      icon: File,
      description: "Editable document format",
    },
    {
      format: "markdown",
      label: "Markdown",
      icon: FileText,
      description: "Plain text with formatting",
    },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="gold-outline" size="lg">
          <Download className="h-5 w-5 mr-2" />
          Download
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download Book</DialogTitle>
          <DialogDescription>
            Export "{title}" in your preferred format
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 pt-4">
          {formats.map(({ format, label, icon: Icon, description }) => (
            <Button
              key={format}
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4"
              onClick={() => handleExport(format)}
              disabled={isExporting !== null || !hasGeneratedChapters}
            >
              {isExporting === format ? (
                <Loader2 className="h-5 w-5 mr-3 animate-spin" />
              ) : (
                <Icon className="h-5 w-5 mr-3 text-scroll-gold" />
              )}
              <div className="text-left">
                <div className="font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{description}</div>
              </div>
            </Button>
          ))}
        </div>

        {!hasGeneratedChapters && (
          <p className="text-sm text-muted-foreground text-center mt-2">
            Generate chapters first to enable export
          </p>
        )}

        <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
          <p className="text-xs text-muted-foreground text-center">
            📜 Your generated book is ready to sell or publish. All rights belong to you.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
