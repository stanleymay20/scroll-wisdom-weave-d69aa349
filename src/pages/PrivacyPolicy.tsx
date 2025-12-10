import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Shield, Lock, Database, Globe, Mail } from "lucide-react";

export default function PrivacyPolicy() {
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
              <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h1 className="text-4xl font-display font-bold text-gradient-gold mb-4">
                Privacy Policy
              </h1>
              <p className="text-muted-foreground">
                Last updated: December 10, 2024
              </p>
            </div>

            <div className="prose prose-invert max-w-none space-y-8">
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Database className="h-6 w-6 text-primary" />
                  1. Information We Collect
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p><strong className="text-foreground">Personal Information:</strong> Name, email address, profile picture, country, and account preferences when you register.</p>
                  <p><strong className="text-foreground">Usage Data:</strong> Books generated, reading history, learning progress, and platform interactions.</p>
                  <p><strong className="text-foreground">Device Information:</strong> Browser type, IP address, device identifiers for security and optimization.</p>
                  <p><strong className="text-foreground">Content:</strong> Books, notes, highlights, and other content you create on our platform.</p>
                </div>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Lock className="h-6 w-6 text-primary" />
                  2. How We Use Your Information
                </h2>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Provide, maintain, and improve ScrollLibrary services</li>
                  <li>Generate personalized AI content based on your preferences</li>
                  <li>Process transactions and manage subscriptions</li>
                  <li>Send important service updates and notifications</li>
                  <li>Ensure platform security and prevent fraud</li>
                  <li>Comply with legal obligations</li>
                </ul>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Globe className="h-6 w-6 text-primary" />
                  3. Data Sharing & Third Parties
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>We do <strong className="text-foreground">not</strong> sell your personal data. We may share data with:</p>
                  <ul className="list-disc list-inside space-y-2">
                    <li>Service providers who help operate our platform (hosting, analytics)</li>
                    <li>AI processing services for content generation</li>
                    <li>Legal authorities when required by law</li>
                    <li>Business partners with your explicit consent</li>
                  </ul>
                </div>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  4. Your Rights (GDPR & CCPA)
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>You have the right to:</p>
                  <ul className="list-disc list-inside space-y-2">
                    <li><strong className="text-foreground">Access:</strong> Request a copy of your personal data</li>
                    <li><strong className="text-foreground">Rectification:</strong> Correct inaccurate data</li>
                    <li><strong className="text-foreground">Erasure:</strong> Request deletion of your data</li>
                    <li><strong className="text-foreground">Portability:</strong> Export your data in a machine-readable format</li>
                    <li><strong className="text-foreground">Objection:</strong> Opt out of certain data processing</li>
                    <li><strong className="text-foreground">Restriction:</strong> Limit how we use your data</li>
                  </ul>
                  <p>To exercise these rights, visit Settings → Privacy or contact us.</p>
                </div>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  5. Data Retention
                </h2>
                <p className="text-muted-foreground">
                  We retain your data for as long as your account is active or as needed to provide services. 
                  After account deletion, we may retain anonymized data for analytics and legal compliance for up to 3 years.
                  Generated content is stored until you delete it or close your account.
                </p>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  6. Security
                </h2>
                <p className="text-muted-foreground">
                  We implement industry-standard security measures including encryption, secure servers, 
                  and regular security audits. However, no system is 100% secure. You are responsible 
                  for maintaining the security of your account credentials.
                </p>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  7. Cookies & Tracking
                </h2>
                <p className="text-muted-foreground">
                  We use essential cookies for authentication and preferences. Analytics cookies help us 
                  improve the platform. You can manage cookie preferences in your browser settings or 
                  through our cookie consent manager.
                </p>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  8. Children's Privacy
                </h2>
                <p className="text-muted-foreground">
                  ScrollLibrary is not intended for users under 13 years of age. We do not knowingly 
                  collect data from children. If you believe a child has provided us personal information, 
                  please contact us immediately.
                </p>
              </section>

              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Mail className="h-6 w-6 text-primary" />
                  9. Contact Us
                </h2>
                <p className="text-muted-foreground">
                  For privacy-related inquiries, contact our Data Protection Officer at{" "}
                  <a href="mailto:privacy@scrolllibrary.com" className="text-primary hover:underline">
                    privacy@scrolllibrary.com
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