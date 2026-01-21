/**
 * TEST CERTIFICATE PAGE
 * Verifies: Certification Emblem + Competency Manifest display
 * Route: /certificate-test
 */

import { useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CertificateDisplay } from '@/components/certificates/CertificateDisplay';
import { CompetencyManifestDisplay } from '@/components/certificates/CompetencyManifestDisplay';
import { CertificationEmblem } from '@/components/certificates/CertificationEmblem';
import { createCertificate, CertificateType } from '@/lib/certificateAuthority';
import { generateCompetencyManifest } from '@/lib/competencyManifest';

// Mock data for test certificate
const MOCK_RECIPIENT = {
  name: 'Test Learner',
  email: 'test@scrolllibrary.com',
  userId: 'test-user-123',
};

const MOCK_CONTENT = {
  bookTitle: 'Advanced TypeScript Patterns',
  bookType: 'academic',
  completionDate: new Date(),
  wordCount: 45000,
  chaptersCompleted: 10,
  totalChapters: 10,
  learningLevel: 'Advanced',
};

const MOCK_MANIFEST_DATA = {
  learningObjectives: [
    'Understand advanced TypeScript type inference',
    'Apply generic constraints in real-world scenarios',
    'Analyze complex type unions and intersections',
    'Evaluate type safety patterns for large codebases',
    'Create custom utility types for domain modeling',
  ],
  skills: [
    { name: 'TypeScript', category: 'Programming' },
    { name: 'Type Safety', category: 'Software Engineering' },
    { name: 'Generic Programming', category: 'Advanced Concepts' },
    { name: 'Design Patterns', category: 'Architecture' },
  ],
  assessmentBreakdown: [
    { tier: 1, count: 10, correct: 9 },
    { tier: 2, count: 8, correct: 7 },
    { tier: 3, count: 5, correct: 4 },
    { tier: 4, count: 3, correct: 2 },
  ],
  overallScore: 85,
  integrityScore: 92,
  difficultyLevel: 'Advanced',
  domain: 'Software Engineering',
};

export default function CertificateTest() {
  const navigate = useNavigate();
  const [certificateType, setCertificateType] = useState<CertificateType>('completion');
  const [refreshKey, setRefreshKey] = useState(0);

  // Generate fresh certificate on each refresh
  const certificate = createCertificate(MOCK_RECIPIENT, MOCK_CONTENT);

  // Generate standalone manifest for testing
  const standaloneManifest = generateCompetencyManifest({
    bookId: 'test-book-123',
    bookTitle: MOCK_CONTENT.bookTitle,
    bookType: MOCK_CONTENT.bookType,
    domain: MOCK_MANIFEST_DATA.domain,
    totalChapters: MOCK_CONTENT.totalChapters,
    completedChapters: MOCK_CONTENT.chaptersCompleted,
    learningObjectives: MOCK_MANIFEST_DATA.learningObjectives,
    skills: MOCK_MANIFEST_DATA.skills,
    assessmentResults: MOCK_MANIFEST_DATA.assessmentBreakdown.map(ab => ({
      tier: ab.tier as 1 | 2 | 3 | 4,
      questionCount: ab.count,
      correctCount: ab.correct,
    })),
    integrityScore: MOCK_MANIFEST_DATA.integrityScore / 100,
    integritySignals: ['No focus loss detected', 'Consistent timing patterns'],
    certificateType,
    certificateId: certificate.id,
  });

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50">
        <div className="container max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">Certificate Test Page</h1>
                <p className="text-sm text-muted-foreground">
                  Verify Emblem & Competency Manifest
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handleRefresh} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </Button>
          </div>
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Emblem Test Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🏛️ Certification Emblem Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              The Certification Emblem must appear on all certificates (CONTRACT 8A).
            </p>
            <div className="flex flex-wrap items-end gap-8 p-6 bg-muted/30 rounded-lg">
              <div className="text-center">
                <CertificationEmblem size="sm" />
                <p className="text-xs text-muted-foreground mt-2">Small</p>
              </div>
              <div className="text-center">
                <CertificationEmblem size="md" />
                <p className="text-xs text-muted-foreground mt-2">Medium</p>
              </div>
              <div className="text-center">
                <CertificationEmblem size="lg" />
                <p className="text-xs text-muted-foreground mt-2">Large</p>
              </div>
              <div className="text-center">
                <CertificationEmblem size="lg" showText />
                <p className="text-xs text-muted-foreground mt-2">With Text</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Certificate Type Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Certificate Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(['completion', 'mastery', 'publishing', 'authorship'] as CertificateType[]).map((type) => (
                <Button
                  key={type}
                  variant={certificateType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCertificateType(type)}
                  className="capitalize"
                >
                  {type}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Full Certificate Display */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Full Certificate Display</h2>
          <CertificateDisplay
            key={`cert-${refreshKey}-${certificateType}`}
            certificate={certificate}
            certificateType={certificateType}
            showManifest={true}
            manifestData={MOCK_MANIFEST_DATA}
            onDownload={() => alert('Download triggered!')}
          />
        </div>

        {/* Compact Certificate Display */}
        <Card>
          <CardHeader>
            <CardTitle>Compact Certificate View</CardTitle>
          </CardHeader>
          <CardContent>
            <CertificateDisplay
              key={`compact-${refreshKey}`}
              certificate={certificate}
              certificateType={certificateType}
              compact={true}
            />
          </CardContent>
        </Card>

        {/* Standalone Competency Manifest */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Full Competency Manifest</h2>
          <CompetencyManifestDisplay
            key={`manifest-${refreshKey}`}
            manifest={standaloneManifest}
            showExportOption={true}
          />
        </div>

        {/* Compact Manifest */}
        <Card>
          <CardHeader>
            <CardTitle>Compact Manifest View</CardTitle>
          </CardHeader>
          <CardContent>
            <CompetencyManifestDisplay
              key={`manifest-compact-${refreshKey}`}
              manifest={standaloneManifest}
              compact={true}
            />
          </CardContent>
        </Card>

        {/* Verification Info */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="text-center text-sm text-muted-foreground">
              <p className="font-medium mb-2">Test Certificate Data</p>
              <p>Certificate ID: {certificate.id}</p>
              <p>Verification Hash: {certificate.verificationHash}</p>
              <p>SPC: {certificate.scrollPublishingCode}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
