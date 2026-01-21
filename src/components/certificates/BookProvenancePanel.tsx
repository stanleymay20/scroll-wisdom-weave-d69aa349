/**
 * BOOK PROVENANCE PANEL
 * 
 * Displays cryptographic and structural binding between certificate and book.
 * This proves which book was used for certification.
 */

import { format } from 'date-fns';
import { 
  BookOpen, 
  Hash, 
  Calendar, 
  Layers, 
  FileCheck, 
  ExternalLink,
  Shield,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface BookProvenanceData {
  bookId: string;
  bookTitle: string;
  bookType: 'academic' | 'technical' | 'comic' | 'children' | 'illustrated' | 'workbook' | 'text';
  bookVersion: string;
  bookHash: string; // SHA256 hash of book content at certification time
  totalChapters: number;
  completedChapters: number;
  wordCount?: number;
  category: string;
  language: string;
  assessmentSchema: string; // e.g., "ARC-1.0"
  visualContract?: string; // e.g., "ICG-1.0"
  styleContract?: string; // e.g., "VSC-1.0"
  integrityChecks: {
    name: string;
    passed: boolean;
    details?: string;
  }[];
  certifiedAt: Date;
  bookCreatedAt: Date;
}

interface BookProvenancePanelProps {
  provenance: BookProvenanceData;
  onViewBook?: () => void;
  compact?: boolean;
}

export function BookProvenancePanel({
  provenance,
  onViewBook,
  compact = false
}: BookProvenancePanelProps) {
  const getBookTypeLabel = (type: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      academic: { label: 'Academic', color: 'bg-blue-500/10 text-blue-600' },
      technical: { label: 'Technical', color: 'bg-purple-500/10 text-purple-600' },
      comic: { label: 'Comic', color: 'bg-pink-500/10 text-pink-600' },
      children: { label: "Children's", color: 'bg-green-500/10 text-green-600' },
      illustrated: { label: 'Illustrated', color: 'bg-amber-500/10 text-amber-600' },
      workbook: { label: 'Workbook', color: 'bg-orange-500/10 text-orange-600' },
      text: { label: 'Text', color: 'bg-gray-500/10 text-gray-600' },
    };
    return labels[type] || { label: 'Unknown', color: 'bg-muted text-muted-foreground' };
  };

  const bookTypeInfo = getBookTypeLabel(provenance.bookType);
  const allChecksPassed = provenance.integrityChecks.every(c => c.passed);

  if (compact) {
    return (
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary uppercase tracking-wide">
                  Certified Using
                </span>
              </div>
              <p className="font-semibold truncate">{provenance.bookTitle}</p>
              <p className="text-xs text-muted-foreground">
                {provenance.completedChapters}/{provenance.totalChapters} chapters • {provenance.bookVersion}
              </p>
            </div>
            <Badge className={bookTypeInfo.color}>
              {bookTypeInfo.label}
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20 overflow-hidden">
      {/* Header with Seal */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 border-b border-primary/10">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-lg bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
            <BookOpen className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-primary uppercase tracking-wide">
                Certified Using This Book
              </span>
            </div>
            <h3 className="font-bold text-lg">{provenance.bookTitle}</h3>
          </div>
          {onViewBook && (
            <Button variant="outline" size="sm" onClick={onViewBook} className="gap-1.5">
              <ExternalLink className="h-4 w-4" />
              View Book
            </Button>
          )}
        </div>
      </div>

      <CardContent className="p-6 space-y-6">
        {/* Book Details Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Book Type</p>
            <Badge className={cn("text-sm", bookTypeInfo.color)}>
              {bookTypeInfo.label}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Category</p>
            <p className="font-medium capitalize">{provenance.category.replace('_', ' ')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Language</p>
            <p className="font-medium uppercase">{provenance.language}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Completion</p>
            <p className="font-medium">{provenance.completedChapters}/{provenance.totalChapters} chapters</p>
          </div>
        </div>

        <Separator />

        {/* Version & Hash (Cryptographic Binding) */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2 text-sm">
            <Hash className="h-4 w-4 text-primary" />
            Cryptographic Binding
          </h4>
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Book Version</span>
              <code className="text-sm font-mono bg-background px-2 py-1 rounded">
                {provenance.bookVersion}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Content Hash (SHA256)</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <code className="text-sm font-mono bg-background px-2 py-1 rounded truncate max-w-[200px]">
                      {provenance.bookHash.slice(0, 16)}...
                    </code>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-mono text-xs">{provenance.bookHash}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Book ID</span>
              <code className="text-sm font-mono bg-background px-2 py-1 rounded truncate max-w-[200px]">
                {provenance.bookId.slice(0, 8)}...
              </code>
            </div>
          </div>
        </div>

        <Separator />

        {/* Contract Compliance */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2 text-sm">
            <FileCheck className="h-4 w-4 text-primary" />
            Contract Compliance
          </h4>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1.5">
              <Shield className="h-3 w-3" />
              {provenance.assessmentSchema}
            </Badge>
            {provenance.visualContract && (
              <Badge variant="outline" className="gap-1.5">
                <Layers className="h-3 w-3" />
                {provenance.visualContract}
              </Badge>
            )}
            {provenance.styleContract && (
              <Badge variant="outline" className="gap-1.5">
                <Layers className="h-3 w-3" />
                {provenance.styleContract}
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Integrity Checks */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-primary" />
            Integrity Verification
          </h4>
          <div className="space-y-2">
            {provenance.integrityChecks.map((check, idx) => (
              <div key={idx} className="flex items-center justify-between py-1.5">
                <span className="text-sm">{check.name}</span>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "gap-1",
                    check.passed 
                      ? "bg-green-500/10 text-green-600 border-green-500/30"
                      : "bg-red-500/10 text-red-600 border-red-500/30"
                  )}
                >
                  {check.passed ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      Passed
                    </>
                  ) : (
                    <>⚠️ Failed</>
                  )}
                </Badge>
              </div>
            ))}
          </div>
          
          {/* Overall Status */}
          <div className={cn(
            "rounded-lg p-3 text-center",
            allChecksPassed 
              ? "bg-green-500/10 border border-green-500/20" 
              : "bg-red-500/10 border border-red-500/20"
          )}>
            <p className={cn(
              "font-medium",
              allChecksPassed ? "text-green-600" : "text-red-600"
            )}>
              {allChecksPassed 
                ? "✓ All Integrity Checks Passed" 
                : "⚠️ Some Checks Failed"}
            </p>
          </div>
        </div>

        <Separator />

        {/* Timestamps */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Book Created
            </p>
            <p className="font-medium">
              {format(provenance.bookCreatedAt, 'MMM d, yyyy')}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Certified On
            </p>
            <p className="font-medium">
              {format(provenance.certifiedAt, 'MMM d, yyyy')}
            </p>
          </div>
        </div>

        {/* Footer Notice */}
        <div className="pt-4 border-t text-center">
          <p className="text-xs text-muted-foreground">
            This certificate is cryptographically bound to the book above. 
            The content hash prevents substitution after certification.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default BookProvenancePanel;
