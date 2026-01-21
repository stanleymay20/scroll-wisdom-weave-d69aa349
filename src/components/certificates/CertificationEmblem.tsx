/**
 * CONTRACT 8A — CERTIFICATION EMBLEM COMPONENT
 * 
 * The Certification Emblem is used ONLY on certificates & verification pages.
 * It represents authority & trust and is MANDATORY on every certificate.
 * 
 * This is distinct from the ScrollLibrary Logo which is used for app UI.
 */

import { memo } from 'react';
import certificationEmblem from '@/assets/certification-emblem.png';

export interface CertificationEmblemProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showText?: boolean;
}

const SIZE_MAP = {
  sm: 'h-12 w-12',
  md: 'h-20 w-20',
  lg: 'h-28 w-28',
  xl: 'h-40 w-40',
} as const;

function CertificationEmblemComponent({ 
  size = 'md', 
  className = '',
  showText = false 
}: CertificationEmblemProps) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <img
        src={certificationEmblem}
        alt="ScrollLibrary Certification Authority Emblem"
        className={`${SIZE_MAP[size]} object-contain`}
        draggable={false}
      />
      {showText && (
        <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
          Verified Learning
        </p>
      )}
    </div>
  );
}

export const CertificationEmblem = memo(CertificationEmblemComponent);

// Inline emblem for compact use
export function CertificationEmblemInline({ className = '' }: { className?: string }) {
  return (
    <img
      src={certificationEmblem}
      alt="Certified"
      className={`h-6 w-6 object-contain inline-block ${className}`}
      draggable={false}
    />
  );
}
