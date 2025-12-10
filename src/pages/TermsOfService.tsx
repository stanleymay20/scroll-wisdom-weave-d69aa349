import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { FileText, Scale, BookOpen, AlertTriangle, Copyright } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-center mb-12">
              <FileText className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h1 className="text-4xl font-display font-bold text-gradient-gold mb-4">
                Terms of Service
              </h1>
              <p className="text-muted-foreground">
                Last updated: December 10, 2024
              </p>
            </div>

            <div className="prose prose-invert max-w-none space-y-8">
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  1. Acceptance of Terms
                </h2>
                <p className="text-muted-foreground">
                  By accessing or using ScrollLibrary™, you agree to be bound by these Terms of Service. 
                  If you do not agree, do not use our services. We reserve the right to modify these terms 
                  at any time, with notice provided through the platform.
                </p>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <BookOpen className="h-6 w-6 text-primary" />
                  2. Service Description
                </h2>
                <p className="text-muted-foreground mb-4">
                  ScrollLibrary™ is an AI-powered content generation platform that allows users to:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Generate books, courses, and educational content using AI</li>
                  <li>Export content in multiple publishing formats</li>
                  <li>Access a library of AI-generated educational materials</li>
                  <li>Customize AI generation preferences and settings</li>
                </ul>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Copyright className="h-6 w-6 text-primary" />
                  3. Intellectual Property & Ownership
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p><strong className="text-foreground">Your Content:</strong> You retain ownership of all content you create using ScrollLibrary. This includes generated books, notes, and customizations.</p>
                  <p><strong className="text-foreground">Commercial Rights:</strong> ScrollLibrary grants you a perpetual, worldwide, royalty-free license to use, publish, distribute, and sell any content you generate on our platform for commercial purposes.</p>
                  <p><strong className="text-foreground">Platform Content:</strong> The ScrollLibrary platform, including its design, code, and branding, remains our intellectual property.</p>
                  <p><strong className="text-foreground">AI Attribution:</strong> Generated content may include metadata indicating AI assistance. This does not affect your ownership rights.</p>
                </div>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-primary" />
                  4. Acceptable Use Policy
                </h2>
                <p className="text-muted-foreground mb-4">You agree NOT to use ScrollLibrary to:</p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Generate content that promotes hate, violence, or discrimination</li>
                  <li>Create explicit, pornographic, or sexually exploitative material</li>
                  <li>Produce content that infringes on third-party copyrights or trademarks</li>
                  <li>Generate defamatory, libelous, or fraudulent content</li>
                  <li>Create content promoting illegal activities</li>
                  <li>Spread misinformation or medical/legal/financial advice without disclaimers</li>
                  <li>Bypass content safety filters or moderation systems</li>
                  <li>Use automated systems to abuse the platform</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  Violations may result in content removal, account suspension, or legal action.
                </p>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  5. Content Moderation
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>ScrollLibrary employs automated and human moderation to ensure content safety:</p>
                  <ul className="list-disc list-inside space-y-2">
                    <li>AI content filters scan generated material for policy violations</li>
                    <li>Users can report concerning content for review</li>
                    <li>Moderators review flagged content and take appropriate action</li>
                    <li>Appeals can be submitted through the Support Center</li>
                  </ul>
                </div>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  6. Disclaimers
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p><strong className="text-foreground">AI-Generated Content:</strong> Content is generated by AI and may contain inaccuracies. Users should verify important information independently.</p>
                  <p><strong className="text-foreground">Medical/Legal/Financial:</strong> Content should not be considered professional medical, legal, or financial advice. Consult qualified professionals for such matters.</p>
                  <p><strong className="text-foreground">No Warranty:</strong> Services are provided "as is" without warranties of any kind, express or implied.</p>
                </div>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Scale className="h-6 w-6 text-primary" />
                  7. Limitation of Liability
                </h2>
                <p className="text-muted-foreground">
                  ScrollLibrary and its affiliates shall not be liable for any indirect, incidental, special, 
                  consequential, or punitive damages arising from your use of the service, including but not 
                  limited to loss of profits, data, or goodwill. Our total liability shall not exceed the 
                  amount paid by you in the 12 months preceding the claim.
                </p>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  8. Publishing Responsibility
                </h2>
                <p className="text-muted-foreground">
                  When you publish content generated on ScrollLibrary externally (Amazon KDP, Apple Books, etc.), 
                  you are solely responsible for ensuring compliance with those platforms' guidelines, obtaining 
                  necessary ISBNs, and handling any copyright claims. ScrollLibrary is not liable for issues 
                  arising from external publishing activities.
                </p>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  9. Account Termination
                </h2>
                <p className="text-muted-foreground">
                  We may suspend or terminate your account for violations of these terms. You may delete 
                  your account at any time through Settings. Upon termination, you may export your content 
                  for 30 days before it is permanently deleted.
                </p>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  10. Governing Law
                </h2>
                <p className="text-muted-foreground">
                  These terms are governed by the laws of the jurisdiction in which ScrollLibrary operates. 
                  Any disputes shall be resolved through binding arbitration, except where prohibited by law.
                </p>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  11. Contact
                </h2>
                <p className="text-muted-foreground">
                  For questions about these terms, contact us at{" "}
                  <a href="mailto:legal@scrolllibrary.com" className="text-primary hover:underline">
                    legal@scrolllibrary.com
                  </a>
                </p>
              </section>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}