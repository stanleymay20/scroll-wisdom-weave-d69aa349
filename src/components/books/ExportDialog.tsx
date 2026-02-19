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
  Award,
  AlertCircle,
  Image as ImageIcon,
  GraduationCap,
  XCircle,
  AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useLanguage } from "@/contexts/LanguageContext";
import { validateComicContent, ComicValidationResult } from "@/lib/systemDiagnostics";
import { validateContentForExport, ExportValidationResult, formatIssuesForDisplay } from "@/lib/exportValidation";

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
  
  // Check authentication status
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
  
  // Use centralized entitlements - SINGLE SOURCE OF TRUTH
  const entitlements = useEntitlements();
  
  // ABSOLUTE RULE: If ANY of these are true, user has full export access
  const hasFullAccess = entitlements.isAdmin || entitlements.isProphet || entitlements.isPremium || entitlements.isScrollStudent || entitlements.isPaid;
  
  // Fail-safe: paid users ALWAYS have export access - no exceptions
  const canExport = hasFullAccess || entitlements.canExport || entitlements.canDownload;

  // Comic validation - HARD RULE: comics must have matching panels and images
  const [comicValidation, setComicValidation] = useState<ComicValidationResult | null>(null);
  
  // Pre-export content validation
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  
  // Validate content for selected format
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
  const hasAnyExportErrors = !contentValidation.canProceed;

  useEffect(() => {
    if (defaultAuthorName) {
      setAuthorName(defaultAuthorName);
    }
  }, [defaultAuthorName]);

  const handleExport = async (format: ExportFormat) => {
    // Check if user is authenticated before export
    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to export your book.",
        variant: "destructive",
      });
      return;
    }

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
      // Get the current session to ensure we have a valid token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("No active session. Please sign in again.");
      }

      const response = await supabase.functions.invoke("export-book", {
        body: { 
          bookId, 
          format,
          authorName: authorName.trim(),
          isbn: isbn.trim() || undefined,
          isAcademicMode,
          citationStyle,
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
  const canProceed = hasGeneratedChapters && hasCover && !isComicBlocked && isAuthenticated;

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
        </div>

        {/* Academic Mode Notice */}
        {isAcademicMode && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-400">{t('export.academicExport') || 'Academic Export'}</span>
              <span className="text-xs text-muted-foreground">({citationStyle})</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('export.academicExportDesc') || 'This export includes a bibliography section with references used during generation.'}
            </p>
          </div>
        )}

        {/* Export Formats */}
        <div className="space-y-2">
          <Label>{t('export.format')}</Label>
          <div className="grid gap-2">
            {formats.map(({ format, label, icon: Icon, description }) => {
              // Validate each format independently
              const formatValidation = chapters.length > 0 
                ? validateContentForExport(chapters, bookType, format)
                : { valid: true, issues: [], canProceed: true };
              const formatHasErrors = !formatValidation.canProceed;
              
              return (
                <Button
                  key={format}
                  variant="outline"
                  className={`w-full justify-start h-auto py-3 px-4 hover:border-scroll-gold/50 ${formatHasErrors ? 'opacity-50' : ''}`}
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
                    <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                  ) : (
                    <Icon className="h-5 w-5 mr-3 text-scroll-gold" />
                  )}
                  <div className="text-left flex-1">
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{description}</div>
                  </div>
                  {formatHasErrors && (
                    <XCircle className="h-4 w-4 text-destructive ml-2" />
                  )}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Pre-export Content Validation Issues - only show blocking errors */}
        {!contentValidation.canProceed && contentValidation.issues.filter(i => i.level === 'error').length > 0 && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-2">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">
                Export Blocked
              </span>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {contentValidation.issues.filter(i => i.level === 'error').map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <XCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                  <span className="text-destructive">{issue.message}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-destructive font-medium">
              Fix errors before exporting.
            </p>
          </div>
        )}

        {/* Validation Messages */}
        {!isAuthenticated && (
          <p className="text-sm text-amber-500 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Please sign in to export your book
          </p>
        )}

        {!hasGeneratedChapters && isAuthenticated && (
          <p className="text-sm text-amber-500 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {t('export.generateFirst')}
          </p>
        )}
        
        {!hasCover && hasGeneratedChapters && isAuthenticated && (
          <p className="text-sm text-amber-500 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {t('export.addCover')}
          </p>
        )}

        {/* Comic Export Blocker - HARD RULE */}
        {isComicBlocked && comicValidation && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <div className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Comic Export Blocked</p>
                <p className="text-muted-foreground mt-1">
                  Panels: {comicValidation.panelCount} | Images: {comicValidation.imageCount}
                </p>
                {comicValidation.errors.map((error, i) => (
                  <p key={i} className="text-xs text-destructive mt-1">• {error}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Only show upgrade prompt for FREE tier users */}
        {!canExport && !entitlements.isPaid && !entitlements.isAdmin && !entitlements.isProphet && !entitlements.isPremium && !entitlements.isScrollStudent && (
          <p className="text-sm text-amber-500 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {t('export.upgradeForExport')}
          </p>
        )}

        {/* Content Disclaimer */}
        <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Exported content is AI-generated. You are responsible for reviewing accuracy before publishing or distributing.
            </p>
          </div>
        </div>

        {/* Publishing Ready Badge - only show when actually ready */}
        {canProceed && canExport && authorName.trim() && (
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-600 dark:text-green-400">{t('export.publishingReady')}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
