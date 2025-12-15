import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Download, 
  FileText, 
  BookOpen, 
  File, 
  Loader2, 
  CheckCircle2, 
  Shield, 
  Award,
  AlertCircle,
  Image as ImageIcon
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEntitlements } from "@/hooks/useEntitlements";

interface ExportDialogProps {
  bookId: string;
  title: string;
  hasGeneratedChapters: boolean;
  coverImageUrl?: string | null;
  authorName?: string;
}

type ExportFormat = "pdf" | "epub" | "docx";

export function ExportDialog({ 
  bookId, 
  title, 
  hasGeneratedChapters, 
  coverImageUrl,
  authorName: defaultAuthorName 
}: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);
  const [authorName, setAuthorName] = useState(defaultAuthorName || "");
  const [isbn, setIsbn] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  
  // Use centralized entitlements - SINGLE SOURCE OF TRUTH
  const entitlements = useEntitlements();
  
  // Admin, Prophet, and ScrollStudent ALWAYS have export access - NO EXCEPTIONS
  // Also check canDownload for explicit permission
  const canExport = entitlements.canExport || entitlements.canDownload || entitlements.isAdmin || entitlements.isProphet || entitlements.isScrollStudent;

  useEffect(() => {
    if (defaultAuthorName) {
      setAuthorName(defaultAuthorName);
    }
  }, [defaultAuthorName]);

  const handleExport = async (format: ExportFormat) => {
    if (!hasGeneratedChapters) {
      toast({
        title: "No chapters generated",
        description: "Please generate at least one chapter before exporting.",
        variant: "destructive",
      });
      return;
    }

    if (!coverImageUrl) {
      toast({
        title: "Cover required",
        description: "Please generate or upload a cover image before exporting.",
        variant: "destructive",
      });
      return;
    }

    if (!authorName.trim()) {
      toast({
        title: "Author name required",
        description: "Please enter an author name for your book.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(format);

    try {
      const response = await supabase.functions.invoke("export-book", {
        body: { 
          bookId, 
          format,
          authorName: authorName.trim(),
          isbn: isbn.trim() || undefined,
        },
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
        description: `${metadata.totalChapters} chapters (${metadata.totalWords.toLocaleString()} words) exported as ${format.toUpperCase()}. Publishing ready.`,
      });
      
      setIsOpen(false);
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
      description: "Print-ready with professional typesetting",
    },
    {
      format: "epub",
      label: "EPUB",
      icon: BookOpen,
      description: "E-reader compatible (Apple Books, Kobo)",
    },
    {
      format: "docx",
      label: "Word Document",
      icon: File,
      description: "Editable manuscript format (RTF)",
    },
  ];

  const hasCover = !!coverImageUrl;
  const canProceed = hasGeneratedChapters && hasCover;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="gold-outline" size="lg">
          <Download className="h-5 w-5 mr-2" />
          Download
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-scroll-gold" />
            Export Book
          </DialogTitle>
          <DialogDescription>
            Download "{title}" in publishing-ready format
          </DialogDescription>
        </DialogHeader>

        {/* Cover Preview */}
        <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border/50">
          <div className="w-16 h-20 rounded-md overflow-hidden bg-muted flex-shrink-0">
            {hasCover ? (
              <img src={coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{title}</p>
            {hasCover ? (
              <p className="text-xs text-green-500 flex items-center gap-1 mt-1">
                <CheckCircle2 className="h-3 w-3" />
                Cover included
              </p>
            ) : (
              <p className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" />
                Cover required for export
              </p>
            )}
          </div>
        </div>

        {/* Author Name Input */}
        <div className="space-y-2">
          <Label htmlFor="author-name">Author Name *</Label>
          <Input
            id="author-name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Enter author name for publishing"
            className="bg-background"
          />
        </div>

        {/* ISBN Input (Optional) */}
        <div className="space-y-2">
          <Label htmlFor="isbn" className="flex items-center gap-2">
            ISBN <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder="978-X-XXX-XXXXX-X"
            className="bg-background font-mono"
          />
          <p className="text-xs text-muted-foreground">
            If no ISBN is provided, a Scroll Publishing Code (SPC) will be generated as an internal identifier.
          </p>
        </div>

        {/* Export Formats */}
        <div className="space-y-2">
          <Label>Export Format</Label>
          <div className="grid gap-2">
            {formats.map(({ format, label, icon: Icon, description }) => (
              <Button
                key={format}
                variant="outline"
                className="w-full justify-start h-auto py-3 px-4 hover:border-scroll-gold/50"
                onClick={() => handleExport(format)}
                disabled={isExporting !== null || !canProceed || !canExport || !authorName.trim()}
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
                <CheckCircle2 className="h-4 w-4 ml-auto text-green-500 opacity-0 group-hover:opacity-100" />
              </Button>
            ))}
          </div>
        </div>

        {/* Validation Messages */}
        {!hasGeneratedChapters && (
          <p className="text-sm text-amber-500 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Generate chapters first to enable export
          </p>
        )}
        
        {!hasCover && hasGeneratedChapters && (
          <p className="text-sm text-amber-500 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Add a cover image to enable export
          </p>
        )}

        {/* Only show upgrade prompt for free users - NEVER for paid/admin/prophet */}
        {!canExport && !entitlements.isPaid && !entitlements.isAdmin && (
          <p className="text-sm text-amber-500 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Upgrade to Premium to access publishing exports
          </p>
        )}

        {/* Ownership Statement */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-scroll-gold/5 to-scroll-gold/10 border border-scroll-gold/20">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-scroll-gold flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Ownership & Commercial Rights</p>
              <p className="text-xs text-muted-foreground">
                You own 100% of your generated content. You may publish, sell, or distribute your book freely. 
                ScrollLibrary claims no royalties or ownership.
              </p>
            </div>
          </div>
        </div>

        {/* Publishing Ready Badge */}
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-green-600 dark:text-green-400">Publishing Ready</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
