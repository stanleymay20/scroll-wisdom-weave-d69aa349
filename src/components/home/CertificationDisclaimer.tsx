import { motion } from "framer-motion";
import { Shield, Award, AlertCircle, CheckCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "react-router-dom";

export function CertificationDisclaimer() {
  const { t } = useLanguage();

  return (
    <section className="py-12 bg-muted/30 border-y border-border/50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-medium mb-4">
              <Shield className="h-4 w-4" />
              {t('certification.badge')}
            </span>
            <h2 className="text-2xl font-display font-bold text-foreground mb-2">
              {t('certification.title')}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t('certification.subtitle')}
            </p>
          </div>

          {/* What We Certify Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* We Certify */}
            <div className="bg-gradient-card rounded-xl border border-border/50 p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                {t('certification.weCertify')}
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Award className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  {t('certification.certify1')}
                </li>
                <li className="flex items-start gap-2">
                  <Award className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  {t('certification.certify2')}
                </li>
                <li className="flex items-start gap-2">
                  <Award className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  {t('certification.certify3')}
                </li>
              </ul>
            </div>

            {/* We Do NOT Certify */}
            <div className="bg-gradient-card rounded-xl border border-border/50 p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                {t('certification.weDoNotCertify')}
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5 flex-shrink-0">✕</span>
                  {t('certification.notCertify1')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5 flex-shrink-0">✕</span>
                  {t('certification.notCertify2')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5 flex-shrink-0">✕</span>
                  {t('certification.notCertify3')}
                </li>
              </ul>
            </div>
          </div>

          {/* Learn More Links */}
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <Link 
              to="/docs/how-certification-works" 
              className="text-primary hover:underline flex items-center gap-1"
            >
              {t('certification.howItWorks')} →
            </Link>
            <Link 
              to="/docs/verification" 
              className="text-primary hover:underline flex items-center gap-1"
            >
              {t('certification.forEmployers')} →
            </Link>
            <Link 
              to="/docs/trust-whitepaper" 
              className="text-primary hover:underline flex items-center gap-1"
            >
              {t('certification.trustWhitepaper')} →
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
