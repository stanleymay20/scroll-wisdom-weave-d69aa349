import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  Upload as UploadIcon, FileText, Globe, Type, Loader2,
  CheckCircle, BookOpen, ArrowRight, Lock, X
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { cn } from "@/lib/utils";
import { SEO } from "@/components/SEO";

type UploadStep = 'input' | 'processing' | 'done';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MIN_TEXT_CHARS = 200;
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];
const ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

function isAcceptedFile(f: File): boolean {
  if (ACCEPTED_MIME.has(f.type)) return true;
  const lower = f.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function UploadPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useSubscription();
  const isMobile = useIsMobile();

  const [step, setStep] = useState<UploadStep>('input');
  const [activeTab, setActiveTab] = useState('file');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultBookId, setResultBookId] = useState<string | null>(null);
  const [resultTitle, setResultTitle] = useState('');
  const [resultChapters, setResultChapters] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Input states
  const [file, setFile] = useState<File | null>(null);
  const [plainText, setPlainText] = useState('');
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('en');

  // Lifecycle refs — abort + interval cleanup
  const abortRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      progressTimeoutsRef.current.forEach((t) => clearTimeout(t));
      progressTimeoutsRef.current = [];
    };
  }, []);

  const stopProgressTimers = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    progressTimeoutsRef.current.forEach((t) => clearTimeout(t));
    progressTimeoutsRef.current = [];
  }, []);

  // ---------------------------------------------------------------------
  // File selection (click + drag/drop)
  // ---------------------------------------------------------------------
  const acceptFile = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast({ title: "File too large", description: "Maximum file size is 20MB.", variant: "destructive" });
      return;
    }
    if (!isAcceptedFile(f)) {
      toast({ title: "Unsupported format", description: "Please upload a PDF, DOCX, or text file.", variant: "destructive" });
      return;
    }
    setFile(f);
  }, [toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0] ?? null);
    // Reset so the same file can be re-picked
    e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types?.includes('Files')) setIsDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    acceptFile(e.dataTransfer?.files?.[0] ?? null);
  };

  // ---------------------------------------------------------------------
  // File text extraction
  // ---------------------------------------------------------------------
  const extractTextFromFile = async (f: File, signal: AbortSignal): Promise<string> => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    if (f.type === 'text/plain' || f.name.endsWith('.txt') || f.name.endsWith('.md')) {
      return await f.text();
    }

    if (f.type === 'application/pdf' || f.name.endsWith('.pdf')) {
      setProgressMessage('Extracting text from PDF...');
      const pdfjsLib = await import('pdfjs-dist');
      // Pin to a stable mjs worker matching the loaded version
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const arrayBuffer = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        let lastY: number | null = null;
        const lines: string[] = [];
        let currentLine = '';
        for (const item of textContent.items as Array<{ str?: string; transform?: number[] }>) {
          if (!item.str) continue;
          const y = item.transform?.[5] ?? null;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
            if (currentLine.trim()) lines.push(currentLine.trim());
            currentLine = item.str;
          } else {
            currentLine += (currentLine && !currentLine.endsWith(' ') ? ' ' : '') + item.str;
          }
          lastY = y;
        }
        if (currentLine.trim()) lines.push(currentLine.trim());
        pages.push(lines.join('\n'));
        if (isMountedRef.current) {
          setProgress(Math.min(5 + Math.round((i / pdf.numPages) * 15), 20));
        }
      }
      return pages.join('\n\n');
    }

    if (f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || f.name.endsWith('.docx')) {
      setProgressMessage('Extracting text from DOCX...');
      const mammoth = await import('mammoth');
      const arrayBuffer = await f.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }

    return await f.text();
  };

  // ---------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------
  const cancelProcessing = useCallback(() => {
    abortRef.current?.abort();
    stopProgressTimers();
    if (isMountedRef.current) {
      setStep('input');
      setProgress(0);
      setProgressMessage('');
      toast({ title: "Cancelled", description: "Upload was cancelled." });
    }
  }, [stopProgressTimers, toast]);

  // ---------------------------------------------------------------------
  // Process
  // ---------------------------------------------------------------------
  const processDocument = useCallback(async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to upload documents." });
      navigate('/auth');
      return;
    }

    // Per-tab guard
    if (activeTab === 'url' && !isHttpUrl(url.trim())) {
      toast({ title: "Invalid URL", description: "Please enter a valid http(s) URL.", variant: "destructive" });
      return;
    }

    // Abort any prior run
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    let documentText = '';
    let documentName = '';
    let sourceType: 'uploaded' | 'pasted' | 'url' = 'uploaded';

    try {
      setStep('processing');
      setProgress(5);

      if (activeTab === 'file' && file) {
        setProgressMessage('Reading file...');
        documentText = await extractTextFromFile(file, abort.signal);
        documentName = file.name;
      } else if (activeTab === 'text' && plainText.trim()) {
        documentText = plainText.trim();
        documentName = 'Pasted Text';
        sourceType = 'pasted';
      } else if (activeTab === 'url' && url.trim()) {
        setProgressMessage('Fetching content from URL...');
        setProgress(10);
        sourceType = 'url';
        documentName = url.trim();

        const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke('firecrawl-scrape', {
          body: { url: url.trim() },
        });

        if (abort.signal.aborted) return;
        if (scrapeError || !scrapeData?.success) {
          throw new Error(scrapeData?.error || "Could not extract content from this URL. Try pasting the text directly.");
        }
        documentText = scrapeData.markdown || '';
        if (scrapeData.title) documentName = String(scrapeData.title).slice(0, 500);
      } else {
        setStep('input');
        toast({ title: "No content", description: "Please provide a document, paste text, or enter a URL.", variant: "destructive" });
        return;
      }

      if (abort.signal.aborted) return;
      if (documentText.length < MIN_TEXT_CHARS) {
        setStep('input');
        toast({ title: "Too short", description: `Document must contain at least ${MIN_TEXT_CHARS} characters.`, variant: "destructive" });
        return;
      }

      setProgress(20);
      setProgressMessage('Analyzing document structure...');

      // Real-ish progress: cap below 90% until the server responds.
      stopProgressTimers();
      progressIntervalRef.current = setInterval(() => {
        if (!isMountedRef.current) return;
        setProgress((p) => (p < 88 ? Math.min(p + 2, 88) : p));
      }, 2000);
      const messages: Array<[number, string]> = [
        [3000, 'Extracting learning objectives...'],
        [6000, 'Identifying key concepts...'],
        [9000, 'Generating chapter structure...'],
        [12000, 'Building reflection prompts...'],
      ];
      progressTimeoutsRef.current = messages.map(([ms, msg]) =>
        setTimeout(() => isMountedRef.current && setProgressMessage(msg), ms),
      );

      // Single-attempt invoke with structured-error handling.
      const { data, error } = await supabase.functions.invoke('process-document', {
        body: { documentText, documentName, sourceType, language },
      });

      stopProgressTimers();
      if (abort.signal.aborted) return;

      if (error) {
        const ctx = (error as { context?: { status?: number } }).context;
        if (ctx?.status === 429) {
          throw new Error('You are uploading too quickly. Please wait a minute and try again.');
        }
        if (ctx?.status === 402) {
          throw new Error('AI credits exhausted. Please add credits or try again later.');
        }
        throw error;
      }
      if (!data?.success) throw new Error(data?.error || 'Processing failed');

      setProgress(100);
      setProgressMessage(data.deduplicated ? 'Already processed — opening existing book...' : 'Document processed successfully!');
      setResultBookId(data.bookId);
      setResultTitle(data.title || documentName);
      setResultChapters(data.chaptersCreated || 0);
      setStep('done');

      toast({
        title: data.deduplicated ? "Already in your library" : "Document processed!",
        description: data.deduplicated
          ? "We found an existing copy and opened it for you."
          : `Created ${data.chaptersCreated} chapters from your document.`,
      });
    } catch (err) {
      stopProgressTimers();
      if ((err as { name?: string })?.name === 'AbortError' || abort.signal.aborted) return;
      console.error('Upload error:', err);
      if (isMountedRef.current) {
        setStep('input');
        setProgress(0);
        setProgressMessage('');
        const message = err instanceof Error ? err.message : 'Failed to process document. Please try again.';
        toast({ title: "Processing failed", description: message, variant: "destructive" });
      }
    }
  }, [activeTab, file, plainText, url, user, language, navigate, toast, stopProgressTimers]);

  // ---------------------------------------------------------------------
  // Render — gated state
  // ---------------------------------------------------------------------
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <SEO title="Upload Document — ScrollLibrary" description="Upload a PDF, DOCX, or paste text to instantly generate a structured learning path." />
        <Navbar />
        <main className="flex-1 pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-2xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-2xl border border-border/50 p-12"
            >
              <Lock className="h-12 w-12 text-primary mx-auto mb-6" />
              <h1 className="font-display text-3xl font-bold mb-4">Sign in to Upload</h1>
              <p className="text-muted-foreground mb-8">Upload your documents and start your learning journey.</p>
              <Button onClick={() => navigate("/auth")} size="lg">Sign In</Button>
            </motion.div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const content = (
    <div className={cn("mx-auto", isMobile ? "max-w-full px-4 pt-4 pb-24" : "max-w-3xl pt-24 pb-16 px-4")}>
      {step === 'input' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-4">
              <UploadIcon className="h-4 w-4" />
              Document → Competency Engine
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
              Upload & Learn
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Upload any document. We'll structure it into chapters, extract key concepts, and create a learning pathway with quizzes and certification.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground mb-8 flex-wrap">
            <span className="px-2 py-1 rounded bg-primary/10">Upload</span>
            <ArrowRight className="h-3 w-3" />
            <span className="px-2 py-1 rounded bg-primary/10">AI Structures</span>
            <ArrowRight className="h-3 w-3" />
            <span className="px-2 py-1 rounded bg-primary/10">Read & Reflect</span>
            <ArrowRight className="h-3 w-3" />
            <span className="px-2 py-1 rounded bg-primary/10">Quiz</span>
            <ArrowRight className="h-3 w-3" />
            <span className="px-2 py-1 rounded bg-primary/10">Certificate</span>
          </div>

          <div className="bg-card rounded-2xl border border-border/50 p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="file" className="gap-2">
                  <FileText className="h-4 w-4" />
                  File
                </TabsTrigger>
                <TabsTrigger value="text" className="gap-2">
                  <Type className="h-4 w-4" />
                  Text
                </TabsTrigger>
                <TabsTrigger value="url" className="gap-2">
                  <Globe className="h-4 w-4" />
                  URL
                </TabsTrigger>
              </TabsList>

              <TabsContent value="file">
                <div className="space-y-4">
                  <Label>Upload Document (PDF, DOCX, or TXT — max 20MB)</Label>
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                      isDragging
                        ? "border-primary bg-primary/10"
                        : file
                          ? "border-primary/50 bg-primary/5"
                          : "border-border hover:border-primary/30",
                    )}
                    onClick={() => document.getElementById('file-input')?.click()}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    role="button"
                    tabIndex={0}
                    aria-label="Upload document"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        document.getElementById('file-input')?.click();
                      }
                    }}
                  >
                    <input
                      id="file-input"
                      type="file"
                      accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    {file ? (
                      <div className="flex items-center justify-center gap-3">
                        <CheckCircle className="h-6 w-6 text-primary" />
                        <div className="text-left">
                          <p className="font-medium text-foreground">{file.name}</p>
                          <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); setFile(null); }}
                          aria-label="Remove file"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <UploadIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-foreground font-medium">
                          {isDragging ? 'Drop to upload' : 'Click to select or drag & drop'}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">PDF, DOCX, TXT, MD · max 20MB</p>
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="text">
                <div className="space-y-4">
                  <Label>Paste your document text</Label>
                  <Textarea
                    placeholder="Paste lecture notes, textbook chapters, articles, or any learning material here..."
                    value={plainText}
                    onChange={(e) => setPlainText(e.target.value)}
                    className="min-h-[200px] resize-y text-foreground caret-foreground"
                    maxLength={1_000_000}
                  />
                  {plainText && (
                    <p className="text-xs text-muted-foreground">
                      {plainText.length.toLocaleString()} characters · ~{Math.round(plainText.split(/\s+/).filter(Boolean).length).toLocaleString()} words
                      {plainText.trim().length < MIN_TEXT_CHARS && (
                        <span className="ml-2 text-destructive">
                          (need at least {MIN_TEXT_CHARS - plainText.trim().length} more)
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="url">
                <div className="space-y-4">
                  <Label>Article or webpage URL</Label>
                  <Input
                    type="url"
                    placeholder="https://example.com/article"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="text-foreground caret-foreground"
                    inputMode="url"
                    autoComplete="url"
                  />
                  <p className="text-xs text-muted-foreground">
                    We'll extract the main content from the page and structure it for learning.
                  </p>
                  {url.trim() && !isHttpUrl(url.trim()) && (
                    <p className="text-xs text-destructive">Please enter a valid http(s) URL.</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="mt-6 pt-6 border-t border-border">
              <Button
                onClick={processDocument}
                size="lg"
                className="w-full gap-2"
                disabled={
                  (activeTab === 'file' && !file) ||
                  (activeTab === 'text' && plainText.trim().length < MIN_TEXT_CHARS) ||
                  (activeTab === 'url' && !isHttpUrl(url.trim()))
                }
              >
                <BookOpen className="h-5 w-5" />
                Process & Create Learning Path
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {step === 'processing' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border/50 p-12 text-center"
        >
          <Loader2 className="h-12 w-12 text-primary mx-auto mb-6 animate-spin" />
          <h2 className="font-display text-2xl font-bold mb-4">Processing Your Document</h2>
          <p className="text-muted-foreground mb-6" aria-live="polite">{progressMessage}</p>
          <Progress value={progress} className="max-w-md mx-auto mb-4" />
          <p className="text-xs text-muted-foreground mb-6">
            This may take 15–30 seconds depending on document length.
          </p>
          <Button variant="outline" onClick={cancelProcessing} className="gap-2">
            <X className="h-4 w-4" /> Cancel
          </Button>
        </motion.div>
      )}

      {step === 'done' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card rounded-2xl border border-border/50 p-12 text-center"
        >
          <div className="bg-primary/10 p-4 rounded-full w-fit mx-auto mb-6">
            <CheckCircle className="h-12 w-12 text-primary" />
          </div>
          <h2 className="font-display text-2xl font-bold mb-2">Learning Path Created!</h2>
          <p className="text-muted-foreground mb-2">{resultTitle}</p>
          {resultChapters > 0 && (
            <p className="text-sm text-muted-foreground mb-8">
              {resultChapters} structured chapters ready for learning
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => resultBookId && navigate(`/book/${resultBookId}`)}
              size="lg"
              className="gap-2"
              disabled={!resultBookId}
            >
              Start Learning
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => {
                setStep('input');
                setFile(null);
                setPlainText('');
                setUrl('');
                setProgress(0);
                setProgressMessage('');
                setResultBookId(null);
                setResultTitle('');
                setResultChapters(0);
              }}
              variant="outline"
              size="lg"
            >
              Upload Another
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <SEO title="Upload Document — ScrollLibrary" description="Upload a PDF, DOCX, or paste text to instantly generate a structured learning path." />
        <MobileLayout>{content}</MobileLayout>
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SEO title="Upload Document — ScrollLibrary" description="Upload a PDF, DOCX, or paste text to instantly generate a structured learning path." />
      <Navbar />
      <main className="flex-1">{content}</main>
      <Footer />
    </div>
  );
}
