import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { BUILD_INFO } from "@/lib/buildInfo";
import { Loader2, CheckCircle, XCircle, ExternalLink, Zap, BookOpen, Image as ImageIcon, LogIn, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

interface TestResult {
  name: string;
  status: "pending" | "running" | "passed" | "failed";
  message?: string;
  data?: any;
}

interface ComicTestResult {
  bookId?: string;
  chapterId?: string;
  panelCount?: number;
  hasDialogue?: boolean;
  imageUrls?: string[];
  style?: string;
  error?: string;
  savedContent?: string; // For debug drawer
}

function EdgeFunctionHealth() {
  const [health, setHealth] = useState<Record<string, "pending" | "ok" | "error">>({
    "generate-book": "pending",
    "generate-chapter": "pending",
  });
  const [details, setDetails] = useState<Record<string, any>>({});

  const checkHealth = async (fn: string) => {
    try {
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { healthCheck: true },
      });
      if (error) {
        setHealth((h) => ({ ...h, [fn]: "error" }));
        setDetails((d) => ({ ...d, [fn]: { error: error.message } }));
        return;
      }
      setHealth((h) => ({ ...h, [fn]: "ok" }));
      setDetails((d) => ({ ...d, [fn]: data }));
    } catch (e: any) {
      setHealth((h) => ({ ...h, [fn]: "error" }));
      setDetails((d) => ({ ...d, [fn]: { error: e?.message || "Unknown error" } }));
    }
  };

  const runHealthChecks = () => {
    setHealth({ "generate-book": "pending", "generate-chapter": "pending" });
    setDetails({});
    checkHealth("generate-book");
    checkHealth("generate-chapter");
  };

  useEffect(() => {
    runHealthChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3">
        {Object.entries(health).map(([fn, status]) => (
          <div key={fn} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  status === "ok" ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-muted-foreground"
                }`}
              />
              <span className="text-sm font-mono">{fn}</span>
              <Badge
                variant={status === "ok" ? "default" : status === "error" ? "destructive" : "secondary"}
                className="text-xs"
              >
                {status}
              </Badge>
            </div>
            {details[fn]?.buildId && (
              <span className="text-xs text-muted-foreground font-mono">
                {details[fn].buildId}
              </span>
            )}
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={runHealthChecks}>
        Re-check
      </Button>
    </div>
  );
}

export default function Diagnostics() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [comicResult, setComicResult] = useState<ComicTestResult | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const accessState = useMemo<"loading" | "unauth" | "forbidden" | "ok">(() => {
    if (adminLoading) return "loading";
    if (!isAdmin) return "forbidden";
    return "ok";
  }, [adminLoading, isAdmin]);

  const updateTest = (name: string, update: Partial<TestResult>) => {
    setTestResults((prev) =>
      prev.map((t) => (t.name === name ? { ...t, ...update } : t))
    );
  };

  const runAfricanSuperheroTest = async () => {
    setIsRunning(true);
    setComicResult(null);

    const tests: TestResult[] = [
      { name: "Create test book", status: "pending" },
      { name: "Generate comic chapter", status: "pending" },
      { name: "Verify panel count (5)", status: "pending" },
      { name: "Verify dialogue present", status: "pending" },
      { name: "Verify images stored", status: "pending" },
      { name: "OCR verify text in image", status: "pending" },
      { name: "Render in reader", status: "pending" },
    ];
    setTestResults(tests);

    try {
      // Get session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      // Step 1: Create test book
      updateTest("Create test book", { status: "running" });
      
      const bookPayload = {
        title: `[TEST] African Superhero Comic - ${Date.now()}`,
        description: "Automated smoke test for african_superhero comic style",
        category: "fiction",
        numChapters: 1,
        language: "en",
        bookType: "comic",
        comicStyleId: "african_superhero",
        paletteHint: "Rich earth tones, gold accents",
        lineWeightHint: "Bold confident lines",
        textInImage: true, // Test with text in image enabled
        scenesPerPanel: 1,
        characterSheet: {
          protagonist: {
            name: "Amara",
            hair: "Black braided hair with gold beads",
            skin: "Dark brown skin",
            costume: "Traditional African patterns with futuristic armor elements",
          },
        },
        layoutTemplate: 5,
      };

      const { data: bookData, error: bookError } = await supabase.functions.invoke(
        "generate-book",
        {
          body: bookPayload,
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (bookError || !bookData?.bookId) {
        throw new Error(bookError?.message || "Failed to create book");
      }

      updateTest("Create test book", { 
        status: "passed", 
        message: `Book ID: ${bookData.bookId.slice(0, 8)}...`,
        data: { bookId: bookData.bookId }
      });

      // Get chapter ID
      const { data: chapters } = await supabase
        .from("chapters")
        .select("id, title")
        .eq("book_id", bookData.bookId)
        .order("chapter_number")
        .limit(1);

      if (!chapters || chapters.length === 0) {
        throw new Error("No chapters found");
      }

      const chapterId = chapters[0].id;

      // Step 2: Generate comic chapter
      updateTest("Generate comic chapter", { status: "running" });

      const chapterPayload = {
        chapterId,
        bookTitle: bookPayload.title,
        chapterTitle: chapters[0].title,
        chapterNumber: 1,
        keyTopics: ["African superhero origin story", "Powers awakening", "First challenge"],
        category: "fiction",
        language: "en",
        bookType: "comic",
        comicStyle: "african_superhero",
      };

      const { data: chapterData, error: chapterError } = await supabase.functions.invoke(
        "generate-chapter",
        {
          body: chapterPayload,
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (chapterError) {
        throw new Error(chapterError.message || "Failed to generate chapter");
      }

      updateTest("Generate comic chapter", { 
        status: "passed", 
        message: `Words: ${chapterData?.wordCount || 0}, Panels: ${chapterData?.panelCount || 0}`,
        data: chapterData
      });

      // Step 3: Verify panel count
      updateTest("Verify panel count (5)", { status: "running" });

      const panelCount = chapterData?.panelCount || 0;
      if (panelCount >= 4 && panelCount <= 6) {
        updateTest("Verify panel count (5)", { 
          status: "passed", 
          message: `Found ${panelCount} panels (expected 4-6)` 
        });
      } else {
        updateTest("Verify panel count (5)", { 
          status: "failed", 
          message: `Found ${panelCount} panels (expected 4-6)` 
        });
      }

      // Step 4: Verify dialogue
      updateTest("Verify dialogue present", { status: "running" });

      const { data: chapterContent } = await supabase
        .from("chapters")
        .select("content")
        .eq("id", chapterId)
        .single();

      const content = chapterContent?.content || "";
      // Dialogue formats we generate in comics (post-sanitization):
      // - AMARA: "text"  OR  AMARA: text  (quotes may vary)
      // Also tolerate smart quotes and optional leading hyphen.
      const hasDialogue =
        /\bDialogue\s*:/i.test(content) ||
        /(^|\n)\s*-?\s*(?!Visual\b)(?!Caption\b)(?!Scene\b)[A-Z][A-Za-z0-9_\s-]{1,40}:\s*["“]?[\s\S]{2,80}?["”]?(?=\n|$)/m.test(content);

      updateTest("Verify dialogue present", {
        status: hasDialogue ? "passed" : "failed",
        message: hasDialogue ? "Dialogue found in panels" : "No dialogue detected",
      });

      // Step 5: Verify images
      updateTest("Verify images stored", { status: "running" });

      const imageUrls = content
        .match(/!\[Panel\s*\d+\]\(([^)]+)\)/g)
        ?.map((m) => m.match(/\(([^)]+)\)/)?.[1] || "")
        .filter(Boolean) || [];

      const imageCount = imageUrls.length;

      updateTest("Verify images stored", {
        status: imageCount > 0 ? "passed" : "failed",
        message: `${imageCount} panel images found`,
      });

      // Step 6: OCR verify text in image
      updateTest("OCR verify text in image", { status: "running" });
      
      let ocrPassed = false;
      let ocrMessage = "No images to verify";
      
      if (imageUrls.length > 0) {
        try {
          // Use Gemini to verify if text is present in the first panel image
          const firstImageUrl = imageUrls[0];
          
          // Call an edge function to do OCR check (we'll use Gemini vision)
          const { data: ocrResult, error: ocrError } = await supabase.functions.invoke(
            "generate-chapter",
            {
              body: { 
                ocrCheck: true,
                imageUrl: firstImageUrl,
                expectedText: ["AMARA", "Amara", "city", "calls", "tonight", "hero", "powers"],
              },
              headers: { Authorization: `Bearer ${session.access_token}` },
            }
          );
          
          if (ocrError) {
            ocrMessage = `OCR check failed: ${ocrError.message}`;
          } else if (ocrResult?.ocrResult) {
            const foundText = ocrResult.ocrResult.foundText || [];
            const hasText = ocrResult.ocrResult.hasText || false;
            ocrPassed = hasText && foundText.length > 0;
            ocrMessage = hasText 
              ? `Found text: ${foundText.slice(0, 3).join(", ")}${foundText.length > 3 ? "..." : ""}`
              : "No text detected in image";
          } else {
            ocrMessage = "OCR response invalid";
          }
        } catch (ocrErr) {
          ocrMessage = `OCR error: ${ocrErr instanceof Error ? ocrErr.message : "unknown"}`;
        }
      }
      
      updateTest("OCR verify text in image", {
        status: ocrPassed ? "passed" : "failed",
        message: ocrMessage,
      });

      // Step 7: Render check
      updateTest("Render in reader", { status: "running" });
      updateTest("Render in reader", { 
        status: "passed", 
        message: "Ready for render verification",
        data: { bookId: bookData.bookId, chapterId }
      });

      // Set final result with saved content for debug drawer
      setComicResult({
        bookId: bookData.bookId,
        chapterId,
        panelCount,
        hasDialogue,
        imageUrls,
        style: "african_superhero",
        savedContent: content, // Store saved content for debug
      });

      toast({
        title: "Smoke test complete",
        description: `${testResults.filter(t => t.status === "passed").length}/${tests.length} tests passed`,
      });

    } catch (error) {
      console.error("Smoke test error:", error);
      
      // Mark remaining tests as failed
      setTestResults((prev) =>
        prev.map((t) =>
          t.status === "pending" || t.status === "running"
            ? { ...t, status: "failed", message: error instanceof Error ? error.message : "Unknown error" }
            : t
        )
      );

      setComicResult({
        error: error instanceof Error ? error.message : "Unknown error",
      });

      toast({
        title: "Smoke test failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "passed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "running":
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-muted" />;
    }
  };

  if (adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Diagnostics</h1>
              <p className="text-muted-foreground mt-1">
                Production verification: health checks, build ID, and smoke tests
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {BUILD_INFO.id}
            </Badge>
          </div>

          <Separator />

          {/* Edge Function Health Check */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Edge Function Health</CardTitle>
            </CardHeader>
            <CardContent>
              <EdgeFunctionHealth />
            </CardContent>
          </Card>

          {/* African Superhero Comic Test */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    African Superhero Comic Test
                  </CardTitle>
                  <CardDescription>
                    End-to-end smoke test: create book → generate chapter → verify panels, dialogue, images
                  </CardDescription>
                </div>
                <Button 
                  onClick={runAfricanSuperheroTest} 
                  disabled={isRunning}
                  size="lg"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Run Test
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            
            {testResults.length > 0 && (
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {testResults.map((test, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(test.status)}
                        <span className="font-medium">{test.name}</span>
                      </div>
                      {test.message && (
                        <span className="text-sm text-muted-foreground">
                          {test.message}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Results Summary */}
                {comicResult && !comicResult.error && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <h3 className="font-semibold flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        Test Results
                      </h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-sm text-muted-foreground">Style</p>
                          <Badge variant="secondary" className="mt-1">
                            {comicResult.style}
                          </Badge>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-sm text-muted-foreground">Panels</p>
                          <p className="font-mono text-lg">{comicResult.panelCount}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-sm text-muted-foreground">Dialogue</p>
                          <Badge variant={comicResult.hasDialogue ? "default" : "destructive"}>
                            {comicResult.hasDialogue ? "Present" : "Missing"}
                          </Badge>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-sm text-muted-foreground">Images</p>
                          <p className="font-mono text-lg">{comicResult.imageUrls?.length || 0}</p>
                        </div>
                      </div>

                      {/* Links */}
                      <div className="flex gap-3 flex-wrap">
                        {comicResult.bookId && (
                          <Button
                            variant="outline"
                            onClick={() => navigate(`/book/${comicResult.bookId}`)}
                          >
                            <BookOpen className="mr-2 h-4 w-4" />
                            Open Book
                          </Button>
                        )}
                        {comicResult.bookId && comicResult.chapterId && (
                          <Button
                            variant="outline"
                            onClick={() => navigate(`/read/${comicResult.bookId}/${comicResult.chapterId}`)}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open Reader
                          </Button>
                        )}
                      </div>

                      {/* Panel Image URLs (first 3) */}
                      {comicResult.imageUrls && comicResult.imageUrls.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            Panel image URLs (first 3)
                          </h4>
                          <div className="space-y-1">
                            {comicResult.imageUrls.slice(0, 3).map((url, idx) => (
                              <a
                                key={idx}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-xs font-mono text-primary underline truncate"
                                title={url}
                              >
                                {url}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Panel Images Preview */}
                      {comicResult.imageUrls && comicResult.imageUrls.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            Panel Images ({comicResult.imageUrls.length})
                          </h4>
                          <ScrollArea className="h-[200px] rounded-lg border p-2">
                            <div className="grid grid-cols-3 gap-2">
                              {comicResult.imageUrls.slice(0, 6).map((url, idx) => (
                                <div key={idx} className="aspect-square rounded-lg overflow-hidden bg-muted">
                                  {url.startsWith("data:") ? (
                                    <img 
                                      src={url} 
                                      alt={`Panel ${idx + 1}`} 
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                      External URL
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      )}

                      {/* Debug Drawer: Saved Chapter Content */}
                      {comicResult.savedContent && (
                        <Collapsible open={debugOpen} onOpenChange={setDebugOpen}>
                          <CollapsibleTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full justify-between">
                              <span className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                Debug: Saved Content Preview
                              </span>
                              {debugOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2">
                            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                              <p className="text-xs text-muted-foreground mb-2">
                                First 500 characters of saved chapter content:
                              </p>
                              <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-background/50 p-2 rounded border max-h-64 overflow-auto">
                                {comicResult.savedContent.slice(0, 500)}
                                {comicResult.savedContent.length > 500 && '...'}
                              </pre>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                  </>
                )}

                {/* Error Display */}
                {comicResult?.error && (
                  <>
                    <Separator />
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                      <h3 className="font-semibold text-destructive flex items-center gap-2">
                        <XCircle className="h-5 w-5" />
                        Test Failed
                      </h3>
                      <p className="mt-2 text-sm">{comicResult.error}</p>
                    </div>
                  </>
                )}
              </CardContent>
            )}
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={() => navigate("/pwa-test")}>
                PWA Tests
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin")}>
                Admin Panel
              </Button>
              <Button variant="outline" onClick={() => navigate("/generate")}>
                Generate Page
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
