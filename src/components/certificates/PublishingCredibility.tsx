/**
 * CONTRACT 6A — PUBLISHING CREDIBILITY COMPONENT
 * Displays trust indicators and verification status
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
  hasPublishingRights?: boolean;
  isVerified?: boolean;
}

export function PublishingCredibility({
  bookTitle,
  bookType,
  scrollPublishingCode,
  hasCompletionCertificate = false,
  hasPublishingRights = false,
  isVerified = true,
}: PublishingCredibilityProps) {
  const credibilityItems = [
    {
      icon: Shield,
      title: 'Platform Verified',
      description: 'Content generated and verified by ScrollLibrary',
      active: isVerified,
    },
    {
      icon: Award,
      title: 'Completion Certificate',
      description: 'Official certificate of achievement available',
      active: hasCompletionCertificate,
    },
    {
      icon: FileCheck,
      title: 'Publishing Rights',
      description: 'Commercial publishing rights granted',
      active: hasPublishingRights,
    },
    {
      icon: Lock,
      title: 'Authority Signed',
      description: `Issued by ${CERTIFICATE_ISSUER.authority}`,
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
              Publishing Credibility
            </CardTitle>
            <CardDescription>Trust & verification status</CardDescription>
          </div>
          {isVerified && (
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Book Info */}
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="font-medium text-sm">{bookTitle}</p>
          <p className="text-xs text-muted-foreground capitalize">{bookType} • ScrollLibrary</p>
          {scrollPublishingCode && (
            <p className="text-xs font-mono text-muted-foreground mt-1">
              {scrollPublishingCode}
            </p>
          )}
        </div>

        {/* Credibility Items */}
        <div className="space-y-2">
          {credibilityItems.map((item) => (
            <div
              key={item.title}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                item.active 
                  ? 'bg-primary/5' 
                  : 'bg-muted/30 opacity-60'
              }`}
            >
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                item.active 
                  ? 'bg-primary/10 text-primary' 
                  : 'bg-muted text-muted-foreground'
              }`}>
                <item.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {item.description}
                </p>
              </div>
              {item.active && (
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Issuer Authority */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <img 
              src={CERTIFICATE_ISSUER.signatureImage}
              alt="Authority"
              className="h-6 object-contain dark:invert opacity-50"
            />
            <span>
              Authorized by {CERTIFICATE_ISSUER.representative}, {CERTIFICATE_ISSUER.authority}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
