import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  BookOpen, 
  Users, 
  Lock,
  FileCheck,
  AlertTriangle,
  GraduationCap,
  Building2,
  Scale,
  Printer
} from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const handlePrint = () => {
  window.print();
};

export default function InstitutionalReadiness() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <Badge variant="outline" className="mb-4">
            <Building2 className="h-3 w-3 mr-1" />
            For Faculty & Administrators
          </Badge>
          <h1 className="text-4xl font-display font-bold text-foreground mb-4">
            Institutional Readiness
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-6">
            A clear explanation of what ScrollLibrary is, what it is not, 
            and how it complements existing academic infrastructure.
          </p>
          <Button variant="outline" onClick={handlePrint} className="print:hidden">
            <Printer className="h-4 w-4 mr-2" />
            Download as PDF
          </Button>
        </motion.div>

        {/* What ScrollLibrary Is */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-12"
        >
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <CheckCircle className="h-5 w-5" />
                What ScrollLibrary Is
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-foreground">
                ScrollLibrary is a <strong>supplementary learning platform</strong> that generates 
                educational content and certifies learning outcomes through verified assessments.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <BookOpen className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Self-paced learning resource</strong> — Students access AI-generated educational materials across academic disciplines</span>
                </li>
                <li className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Behavioral integrity tracking</strong> — Assessments include focus monitoring and timing analysis (no invasive proctoring)</span>
                </li>
                <li className="flex items-start gap-3">
                  <FileCheck className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Verifiable certificates</strong> — Credentials are cryptographically bound to specific content and publicly verifiable</span>
                </li>
                <li className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span><strong>Immutable governance</strong> — Certification rules are frozen and cannot be retroactively changed</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </motion.section>

        {/* What ScrollLibrary Is NOT */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12"
        >
          <Card className="border-destructive/20 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" />
                What ScrollLibrary Is NOT
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-foreground">
                ScrollLibrary does not claim equivalence to formal academic credentials 
                and explicitly disclaims the following:
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <XCircle className="h-4 w-4 text-destructive mt-1 flex-shrink-0" />
                  <span><strong>Not a degree or credit provider</strong> — Certificates do not represent academic credits, degrees, or professional licensure</span>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="h-4 w-4 text-destructive mt-1 flex-shrink-0" />
                  <span><strong>Not an accreditation body</strong> — We do not claim equivalence to regional or professional accreditors</span>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="h-4 w-4 text-destructive mt-1 flex-shrink-0" />
                  <span><strong>Not a replacement for coursework</strong> — Designed to supplement, not substitute, formal instruction</span>
                </li>
                <li className="flex items-start gap-3">
                  <XCircle className="h-4 w-4 text-destructive mt-1 flex-shrink-0" />
                  <span><strong>Not an employment guarantee</strong> — Certificates attest to learning completion, not job readiness</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </motion.section>

        {/* Approved Use Cases */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Approved Use Cases
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                title: "Student Self-Study",
                description: "Students use ScrollLibrary independently to reinforce concepts taught in class"
              },
              {
                title: "Skill Building",
                description: "Learners develop competencies in areas outside their formal curriculum"
              },
              {
                title: "Research Preparation",
                description: "Graduate students explore foundational topics before diving into primary literature"
              },
              {
                title: "Professional Development",
                description: "Faculty and staff expand knowledge in adjacent disciplines"
              },
              {
                title: "Teaching Assistants",
                description: "TAs refresh subject matter before leading discussion sections"
              },
              {
                title: "Extracurricular Learning",
                description: "Student organizations use materials for workshops and study groups"
              }
            ].map((useCase, index) => (
              <Card key={index} className="bg-muted/30">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-foreground mb-1">{useCase.title}</h3>
                  <p className="text-sm text-muted-foreground">{useCase.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.section>

        {/* Integrity Framework */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Why Our Integrity Model Is Stronger Than Typical Tools
          </h2>
          <Card>
            <CardContent className="p-6 space-y-4">
              <p className="text-muted-foreground">
                Unlike simple quiz platforms, ScrollLibrary implements a multi-layer integrity framework:
              </p>
              <div className="grid gap-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <Badge variant="outline" className="mt-0.5">1</Badge>
                  <div>
                    <h4 className="font-medium text-foreground">Content Coverage Verification</h4>
                    <p className="text-sm text-muted-foreground">Minimum 80% of material must be accessed before certification eligibility</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <Badge variant="outline" className="mt-0.5">2</Badge>
                  <div>
                    <h4 className="font-medium text-foreground">Multi-Tier Assessments</h4>
                    <p className="text-sm text-muted-foreground">Questions span Bloom's taxonomy from recall to analysis (not just MCQs)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <Badge variant="outline" className="mt-0.5">3</Badge>
                  <div>
                    <h4 className="font-medium text-foreground">Behavioral Signal Analysis</h4>
                    <p className="text-sm text-muted-foreground">Focus patterns, timing variance, and paste detection without invasive proctoring</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <Badge variant="outline" className="mt-0.5">4</Badge>
                  <div>
                    <h4 className="font-medium text-foreground">Cryptographic Content Binding</h4>
                    <p className="text-sm text-muted-foreground">Certificates are SHA-256 bound to exact book version — any content change invalidates credentials</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Complements LMS */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            How It Complements (Not Competes With) Your LMS
          </h2>
          <Card className="bg-muted/30">
            <CardContent className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-foreground">Capability</th>
                      <th className="text-left py-3 px-4 font-medium text-foreground">Your LMS</th>
                      <th className="text-left py-3 px-4 font-medium text-foreground">ScrollLibrary</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-3 px-4">Course management</td>
                      <td className="py-3 px-4">✓ Primary</td>
                      <td className="py-3 px-4">✗ Not provided</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-3 px-4">Grading & transcripts</td>
                      <td className="py-3 px-4">✓ Official</td>
                      <td className="py-3 px-4">✗ Not provided</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-3 px-4">Self-paced content</td>
                      <td className="py-3 px-4">Limited</td>
                      <td className="py-3 px-4">✓ Extensive</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-3 px-4">Cross-disciplinary materials</td>
                      <td className="py-3 px-4">Course-bound</td>
                      <td className="py-3 px-4">✓ Open access</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4">Skill verification</td>
                      <td className="py-3 px-4">Per-course</td>
                      <td className="py-3 px-4">✓ Portable credentials</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                ScrollLibrary fills gaps in informal learning without threatening institutional authority over formal credentials.
              </p>
            </CardContent>
          </Card>
        </motion.section>

        {/* Risk Statement */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mb-12"
        >
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" />
                Clear Boundaries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground mb-4">
                To prevent misuse or misinterpretation, ScrollLibrary enforces the following governance rules:
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400">•</span>
                  Certificates explicitly state they are <em>"not equivalent to academic credit"</em>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400">•</span>
                  Verification pages include legal disclaimers visible to third parties
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400">•</span>
                  The AI does not claim to detect plagiarism or AI-generated content
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400">•</span>
                  No integration with official academic records or student information systems
                </li>
              </ul>
            </CardContent>
          </Card>
        </motion.section>

        {/* CTA */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="text-center"
        >
          <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
            <CardContent className="p-8">
              <Users className="h-10 w-10 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-bold text-foreground mb-2">
                Questions or Feedback?
              </h3>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                We welcome inquiries from faculty, administrators, and institutional technology offices. 
                Our goal is transparency, not disruption.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button asChild>
                  <Link to="/contact">Contact Us</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/docs/trust-whitepaper">Read Trust Whitepaper</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.section>
      </main>

      <Footer />
    </div>
  );
}
