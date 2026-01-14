/**
 * Contract 5 Compliance Dashboard
 * Shows SLA violations, connection history, and performance metrics
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Wifi, 
  WifiOff, 
  Gauge, 
  Clock, 
  RefreshCw,
  Smartphone,
  Monitor,
  Activity
} from 'lucide-react';
import { 
  verifyContract5, 
  getSLAViolations, 
  getConnectionDiagnostics,
  getLockedViewport,
  SLA,
  type Contract5Report,
  type ConnectionState
} from '@/lib/contract5';
import { getMetrics, getViolations as getPerformanceViolations } from '@/lib/performance';

// Get all page metrics from contract5
function getAllPageMetrics() {
  const violations = getSLAViolations();
  return violations;
}

export function Contract5Dashboard() {
  const [report, setReport] = useState<Contract5Report | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshReport = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setReport(verifyContract5());
      setIsRefreshing(false);
    }, 100);
  };

  useEffect(() => {
    refreshReport();
    // Auto-refresh every 10 seconds
    const interval = setInterval(refreshReport, 10000);
    return () => clearInterval(interval);
  }, []);

  const connectionDiagnostics = getConnectionDiagnostics();
  const viewport = getLockedViewport();
  const performanceViolations = getPerformanceViolations();

  const getConnectionIcon = (state: ConnectionState) => {
    switch (state) {
      case 'online': return <Wifi className="h-5 w-5 text-green-500" />;
      case 'offline': return <WifiOff className="h-5 w-5 text-destructive" />;
      case 'unstable': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    }
  };

  const getStatusBadge = (passed: boolean) => (
    <Badge variant={passed ? 'default' : 'destructive'} className="gap-1">
      {passed ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {passed ? 'PASS' : 'FAIL'}
    </Badge>
  );

  if (!report) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Contract 5 Compliance
            </CardTitle>
            <CardDescription>
              Performance, Reliability & Trust Metrics
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(report.passed)}
            <Button variant="outline" size="sm" onClick={refreshReport} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* SLA Compliance */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-semibold">SLA Compliance (Rule 5.1)</h4>
            </div>
            {getStatusBadge(report.results.slaCompliance.passed)}
          </div>
          <div className="text-sm text-muted-foreground mb-2">
            First content: ≤{SLA.FIRST_MEANINGFUL_CONTENT_MS}ms • Interactive: ≤{SLA.FULLY_INTERACTIVE_MS}ms
          </div>
          
          {report.results.slaCompliance.violations.length > 0 ? (
            <ScrollArea className="h-24 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <ul className="space-y-1 text-sm text-destructive">
                {report.results.slaCompliance.violations.map((v, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <XCircle className="h-3 w-3 flex-shrink-0" />
                    {v}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          ) : (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              All pages within SLA thresholds
            </div>
          )}

          {/* Performance TTI Violations */}
          {performanceViolations.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-medium mb-2">TTI Violations (from performance.ts):</div>
              <ul className="text-sm text-amber-600 dark:text-amber-400 space-y-1">
                {performanceViolations.map((v, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    {v.page}: {v.tti.toFixed(0)}ms
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Separator />

        {/* Mobile Stability */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {viewport?.isMobile ? (
                <Smartphone className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Monitor className="h-4 w-4 text-muted-foreground" />
              )}
              <h4 className="font-semibold">Mobile Stability (Rule 5.2)</h4>
            </div>
            {getStatusBadge(report.results.mobileStability.passed)}
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="text-muted-foreground mb-1">Locked Viewport</div>
              <div className="font-mono text-xs">
                {viewport ? `${viewport.width}x${viewport.height}` : 'Not locked'}
              </div>
              <Badge variant="secondary" className="mt-1 text-xs">
                {viewport?.isMobile ? 'Mobile' : 'Desktop'}
              </Badge>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="text-muted-foreground mb-1">Current Status</div>
              <div className="font-medium">{report.results.mobileStability.details}</div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Connection State */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {getConnectionIcon(connectionDiagnostics.state)}
              <h4 className="font-semibold">Connection Truth (Rule 5.3)</h4>
            </div>
            {getStatusBadge(report.results.connectionTruth.passed)}
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm mb-3">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="text-muted-foreground mb-1">Current State</div>
              <Badge 
                variant={connectionDiagnostics.state === 'online' ? 'default' : 
                        connectionDiagnostics.state === 'offline' ? 'destructive' : 'secondary'}
                className="capitalize"
              >
                {connectionDiagnostics.state}
              </Badge>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="text-muted-foreground mb-1">Avg Latency</div>
              <div className="font-mono">
                {connectionDiagnostics.averageLatency 
                  ? `${connectionDiagnostics.averageLatency.toFixed(0)}ms` 
                  : 'N/A'}
              </div>
            </div>
          </div>

          {/* Connection History */}
          {connectionDiagnostics.recentChecks.length > 0 && (
            <div>
              <div className="text-sm text-muted-foreground mb-2">Recent Checks:</div>
              <div className="flex gap-1 flex-wrap">
                {connectionDiagnostics.recentChecks.map((check, i) => (
                  <div 
                    key={i}
                    className={`h-6 w-6 rounded flex items-center justify-center text-xs ${
                      check.success 
                        ? 'bg-green-500/20 text-green-600 dark:text-green-400' 
                        : 'bg-destructive/20 text-destructive'
                    }`}
                    title={`${check.endpoint} - ${check.success ? 'OK' : 'FAIL'}${check.latency ? ` (${check.latency.toFixed(0)}ms)` : ''}`}
                  >
                    {check.success ? '✓' : '✕'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Trust Signals */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-semibold">Trust Signals (Rule 5.7)</h4>
            </div>
            {getStatusBadge(report.results.trustSignals.passed)}
          </div>
          
          <div className="text-sm text-muted-foreground">
            Active loading states: {report.results.trustSignals.activeStates}
          </div>
        </div>

        {/* Overall Status */}
        <div className={`rounded-lg p-4 text-center ${
          report.passed 
            ? 'bg-green-500/10 border border-green-500/30' 
            : 'bg-destructive/10 border border-destructive/30'
        }`}>
          <div className="flex items-center justify-center gap-2 font-semibold">
            {report.passed ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="text-green-600 dark:text-green-400">Contract 5 Compliance: PASSED</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="text-destructive">Contract 5 Compliance: FAILED</span>
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Last checked: {new Date(report.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
