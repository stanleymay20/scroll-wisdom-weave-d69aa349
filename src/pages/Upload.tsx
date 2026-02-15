import { useState, useCallback } from "react";
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
  CheckCircle, BookOpen, ArrowRight, Lock, AlertTriangle 
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { cn } from "@/lib/utils";

type UploadStep = 'input' | 'processing' | 'done';

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

  // Input states
  const [file, setFile] = useState<File | null>(null);
  const [plainText, setPlainText] = useState('');
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('en');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (f.size > maxSize) {
      toast({ title: "File too large", description: "Maximum file size is 20MB.", variant: "destructive" });
      return;
    }

    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'text/markdown',
    ];
    if (!validTypes.includes(f.type) && !f.name.endsWith('.md') && !f.name.endsWith('.txt')) {
      toast({ title: "Unsupported format", description: "Please upload a PDF, DOCX, or text file.", variant: "destructive" });
      return;
    }
    setFile(f);
  };

  const extractTextFromFile = async (f: File): Promise<string> => {
    // For text files, read directly
    if (f.type === 'text/plain' || f.name.endsWith('.txt') || f.name.endsWith('.md')) {
      return await f.text();
    }

    // For PDF/DOCX, upload to storage and use a simpler approach
    // We'll read as text for now (basic extraction)
    // In production, this would use a proper parser
    const text = await f.text();
    
    // If it looks like binary/garbled, we need to handle it
    if (text.includes('%PDF') || text.charCodeAt(0) > 127) {
      // Upload the file and let the edge function handle it via storage
      const path = `${user!.id}/${Date.now()}-${f.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, f);

      if (uploadError) throw new Error('Failed to upload file');

      // For now, return a message indicating PDF parsing limitation
      // TODO: Integrate proper PDF parsing in edge function
      throw new Error('PDF and DOCX files require text extraction. Please copy-paste the text content directly, or use the Text tab.');
    }

    return text;
  };

  const processDocument = useCallback(async () => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to upload documents." });
      navigate('/auth');
      return;
    }

    let documentText = '';
    let documentName = '';
    let sourceType = 'uploaded';

    try {
      if (activeTab === 'file' && file) {
        setProgressMessage('Reading file...');
        setProgress(10);
        documentText = await extractTextFromFile(file);
        documentName = file.name;
      } else if (activeTab === 'text' && plainText.trim()) {
        documentText = plainText.trim();
        documentName = 'Pasted Text';
        sourceType = 'pasted';
      } else if (activeTab === 'url' && url.trim()) {
        setProgressMessage('Fetching content from URL...');
        setProgress(10);
        sourceType = 'url';
        documentName = url;
        
        // Use Firecrawl to scrape the URL
        const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke('firecrawl-scrape', {
          body: { url: url.trim() },
        });

        if (scrapeError || !scrapeData?.success) {
          toast({ 
            title: "URL fetch failed", 
            description: scrapeData?.error || "Could not extract content from this URL. Try pasting the text directly.",
            variant: "destructive",
          });
          return;
        }

        documentText = scrapeData.markdown || '';
        if (scrapeData.title) documentName = scrapeData.title;
      } else {
        toast({ title: "No content", description: "Please provide a document, paste text, or enter a URL.", variant: "destructive" });
        return;
      }

      if (documentText.length < 200) {
        toast({ title: "Too short", description: "Document must contain at least 200 characters.", variant: "destructive" });
        return;
      }

      setStep('processing');
      setProgress(20);
      setProgressMessage('Analyzing document structure...');

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(p => Math.min(p + 5, 85));
      }, 2000);

      setTimeout(() => setProgressMessage('Extracting learning objectives...'), 3000);
      setTimeout(() => setProgressMessage('Identifying key concepts...'), 6000);
      setTimeout(() => setProgressMessage('Generating chapter structure...'), 9000);
      setTimeout(() => setProgressMessage('Building reflection prompts...'), 12000);

      const { data, error } = await supabase.functions.invoke('process-document', {
        body: {
          documentText,
          documentName,
          sourceType,
          language,
        },
      });

      clearInterval(progressInterval);

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Processing failed');

      setProgress(100);
      setProgressMessage('Document processed successfully!');
      setResultBookId(data.bookId);
      setResultTitle(data.title);
      setResultChapters(data.chaptersCreated);
      setStep('done');

      toast({ title: "Document processed!", description: `Created ${data.chaptersCreated} chapters from your document.` });

    } catch (err: any) {
      console.error('Upload error:', err);
      setStep('input');
      setProgress(0);
      toast({ 
        title: "Processing failed", 
        description: err.message || "Failed to process document. Please try again.",
        variant: "destructive",
      });
    }
  }, [activeTab, file, plainText, url, user, language, navigate, toast]);

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
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
          {/* Header */}
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

          {/* How it works */}
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

          {/* Input tabs */}
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
                      file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
                    )}
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    <input
                      id="file-input"
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
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
                      </div>
                    ) : (
                      <>
                        <UploadIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">Click to select or drag & drop</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">PDF, DOCX, TXT, MD</p>
                      </>
                    )}
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      For best results with PDF/DOCX, copy the text content and use the "Text" tab. Direct file parsing support is coming soon.
                    </p>
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
                    className="min-h-[200px] resize-y"
                  />
                  {plainText && (
                    <p className="text-xs text-muted-foreground">
                      {plainText.length.toLocaleString()} characters · ~{Math.round(plainText.split(/\s+/).length).toLocaleString()} words
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
                  />
                  <p className="text-xs text-muted-foreground">
                    We'll extract the main content from the page and structure it for learning.
                  </p>
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
                  (activeTab === 'text' && plainText.trim().length < 200) ||
                  (activeTab === 'url' && !url.trim())
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
          <p className="text-muted-foreground mb-6">{progressMessage}</p>
          <Progress value={progress} className="max-w-md mx-auto mb-4" />
          <p className="text-xs text-muted-foreground">This may take 15-30 seconds depending on document length.</p>
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
          <p className="text-sm text-muted-foreground mb-8">{resultChapters} structured chapters ready for learning</p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={() => navigate(`/book/${resultBookId}`)} 
              size="lg" 
              className="gap-2"
            >
              Start Learning
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              onClick={() => { setStep('input'); setFile(null); setPlainText(''); setUrl(''); setProgress(0); }}
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
    return <MobileLayout>{content}</MobileLayout>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      {content}
      <Footer />
    </div>
  );
}
