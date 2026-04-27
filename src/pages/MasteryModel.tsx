/**
 * Mastery Model Whitepaper — /docs/mastery-model
 * 
 * Publishable academic architecture documentation.
 */

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Brain, Shield, Code2, TrendingUp, Lock, 
  AlertTriangle, Award, FileText 
} from "lucide-react";
import { MASTERY_THRESHOLDS, ANTI_GAMING, BLOOM_WEIGHTS, BLOOM_DISTRIBUTION_REQUIREMENTS, INSTITUTIONAL_MODE } from "@/lib/masteryEngine";

import { SEO } from "@/components/SEO";
export default function MasteryModel() {
  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Mastery Model Whitepaper | ScrollLibrary"
        description="The cognitive science behind ScrollLibrary's 5-layer Cognitive Assimilation System and adaptive remediation engine."
        canonical="/docs/mastery-model"
      />
      <Navbar />
      <main className="flex-1 pt-24 pb-16 container mx-auto px-4 max-w-4xl">
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <Badge variant="outline" className="gap-1">
              <FileText className="h-3 w-3" />
              Academic Architecture Document
            </Badge>
            <h1 className="text-4xl font-display font-bold">
              Mastery-Certified Learning Architecture v2.0
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A formally defensible, Bloom-weighted competency validation system
              with typed-only coding integrity and cryptographic mastery records.
            </p>
          </div>

          <Separator />

          {/* Section 1: Bloom-Weighted Scoring */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                1. Bloom-Weighted Competency Scoring
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Assessment scores are weighted according to Bloom's Taxonomy cognitive levels,
                ensuring higher-order thinking contributes proportionally more to mastery classification.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(BLOOM_WEIGHTS).map(([level, weight]) => (
                  <div key={level} className="p-3 rounded-lg bg-muted/50 border border-border/50">
                    <p className="font-medium capitalize text-sm">{level}</p>
                    <p className="text-2xl font-bold text-primary">{Math.round(weight * 100)}%</p>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                <p className="font-medium mb-1">Distribution Requirements for Quiz Generation:</p>
                <ul className="space-y-1">
                  <li>• Remember/Understand: ≤25% each</li>
                  <li>• Apply/Analyze: ≥20% each</li>
                  <li>• Evaluate/Create: ≥5% each</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Certification Gate */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                2. Hard Certification Gate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Certification requires ALL of the following:</p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <Badge variant="outline">Gate 1</Badge> Overall score ≥ {MASTERY_THRESHOLDS.MIN_OVERALL}%
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="outline">Gate 2</Badge> Apply + Analyze average ≥ {MASTERY_THRESHOLDS.MIN_APPLY_ANALYZE}%
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="outline">Gate 3</Badge> At least 1 successful Evaluate-level attempt
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="outline">Gate 4</Badge> No declining performance trend
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="outline">Gate 5</Badge> ≥2 attempts (unless first-attempt mastery ≥ {MASTERY_THRESHOLDS.MASTERY_MIN}%)
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="outline">Gate 6</Badge> ≥{MASTERY_THRESHOLDS.MIN_BLOOM_LEVELS} Bloom levels assessed
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="outline">Gate 7</Badge> No suspicious input flags
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="outline">Gate 8</Badge> Score volatility within threshold
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="outline">Gate 9</Badge> Coding pass rate ≥ {MASTERY_THRESHOLDS.MIN_CODING_PASS_RATE}% (if applicable)
                </li>
              </ul>
              <p className="font-medium text-foreground pt-2">No override. No bypass.</p>
            </CardContent>
          </Card>

          {/* Section 3: Anti-Gaming */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                3. Anti-Gaming Enforcement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <ul className="space-y-2">
                <li>• Minimum {ANTI_GAMING.MIN_TIME_PER_ATTEMPT}s per attempt ({INSTITUTIONAL_MODE.MIN_TIME_PER_ATTEMPT}s in institutional mode)</li>
                <li>• Maximum {ANTI_GAMING.MAX_RETAKES_PER_DAY} retakes/day ({INSTITUTIONAL_MODE.MAX_RETAKES_PER_DAY} in institutional mode)</li>
                <li>• Difficulty escalation after {ANTI_GAMING.ESCALATION_AFTER_ATTEMPTS} attempts</li>
                <li>• Minimum {ANTI_GAMING.MIN_QUESTIONS} questions per attempt</li>
                <li>• Suspicious typing burst detection (≥{ANTI_GAMING.SUSPICIOUS_TYPING_CHARS} chars in &lt;{ANTI_GAMING.SUSPICIOUS_TYPING_MS}ms)</li>
                <li>• Score volatility anomaly detection (σ &gt; {ANTI_GAMING.VOLATILITY_THRESHOLD})</li>
                <li>• Daily mastery variance monitoring</li>
              </ul>
            </CardContent>
          </Card>

          {/* Section 4: Typed-Only Coding */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-primary" />
                4. Typed-Only Coding Integrity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>All coding exercises enforce typed-only input:</p>
              <ul className="space-y-1">
                <li>• Paste events blocked (onPaste preventDefault)</li>
                <li>• Drag-and-drop disabled</li>
                <li>• Copy/Cut disabled within editor</li>
                <li>• Autocomplete disabled</li>
                <li>• Typing burst detection (≥30 chars in &lt;200ms → flagged)</li>
                <li>• Flagged attempts excluded from certification</li>
              </ul>
            </CardContent>
          </Card>

          {/* Section 5: Adaptive Difficulty */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                5. Adaptive Difficulty Logic
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Difficulty adjusts based on rolling performance:</p>
              <ul className="space-y-1">
                <li>• Score ≥ 80% (last 3 attempts) → Increase difficulty (+1)</li>
                <li>• Score &lt; 50% (last 3 attempts) → Decrease difficulty (-1)</li>
                <li>• After {ANTI_GAMING.ESCALATION_AFTER_ATTEMPTS} attempts → Force difficulty escalation</li>
                <li>• Range: 1 (introductory) to 6 (professional mastery)</li>
              </ul>
            </CardContent>
          </Card>

          {/* Section 6: Cryptographic Record */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                6. Cryptographic Mastery Record
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Each mastery certificate includes a SHA-256 hash computed from:</p>
              <ul className="space-y-1">
                <li>• User ID</li>
                <li>• Book ID</li>
                <li>• Final mastery score</li>
                <li>• Bloom distribution snapshot</li>
                <li>• Attempt count</li>
                <li>• Coding pass rate</li>
                <li>• Issuance timestamp</li>
              </ul>
              <p>This prevents replay fraud and ensures each credential is unique and verifiable.</p>
            </CardContent>
          </Card>

          {/* Section 7: Limitations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                7. Limitations & Non-Accreditation Boundary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <ul className="space-y-2">
                <li>• This system does not constitute accredited academic credit</li>
                <li>• It does not replace institutional assessment or proctored examination</li>
                <li>• Coding execution is string-matching based, not sandboxed runtime</li>
                <li>• Anti-gaming measures reduce but do not eliminate all cheating vectors</li>
                <li>• AI-generated questions may contain inaccuracies</li>
                <li>• The system is designed for self-directed mastery validation, not formal credentialing</li>
              </ul>
              <p className="font-medium text-foreground pt-2">
                ScrollLibrary produces Cryptographically Verified Learning Records — not diplomas, not degrees, not professional certifications.
              </p>
            </CardContent>
          </Card>

          {/* Footer */}
          <p className="text-xs text-muted-foreground text-center pb-8">
            Mastery-Certified Learning Architecture v2.0 — ScrollLibrary
            <br />
            This document describes the technical architecture and is not a claim of institutional endorsement.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
