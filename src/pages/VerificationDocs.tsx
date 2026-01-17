/**
 * CONTRACT 7C — Public Verification Documentation & Trust Contract
 * 
 * Route: /docs/verification
 * 
 * This page serves as the authoritative reference for:
 * - API documentation for batch verification
 * - Verification guarantees and invariants
 * - Integrity classification definitions
 * - Trust contract for employers/institutions
 */

import { Link } from 'react-router-dom';
import {
  Shield, Code, FileJson, CheckCircle2, AlertTriangle,
  XCircle, Lock, Building2, FileText, ExternalLink,
  BookOpen, Scale, Clock, Hash
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Logo } from '@/components/brand';
import { cn } from '@/lib/utils';

// Current schema version - increment on breaking changes
const SCHEMA_VERSION = '7.0';
const LAST_UPDATED = '2026-01-17';

export default function VerificationDocs() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo variant="icon" size="sm" />
            <span className="font-semibold">ScrollLibrary</span>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              API Documentation
            </Badge>
            <Badge variant="secondary">v{SCHEMA_VERSION}</Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Title Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Certificate Verification API</h1>
          <p className="text-muted-foreground mb-4">
            Public API documentation for employers, institutions, and integration partners.
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Last updated: {LAST_UPDATED}
            </span>
            <span className="flex items-center gap-1">
              <Hash className="h-4 w-4" />
              Schema version: {SCHEMA_VERSION}
            </span>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="api">API Reference</TabsTrigger>
            <TabsTrigger value="integrity">Integrity</TabsTrigger>
            <TabsTrigger value="guarantees">Guarantees</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  What is ScrollLibrary Certification?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  ScrollLibrary issues verifiable certificates of learning achievement. Unlike 
                  traditional course completion certificates, ScrollLibrary certificates include:
                </p>
                <ul className="space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Integrity Scoring</strong> — Behavioral analysis during learning to detect authentic engagement</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Quiz Performance</strong> — Verified assessment scores across all chapters</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Cryptographic Verification</strong> — Unique hash excluding learner identity to prevent self-signing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Public Verification</strong> — Any party can verify without contacting ScrollLibrary</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Certificate Types</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-lg">
                    <Badge variant="secondary" className="mb-2">Completion</Badge>
                    <p className="text-sm text-muted-foreground">
                      Awarded when all chapters and quizzes are completed with integrity score ≥ 0.6 
                      and quiz average ≥ 70%.
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <Badge className="mb-2">Mastery</Badge>
                    <p className="text-sm text-muted-foreground">
                      Awarded for exceptional performance: quiz average ≥ 90%, integrity score ≥ 0.9, 
                      and no integrity flags.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Building2 className="h-8 w-8 text-primary flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">For Employers & Institutions</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Use our batch verification API to verify multiple candidates at once, 
                      or use the verification dashboard for manual verification.
                    </p>
                    <div className="flex gap-2">
                      <Button asChild size="sm">
                        <Link to="/verify">Verification Dashboard</Link>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href="#api-batch">API Documentation</a>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Reference Tab */}
          <TabsContent value="api" className="space-y-6">
            {/* Single Verification */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Single Certificate Verification
                </CardTitle>
                <CardDescription>
                  GET /functions/v1/verify-certificate
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  <pre>{`GET ${supabaseUrl}/functions/v1/verify-certificate?number=SL-CERT-XXXX`}</pre>
                </div>
                
                <h4 className="font-semibold">Response</h4>
                <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  <pre>{`{
  "valid": true,
  "certificateNumber": "SL-CERT-XXXX",
  "certificateType": "completion",
  "issuedAt": "2026-01-15T10:30:00Z",
  "issuer": {
    "authority": "ScrollLibrary Certification Authority",
    "representative": "Founder"
  },
  "recipient": {
    "name": "John Doe"
  },
  "book": {
    "title": "Introduction to Machine Learning",
    "category": "technology"
  },
  "integrityClassification": "trusted",
  "verificationHash": "sha256:abc123..."
}`}</pre>
                </div>
              </CardContent>
            </Card>

            {/* Batch Verification */}
            <Card id="api-batch">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileJson className="h-5 w-5" />
                  Batch Certificate Verification
                </CardTitle>
                <CardDescription>
                  POST /functions/v1/batch-verify-certificates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">Rate Limit: 100 certificates per request</Badge>
                  <Badge variant="outline">No authentication required</Badge>
                </div>

                <h4 className="font-semibold">Request</h4>
                <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  <pre>{`POST ${supabaseUrl}/functions/v1/batch-verify-certificates
Content-Type: application/json

{
  "certificateNumbers": [
    "SL-CERT-001",
    "SL-CERT-002",
    "SL-CERT-003"
  ]
}`}</pre>
                </div>
                
                <h4 className="font-semibold">Response</h4>
                <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  <pre>{`{
  "success": true,
  "totalRequested": 3,
  "totalVerified": 3,
  "totalValid": 2,
  "totalInvalid": 1,
  "results": [
    {
      "certificateNumber": "SL-CERT-001",
      "valid": true,
      "certificateType": "completion",
      "recipientName": "John Doe",
      "bookTitle": "Machine Learning Basics",
      "integrityClassification": "trusted"
    },
    {
      "certificateNumber": "SL-CERT-002",
      "valid": true,
      "certificateType": "mastery",
      "recipientName": "Jane Smith",
      "bookTitle": "Advanced Python",
      "integrityClassification": "trusted"
    },
    {
      "certificateNumber": "SL-CERT-003",
      "valid": false,
      "reason": "Certificate not found"
    }
  ],
  "issuer": {
    "authority": "ScrollLibrary Certification Authority",
    "verifiedAt": "2026-01-17T14:30:00Z"
  }
}`}</pre>
                </div>

                <h4 className="font-semibold">Error Responses</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">400</Badge>
                    <span>Invalid request (empty array, non-string values)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">400</Badge>
                    <span>Batch size exceeded (more than 100 certificates)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">500</Badge>
                    <span>Internal server error</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Export API */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Certificate Export
                </CardTitle>
                <CardDescription>
                  GET /functions/v1/export-certificate
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
                  <pre>{`# JSON Export
GET ${supabaseUrl}/functions/v1/export-certificate?number=SL-CERT-XXXX&format=json

# Printable HTML (for PDF)
GET ${supabaseUrl}/functions/v1/export-certificate?number=SL-CERT-XXXX&format=pdf`}</pre>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Legacy certificates without integrity data cannot be exported.</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Integrity Tab */}
          <TabsContent value="integrity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Integrity Classification System
                </CardTitle>
                <CardDescription>
                  Understanding what integrity scores mean
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  ScrollLibrary uses behavioral analysis during the learning process to assess 
                  the authenticity of learner engagement. This is NOT an AI detection system — 
                  it measures genuine learning behaviors.
                </p>

                <Separator />

                {/* Trusted */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">Trusted</h4>
                      <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-300">
                        Integrity ≥ 0.9
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      High confidence in authentic learning engagement. The learner demonstrated:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                      <li>Consistent typing patterns (not bulk paste)</li>
                      <li>Natural reading pace and focus</li>
                      <li>Progressive quiz improvement</li>
                      <li>No suspicious timing anomalies</li>
                    </ul>
                  </div>
                </div>

                <Separator />

                {/* Review */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">Review</h4>
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        Integrity 0.6 – 0.89
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Valid certificate with some behavioral anomalies. May indicate:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                      <li>Occasional focus interruptions</li>
                      <li>Some paste activity (notes, references)</li>
                      <li>Variable reading speed</li>
                      <li>Minor timing irregularities</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      <strong>Recommendation:</strong> Valid for most purposes. Consider follow-up 
                      interview for high-stakes positions.
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Flagged */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <XCircle className="h-6 w-6 text-destructive" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">Flagged</h4>
                      <Badge variant="outline" className="bg-destructive/10 text-destructive">
                        Integrity &lt; 0.6
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Significant behavioral concerns detected. May indicate:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                      <li>Extensive paste activity</li>
                      <li>Frequent tab switching / focus loss</li>
                      <li>Suspiciously fast completion</li>
                      <li>Quiz timing anomalies</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      <strong>Recommendation:</strong> Verify learning through additional assessment 
                      before relying on this credential.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Lock className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold mb-1">Legacy Certificates</h4>
                    <p className="text-sm text-muted-foreground">
                      Certificates issued before integrity tracking was implemented (pre-v7.0) 
                      are marked as <strong>not verifiable</strong>. This is intentional — 
                      ScrollLibrary prioritizes trust over backwards compatibility.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Guarantees Tab */}
          <TabsContent value="guarantees" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Verification Guarantees
                </CardTitle>
                <CardDescription>
                  Our commitments to verifying parties
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Immutable Issuance
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Once issued, certificate content is frozen. Changes to the underlying book 
                      or user profile do not affect issued certificates.
                    </p>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Data Integrity
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      All verification responses use stored metadata only. No defaults, 
                      no fallbacks, no silent substitutions. If data is missing, 
                      verification fails explicitly.
                    </p>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Revocation Transparency
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Revoked certificates are always clearly marked with the revocation 
                      reason and timestamp. Revocation is permanent and cannot be undone.
                    </p>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Schema Versioning
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Every certificate includes a schema version (currently v{SCHEMA_VERSION}). 
                      Breaking changes increment the major version. Old certificates remain 
                      verifiable under their original schema.
                    </p>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Public Access
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Verification APIs require no authentication. Any party can verify 
                      any certificate number without contacting ScrollLibrary.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Issuing Authority</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">ScrollLibrary Certification Authority</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Official Signatory: Founder & Chief Executive Officer
                    </p>
                    <p className="text-sm text-muted-foreground">
                      All certificates are cryptographically signed by the ScrollLibrary 
                      Certification Authority. The verification hash excludes learner 
                      identity to prevent self-signing attacks.
                    </p>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  <p><strong>Authority Rotation:</strong> Future versions may support 
                  institutional co-signing for enterprise partners. Schema versioning 
                  ensures continuity during authority transitions.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <h3 className="text-xl font-semibold">Ready to Verify?</h3>
                  <p className="text-muted-foreground">
                    Use our dashboard for manual verification or integrate our API 
                    into your HR workflows.
                  </p>
                  <div className="flex justify-center gap-4">
                    <Button asChild>
                      <Link to="/verify">Verification Dashboard</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/contact">Contact for Integration Support</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} ScrollLibrary. All rights reserved.</p>
          <p className="mt-1">
            Schema Version {SCHEMA_VERSION} • Last Updated {LAST_UPDATED}
          </p>
        </div>
      </footer>
    </div>
  );
}
