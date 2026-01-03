import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  Database, 
  Zap, 
  HardDrive, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlements } from "@/hooks/useEntitlements";

interface DiagnosticTest {
  name: string;
  description: string;
  status: "pending" | "running" | "passed" | "failed" | "warning";
  duration?: number;
  message?: string;
  data?: any;
}

export function SystemDoctor() {
  const entitlements = useEntitlements();
  const [isRunning, setIsRunning] = useState(false);
  const [tests, setTests] = useState<DiagnosticTest[]>([]);
  const [overallHealth, setOverallHealth] = useState<"healthy" | "degraded" | "critical" | null>(null);

  const updateTest = (name: string, update: Partial<DiagnosticTest>) => {
    setTests(prev => prev.map(t => t.name === name ? { ...t, ...update } : t));
  };

  const runDiagnostics = async () => {
    setIsRunning(true);
    setOverallHealth(null);
    
    const initialTests: DiagnosticTest[] = [
      { name: "Edge Functions", description: "Check generate-book, generate-chapter, export-book health", status: "pending" },
      { name: "Storage Access", description: "Verify book-assets bucket read/write", status: "pending" },
      { name: "Database Latency", description: "Measure library query performance", status: "pending" },
      { name: "TTS Service", description: "Check text-to-speech availability", status: "pending" },
      { name: "Authentication", description: "Verify user session and roles", status: "pending" },
      { name: "Entitlements", description: "Validate subscription access", status: "pending" },
    ];
    
    setTests(initialTests);

    const results: { passed: number; failed: number; warning: number } = { passed: 0, failed: 0, warning: 0 };

    // Test 1: Edge Functions
    updateTest("Edge Functions", { status: "running" });
    const edgeStart = Date.now();
    try {
      const functions = ["generate-book", "generate-chapter"];
      let allOk = true;
      
      for (const fn of functions) {
        const { data, error } = await supabase.functions.invoke(fn, {
          body: { healthCheck: true },
        });
        if (error || !data?.ok) allOk = false;
      }
      
      updateTest("Edge Functions", { 
        status: allOk ? "passed" : "warning", 
        duration: Date.now() - edgeStart,
        message: allOk ? "All edge functions responding" : "Some functions unavailable"
      });
      if (allOk) results.passed++; else results.warning++;
    } catch (e) {
      updateTest("Edge Functions", { 
        status: "failed", 
        duration: Date.now() - edgeStart,
        message: e instanceof Error ? e.message : "Edge function check failed"
      });
      results.failed++;
    }

    // Test 2: Storage Access
    updateTest("Storage Access", { status: "running" });
    const storageStart = Date.now();
    try {
      const testPath = `diagnostics/test-${Date.now()}.txt`;
      const testData = new Uint8Array([116, 101, 115, 116]);
      
      const { error: uploadError } = await supabase.storage
        .from("book-assets")
        .upload(testPath, testData.buffer, { upsert: true });
      
      if (uploadError) {
        // Try comic-panels bucket as fallback
        const { error: fallbackError } = await supabase.storage
          .from("comic-panels")
          .upload(testPath, testData.buffer, { upsert: true });
        
        if (fallbackError) throw fallbackError;
        
        // Clean up
        await supabase.storage.from("comic-panels").remove([testPath]);
      } else {
        // Clean up
        await supabase.storage.from("book-assets").remove([testPath]);
      }
      
      updateTest("Storage Access", { 
        status: "passed", 
        duration: Date.now() - storageStart,
        message: "Storage bucket accessible"
      });
      results.passed++;
    } catch (e) {
      updateTest("Storage Access", { 
        status: "failed", 
        duration: Date.now() - storageStart,
        message: e instanceof Error ? e.message : "Storage access failed"
      });
      results.failed++;
    }

    // Test 3: Database Latency
    updateTest("Database Latency", { status: "running" });
    const dbStart = Date.now();
    try {
      const { data, error } = await supabase
        .from("books")
        .select("id")
        .limit(10);
      
      const duration = Date.now() - dbStart;
      const isGood = duration < 800;
      
      updateTest("Database Latency", { 
        status: isGood ? "passed" : "warning", 
        duration,
        message: `Query completed in ${duration}ms ${isGood ? '(good)' : '(slow)'}`
      });
      if (isGood) results.passed++; else results.warning++;
    } catch (e) {
      updateTest("Database Latency", { 
        status: "failed", 
        duration: Date.now() - dbStart,
        message: e instanceof Error ? e.message : "Database query failed"
      });
      results.failed++;
    }

    // Test 4: TTS Service
    updateTest("TTS Service", { status: "running" });
    const ttsStart = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke("text-to-speech", {
        body: { healthCheck: true },
      });
      
      updateTest("TTS Service", { 
        status: (error || !data?.ok) ? "warning" : "passed", 
        duration: Date.now() - ttsStart,
        message: error ? "TTS service unavailable" : "TTS service ready"
      });
      if (!error && data?.ok) results.passed++; else results.warning++;
    } catch (e) {
      updateTest("TTS Service", { 
        status: "warning", 
        duration: Date.now() - ttsStart,
        message: "TTS check skipped"
      });
      results.warning++;
    }

    // Test 5: Authentication
    updateTest("Authentication", { status: "running" });
    const authStart = Date.now();
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (session) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);
        
        updateTest("Authentication", { 
          status: "passed", 
          duration: Date.now() - authStart,
          message: `Authenticated as ${session.user.email}`,
          data: { roles: roles?.map(r => r.role) || [] }
        });
        results.passed++;
      } else {
        updateTest("Authentication", { 
          status: "warning", 
          duration: Date.now() - authStart,
          message: "Not authenticated"
        });
        results.warning++;
      }
    } catch (e) {
      updateTest("Authentication", { 
        status: "failed", 
        duration: Date.now() - authStart,
        message: e instanceof Error ? e.message : "Auth check failed"
      });
      results.failed++;
    }

    // Test 6: Entitlements
    updateTest("Entitlements", { status: "running" });
    const entStart = Date.now();
    try {
      const issues: string[] = [];
      
      if (!entitlements.canExport && entitlements.isPaid) {
        issues.push("Paid user blocked from export");
      }
      if (!entitlements.canGenerateBooks && entitlements.isPaid) {
        issues.push("Paid user blocked from generation");
      }
      
      updateTest("Entitlements", { 
        status: issues.length === 0 ? "passed" : "warning", 
        duration: Date.now() - entStart,
        message: issues.length === 0 
          ? `Tier: ${entitlements.tier}, Admin: ${entitlements.isAdmin}`
          : issues.join("; "),
        data: {
          tier: entitlements.tier,
          isAdmin: entitlements.isAdmin,
          isProphet: entitlements.isProphet,
          isPaid: entitlements.isPaid,
          canExport: entitlements.canExport,
          canGenerateBooks: entitlements.canGenerateBooks,
        }
      });
      if (issues.length === 0) results.passed++; else results.warning++;
    } catch (e) {
      updateTest("Entitlements", { 
        status: "failed", 
        duration: Date.now() - entStart,
        message: "Entitlement check failed"
      });
      results.failed++;
    }

    // Calculate overall health
    if (results.failed > 0) {
      setOverallHealth("critical");
    } else if (results.warning > 1) {
      setOverallHealth("degraded");
    } else {
      setOverallHealth("healthy");
    }

    setIsRunning(false);
  };

  const getStatusIcon = (status: DiagnosticTest["status"]) => {
    switch (status) {
      case "passed": return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed": return <XCircle className="h-5 w-5 text-destructive" />;
      case "warning": return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case "running": return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default: return <div className="h-5 w-5 rounded-full border-2 border-muted" />;
    }
  };

  const passedCount = tests.filter(t => t.status === "passed").length;
  const totalTests = tests.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              System Doctor
            </CardTitle>
            <CardDescription>
              Comprehensive system health diagnostics
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {overallHealth && (
              <Badge 
                variant={
                  overallHealth === "healthy" ? "default" : 
                  overallHealth === "degraded" ? "secondary" : "destructive"
                }
              >
                {overallHealth === "healthy" ? "Healthy" : 
                 overallHealth === "degraded" ? "Degraded" : "Critical"}
              </Badge>
            )}
            <Button onClick={runDiagnostics} disabled={isRunning}>
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Run Diagnostics
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {tests.length > 0 && (
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{passedCount}/{totalTests} passed</span>
            </div>
            <Progress value={(passedCount / Math.max(totalTests, 1)) * 100} />
          </div>

          <div className="space-y-3">
            {tests.map((test) => (
              <div
                key={test.name}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(test.status)}
                  <div>
                    <p className="font-medium text-sm">{test.name}</p>
                    <p className="text-xs text-muted-foreground">{test.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  {test.duration !== undefined && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {test.duration}ms
                    </p>
                  )}
                  {test.message && (
                    <p className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {test.message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Entitlement Debug Panel */}
          {tests.find(t => t.name === "Entitlements")?.data && (
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Database className="h-4 w-4" />
                Entitlement Debug
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(tests.find(t => t.name === "Entitlements")?.data || {}).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-muted-foreground">{key}:</span>
                    <span className={value === true ? "text-green-500" : value === false ? "text-red-500" : ""}>
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
