import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Shield, Lock, Database, Globe, Mail, Phone, Trash2, Clock, Users } from "lucide-react";

import { SEO } from "@/components/SEO";
export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Privacy Policy | ScrollLibrary"
        description="How ScrollLibrary collects, uses, and protects your data. GDPR-compliant policy for learners and institutions."
        canonical="/privacy"
      />
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
                Last updated: February 9, 2026
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                ScrollLibrary ("we", "us", "our") is committed to protecting your privacy. This policy explains how we collect, use, store, and protect your personal data in compliance with the EU General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), and the Google Play User Data Policy.
              </p>
            </div>

            <div className="prose prose-invert max-w-none space-y-8">
              {/* Data Controller */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Users className="h-6 w-6 text-primary" />
                  1. Data Controller
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>The data controller responsible for your personal data is:</p>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-1">
                    <p className="text-foreground font-medium">ScrollLibrary</p>
                    <p>Email: <a href="mailto:support@scrolllibrary.org" className="text-primary hover:underline">support@scrolllibrary.org</a></p>
                    <p>Phone: <a href="tel:+491791455906" className="text-primary hover:underline">+49 179 1455906</a></p>
                    <p>Data Protection Officer: <a href="mailto:privacy@scrolllibrary.org" className="text-primary hover:underline">privacy@scrolllibrary.org</a></p>
                  </div>
                </div>
              </section>

              {/* Information We Collect */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Database className="h-6 w-6 text-primary" />
                  2. Information We Collect
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <div>
                    <p className="text-foreground font-medium mb-2">2.1 Information You Provide Directly</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong className="text-foreground">Account Data:</strong> Name, email address, password (hashed), profile picture, country, and account preferences when you register.</li>
                      <li><strong className="text-foreground">Content:</strong> Books, notes, highlights, quiz responses, and other content you create on our platform.</li>
                      <li><strong className="text-foreground">Communications:</strong> Messages you send through our contact forms or support channels.</li>
                      <li><strong className="text-foreground">Payment Data:</strong> Payment information is processed by Stripe; we do not store your credit card details.</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-foreground font-medium mb-2">2.2 Information Collected Automatically</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong className="text-foreground">Usage Data:</strong> Books generated, reading history, learning progress, and platform interactions.</li>
                      <li><strong className="text-foreground">Device Information:</strong> Browser type, operating system, IP address, device identifiers for security and optimization.</li>
                      <li><strong className="text-foreground">Cookies:</strong> Essential cookies for authentication and preferences (see Section 8).</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-foreground font-medium mb-2">2.3 Information We Do NOT Collect</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>We do not collect biometric data, precise geolocation, contacts, or data from other apps on your device.</li>
                      <li>We do not sell or share personal data with third parties for advertising purposes.</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* Legal Basis & Purpose */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Lock className="h-6 w-6 text-primary" />
                  3. Legal Basis and Purpose of Data Processing
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>We process your data based on the following legal grounds (Art. 6 GDPR):</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-border/50 rounded-lg overflow-hidden">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3 text-foreground">Purpose</th>
                          <th className="text-left p-3 text-foreground">Legal Basis</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        <tr><td className="p-3">Provide and maintain ScrollLibrary services</td><td className="p-3">Contract performance</td></tr>
                        <tr><td className="p-3">Generate personalized AI content based on your preferences</td><td className="p-3">Contract performance</td></tr>
                        <tr><td className="p-3">Process transactions and manage subscriptions</td><td className="p-3">Contract performance</td></tr>
                        <tr><td className="p-3">Send important service updates and notifications</td><td className="p-3">Legitimate interest</td></tr>
                        <tr><td className="p-3">Ensure platform security and prevent fraud</td><td className="p-3">Legitimate interest</td></tr>
                        <tr><td className="p-3">Improve our services through anonymous analytics</td><td className="p-3">Legitimate interest</td></tr>
                        <tr><td className="p-3">Comply with legal obligations</td><td className="p-3">Legal obligation</td></tr>
                        <tr><td className="p-3">Marketing communications (optional)</td><td className="p-3">Consent</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* Data Sharing */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Globe className="h-6 w-6 text-primary" />
                  4. Data Sharing & Third Parties
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>We do <strong className="text-foreground">not</strong> sell your personal data. We may share data with:</p>
                  <ul className="list-disc list-inside space-y-2">
                    <li><strong className="text-foreground">Supabase:</strong> Database and authentication hosting (EU/US data centers).</li>
                    <li><strong className="text-foreground">Stripe:</strong> Payment processing (PCI-DSS compliant).</li>
                    <li><strong className="text-foreground">AI Processing:</strong> Content generation via Google Gemini / OpenAI APIs — prompts are sent but no personal data beyond the book content you provide.</li>
                    <li><strong className="text-foreground">Legal Authorities:</strong> When required by law or court order.</li>
                  </ul>
                  <p className="text-sm">All third-party providers are bound by data processing agreements and comply with GDPR standards.</p>
                </div>
              </section>

              {/* Your Rights */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Shield className="h-6 w-6 text-primary" />
                  5. Your Rights (GDPR Articles 15-22 & CCPA)
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>You have the following rights regarding your personal data:</p>
                  <ul className="list-disc list-inside space-y-2">
                    <li><strong className="text-foreground">Right of Access (Art. 15):</strong> Request a copy of all personal data we hold about you.</li>
                    <li><strong className="text-foreground">Right to Rectification (Art. 16):</strong> Correct any inaccurate or incomplete data via your Profile page.</li>
                    <li><strong className="text-foreground">Right to Erasure (Art. 17):</strong> Delete your account and all associated data at <a href="/account/delete" className="text-primary hover:underline">scrolllibrary.org/delete-account</a> or through Settings → Privacy → Delete Account.</li>
                    <li><strong className="text-foreground">Right to Data Portability (Art. 20):</strong> Export your data in machine-readable format via Settings → Privacy → Export Data.</li>
                    <li><strong className="text-foreground">Right to Object (Art. 21):</strong> Opt out of certain data processing by contacting us.</li>
                    <li><strong className="text-foreground">Right to Restriction (Art. 18):</strong> Limit how we use your data.</li>
                    <li><strong className="text-foreground">Right to Withdraw Consent:</strong> Withdraw consent at any time without affecting the lawfulness of prior processing.</li>
                  </ul>
                  <div className="bg-muted/30 rounded-lg p-4 mt-4">
                    <p className="text-foreground font-medium mb-1">How to exercise your rights:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>In-app: Settings → Privacy</li>
                      <li>Account deletion: <a href="/account/delete" className="text-primary hover:underline">scrolllibrary.org/delete-account</a></li>
                      <li>Email: <a href="mailto:privacy@scrolllibrary.org" className="text-primary hover:underline">privacy@scrolllibrary.org</a></li>
                      <li>We will respond within 30 days as required by GDPR.</li>
                    </ul>
                  </div>
                  <p className="text-sm">You also have the right to lodge a complaint with your local data protection authority.</p>
                </div>
              </section>

              {/* Data Retention */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Clock className="h-6 w-6 text-primary" />
                  6. Data Retention
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-border/50 rounded-lg overflow-hidden">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3 text-foreground">Data Type</th>
                          <th className="text-left p-3 text-foreground">Retention Period</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        <tr><td className="p-3">Account data</td><td className="p-3">Until account deletion</td></tr>
                        <tr><td className="p-3">Generated content (books, notes)</td><td className="p-3">Until you delete it or close your account</td></tr>
                        <tr><td className="p-3">Payment records</td><td className="p-3">7 years (legal obligation)</td></tr>
                        <tr><td className="p-3">Certificate records</td><td className="p-3">Revoked on deletion; verification metadata retained for audit integrity</td></tr>
                        <tr><td className="p-3">Anonymous analytics</td><td className="p-3">Up to 26 months</td></tr>
                        <tr><td className="p-3">Support communications</td><td className="p-3">12 months after resolution</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-sm">Upon account deletion, all personal data is permanently removed within 30 days. Anonymized, aggregated data may be retained for analytics.</p>
                </div>
              </section>

              {/* Security */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Lock className="h-6 w-6 text-primary" />
                  7. Security Measures
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>We implement industry-standard security measures including:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>TLS/SSL encryption for all data in transit</li>
                    <li>AES-256 encryption for data at rest</li>
                    <li>Row-Level Security (RLS) policies on all database tables</li>
                    <li>Regular security audits and vulnerability assessments</li>
                    <li>Secure password hashing (bcrypt)</li>
                    <li>Token-based authentication with automatic expiration</li>
                  </ul>
                  <p className="text-sm">No system is 100% secure. You are responsible for maintaining the security of your account credentials. Report security concerns to <a href="mailto:security@scrolllibrary.org" className="text-primary hover:underline">security@scrolllibrary.org</a>.</p>
                </div>
              </section>

              {/* Cookies */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  8. Cookies & Tracking
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-border/50 rounded-lg overflow-hidden">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3 text-foreground">Cookie Type</th>
                          <th className="text-left p-3 text-foreground">Purpose</th>
                          <th className="text-left p-3 text-foreground">Required?</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        <tr><td className="p-3">Authentication</td><td className="p-3">Keep you logged in securely</td><td className="p-3">Essential</td></tr>
                        <tr><td className="p-3">Preferences</td><td className="p-3">Theme, language, reader settings</td><td className="p-3">Essential</td></tr>
                        <tr><td className="p-3">Analytics</td><td className="p-3">Improve platform performance</td><td className="p-3">Optional</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-sm">We do NOT use third-party advertising cookies. You can manage cookie preferences through our cookie consent manager or your browser settings.</p>
                </div>
              </section>

              {/* Account Deletion */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Trash2 className="h-6 w-6 text-primary" />
                  9. Account Deletion
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>You can permanently delete your account and all associated data at any time:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>In-app: Settings → Privacy → Delete Account</li>
                    <li>Direct URL: <a href="/account/delete" className="text-primary hover:underline">scrolllibrary.org/delete-account</a></li>
                    <li>Email: <a href="mailto:support@scrolllibrary.org" className="text-primary hover:underline">support@scrolllibrary.org</a></li>
                  </ul>
                  <p className="text-sm">Deletion is immediate and irreversible. All personal data, books, notes, and preferences will be permanently removed. Active subscriptions will be cancelled.</p>
                </div>
              </section>

              {/* Children's Privacy */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  10. Children's Privacy
                </h2>
                <p className="text-muted-foreground">
                  ScrollLibrary is not intended for users under 13 years of age (or 16 in the EU). We do not knowingly 
                  collect data from children. If you believe a child has provided us personal information, 
                  please contact us immediately at <a href="mailto:privacy@scrolllibrary.org" className="text-primary hover:underline">privacy@scrolllibrary.org</a> and we will promptly delete it.
                </p>
              </section>

              {/* International Transfers */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  11. International Data Transfers
                </h2>
                <p className="text-muted-foreground">
                  Your data may be transferred to and processed in countries outside your jurisdiction. We ensure appropriate safeguards are in place, including Standard Contractual Clauses (SCCs) approved by the European Commission, to protect your data during international transfers.
                </p>
              </section>

              {/* Changes to Policy */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4">
                  12. Changes to This Policy
                </h2>
                <p className="text-muted-foreground">
                  We may update this policy from time to time. We will notify you of significant changes via email or in-app notification at least 30 days before they take effect. Continued use of ScrollLibrary after changes constitutes acceptance.
                </p>
              </section>

              {/* Contact */}
              <section className="bg-gradient-card rounded-xl border border-border/50 p-6">
                <h2 className="text-2xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Mail className="h-6 w-6 text-primary" />
                  13. Contact Us
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>For any privacy-related inquiries:</p>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      <span>Data Protection Officer: <a href="mailto:privacy@scrolllibrary.org" className="text-primary hover:underline">privacy@scrolllibrary.org</a></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      <span>Support: <a href="mailto:support@scrolllibrary.org" className="text-primary hover:underline">support@scrolllibrary.org</a></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-primary" />
                      <span>Phone: <a href="tel:+491791455906" className="text-primary hover:underline">+49 179 1455906</a></span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
