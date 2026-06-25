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
  Store,
  Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { validateComicContent, ComicValidationResult } from "@/lib/systemDiagnostics";
import { validateContentForExport, ExportValidationResult } from "@/lib/exportValidation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

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

type ExportFormat = "pdf" | "epub" | "docx" | "kdp-pdf";

// Tier-level format access — mirrors server-side TIER_FORMATS in export-book/index.ts
const TIER_FORMAT_ACCESS: Record<string, ExportFormat[]> = {
  free: ["pdf"],
  student: ["pdf", "epub", "docx"],
  premium: ["pdf", "epub", "docx", "kdp-pdf"],
  prophet_tier: ["pdf", "epub", "docx", "kdp-pdf"],
};

const KDP_TRIM_SIZES = [
  { value: '5x8', label: '5" × 8"', desc: 'Small paperback' },
  { value: '5.25x8', label: '5.25" × 8"', desc: 'Compact' },
  { value: '5.5x8.5', label: '5.5" × 8.5"', desc: 'Standard trade' },
  { value: '6x9', label: '6" × 9"', desc: 'Most popular' },
  { value: '7x10', label: '7" × 10"', desc: 'Textbook' },
  { value: '8.5x11', label: '8.5" × 11"', desc: 'Full size' },
];

// Read-only identity resolved from the canonical Publication Snapshot.
// This is informational ONLY — the server always uses snapshot values
// regardless of what (if anything) the client renders here.
interface CanonicalIdentity {
  title: string;
  authors: string;
  publisher: string | null;
  copyright: string | null;
  version: string | null;
  edition: string | null;
  language: string | null;
  certificate_id: string | null;
  isbn: string | null;
  published_at: string | null;
}

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
  const [isOpen, setIsOpen] = useState(false);
  const [kdpTrimSize, setKdpTrimSize] = useState('6x9');
  const [kdpBleed, setKdpBleed] = useState(false);
  const [identity, setIdentity] = useState<CanonicalIdentity | null>(null);
  const { toast } = useToast();
  const { t } = useLanguage();

  const entitlements = useEntitlements();
  const { user } = useSubscription();
  const isAuthenticated = !!user;
  const canExport = entitlements.canExport || entitlements.canDownload;

  const allowedFormats: ExportFormat[] = (entitlements.isAdmin || entitlements.isProphet)
    ? ["pdf", "epub", "docx", "kdp-pdf"]
    : (TIER_FORMAT_ACCESS[entitlements.tier] || TIER_FORMAT_ACCESS.free);

  const [comicValidation, setComicValidation] = useState<ComicValidationResult | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');

  const contentValidation = useMemo<ExportValidationResult>(() => {
    if (!hasGeneratedChapters || chapters.length === 0) {
      return { valid: true, issues: [], canProceed: true };
    }
    const validateFormat = selectedFormat === 'kdp-pdf' ? 'pdf' : selectedFormat;
    return validateContentForExport(chapters, bookType, validateFormat as "pdf" | "epub" | "docx");
  }, [chapters, bookType, selectedFormat, hasGeneratedChapters]);

  useEffect(() => {
    if (bookType === 'comic' && chapterContents.length > 0) {
      const allContent = chapterContents.join('\n\n');
      const validation = validateComicContent(allContent);
      setComicValidation(validation);
    }
  }, [bookType, chapterContents]);

  const isComicBlocked = bookType === 'comic' && comicValidation && !comicValidation.canExport;

  // Load canonical Publication identity (read-only)
  useEffect(() => {
    if (!isOpen || !bookId) return;
    let cancelled = false;
    (async () => {
      const { data: book } = await supabase
        .from('books')
        .select('title, author_ai_agent, work_id, current_publication_id')
        .eq('id', bookId)
        .maybeSingle();
      if (!book || cancelled) return;

      let resolved: CanonicalIdentity = {
        title: book.title || title,
        authors: defaultAuthorName || (book as any).author_ai_agent || 'Unknown Author',
        publisher: null,
        copyright: null,
        version: null,
        edition: null,
        language: null,
        certificate_id: null,
        isbn: null,
        published_at: null,
      };

      if ((book as any).current_publication_id) {
        const { data: pub } = await supabase
          .from('publications')
          .select('version, certificate_id, language, snapshot, published_at')
          .eq('id', (book as any).current_publication_id)
          .maybeSingle();
        if (pub) {
          const snap: any = pub.snapshot || {};
          resolved.version = pub.version;
          resolved.certificate_id = pub.certificate_id;
          resolved.language = (pub as any).language || null;
          resolved.published_at = (pub as any).published_at || null;
          resolved.title = snap.title || resolved.title;
          if (Array.isArray(snap.authors) && snap.authors.length) {
            resolved.authors = snap.authors
              .slice()
              .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((a: any) => a.display_name)
              .filter(Boolean)
              .join(', ');
          }
          if (Array.isArray(snap.rights_holders) && snap.rights_holders.length) {
            resolved.publisher = snap.rights_holders[0]?.display_name || null;
            resolved.copyright = resolved.publisher;
          }
          resolved.isbn = snap.isbn || snap.isbn_13 || null;
          resolved.edition = snap.edition || null;
        }
      } else if ((book as any).work_id) {
        const { data: authors } = await supabase
          .from('work_authors')
          .select('display_name, sort_order')
          .eq('work_id', (book as any).work_id)
          .order('sort_order', { ascending: true });
        if (authors && authors.length) {
          resolved.authors = authors.map((a: any) => a.display_name).filter(Boolean).join(', ');
        }
      }

      if (!cancelled) setIdentity(resolved);
    })();
    return () => { cancelled = true; };
  }, [isOpen, bookId, title, defaultAuthorName]);

  const handleExport = async (format: ExportFormat) => {
    if (!isAuthenticated) {
      toast({ title: "Authentication Required", description: "Please sign in to export your book.", variant: "destructive" });
      return;
    }
    if (!hasGeneratedChapters) {
      toast({ title: t('export.noChapters'), description: t('export.noChaptersDesc'), variant: "destructive" });
      return;
    }

    setIsExporting(format);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("No active session. Please sign in again.");

      // SECURITY: never send authorName / isbn / publisher / copyright / version
      // / certificate_id from the client. The server resolves all identity from
      // the immutable Publication Snapshot and ignores any client overrides.
      const body: Record<string, unknown> = {
        bookId,
        format,
        isAcademicMode,
        citationStyle,
      };

      if (format === 'kdp-pdf') {
        body.kdpTrimSize = kdpTrimSize;
        body.kdpBleed = kdpBleed;
      }

      const response = await supabase.functions.invoke("export-book", { body });

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

  const formats: { format: ExportFormat; label: string; icon: typeof FileText; description: string; badge?: string }[] = [
    { format: "pdf", label: t('export.pdf'), icon: FileText, description: t('export.pdfDesc') },
    { format: "kdp-pdf", label: "KDP PDF", icon: Store, description: "Amazon KDP-ready interior", badge: "NEW" },
    { format: "epub", label: t('export.epub'), icon: BookOpen, description: t('export.epubDesc') },
    { format: "docx", label: t('export.docx'), icon: File, description: t('export.docxDesc') },
  ];

  const hasCover = !!coverImageUrl;
  const canProceed = hasGeneratedChapters && !isComicBlocked && isAuthenticated;
  const isReady = canProceed && canExport && contentValidation.canProceed;

  const IdentityRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 shrink-0">{label}</span>
      <span className="text-xs font-medium text-foreground text-right truncate">{value || '—'}</span>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <Download className="h-5 w-5 mr-2" />
          {t('common.download')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md gap-5 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{t('export.title')}</DialogTitle>
          <DialogDescription className="text-sm truncate">
            Download "{identity?.title || title}"
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
            <p className="text-sm font-medium truncate">{identity?.title || title}</p>
            <p className={`text-xs flex items-center gap-1 mt-0.5 ${hasCover ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {hasCover ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {hasCover ? t('export.coverIncluded') : t('export.coverNeeded')}
            </p>
          </div>
        </div>

        {/* Publication Identity — READ ONLY (Phase 1 invariant) */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold">Publication Identity</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
              Read-only
            </Badge>
          </div>
          <div className="divide-y divide-border/30">
            <IdentityRow label="Title" value={identity?.title || title} />
            <IdentityRow label="Authors" value={identity?.authors} />
            <IdentityRow label="Copyright" value={identity?.copyright} />
            <IdentityRow label="Publisher" value={identity?.publisher} />
            <IdentityRow label="Version" value={identity?.version} />
            <IdentityRow label="Edition" value={identity?.edition} />
            <IdentityRow label="Language" value={identity?.language} />
            <IdentityRow label="ISBN" value={identity?.isbn} />
            <IdentityRow label="Certificate ID" value={identity?.certificate_id} />
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-2 leading-relaxed">
            These fields come from the immutable Publication Snapshot. To change them, edit the
            work's authorship & rights, then publish a new version.
          </p>
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

        {/* Export Options — the ONLY editable section */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">{t('export.format')}</Label>
          <div className="grid gap-1.5">
            {formats.map(({ format, label, icon: Icon, description, badge }) => {
              const formatHasErrors = !contentValidation.canProceed;
              const isFormatLocked = !allowedFormats.includes(format);

              return (
                <Button
                  key={format}
                  variant="outline"
                  className={`w-full justify-start h-auto py-2.5 px-3 text-left transition-colors ${(formatHasErrors || isFormatLocked) ? 'opacity-40' : 'hover:bg-primary/5 hover:border-primary/30'}`}
                  onClick={() => {
                    if (isFormatLocked) {
                      toast({
                        title: "Upgrade Required",
                        description: `${label} export requires a higher plan. Upgrade to access this format.`,
                        variant: "destructive",
                      });
                      return;
                    }
                    setSelectedFormat(format);
                    if (!formatHasErrors) {
                      handleExport(format);
                    } else {
                      const errorCount = contentValidation.issues.filter(i => i.level === 'error').length;
                      toast({
                        title: "Export Blocked",
                        description: `Fix ${errorCount} error(s) before exporting as ${label}.`,
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={isExporting !== null || !canProceed}
                >
                  {isExporting === format ? (
                    <Loader2 className="h-4 w-4 mr-2.5 animate-spin flex-shrink-0" />
                  ) : isFormatLocked ? (
                    <Lock className="h-4 w-4 mr-2.5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <Icon className="h-4 w-4 mr-2.5 text-primary flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{label}</span>
                    {isFormatLocked && (
                      <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 text-muted-foreground">
                        Upgrade
                      </Badge>
                    )}
                    {badge && !isFormatLocked && (
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                        {badge}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-2">{description}</span>
                  </div>
                  {formatHasErrors && !isFormatLocked && <XCircle className="h-3.5 w-3.5 text-destructive ml-1" />}
                </Button>
              );
            })}
          </div>
        </div>

        {/* KDP Settings — Export Option, not identity */}
        {selectedFormat === 'kdp-pdf' && (
          <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/40">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold">KDP Settings</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Trim Size</Label>
              <Select value={kdpTrimSize} onValueChange={setKdpTrimSize}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KDP_TRIM_SIZES.map(size => (
                    <SelectItem key={size.value} value={size.value}>
                      <span className="font-medium">{size.label}</span>
                      <span className="text-muted-foreground ml-1.5">— {size.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-muted-foreground">Bleed margins</Label>
                <p className="text-[10px] text-muted-foreground/70">For books with edge-to-edge images</p>
              </div>
              <Switch checked={kdpBleed} onCheckedChange={setKdpBleed} />
            </div>
          </div>
        )}

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

        {!canExport && !entitlements.isPaid && !entitlements.isAdmin && !entitlements.isProphet && !entitlements.isPremium && !entitlements.isScrollStudent && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> {t('export.upgradeForExport')}
          </p>
        )}

        <div className="flex items-start gap-2 pt-1">
          <Shield className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Every export is rendered from the immutable Publication Snapshot. Identity fields above
            cannot be changed at export time. Review content for accuracy before distributing.
          </p>
        </div>

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
