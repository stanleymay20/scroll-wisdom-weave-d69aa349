/**
 * CERTIFIED USING BOOK SEAL
 * 
 * A prominent, clickable seal showing which book was used for certification.
 * Designed to be immediately recognizable and verifiable.
 */

import { BookOpen, CheckCircle, Lock, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CertifiedBookSealProps {
  bookTitle: string;
  bookType: string;
  version?: string;
  verificationUrl?: string;
  onViewBook?: () => void;
  variant?: 'default' | 'compact' | 'inline';
  className?: string;
}

export function CertifiedBookSeal({
  bookTitle,
  bookType,
  version,
  verificationUrl,
  onViewBook,
  variant = 'default',
  className,
}: CertifiedBookSealProps) {
  const getBookTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      academic: 'from-blue-500 to-blue-600',
      technical: 'from-purple-500 to-purple-600',
      comic: 'from-pink-500 to-pink-600',
      children: 'from-green-500 to-green-600',
      illustrated: 'from-amber-500 to-amber-600',
      workbook: 'from-orange-500 to-orange-600',
      text: 'from-gray-500 to-gray-600',
    };
    return colors[type] || 'from-primary to-primary/80';
  };

  if (variant === 'inline') {
    return (
      <button
        onClick={onViewBook}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
          "bg-primary/10 hover:bg-primary/20 transition-colors",
          "border border-primary/20 hover:border-primary/30",
          "text-sm font-medium",
          className
        )}
      >
        <CheckCircle className="h-4 w-4 text-primary" />
        <span>Certified Using</span>
        <span className="font-semibold text-primary truncate max-w-[200px]">
          {bookTitle}
        </span>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-lg",
        "bg-gradient-to-r from-primary/5 to-transparent",
        "border border-primary/20",
        className
      )}>
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium uppercase tracking-wide">
            <Lock className="h-3 w-3" />
            Certified Using
          </div>
          <p className="font-semibold truncate">{bookTitle}</p>
        </div>
        {onViewBook && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onViewBook}
            className="flex-shrink-0"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  // Default variant - prominent seal
  return (
    <div className={cn(
      "relative rounded-xl overflow-hidden",
      "border-2 border-primary/30",
      "bg-gradient-to-br from-background via-primary/5 to-background",
      className
    )}>
      {/* Decorative top bar */}
      <div className={cn(
        "h-1.5 w-full bg-gradient-to-r",
        getBookTypeColor(bookType)
      )} />

      <div className="p-6">
        {/* Seal Header */}
        <div className="flex items-center gap-4">
          {/* Book Icon with Ring */}
          <div className="relative">
            <div className={cn(
              "h-16 w-16 rounded-full flex items-center justify-center",
              "bg-gradient-to-br",
              getBookTypeColor(bookType)
            )}>
              <BookOpen className="h-8 w-8 text-white" />
            </div>
            {/* Verified checkmark */}
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-green-500 flex items-center justify-center border-2 border-background">
              <CheckCircle className="h-4 w-4 text-white" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-primary uppercase tracking-wide">
                Certified Using
              </span>
            </div>
            <h3 className="text-xl font-bold truncate">{bookTitle}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs capitalize">
                {bookType}
              </Badge>
              {version && (
                <span className="text-xs text-muted-foreground">
                  Version {version}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Button */}
        {onViewBook && (
          <div className="mt-4 pt-4 border-t border-primary/10">
            <Button 
              variant="outline" 
              onClick={onViewBook} 
              className="w-full gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              View Book Details
            </Button>
          </div>
        )}

        {/* Verification URL */}
        {verificationUrl && (
          <p className="text-xs text-center text-muted-foreground mt-3">
            Verify at: <span className="font-mono">{verificationUrl}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export default CertifiedBookSeal;
