/**
 * CONTRACT 7B — Organization Verification Dashboard
 * 
 * Route: /verify
 * 
 * Allows employers and institutions to:
 * - Upload CSV of certificate numbers
 * - Batch verify certificates
 * - View status: valid / revoked / flagged
 * - Export verification results
 */

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield, Upload, FileSpreadsheet, CheckCircle2, XCircle,
  AlertTriangle, Download, Loader2, Building2, Search,
  FileJson, Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Logo } from '@/components/brand';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VerificationResult {
  certificateNumber: string;
  valid: boolean;
  certificateType?: string;
  issuedAt?: string;
  recipientName?: string;
  bookTitle?: string;
  integrityClassification?: 'trusted' | 'review' | 'flagged';
  revoked?: boolean;
  revokedReason?: string;
  reason?: string;
}

interface BatchResponse {
  success: boolean;
  totalRequested: number;
  totalVerified: number;
  totalValid: number;
  totalInvalid: number;
  results: VerificationResult[];
  issuer: {
    authority: string;
    verifiedAt: string;
  };
}

export default function OrganizationVerify() {
  const [certificates, setCertificates] = useState<string[]>([]);
  const [results, setResults] = useState<VerificationResult[] | null>(null);
  const [batchStats, setBatchStats] = useState<BatchResponse | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [manualInput, setManualInput] = useState('');

  // Handle CSV file upload
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      // Parse CSV - extract certificate numbers from first column or whole lines
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const certNumbers: string[] = [];

      lines.forEach((line, index) => {
        // Skip header row if it looks like a header
        if (index === 0 && (line.toLowerCase().includes('certificate') || line.toLowerCase().includes('number'))) {
          return;
        }

        // Extract first column (comma-separated) or whole line
        const value = line.includes(',') ? line.split(',')[0].trim() : line.trim();
        
        // Basic validation: looks like a certificate number
        if (value && (value.startsWith('SL-CERT-') || value.match(/^[A-Z0-9-]+$/))) {
          certNumbers.push(value);
        }
      });

      if (certNumbers.length === 0) {
        toast.error('No valid certificate numbers found in CSV');
        return;
      }

      setCertificates(certNumbers);
      setResults(null);
      toast.success(`Loaded ${certNumbers.length} certificate numbers`);
    };

    reader.readAsText(file);
    event.target.value = ''; // Reset input
  }, []);

  // Add manual certificate number
  const addManualCertificate = useCallback(() => {
    const trimmed = manualInput.trim();
    if (!trimmed) return;

    if (certificates.includes(trimmed)) {
      toast.error('Certificate number already added');
      return;
    }

    setCertificates(prev => [...prev, trimmed]);
    setManualInput('');
    setResults(null);
  }, [manualInput, certificates]);

  // Remove certificate from list
  const removeCertificate = useCallback((certNumber: string) => {
    setCertificates(prev => prev.filter(c => c !== certNumber));
    setResults(null);
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    setCertificates([]);
    setResults(null);
    setBatchStats(null);
  }, []);

  // Verify all certificates
  const verifyBatch = useCallback(async () => {
    if (certificates.length === 0) {
      toast.error('Add certificate numbers first');
      return;
    }

    setIsVerifying(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-verify-certificates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificateNumbers: certificates }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Verification failed');
      }

      const data: BatchResponse = await response.json();
      setResults(data.results);
      setBatchStats(data);
      toast.success(`Verified ${data.totalVerified} certificates`);
    } catch (error) {
      console.error('Batch verification error:', error);
      toast.error('Failed to verify certificates');
    } finally {
      setIsVerifying(false);
    }
  }, [certificates]);

  // Export results as JSON
  const exportResults = useCallback(() => {
    if (!batchStats) return;

    const blob = new Blob([JSON.stringify(batchStats, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verification-results-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Results exported');
  }, [batchStats]);

  // Export results as CSV
  const exportCSV = useCallback(() => {
    if (!results) return;

    const headers = ['Certificate Number', 'Valid', 'Type', 'Recipient', 'Book', 'Integrity', 'Revoked', 'Reason'];
    const rows = results.map(r => [
      r.certificateNumber,
      r.valid ? 'Yes' : 'No',
      r.certificateType || '',
      r.recipientName || '',
      r.bookTitle || '',
      r.integrityClassification || '',
      r.revoked ? 'Yes' : 'No',
      r.reason || r.revokedReason || '',
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verification-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  }, [results]);

  const getStatusIcon = (result: VerificationResult) => {
    if (result.revoked) return <XCircle className="h-4 w-4 text-destructive" />;
    if (!result.valid) return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  };

  const getIntegrityBadge = (classification?: string) => {
    switch (classification) {
      case 'trusted':
        return <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-300">Trusted</Badge>;
      case 'review':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300">Review</Badge>;
      case 'flagged':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive">Flagged</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Unknown</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo variant="icon" size="sm" />
            <span className="font-semibold">ScrollLibrary</span>
          </Link>
          <Badge variant="outline" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Organization Verification
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Title Section */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Batch Certificate Verification</h1>
          <p className="text-muted-foreground">
            Verify multiple certificates at once for HR workflows and institutional compliance.
          </p>
        </div>

        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Add Certificates
            </CardTitle>
            <CardDescription>
              Upload a CSV file or enter certificate numbers manually
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* CSV Upload */}
            <div className="flex items-center gap-4">
              <label className="flex-1">
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="flex items-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Drop CSV here or click to upload
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Manual Input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter certificate number (e.g., SL-CERT-XXXX)"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualCertificate()}
                  className="pl-10"
                />
              </div>
              <Button onClick={addManualCertificate} disabled={!manualInput.trim()}>
                Add
              </Button>
            </div>

            {/* Certificate List */}
            {certificates.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {certificates.length} certificate{certificates.length !== 1 ? 's' : ''} to verify
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-muted/50 rounded-lg">
                  {certificates.map(cert => (
                    <Badge
                      key={cert}
                      variant="secondary"
                      className="gap-1 cursor-pointer hover:bg-destructive/20"
                      onClick={() => removeCertificate(cert)}
                    >
                      {cert}
                      <XCircle className="h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Verify Button */}
            <Button
              onClick={verifyBatch}
              disabled={certificates.length === 0 || isVerifying}
              className="w-full"
              size="lg"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Verify {certificates.length} Certificate{certificates.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Section */}
        {batchStats && results && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Verification Results</CardTitle>
                  <CardDescription>
                    Verified by {batchStats.issuer.authority} at{' '}
                    {new Date(batchStats.issuer.verifiedAt).toLocaleString()}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportCSV}>
                    <Download className="h-4 w-4 mr-1" />
                    CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportResults}>
                    <FileJson className="h-4 w-4 mr-1" />
                    JSON
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{batchStats.totalVerified}</p>
                  <p className="text-xs text-muted-foreground">Total Verified</p>
                </div>
                <div className="text-center p-3 bg-green-500/10 rounded-lg">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {batchStats.totalValid}
                  </p>
                  <p className="text-xs text-muted-foreground">Valid</p>
                </div>
                <div className="text-center p-3 bg-destructive/10 rounded-lg">
                  <p className="text-2xl font-bold text-destructive">
                    {batchStats.totalInvalid}
                  </p>
                  <p className="text-xs text-muted-foreground">Invalid</p>
                </div>
              </div>

              <Separator />

              {/* Results Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Status</TableHead>
                      <TableHead>Certificate</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Book</TableHead>
                      <TableHead>Integrity</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((result) => (
                      <TableRow key={result.certificateNumber}>
                        <TableCell>{getStatusIcon(result)}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {result.certificateNumber}
                        </TableCell>
                        <TableCell className="text-sm">
                          {result.recipientName || (
                            <span className="text-muted-foreground italic">
                              {result.reason || 'Unknown'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {result.bookTitle || '-'}
                        </TableCell>
                        <TableCell>
                          {result.valid && getIntegrityBadge(result.integrityClassification)}
                          {!result.valid && (
                            <Badge variant="outline" className="text-destructive">
                              {result.revoked ? 'Revoked' : 'Invalid'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <Link to={`/certificate/${result.certificateNumber}`}>
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trust Badge Info */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Verified by ScrollLibrary</h3>
                <p className="text-sm text-muted-foreground">
                  All certificates verified through this system are cryptographically signed by 
                  ScrollLibrary Certification Authority. Integrity classifications are based on 
                  real-time behavioral analysis during the learning process.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
