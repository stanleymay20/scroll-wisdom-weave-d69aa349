/**
 * CONTRACT 6A — CERTIFICATE DISPLAY COMPONENT
 * Renders certificates with locked issuer authority and Founder signature
 */

import { format } from 'date-fns';
import { Award, CheckCircle, Shield, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Certificate, 
  CERTIFICATE_ISSUER,
  CERTIFICATE_TYPES,
  CertificateType,
  validateCertificateIntegrity 
} from '@/lib/certificateAuthority';

interface CertificateDisplayProps {
  certificate: Certificate;
  certificateType?: CertificateType;
  onDownload?: () => void;
  compact?: boolean;
}

export function CertificateDisplay({ 
  certificate, 
  certificateType = 'completion',
  onDownload,
  compact = false 
}: CertificateDisplayProps) {
  const isValid = validateCertificateIntegrity(certificate);
  const typeConfig = CERTIFICATE_TYPES[certificateType];

  if (compact) {
    return (
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Award className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{typeConfig.displayName}</p>
                <p className="text-xs text-muted-foreground">{certificate.content.bookTitle}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              <CheckCircle className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-4 border-double border-primary/30 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 overflow-hidden">
      {/* Decorative Header */}
      <div className="h-2 bg-gradient-to-r from-primary via-primary/80 to-primary" />
      
      <CardContent className="p-8 md:p-12">
        {/* Authority Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-primary tracking-wide uppercase">
            {CERTIFICATE_ISSUER.authority}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Official Certificate of Achievement
          </p>
        </div>

        {/* Certificate Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">
            {typeConfig.displayName}
          </h1>
          <div className="w-24 h-0.5 bg-primary mx-auto mt-4" />
        </div>

        {/* Recipient Section */}
        <div className="text-center mb-8">
          <p className="text-muted-foreground mb-2">This certifies that</p>
          <p className="text-2xl md:text-3xl font-serif font-bold text-primary">
            {certificate.recipient.name}
          </p>
          <p className="text-muted-foreground mt-4">
            has successfully completed
          </p>
          <p className="text-xl font-semibold mt-2">
            "{certificate.content.bookTitle}"
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {certificate.content.chaptersCompleted} of {certificate.content.totalChapters} chapters
            {certificate.content.wordCount && ` • ${certificate.content.wordCount.toLocaleString()} words`}
          </p>
        </div>

        {/* Granted Rights */}
        <div className="text-center mb-8">
          <p className="text-sm text-muted-foreground mb-2">Rights Granted:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {typeConfig.grantedRights.map((right) => (
              <Badge key={right} variant="secondary" className="text-xs">
                {right}
              </Badge>
            ))}
          </div>
        </div>

        {/* Signature Section - LOCKED TO FOUNDER */}
        <div className="grid md:grid-cols-2 gap-8 mt-12 pt-8 border-t border-primary/20">
          {/* Issuer Signature */}
          <div className="text-center">
            <div className="h-20 flex items-center justify-center mb-2">
              <img 
                src={CERTIFICATE_ISSUER.signatureImage} 
                alt="Authorized Signature"
                className="h-16 md:h-20 object-contain dark:invert"
              />
            </div>
            <div className="border-t border-foreground/30 pt-2 inline-block px-8">
              <p className="font-semibold text-sm">{CERTIFICATE_ISSUER.representative}</p>
              <p className="text-xs text-muted-foreground">{CERTIFICATE_ISSUER.title}</p>
              <p className="text-xs text-muted-foreground">{CERTIFICATE_ISSUER.authority}</p>
            </div>
          </div>

          {/* Date & Verification */}
          <div className="text-center">
            <div className="h-20 flex items-center justify-center mb-2">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Date of Issue</p>
                <p className="text-lg font-semibold">
                  {format(certificate.issuedAt, 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
            <div className="border-t border-foreground/30 pt-2 inline-block px-8">
              <p className="font-mono text-xs text-muted-foreground">
                SPC: {certificate.scrollPublishingCode}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Verify: {certificate.verificationHash}
              </p>
            </div>
          </div>
        </div>

        {/* Validity Badge */}
        <div className="flex justify-center mt-8">
          {isValid ? (
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20 px-4 py-1">
              <CheckCircle className="h-4 w-4 mr-2" />
              Verified & Valid
            </Badge>
          ) : (
            <Badge variant="destructive" className="px-4 py-1">
              ⚠️ Certificate Integrity Error
            </Badge>
          )}
        </div>

        {/* Download Button */}
        {onDownload && (
          <div className="flex justify-center mt-6">
            <Button onClick={onDownload} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Download Certificate
            </Button>
          </div>
        )}

        {/* Legal Footer */}
        <div className="mt-8 pt-4 border-t border-primary/10 text-center">
          <p className="text-xs text-muted-foreground">
            This certificate is issued by {CERTIFICATE_ISSUER.authority}. 
            Verification available at scroll-wisdom-weave.lovable.app/verify/{certificate.id}
          </p>
        </div>
      </CardContent>

      {/* Decorative Footer */}
      <div className="h-2 bg-gradient-to-r from-primary via-primary/80 to-primary" />
    </Card>
  );
}
