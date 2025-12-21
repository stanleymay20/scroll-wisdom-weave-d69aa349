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
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { t } = useLanguage();
  
  // Use centralized entitlements - SINGLE SOURCE OF TRUTH
  const entitlements = useEntitlements();
  
  // ABSOLUTE RULE: If ANY of these are true, user has full export access
  const hasFullAccess = entitlements.isAdmin || entitlements.isProphet || entitlements.isPremium || entitlements.isScrollStudent || entitlements.isPaid;
  
  // Fail-safe: paid users ALWAYS have export access - no exceptions
  const canExport = hasFullAccess || entitlements.canExport || entitlements.canDownload;

  useEffect(() => {
    if (defaultAuthorName) {
      setAuthorName(defaultAuthorName);
    }
  }, [defaultAuthorName]);

  const handleExport = async (format: ExportFormat) => {
    if (!hasGeneratedChapters) {
      toast({
        title: t('export.noChapters'),
        description: t('export.noChaptersDesc'),
        variant: "destructive",
      });
      return;
    }

    if (!coverImageUrl) {
      toast({
        title: t('export.coverRequired'),
        description: t('export.coverRequiredDesc'),
        variant: "destructive",
      });
      return;
    }

    if (!authorName.trim()) {
      toast({
        title: t('export.authorRequired'),
        description: t('export.authorRequiredDesc'),
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

      const { content, filename, contentType } = response.data;

      // Decode base64 if present, otherwise use content directly
      let blobContent: BlobPart;
      if (response.data.isBase64) {
        const binaryString = atob(content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        blobContent = bytes;
      } else {
        blobContent = content;
      }

      // Create blob and download
      const blob = new Blob([blobContent], { type: contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: t('export.complete'),
        description: t('export.downloaded').replace('{filename}', filename),
      });
      
      setIsOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: t('export.failed'),
        description: error instanceof Error ? error.message : t('export.failed'),
        variant: "destructive",
      });
    } finally {
      setIsExporting(null);
    }
  };

  const formats: { format: ExportFormat; label: string; icon: typeof FileText; description: string }[] = [
    {
      format: "pdf",
      label: t('export.pdf'),
      icon: FileText,
      description: t('export.pdfDesc'),
    },
    {
      format: "epub",
      label: t('export.epub'),
      icon: BookOpen,
      description: t('export.epubDesc'),
    },
    {
      format: "docx",
      label: t('export.docx'),
      icon: File,
      description: t('export.docxDesc'),
    },
  ];

  const hasCover = !!coverImageUrl;
  const canProceed = hasGeneratedChapters && hasCover;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="gold-outline" size="lg">
          <Download className="h-5 w-5 mr-2" />
          {t('common.download')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-scroll-gold" />
            {t('export.title')}
          </DialogTitle>
          <DialogDescription>
            {t('export.subtitle').replace('{title}', title)}
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
                {t('export.coverIncluded')}
              </p>
            ) : (
              <p className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" />
                {t('export.coverNeeded')}
              </p>
            )}
          </div>
        </div>

        {/* Author Name Input */}
        <div className="space-y-2">
          <Label htmlFor="author-name">{t('export.authorName')} *</Label>
          <Input
            id="author-name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder={t('export.authorPlaceholder')}
            className="bg-background"
          />
        </div>

        {/* ISBN Input (Optional) */}
        <div className="space-y-2">
          <Label htmlFor="isbn" className="flex items-center gap-2">
            {t('export.isbn')} <span className="text-xs text-muted-foreground">({t('export.isbnOptional')})</span>
          </Label>
          <Input
            id="isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder={t('export.isbnPlaceholder')}
            className="bg-background font-mono"
          />
          <p className="text-xs text-muted-foreground">
            {t('export.isbnNote')}
          </p>
        </div>

        {/* Export Formats */}
        <div className="space-y-2">
          <Label>{t('export.format')}</Label>
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
            {t('export.generateFirst')}
          </p>
        )}
        
        {!hasCover && hasGeneratedChapters && (
          <p className="text-sm text-amber-500 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {t('export.addCover')}
          </p>
        )}

        {/* Only show upgrade prompt for FREE tier users */}
        {!canExport && !entitlements.isPaid && !entitlements.isAdmin && !entitlements.isProphet && !entitlements.isPremium && !entitlements.isScrollStudent && (
          <p className="text-sm text-amber-500 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {t('export.upgradeForExport')}
          </p>
        )}

        {/* Ownership Statement */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-scroll-gold/5 to-scroll-gold/10 border border-scroll-gold/20">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-scroll-gold flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{t('export.ownership')}</p>
              <p className="text-xs text-muted-foreground">
                {t('export.ownershipDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* Publishing Ready Badge */}
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-green-600 dark:text-green-400">{t('export.publishingReady')}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
