import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  BookOpen, 
  Brain, 
  Award, 
  Shield, 
  CheckCircle, 
  ArrowRight,
  FileCheck,
  Eye,
  Lock,
  Users
} from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import { SEO } from "@/components/SEO";
export default function HowCertificationWorks() {
  const steps = [
    {
      step: 1,
      icon: BookOpen,
      title: "Complete the Learning Material",
      description: "Read through all chapters of the book. Our system tracks your reading progress and ensures you engage with at least 80% of the content before certification eligibility.",
      details: ["Chapter-by-chapter progress tracking", "Minimum 80% content coverage required", "Time-based engagement validation"]
    },
    {
      step: 2,
      icon: Brain,
      title: "Pass Knowledge Assessments",
      description: "Complete quizzes at the end of each chapter to demonstrate comprehension. Questions are designed to test understanding, not memorization.",
      details: ["Multi-tier cognitive assessments", "Minimum 70% aggregate score required", "Visual and code-based questions where applicable"]
    },
    {
      step: 3,
      icon: Shield,
      title: "Integrity Verification",
      description: "Our behavioral integrity system monitors for authentic learning patterns. This includes focus tracking, natural response timing, and paste detection.",
      details: ["Behavioral signal analysis", "Focus and attention monitoring", "No proctoring software required"]
    },
    {
      step: 4,
      icon: Award,
      title: "Certificate Issuance",
      description: "Upon meeting all requirements, a cryptographically signed certificate is issued. This certificate is permanently bound to the book content and your learning record.",
      details: ["SHA-256 content binding", "Immutable issuance record", "Publicly verifiable at any time"]
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="How ScrollLibrary Certification Works"
        description="Inside the 9-gate certification loop: Bloom-taxonomy assessments, anti-gaming integrity scoring, and SHA-256 cryptographic verification."
        canonical="/docs/how-certification-works"
      />
      <Navbar />
      
      <main className="container mx-auto px-4 py-16">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <Badge variant="outline" className="mb-4">
            <FileCheck className="h-3 w-3 mr-1" />
            Certification Process
          </Badge>
          <h1 className="text-4xl font-display font-bold text-foreground mb-4">
            How ScrollLibrary Certification Works
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            A transparent, verifiable process for certifying demonstrated learning outcomes
          </p>
        </motion.div>

        {/* Process Steps */}
        <div className="max-w-4xl mx-auto mb-16">
          <div className="space-y-8">
            {steps.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                  <CardHeader className="flex flex-row items-start gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-lg">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <item.icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-xl">{item.title}</CardTitle>
                      </div>
                      <p className="text-muted-foreground">{item.description}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="pl-20">
                    <ul className="space-y-2">
                      {item.details.map((detail, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* What Certificates Prove */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto mb-16"
        >
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
            What a ScrollLibrary Certificate Proves
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <CheckCircle className="h-5 w-5" />
                  What It Certifies
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>✓ The holder completed the specified learning material</p>
                <p>✓ The holder demonstrated comprehension via assessments</p>
                <p>✓ Learning was conducted with verified behavioral integrity</p>
                <p>✓ The certificate is cryptographically bound to specific content</p>
              </CardContent>
            </Card>

            <Card className="bg-destructive/5 border-destructive/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <Lock className="h-5 w-5" />
                  What It Does NOT Certify
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>✕ Professional licensure or accreditation</p>
                <p>✕ Academic degrees or university credits</p>
                <p>✕ Employment eligibility or job qualifications</p>
                <p>✕ Equivalence to formal education credentials</p>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* For Employers */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto mb-16"
        >
          <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
            <CardContent className="p-8">
              <div className="flex items-start gap-4">
                <Users className="h-8 w-8 text-primary flex-shrink-0" />
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-2">For Employers & Institutions</h3>
                  <p className="text-muted-foreground mb-4">
                    ScrollLibrary certificates can be instantly verified using our public verification API or web interface. 
                    Each certificate includes a unique verification hash and can be validated in under 5 seconds.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link to="/docs/verification">
                        <Eye className="h-4 w-4 mr-2" />
                        Verification API Docs
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/verify">
                        Verify a Certificate
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Trust Framework */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center"
        >
          <h2 className="text-2xl font-bold text-foreground mb-4">
            Built on a Transparent Trust Framework
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Our certification model is governed by a published contract stack (Contracts 6-12) that defines 
            exactly how certificates are issued, validated, and revoked. This framework is publicly documented 
            and frozen to prevent arbitrary changes.
          </p>
          <Button variant="outline" asChild>
            <Link to="/docs/trust-whitepaper">
              Read the Trust Whitepaper
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
