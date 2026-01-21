/**
 * COMPETENCY MANIFEST DISPLAY COMPONENT
 * Shows employer-grade learning evidence on certificates
 */

import { useMemo } from 'react';
import { Award, BookOpen, Brain, CheckCircle, Shield, TrendingUp, Target, FileCheck, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CompetencyManifest,
  ManifestSummary,
  generateManifestSummary,
  formatManifestForExport
} from '@/lib/competencyManifest';

interface CompetencyManifestDisplayProps {
  manifest: CompetencyManifest;
  showExportOption?: boolean;
  compact?: boolean;
}

export function CompetencyManifestDisplay({
  manifest,
  showExportOption = false,
  compact = false
}: CompetencyManifestDisplayProps) {
  const summary = useMemo(() => generateManifestSummary(manifest), [manifest]);
  
  const getIntegrityColor = (classification: string) => {
    switch (classification) {
      case 'trusted': return 'text-green-600 bg-green-500/10 border-green-500/20';
      case 'review': return 'text-amber-600 bg-amber-500/10 border-amber-500/20';
      case 'flagged': return 'text-red-600 bg-red-500/10 border-red-500/20';
      default: return 'text-muted-foreground bg-muted border-border';
    }
  };

  const getRigorColor = (level: string) => {
    switch (level) {
      case 'comprehensive': return 'text-purple-600 bg-purple-500/10';
      case 'rigorous': return 'text-blue-600 bg-blue-500/10';
      case 'standard': return 'text-green-600 bg-green-500/10';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const handleExportJSON = () => {
    const exportData = formatManifestForExport(manifest);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `competency-manifest-${manifest.certificateId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (compact) {
    return (
      <Card className="border border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <FileCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Competency Manifest</p>
                <p className="text-xs text-muted-foreground">
                  {manifest.skillsCovered.length} skills • {summary.rigorLevel} rigor
                </p>
              </div>
            </div>
            <Badge className={getRigorColor(summary.rigorLevel)}>
              {summary.rigorLevel.toUpperCase()}
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileCheck className="h-5 w-5 text-primary" />
            Competency Manifest
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Schema {manifest.schemaVersion}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Employer-grade learning evidence for verification
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summary.keyStats.map((stat, idx) => (
            <div key={idx} className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold text-primary">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        <Separator />

        {/* Learning Objectives */}
        <div>
          <h4 className="font-medium flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-primary" />
            Learning Objectives ({manifest.objectivesAchieved}/{manifest.objectivesTotal})
          </h4>
          <div className="space-y-2">
            {manifest.learningObjectives.slice(0, 5).map((obj) => (
              <div key={obj.id} className="flex items-start gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>{obj.description}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="text-xs ml-auto">
                        {obj.bloomLevel}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Bloom's Taxonomy Level: {obj.bloomLevel}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ))}
            {manifest.learningObjectives.length > 5 && (
              <p className="text-xs text-muted-foreground">
                +{manifest.learningObjectives.length - 5} more objectives
              </p>
            )}
          </div>
        </div>

        <Separator />

        {/* Skills Covered */}
        <div>
          <h4 className="font-medium flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-primary" />
            Skills Demonstrated
          </h4>
          <div className="flex flex-wrap gap-2">
            {manifest.primarySkills.map((skill, idx) => (
              <Badge key={idx} className="bg-primary/10 text-primary">
                {skill}
              </Badge>
            ))}
            {manifest.secondarySkills.map((skill, idx) => (
              <Badge key={idx} variant="outline">
                {skill}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        {/* Assessment Rigor */}
        <div>
          <h4 className="font-medium flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-primary" />
            Assessment Rigor Breakdown
          </h4>
          <div className="space-y-3">
            {manifest.assessmentBreakdown.map((tier) => (
              <div key={tier.tier} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      tier.passed ? 'bg-green-500' : 'bg-muted-foreground'
                    }`} />
                    Tier {tier.tier}: {tier.tierName}
                  </span>
                  <span className="text-muted-foreground">
                    {tier.questionCount} questions • {tier.scorePercentage.toFixed(0)}%
                  </span>
                </div>
                <Progress value={tier.scorePercentage} className="h-1.5" />
              </div>
            ))}
          </div>
          
          {/* Tier Flags */}
          <div className="flex gap-2 mt-3">
            {manifest.hasTier2Questions && (
              <Badge className="bg-blue-500/10 text-blue-600 text-xs">
                ✓ Applied Reasoning
              </Badge>
            )}
            {manifest.hasTier3Questions && (
              <Badge className="bg-purple-500/10 text-purple-600 text-xs">
                ✓ Scenario/Debugging
              </Badge>
            )}
            {manifest.hasTier4Questions && (
              <Badge className="bg-amber-500/10 text-amber-600 text-xs">
                ✓ Integrity-Weighted
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Integrity Classification */}
        <div className="p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Integrity Verification</p>
                <p className="text-xs text-muted-foreground">
                  Score: {(manifest.integrity.score * 100).toFixed(0)}%
                </p>
              </div>
            </div>
            <Badge className={getIntegrityColor(manifest.integrity.classification)}>
              {manifest.integrity.classification.toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Employer Recommendation */}
        <div className="p-4 rounded-lg bg-muted/50">
          <h4 className="font-medium flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Employer Recommendation
          </h4>
          <p className="text-sm text-muted-foreground">
            {summary.employerRecommendation}
          </p>
        </div>

        {/* Export Option */}
        {showExportOption && (
          <button
            onClick={handleExportJSON}
            className="w-full py-2 px-4 text-sm border rounded-lg hover:bg-muted transition-colors flex items-center justify-center gap-2"
          >
            <FileCheck className="h-4 w-4" />
            Export Manifest as JSON
          </button>
        )}

        {/* Footer */}
        <div className="text-center pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Issued by {manifest.issuedBy} • Verification Hash: {manifest.verificationHash.slice(0, 8)}...
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Re-export for convenience
export type { CompetencyManifest } from '@/lib/competencyManifest';
