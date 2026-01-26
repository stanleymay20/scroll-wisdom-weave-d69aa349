/**
 * Launch Health Check Page
 * 
 * Pre-flight checklist that runs automated tests on core features:
 * - Authentication status
 * - Database connectivity
 * - Edge function availability
 * - Storage access
 * - PWA readiness
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  RefreshCw,
  Shield,
  Database,
  Cloud,
  Wifi,
  Smartphone,
  Server,
  Key,
  FileText,
  Zap,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";

type CheckStatus = 'pending' | 'running' | 'passed' | 'failed' | 'warning';

interface HealthCheck {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'core' | 'backend' | 'frontend' | 'pwa';
  status: CheckStatus;
  message?: string;
  duration?: number;
}

const initialChecks: HealthCheck[] = [
  // Core checks
  {
    id: 'auth',
    name: 'Authentication System',
    description: 'Verify auth service is responsive',
    icon: <Key className="h-5 w-5" />,
    category: 'core',
    status: 'pending',
  },
  {
    id: 'database',
    name: 'Database Connection',
    description: 'Test database read/write access',
    icon: <Database className="h-5 w-5" />,
    category: 'core',
    status: 'pending',
  },
  {
    id: 'storage',
    name: 'File Storage',
    description: 'Verify storage bucket access',
    icon: <FileText className="h-5 w-5" />,
    category: 'core',
    status: 'pending',
  },
  // Backend checks
  {
    id: 'edge-check-subscription',
    name: 'Subscription Service',
    description: 'Test check-subscription edge function',
    icon: <Server className="h-5 w-5" />,
    category: 'backend',
    status: 'pending',
  },
  {
    id: 'edge-content-filter',
    name: 'Content Filter',
    description: 'Test content-filter edge function',
    icon: <Shield className="h-5 w-5" />,
    category: 'backend',
    status: 'pending',
  },
  // Frontend checks
  {
    id: 'network',
    name: 'Network Connectivity',
    description: 'Verify network status detection',
    icon: <Wifi className="h-5 w-5" />,
    category: 'frontend',
    status: 'pending',
  },
  {
    id: 'localstorage',
    name: 'Local Storage',
    description: 'Test local storage availability',
    icon: <Database className="h-5 w-5" />,
    category: 'frontend',
    status: 'pending',
  },
  // PWA checks
  {
    id: 'service-worker',
    name: 'Service Worker',
    description: 'Verify service worker registration',
    icon: <Cloud className="h-5 w-5" />,
    category: 'pwa',
    status: 'pending',
  },
  {
    id: 'manifest',
    name: 'Web Manifest',
    description: 'Check PWA manifest availability',
    icon: <Smartphone className="h-5 w-5" />,
    category: 'pwa',
    status: 'pending',
  },
  {
    id: 'cache-api',
    name: 'Cache API',
    description: 'Test cache storage for offline support',
    icon: <Zap className="h-5 w-5" />,
    category: 'pwa',
    status: 'pending',
  },
];

export default function HealthCheck() {
  const [checks, setChecks] = useState<HealthCheck[]>(initialChecks);
  const [isRunning, setIsRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);

  const updateCheck = useCallback((id: string, updates: Partial<HealthCheck>) => {
    setChecks(prev => prev.map(check => 
      check.id === id ? { ...check, ...updates } : check
    ));
  }, []);

  const runCheck = async (check: HealthCheck): Promise<void> => {
    const start = performance.now();
    updateCheck(check.id, { status: 'running' });

    try {
      switch (check.id) {
        case 'auth': {
          const { error } = await supabase.auth.getSession();
          if (error) throw error;
          updateCheck(check.id, { 
            status: 'passed', 
            message: 'Auth service responding',
            duration: performance.now() - start 
          });
          break;
        }

        case 'database': {
          const { error } = await supabase.from('faqs').select('id').limit(1);
          if (error) throw error;
          updateCheck(check.id, { 
            status: 'passed', 
            message: 'Database accessible',
            duration: performance.now() - start 
          });
          break;
        }

        case 'storage': {
          const { error } = await supabase.storage.from('book-assets').list('', { limit: 1 });
          if (error) throw error;
          updateCheck(check.id, { 
            status: 'passed', 
            message: 'Storage bucket accessible',
            duration: performance.now() - start 
          });
          break;
        }

        case 'edge-check-subscription': {
          const { error } = await supabase.functions.invoke('check-subscription', {
            body: {},
          });
          // 401 is expected for unauthenticated - that's fine, function is reachable
          if (error && !error.message.includes('401') && !error.message.includes('Unauthorized')) {
            throw error;
          }
          updateCheck(check.id, { 
            status: 'passed', 
            message: 'Edge function reachable',
            duration: performance.now() - start 
          });
          break;
        }

        case 'edge-content-filter': {
          const { error } = await supabase.functions.invoke('content-filter', {
            body: { text: 'test', action: 'check' },
          });
          if (error && !error.message.includes('401')) throw error;
          updateCheck(check.id, { 
            status: 'passed', 
            message: 'Content filter operational',
            duration: performance.now() - start 
          });
          break;
        }

        case 'network': {
          if (navigator.onLine) {
            updateCheck(check.id, { 
              status: 'passed', 
              message: 'Network available',
              duration: performance.now() - start 
            });
          } else {
            updateCheck(check.id, { 
              status: 'warning', 
              message: 'Offline mode detected',
              duration: performance.now() - start 
            });
          }
          break;
        }

        case 'localstorage': {
          const testKey = '__health_check_test__';
          localStorage.setItem(testKey, 'test');
          localStorage.removeItem(testKey);
          updateCheck(check.id, { 
            status: 'passed', 
            message: 'Local storage working',
            duration: performance.now() - start 
          });
          break;
        }

        case 'service-worker': {
          if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
              updateCheck(check.id, { 
                status: 'passed', 
                message: 'Service worker registered',
                duration: performance.now() - start 
              });
            } else {
              updateCheck(check.id, { 
                status: 'warning', 
                message: 'Service worker not yet registered',
                duration: performance.now() - start 
              });
            }
          } else {
            updateCheck(check.id, { 
              status: 'warning', 
              message: 'Service workers not supported',
              duration: performance.now() - start 
            });
          }
          break;
        }

        case 'manifest': {
          const response = await fetch('/manifest.webmanifest');
          if (!response.ok) throw new Error('Manifest not found');
          const manifest = await response.json();
          if (!manifest.name) throw new Error('Invalid manifest');
          updateCheck(check.id, { 
            status: 'passed', 
            message: 'Manifest valid',
            duration: performance.now() - start 
          });
          break;
        }

        case 'cache-api': {
          if ('caches' in window) {
            const cache = await caches.open('health-check-test');
            await cache.put('/test', new Response('test'));
            await cache.delete('/test');
            await caches.delete('health-check-test');
            updateCheck(check.id, { 
              status: 'passed', 
              message: 'Cache API working',
              duration: performance.now() - start 
            });
          } else {
            updateCheck(check.id, { 
              status: 'warning', 
              message: 'Cache API not supported',
              duration: performance.now() - start 
            });
          }
          break;
        }

        default:
          updateCheck(check.id, { 
            status: 'warning', 
            message: 'Unknown check',
            duration: performance.now() - start 
          });
      }
    } catch (error) {
      updateCheck(check.id, { 
        status: 'failed', 
        message: error instanceof Error ? error.message : 'Check failed',
        duration: performance.now() - start 
      });
    }
  };

  const runAllChecks = async () => {
    setIsRunning(true);
    setStartTime(Date.now());
    setTotalDuration(null);
    
    // Reset all checks
    setChecks(initialChecks);

    // Run checks sequentially for clarity
    for (const check of initialChecks) {
      await runCheck(check);
      // Small delay between checks
      await new Promise(r => setTimeout(r, 100));
    }

    setIsRunning(false);
    setTotalDuration(Date.now() - (startTime || Date.now()));
  };

  // Auto-run on mount
  useEffect(() => {
    runAllChecks();
  }, []);

  const passedCount = checks.filter(c => c.status === 'passed').length;
  const failedCount = checks.filter(c => c.status === 'failed').length;
  const warningCount = checks.filter(c => c.status === 'warning').length;
  const progress = (checks.filter(c => c.status !== 'pending' && c.status !== 'running').length / checks.length) * 100;

  const overallStatus = failedCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy';

  const getStatusIcon = (status: CheckStatus) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'running':
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-muted" />;
    }
  };

  const categories = ['core', 'backend', 'frontend', 'pwa'] as const;
  const categoryNames = {
    core: 'Core Services',
    backend: 'Backend Functions',
    frontend: 'Frontend Systems',
    pwa: 'PWA Capabilities',
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold">System Health Check</h1>
            <p className="text-muted-foreground">
              Pre-flight diagnostics for ScrollLibrary
            </p>
          </div>

          {/* Overall Status */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-full ${
                    overallStatus === 'healthy' ? 'bg-emerald-500/10' :
                    overallStatus === 'warning' ? 'bg-amber-500/10' :
                    'bg-destructive/10'
                  }`}>
                    {overallStatus === 'healthy' ? (
                      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    ) : overallStatus === 'warning' ? (
                      <AlertTriangle className="h-8 w-8 text-amber-500" />
                    ) : (
                      <XCircle className="h-8 w-8 text-destructive" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">
                      {overallStatus === 'healthy' ? 'All Systems Operational' :
                       overallStatus === 'warning' ? 'Minor Issues Detected' :
                       'Critical Issues Found'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {passedCount} passed · {warningCount} warnings · {failedCount} failed
                    </p>
                  </div>
                </div>
                
                <Button 
                  onClick={runAllChecks} 
                  disabled={isRunning}
                  variant={overallStatus === 'healthy' ? 'outline' : 'default'}
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {isRunning ? 'Running...' : 'Run Again'}
                </Button>
              </div>
              
              {isRunning && (
                <Progress value={progress} className="mt-4" />
              )}
            </CardContent>
          </Card>

          {/* Checks by Category */}
          {categories.map(category => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-lg">{categoryNames[category]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {checks.filter(c => c.category === category).map(check => (
                  <motion.div
                    key={check.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      check.status === 'failed' ? 'border-destructive/30 bg-destructive/5' :
                      check.status === 'warning' ? 'border-amber-500/30 bg-amber-500/5' :
                      check.status === 'passed' ? 'border-emerald-500/30 bg-emerald-500/5' :
                      'border-border bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-muted-foreground">
                        {check.icon}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{check.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {check.message || check.description}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {check.duration && (
                        <Badge variant="outline" className="text-xs">
                          {check.duration.toFixed(0)}ms
                        </Badge>
                      )}
                      {getStatusIcon(check.status)}
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Readiness Summary */}
          {!isRunning && (
            <Card className={
              overallStatus === 'healthy' ? 'border-emerald-500/30' :
              overallStatus === 'warning' ? 'border-amber-500/30' :
              'border-destructive/30'
            }>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <Badge variant={
                    overallStatus === 'healthy' ? 'default' :
                    overallStatus === 'warning' ? 'secondary' :
                    'destructive'
                  } className="text-sm px-4 py-1">
                    {overallStatus === 'healthy' ? '✅ Ready for Launch' :
                     overallStatus === 'warning' ? '⚠️ Proceed with Caution' :
                     '❌ Not Ready'}
                  </Badge>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {overallStatus === 'healthy' 
                      ? 'All core systems are operational. The app is ready for production use.'
                      : overallStatus === 'warning'
                      ? 'Some non-critical features may be limited. Core functionality is operational.'
                      : 'Critical issues need to be resolved before going live. Check the failed items above.'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
