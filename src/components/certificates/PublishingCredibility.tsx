/**
 * CONTRACT 6A — PUBLISHING CREDIBILITY COMPONENT
 *
 * Trust indicators are opt-in and evidence-named. Nothing defaults to verified,
 * and this component never claims that ScrollLibrary grants copyright or
 * commercial publishing rights.
 */

import { Shield, CheckCircle, Award, FileCheck, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CERTIFICATE_ISSUER } from '@/lib/certificateAuthority';

interface PublishingCredibilityProps {
  bookTitle: string;
  bookType: string;
  scrollPublishingCode?: string;
  hasCompletionCertificate?: boolean;
  /** @deprecated This means a publication-generation record exists; it does not prove legal rights. */
  hasPublishingRights?: boolean;
  hasPublicationRecord?: boolean;
  isVerified?: boolean;
}

export function PublishingCredibility({
  bookTitle,
  bookType,
  scrollPublishingCode,
  hasCompletionCertificate = false,
  hasPublishingRights = false,
  hasPublicationRecord = false,
  isVerified = false,
}: PublishingCredibilityProps) {
  const publicationRecord = hasPublicationRecord || hasPublishingRights;
  const credibilityItems = [
    {
      icon: Shield,
      title: 'Platform Verification',
      description: isVerified ? 'Server verification evidence is available' : 'No server verification claim is active',
      active: isVerified,
    },
    {
      icon: Award,
      title: 'Learning Record',
      description: 'A server-issued completion/mastery learning record is available',
      active: hasCompletionCertificate,
    },
    {
      icon: FileCheck,
      title: 'Publication Record',
      description: 'AI-assisted publication/generation provenance is recorded; legal rights are determined separately',
      active: publicationRecord,
    },
    {
      icon: Lock,
      title: 'Canonical Issuer',
      description: `Learning records use ${CERTIFICATE_ISSUER.authority}`,
      active: true,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Publishing & Learning Evidence
            </CardTitle>
            <CardDescription>Evidence status — not a grant of legal rights</CardDescription>
          </div>
          {isVerified && (
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle className="h-3 w-3 mr-1" />
              Server Verified
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="font-medium text-sm">{bookTitle}</p>
          <p className="text-xs text-muted-foreground capitalize">{bookType} • ScrollLibrary</p>
          {scrollPublishingCode && <p className="text-xs font-mono text-muted-foreground mt-1">{scrollPublishingCode}</p>}
        </div>

        <div className="space-y-2">
          {credibilityItems.map((item) => (
            <div key={item.title} className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${item.active ? 'bg-primary/5' : 'bg-muted/30 opacity-60'}`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${item.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <item.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              {item.active && <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />}
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <img src={CERTIFICATE_ISSUER.signatureImage} alt="Issuer signature" className="h-6 object-contain dark:invert opacity-50" />
            <span>{CERTIFICATE_ISSUER.representative}, {CERTIFICATE_ISSUER.title} — {CERTIFICATE_ISSUER.authority}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}