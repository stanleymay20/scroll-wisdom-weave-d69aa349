import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileText, Download, ExternalLink, Shield, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

import { SEO } from "@/components/SEO";
const WHITEPAPER_VERSION = "2.0";
const PUBLICATION_DATE = "February 2026";

export default function TrustWhitepaper() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Trust Whitepaper | ScrollLibrary"
        description="How ScrollLibrary delivers verifiable, anti-gaming AI learning. Architecture, integrity controls, and audit standards behind every certificate."
        canonical="/docs/trust-whitepaper"
      />
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 pt-24 max-w-4xl print:pt-0 print:max-w-none">
        {/* Header */}
        <div className="text-center mb-12 print:mb-8">
          <Badge variant="outline" className="mb-4">
            Version {WHITEPAPER_VERSION} • {PUBLICATION_DATE}
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 print:text-3xl">
            ScrollLibrary Trust Whitepaper
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            A Credential Authority for the Post-AI Era
          </p>
          
          <div className="flex justify-center gap-4 mt-6 print:hidden">
            <Button onClick={handlePrint} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
            <Button asChild variant="ghost">
              <a href="/docs/verification">
                <ExternalLink className="h-4 w-4 mr-2" />
                API Documentation
              </a>
            </Button>
          </div>
        </div>

        {/* Table of Contents */}
        <Card className="mb-8 print:hidden">
          <CardContent className="p-6">
            <h2 className="font-semibold mb-4">Contents</h2>
            <nav className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <a href="#executive-summary" className="text-muted-foreground hover:text-foreground">1. Executive Summary</a>
              <a href="#problem-statement" className="text-muted-foreground hover:text-foreground">2. Problem Statement</a>
              <a href="#certification-model" className="text-muted-foreground hover:text-foreground">3. Certification Model</a>
              <a href="#integrity-framework" className="text-muted-foreground hover:text-foreground">4. Integrity Framework</a>
              <a href="#certificate-lifecycle" className="text-muted-foreground hover:text-foreground">5. Certificate Lifecycle</a>
              <a href="#verification-guarantees" className="text-muted-foreground hover:text-foreground">6. Verification Guarantees</a>
              <a href="#api-trust-contract" className="text-muted-foreground hover:text-foreground">7. API Trust Contract</a>
              <a href="#governance" className="text-muted-foreground hover:text-foreground">8. Governance & Authority</a>
              <a href="#compliance" className="text-muted-foreground hover:text-foreground">9. Compliance Posture</a>
              <a href="#non-claims" className="text-muted-foreground hover:text-foreground">10. What We Do NOT Claim</a>
              <a href="#methodology" className="text-muted-foreground hover:text-foreground">11. Generation Methodology</a>
              <a href="#roadmap" className="text-muted-foreground hover:text-foreground">12. Roadmap</a>
            </nav>
          </CardContent>
        </Card>

        {/* Content Sections */}
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          
          {/* Executive Summary */}
          <section id="executive-summary" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">1.</span> Executive Summary
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              The proliferation of AI-assisted learning has created a credential crisis. Traditional certificates 
              verify completion, not comprehension. ScrollLibrary addresses this by implementing a behavioral 
              integrity framework that measures genuine engagement rather than attempting to detect AI usage.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              This whitepaper defines ScrollLibrary's credential authority architecture, establishing the platform 
              as infrastructure for verifiable learning outcomes—not merely another online course provider.
            </p>
            
            <Card className="mt-6 border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <p className="text-sm font-medium">
                  Core Principle: "We would rather invalidate than lie."
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Certificates without integrity data are explicitly non-verifiable. This is a feature, not a limitation.
                </p>
              </CardContent>
            </Card>
          </section>

          <Separator className="my-8" />

          {/* Problem Statement */}
          <section id="problem-statement" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">2.</span> Problem Statement
            </h2>
            
            <h3 className="text-lg font-semibold mt-6 mb-3">2.1 AI-Assisted Cheating</h3>
            <p className="text-muted-foreground leading-relaxed">
              Generative AI has made traditional assessment methods obsolete. Any text-based evaluation can be 
              completed by AI systems, rendering completion certificates meaningless as indicators of actual learning.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-3">2.2 Unverifiable Online Learning</h3>
            <p className="text-muted-foreground leading-relaxed">
              Most online learning platforms issue certificates that cannot be independently verified. Employers 
              must trust the learner's claim, creating an information asymmetry that devalues all online credentials.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-3">2.3 Credential Inflation</h3>
            <p className="text-muted-foreground leading-relaxed">
              The ease of obtaining online certificates has led to credential inflation, where certificates 
              carry diminishing signal value. Institutions require increasingly elaborate verification processes.
            </p>
          </section>

          <Separator className="my-8" />

          {/* Certification Model */}
          <section id="certification-model" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">3.</span> ScrollLibrary Certification Model
            </h2>
            
            <h3 className="text-lg font-semibold mt-6 mb-3">3.1 Issuance Authority</h3>
            <p className="text-muted-foreground leading-relaxed">
              All certificates are issued exclusively by the ScrollLibrary Certification Authority. The authority 
              operates independently from the learning platform, ensuring separation between content delivery 
              and credential issuance.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-3">3.2 Three-Party Model</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="font-semibold mb-2">Learner</div>
                  <p className="text-xs text-muted-foreground">
                    Completes content and assessments. Cannot self-certify.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="font-semibold mb-2">Issuer</div>
                  <p className="text-xs text-muted-foreground">
                    ScrollLibrary Certification Authority. Issues based on integrity data.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="font-semibold mb-2">Verifier</div>
                  <p className="text-xs text-muted-foreground">
                    Employers, institutions. Can verify without contacting issuer.
                  </p>
                </CardContent>
              </Card>
            </div>

            <h3 className="text-lg font-semibold mt-6 mb-3">3.3 Anti-Gaming Guarantees</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Learners cannot issue certificates to themselves</li>
              <li>Certificate content is frozen at issuance time</li>
              <li>Verification does not require learner cooperation</li>
              <li>Revocation is permanent and publicly visible</li>
            </ul>
          </section>

          <Separator className="my-8" />

          {/* Integrity Framework */}
          <section id="integrity-framework" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">4.</span> Integrity Framework (Contract 6)
            </h2>
            
            <p className="text-muted-foreground leading-relaxed">
              ScrollLibrary's integrity framework does not attempt to detect AI usage. Instead, it measures 
              behavioral signals that indicate genuine engagement with learning material.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-3">4.1 Behavioral Integrity Scoring</h3>
            <p className="text-muted-foreground leading-relaxed">
              The system monitors four behavioral dimensions during assessments:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-3">
              <li><strong>Typing Pattern Analysis:</strong> Variance in keystroke timing indicates human input</li>
              <li><strong>Paste Detection:</strong> Frequency of paste operations relative to typed content</li>
              <li><strong>Focus Monitoring:</strong> Tab switches and window focus changes during assessments</li>
              <li><strong>Timing Analysis:</strong> Response time patterns compared to content complexity</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">4.2 Integrity Classifications</h3>
            <div className="space-y-3 mt-4">
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-green-500/5 border-green-500/20">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <div className="font-semibold text-green-700 dark:text-green-400">Trusted (≥0.8)</div>
                  <p className="text-sm text-muted-foreground">
                    High confidence in genuine engagement. Eligible for all certificate types.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-yellow-500/5 border-yellow-500/20">
                <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div>
                  <div className="font-semibold text-yellow-700 dark:text-yellow-400">Review (0.5-0.79)</div>
                  <p className="text-sm text-muted-foreground">
                    Moderate confidence. Eligible for completion certificates only.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-red-500/5 border-red-500/20">
                <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                <div>
                  <div className="font-semibold text-red-700 dark:text-red-400">Flagged (&lt;0.5)</div>
                  <p className="text-sm text-muted-foreground">
                    Low confidence. Not eligible for certification.
                  </p>
                </div>
              </div>
            </div>

            <h3 className="text-lg font-semibold mt-6 mb-3">4.3 Missing Data Policy</h3>
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-4">
                <p className="text-sm">
                  Certificates without integrity data are explicitly marked as non-verifiable. The system does 
                  not infer or impute missing integrity scores. This protects the authority's credibility by 
                  ensuring only measurable outcomes are certified.
                </p>
              </CardContent>
            </Card>
          </section>

          <Separator className="my-8" />

          {/* Certificate Lifecycle */}
          <section id="certificate-lifecycle" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">5.</span> Certificate Lifecycle (Contract 7)
            </h2>
            
            <h3 className="text-lg font-semibold mt-6 mb-3">5.1 Issuance</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Certificates are issued only after eligibility requirements are met</li>
              <li>Each certificate receives a unique, sequential identifier</li>
              <li>Issuance timestamp and schema version are permanently recorded</li>
              <li>Content is frozen—subsequent book modifications do not affect the certificate</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">5.2 Verification</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Public verification via canonical URL: <code>/certificate/[number]</code></li>
              <li>Batch verification API for institutional use</li>
              <li>No authentication required for verification</li>
              <li>Real-time status: valid, revoked, or not found</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">5.3 Export Formats</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>JSON:</strong> Machine-readable, ATS/HR system compatible</li>
              <li><strong>PDF:</strong> Human-readable, archival-grade</li>
              <li><strong>Canonical URL:</strong> Single source of truth</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">5.4 Revocation</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Revocation is permanent and irreversible</li>
              <li>Revocation reason is recorded and visible</li>
              <li>Revoked certificates remain in the system with clear status</li>
              <li>Export of revoked certificates shows revocation status</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">5.5 Schema Versioning</h3>
            <p className="text-muted-foreground leading-relaxed">
              Each certificate includes a schema version identifier. This ensures that verification semantics 
              remain stable over time—old certificates can be verified according to the rules that existed 
              at issuance, even as the system evolves.
            </p>
          </section>

          <Separator className="my-8" />

          {/* Verification Guarantees */}
          <section id="verification-guarantees" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">6.</span> Verification Guarantees
            </h2>
            
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2">Immutable Issuance</div>
                  <p className="text-sm text-muted-foreground">
                    Once issued, certificate content cannot be modified. The issuer signature, 
                    recipient information, and integrity data are permanently fixed.
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2">Data Integrity</div>
                  <p className="text-sm text-muted-foreground">
                    Verification recalculates integrity classifications from source data. 
                    Exported values match database records exactly.
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2">Revocation Transparency</div>
                  <p className="text-sm text-muted-foreground">
                    Revoked certificates are clearly marked. Verifiers always see current status, 
                    not cached or stale information.
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2">Schema Versioning</div>
                  <p className="text-sm text-muted-foreground">
                    Certificates issued under different schema versions remain verifiable. 
                    Version information is included in all exports.
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2">Public Access</div>
                  <p className="text-sm text-muted-foreground">
                    Verification requires no account, login, or authentication. 
                    Anyone can verify any certificate using only the certificate number.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          <Separator className="my-8" />

          {/* API Trust Contract */}
          <section id="api-trust-contract" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">7.</span> API Trust Contract
            </h2>
            
            <h3 className="text-lg font-semibold mt-6 mb-3">7.1 What the API Guarantees</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Verification responses reflect current database state</li>
              <li>Integrity scores are calculated, not cached</li>
              <li>Response format is stable within schema versions</li>
              <li>Error responses are explicit and actionable</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">7.2 What the API Does NOT Guarantee</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Identity verification of the certificate holder</li>
              <li>Correlation with external identity systems</li>
              <li>Historical verification status (only current state)</li>
              <li>Uptime SLAs (best-effort availability)</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">7.3 Rate Limits & Abuse Resistance</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Batch verification: maximum 100 certificates per request</li>
              <li>Rate limiting applied per IP address</li>
              <li>Enumeration attacks are logged and may result in blocking</li>
            </ul>
          </section>

          <Separator className="my-8" />

          {/* Governance */}
          <section id="governance" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">8.</span> Governance & Authority
            </h2>
            
            <h3 className="text-lg font-semibold mt-6 mb-3">8.1 Certification Authority</h3>
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="h-8 w-8 text-primary" />
                  <div>
                    <div className="font-bold text-lg">ScrollLibrary Certification Authority</div>
                    <div className="text-sm text-muted-foreground">Sole issuer of ScrollLibrary credentials</div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  The authority identity is embedded in every certificate. Signature assets are 
                  immutable and cannot be reproduced by certificate holders.
                </p>
              </CardContent>
            </Card>

            <h3 className="text-lg font-semibold mt-6 mb-3">8.2 Signatory Model</h3>
            <p className="text-muted-foreground leading-relaxed">
              Currently, all certificates are signed by the founding authority. The system is 
              designed to support multi-signer configurations for future institutional partnerships.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-3">8.3 Authority Rotation</h3>
            <p className="text-muted-foreground leading-relaxed">
              The architecture supports authority rotation without invalidating existing certificates. 
              New authorities can be added; existing certificates remain valid under their original issuer.
            </p>
          </section>

          <Separator className="my-8" />

          {/* Compliance */}
          <section id="compliance" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">9.</span> Compliance Posture
            </h2>
            
            <h3 className="text-lg font-semibold mt-6 mb-3">9.1 GDPR Alignment</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Minimal PII in certificate records</li>
              <li>Verification does not expose learner email addresses</li>
              <li>Data export available upon request</li>
              <li>Right to erasure supported (certificate revocation)</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">9.2 Verifier Privacy</h3>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Verification requests are not logged with identifiable verifier information</li>
              <li>Batch verification does not require account creation</li>
              <li>No tracking cookies on verification pages</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">9.3 Data Residency</h3>
            <p className="text-muted-foreground leading-relaxed">
              Certificate data is stored in compliance with applicable data residency requirements. 
              Specific deployment configurations available for enterprise customers.
            </p>
          </section>

          <Separator className="my-8" />

          {/* What ScrollLibrary Does NOT Claim */}
          <section id="non-claims" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">10.</span> What ScrollLibrary Does NOT Claim
            </h2>
            
            <p className="text-muted-foreground leading-relaxed mb-6">
              Institutional trust requires explicit boundary-setting. ScrollLibrary makes the following 
              non-claims to prevent misrepresentation and maintain credibility.
            </p>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-destructive/5 border-destructive/20">
                <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong>NOT an accredited institution.</strong> ScrollLibrary does not grant academic degrees, 
                  professional certifications, or credentials recognized by any national accreditation body.
                </p>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-destructive/5 border-destructive/20">
                <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong>NOT peer-reviewed publishing.</strong> AI-generated content is not peer-reviewed. 
                  References are CrossRef-validated for metadata existence, not for semantic support of specific claims.
                </p>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-destructive/5 border-destructive/20">
                <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong>NOT a replacement for formal education.</strong> Learning records document structured 
                  engagement with AI-synthesized material. They complement, not substitute, university coursework.
                </p>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-destructive/5 border-destructive/20">
                <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong>NOT AI-detection-proof.</strong> While the writing engine applies variability patterns, 
                  we do not guarantee content will pass AI detection tools. Users must verify independently.
                </p>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-destructive/5 border-destructive/20">
                <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong>NOT citation-verified for semantic accuracy.</strong> DOI validation confirms source 
                  existence, not that the cited work supports the specific claim made. Users must verify all 
                  citations before use in formal academic work.
                </p>
              </div>
            </div>
          </section>

          <Separator className="my-8" />

          {/* Methodology */}
          <section id="methodology" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">11.</span> Generation Methodology
            </h2>
            
            <h3 className="text-lg font-semibold mt-6 mb-3">11.1 Content Generation Pipeline</h3>
            <p className="text-muted-foreground leading-relaxed">
              Academic content is generated through a governed pipeline with the following stages:
            </p>
            <ul className="list-decimal pl-6 space-y-2 text-muted-foreground mt-3">
              <li><strong>Book Type Router:</strong> Immutably assigns generator identity (academic, technical, professional, bestseller)</li>
              <li><strong>Discipline Detection:</strong> Adjusts vocabulary, evidence hierarchy, and rhetorical conventions to the field</li>
              <li><strong>Argument Architecture Enforcement:</strong> Requires thesis tension, literature disagreement, counterarguments, and methodological critique</li>
              <li><strong>Citation Rhythm Variation:</strong> Enforces natural density patterns (dense in empirical sections, sparse in interpretive)</li>
              <li><strong>AI-Detectability Suppression:</strong> Applies sentence length variation, clause complexity alternation, and formulaic pattern prohibition</li>
              <li><strong>Reference Integrity Pipeline:</strong> Filters fabricated/placeholder sources before insertion</li>
              <li><strong>Chief Editor Audit:</strong> Deterministic penalty engine + AI evaluation against textbook benchmarks</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">11.2 Validation Logic</h3>
            <p className="text-muted-foreground leading-relaxed">
              Every generated chapter undergoes a two-phase validation:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-3">
              <li><strong>Phase 1 — Deterministic Penalties:</strong> Regex-based checks for word count, heading density, example count, definition presence, and engagement signals. Violations proportionally cap dimension scores.</li>
              <li><strong>Phase 2 — AI Evaluation:</strong> An independent AI auditor (temperature: 0.1 for reproducibility) scores Structural Integrity (30%), Academic Rigor (35%), and Pedagogical Quality (35%) against a contrastive benchmark of what a well-written textbook chapter looks like.</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">11.3 Failure Conditions</h3>
            <p className="text-muted-foreground leading-relaxed">
              Content is blocked from certification if:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-3">
              <li>Structural score &lt; 75</li>
              <li>Academic score &lt; 80</li>
              <li>Pedagogical score &lt; 75</li>
              <li>Overall weighted score &lt; 78</li>
              <li>DOI verification failures exceed threshold</li>
              <li>Suspicious reference rate ≥ 5%</li>
              <li>Claim-level support score &lt; 60</li>
            </ul>
          </section>

          <Separator className="my-8" />

          {/* Roadmap */}
          <section id="roadmap" className="mb-12">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="text-muted-foreground">12.</span> Roadmap (Non-binding)
            </h2>
            
            <p className="text-muted-foreground leading-relaxed mb-6">
              The following capabilities are under consideration. This roadmap is non-binding and 
              subject to change based on institutional adoption and technical feasibility.
            </p>

            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2">Faculty Pilot Mode</div>
                  <p className="text-sm text-muted-foreground">
                    Free access for faculty evaluation with co-branded certificates, data export, 
                    and semester-based usage reports.
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2">Institutional Co-signing</div>
                  <p className="text-sm text-muted-foreground">
                    Partner institutions can co-sign certificates, adding their authority 
                    alongside ScrollLibrary's. Useful for university partnerships.
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2">Federation & Interoperability</div>
                  <p className="text-sm text-muted-foreground">
                    Interoperability with external credential systems (Open Badges, Verifiable Credentials, LTI 1.3).
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2">Retraction Check Layer</div>
                  <p className="text-sm text-muted-foreground">
                    Integration with Retraction Watch database to flag cited sources that have been 
                    retracted post-publication. Currently a placeholder—retraction status is marked as unknown.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2">External Audits</div>
                  <p className="text-sm text-muted-foreground">
                    Third-party audits of the integrity framework and issuance processes.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Citation */}
          <Separator className="my-8" />
          
          <section className="mb-12">
            <h2 className="text-lg font-bold mb-4">Citation</h2>
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <p className="text-sm font-mono">
                  ScrollLibrary Certification Authority. (2026). <em>ScrollLibrary Trust Whitepaper: 
                  A Credential Authority for the Post-AI Era</em> (Version 1.0). 
                  https://scroll-wisdom-weave.lovable.app/docs/trust-whitepaper
                </p>
              </CardContent>
            </Card>
          </section>

        </article>
      </main>

      <Footer />
    </div>
  );
}
