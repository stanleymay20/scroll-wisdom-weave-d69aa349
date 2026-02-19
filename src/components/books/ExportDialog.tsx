import { useState, useEffect, useMemo } from "react";
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
  AlertCircle,
  Image as ImageIcon,
  GraduationCap,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useLanguage } from "@/contexts/LanguageContext";
import { validateComicContent, ComicValidationResult } from "@/lib/systemDiagnostics";
import { validateContentForExport, ExportValidationResult } from "@/lib/exportValidation";

interface ExportDialogProps {
  bookId: string;
  title: string;
  hasGeneratedChapters: boolean;
  coverImageUrl?: string | null;
  authorName?: string;
  isAcademicMode?: boolean;
  citationStyle?: string;
  bookType?: string;
  chapterContents?: string[];
  chapters?: { chapter_number: number; content: string | null }[];
}

type ExportFormat = "pdf" | "epub" | "docx";

export function ExportDialog({ 
  bookId, 
  title, 
  hasGeneratedChapters, 
  coverImageUrl,
  authorName: defaultAuthorName,
  isAcademicMode = false,
  citationStyle = 'APA',
  bookType = 'text',
  chapterContents = [],
  chapters = []
}: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);
  const [authorName, setAuthorName] = useState(defaultAuthorName || "");
  const [isbn, setIsbn] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();
  
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session?.user);
    };
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsAuthenticated(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);
  
  const entitlements = useEntitlements();
  const hasFullAccess = entitlements.isAdmin || entitlements.isProphet || entitlements.isPremium || entitlements.isScrollStudent || entitlements.isPaid;
  const canExport = hasFullAccess || entitlements.canExport || entitlements.canDownload;

  const [comicValidation, setComicValidation] = useState<ComicValidationResult | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  
  const contentValidation = useMemo<ExportValidationResult>(() => {
    if (!hasGeneratedChapters || chapters.length === 0) {
      return { valid: true, issues: [], canProceed: true };
    }
    return validateContentForExport(chapters, bookType, selectedFormat);
  }, [chapters, bookType, selectedFormat, hasGeneratedChapters]);
  
  useEffect(() => {
    if (bookType === 'comic' && chapterContents.length > 0) {
      const allContent = chapterContents.join('\n\n');
      const validation = validateComicContent(allContent);
      setComicValidation(validation);
    }
  }, [bookType, chapterContents]);

  const isComicBlocked = bookType === 'comic' && comicValidation && !comicValidation.canExport;

  useEffect(() => {
    if (defaultAuthorName) {
      setAuthorName(defaultAuthorName);
    }
  }, [defaultAuthorName]);

  const handleExport = async (format: ExportFormat) => {
    if (!isAuthenticated) {
      toast({ title: "Authentication Required", description: "Please sign in to export your book.", variant: "destructive" });
      return;
    }
    if (!hasGeneratedChapters) {
      toast({ title: t('export.noChapters'), description: t('export.noChaptersDesc'), variant: "destructive" });
      return;
    }
    if (!coverImageUrl) {
      toast({ title: t('export.coverRequired'), description: t('export.coverRequiredDesc'), variant: "destructive" });
      return;
    }
    if (!authorName.trim()) {
      toast({ title: t('export.authorRequired'), description: t('export.authorRequiredDesc'), variant: "destructive" });
      return;
    }

    setIsExporting(format);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("No active session. Please sign in again.");

      const response = await supabase.functions.invoke("export-book", {
        body: { bookId, format, authorName: authorName.trim(), isbn: isbn.trim() || undefined, isAcademicMode, citationStyle },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      const { content, filename, contentType } = response.data;
      let blobContent: BlobPart;
      if (response.data.isBase64) {
        const binaryString = atob(content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        blobContent = bytes;
      } else {
        blobContent = content;
      }

      const blob = new Blob([blobContent], { type: contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: t('export.complete'), description: t('export.downloaded').replace('{filename}', filename) });
      setIsOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: t('export.failed'), description: error instanceof Error ? error.message : t('export.failed'), variant: "destructive" });
    } finally {
      setIsExporting(null);
    }
  };

  const formats: { format: ExportFormat; label: string; icon: typeof FileText; description: string }[] = [
    { format: "pdf", label: t('export.pdf'), icon: FileText, description: t('export.pdfDesc') },
    { format: "epub", label: t('export.epub'), icon: BookOpen, description: t('export.epubDesc') },
    { format: "docx", label: t('export.docx'), icon: File, description: t('export.docxDesc') },
  ];

  const hasCover = !!coverImageUrl;
  const canProceed = hasGeneratedChapters && hasCover && !isComicBlocked && isAuthenticated;
  const isReady = canProceed && canExport && authorName.trim();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <Download className="h-5 w-5 mr-2" />
          {t('common.download')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md gap-5">
        <DialogHeader>
          <DialogTitle className="text-lg">{t('export.title')}</DialogTitle>
          <DialogDescription className="text-sm">
            Download "{title}" as a file
          </DialogDescription>
        </DialogHeader>

        {/* Book preview row */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/40">
          <div className="w-10 h-14 rounded overflow-hidden bg-muted flex-shrink-0">
            {hasCover ? (
              <img src={coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{title}</p>
            <p className={`text-xs flex items-center gap-1 mt-0.5 ${hasCover ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {hasCover ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {hasCover ? t('export.coverIncluded') : t('export.coverNeeded')}
            </p>
          </div>
        </div>

        {/* Author + ISBN in compact layout */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="author-name" className="text-xs font-medium">{t('export.authorName')} *</Label>
            <Input
              id="author-name"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder={t('export.authorPlaceholder')}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="isbn" className="text-xs font-medium text-muted-foreground">
              {t('export.isbn')} ({t('export.isbnOptional')})
            </Label>
            <Input
              id="isbn"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder={t('export.isbnPlaceholder')}
              className="h-9 text-sm font-mono"
            />
          </div>
        </div>

        {/* Academic badge */}
        {isAcademicMode && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/40">
            <GraduationCap className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">
              Academic mode ({citationStyle}) — bibliography included
            </span>
          </div>
        )}

        {/* Format buttons */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">{t('export.format')}</Label>
          <div className="grid gap-1.5">
            {formats.map(({ format, label, icon: Icon, description }) => {
              const formatValidation = chapters.length > 0 
                ? validateContentForExport(chapters, bookType, format)
                : { valid: true, issues: [], canProceed: true };
              const formatHasErrors = !formatValidation.canProceed;
              
              return (
                <Button
                  key={format}
                  variant="outline"
                  className={`w-full justify-start h-auto py-2.5 px-3 text-left transition-colors ${formatHasErrors ? 'opacity-40' : 'hover:bg-primary/5 hover:border-primary/30'}`}
                  onClick={() => {
                    setSelectedFormat(format);
                    if (!formatHasErrors) {
                      handleExport(format);
                    } else {
                      toast({
                        title: "Export Blocked",
                        description: `Fix ${formatValidation.issues.filter(i => i.level === 'error').length} error(s) before exporting as ${format.toUpperCase()}.`,
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={isExporting !== null || !canProceed || !canExport || !authorName.trim()}
                >
                  {isExporting === format ? (
                    <Loader2 className="h-4 w-4 mr-2.5 animate-spin flex-shrink-0" />
                  ) : (
                    <Icon className="h-4 w-4 mr-2.5 text-primary flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{description}</span>
                  </div>
                  {formatHasErrors && <XCircle className="h-3.5 w-3.5 text-destructive ml-1" />}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Validation errors */}
        {!contentValidation.canProceed && contentValidation.issues.filter(i => i.level === 'error').length > 0 && (
          <div className="p-2.5 rounded-lg bg-destructive/5 border border-destructive/20 space-y-1">
            {contentValidation.issues.filter(i => i.level === 'error').map((issue, i) => (
              <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
                <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                {issue.message}
              </p>
            ))}
          </div>
        )}

        {/* Status messages */}
        {!isAuthenticated && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Sign in to export
          </p>
        )}
        {!hasGeneratedChapters && isAuthenticated && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> {t('export.generateFirst')}
          </p>
        )}
        {!hasCover && hasGeneratedChapters && isAuthenticated && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> {t('export.addCover')}
          </p>
        )}

        {/* Comic blocker */}
        {isComicBlocked && comicValidation && (
          <div className="p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
            <p className="text-xs font-medium text-destructive mb-1">Comic export blocked</p>
            <p className="text-xs text-muted-foreground">
              Panels: {comicValidation.panelCount} | Images: {comicValidation.imageCount}
            </p>
            {comicValidation.errors.map((error, i) => (
              <p key={i} className="text-xs text-destructive mt-0.5">• {error}</p>
            ))}
          </div>
        )}

        {/* Upgrade nudge for free users */}
        {!canExport && !entitlements.isPaid && !entitlements.isAdmin && !entitlements.isProphet && !entitlements.isPremium && !entitlements.isScrollStudent && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> {t('export.upgradeForExport')}
          </p>
        )}

        {/* Disclaimer */}
        <div className="flex items-start gap-2 pt-1">
          <Shield className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Content is AI-generated. Review for accuracy before publishing or distributing. You are responsible for any use of exported materials.
          </p>
        </div>

        {/* Ready indicator */}
        {isReady && (
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Ready to export
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
