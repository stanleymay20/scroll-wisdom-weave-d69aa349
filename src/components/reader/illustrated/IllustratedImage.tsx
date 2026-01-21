/**
 * ILLUSTRATED IMAGE COMPONENT
 * 
 * Renders a single illustration with interactive capabilities
 * based on book type and illustration type.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, HelpCircle, Lightbulb, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAvailableInteractions } from '@/lib/illustratedContentContract';
import type { IllustratedImageProps } from './types';

export function IllustratedImage({
  illustration,
  bookType,
  onExpand,
  onExplain,
  className,
}: IllustratedImageProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const interactions = getAvailableInteractions(illustration.type, bookType);
  const hasExplain = interactions.some(i => i.type === 'explain' && i.available);

  const getTypeIcon = () => {
    switch (illustration.type) {
      case 'chart':
        return '📊';
      case 'diagram':
        return '🔀';
      case 'technical':
        return '⚙️';
      case 'illustration':
        return '🎨';
      default:
        return '🖼️';
    }
  };

  const getTypeLabel = () => {
    const labels: Record<string, string> = {
      chart: 'Data Visualization',
      diagram: 'Concept Diagram',
      technical: 'Technical Visual',
      illustration: 'Illustration',
    };
    return labels[illustration.type] || 'Visual';
  };

  if (imageError) {
    return (
      <div className={cn(
        "rounded-lg border border-dashed border-muted-foreground/30 p-6 text-center",
        className
      )}>
        <p className="text-sm text-muted-foreground">
          Image unavailable
        </p>
        {illustration.caption && (
          <p className="text-xs text-muted-foreground/70 mt-2">
            {illustration.caption}
          </p>
        )}
      </div>
    );
  }

  return (
    <motion.figure
      className={cn(
        "relative rounded-lg overflow-hidden my-6",
        illustration.position === 'full-width' && "w-full",
        illustration.position === 'sidebar' && "float-right ml-4 w-1/3",
        illustration.position === 'inline' && "mx-auto max-w-2xl",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Type Badge */}
      <Badge
        variant="secondary"
        className="absolute top-2 left-2 z-10 gap-1 text-xs bg-background/80 backdrop-blur-sm"
      >
        <span>{getTypeIcon()}</span>
        <span>{getTypeLabel()}</span>
      </Badge>

      {/* Image Container */}
      <div className="relative bg-muted/30 rounded-lg overflow-hidden">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-pulse w-full h-48 bg-muted" />
          </div>
        )}

        <img
          src={illustration.imageUrl}
          alt={illustration.altText || illustration.caption}
          className={cn(
            "w-full h-auto object-contain transition-opacity duration-300",
            !imageLoaded && "opacity-0",
            imageLoaded && "opacity-100"
          )}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          loading="lazy"
        />

        {/* Hover Overlay with Actions */}
        <motion.div
          className="absolute inset-0 bg-black/50 flex items-center justify-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ pointerEvents: isHovered ? 'auto' : 'none' }}
        >
          <Button
            size="sm"
            variant="secondary"
            onClick={onExpand}
            className="gap-1.5"
          >
            <ZoomIn className="h-4 w-4" />
            Expand
          </Button>

          {hasExplain && onExplain && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onExplain}
              className="gap-1.5"
            >
              {bookType === 'children' ? (
                <>
                  <HelpCircle className="h-4 w-4" />
                  What's This?
                </>
              ) : (
                <>
                  <Lightbulb className="h-4 w-4" />
                  Explain
                </>
              )}
            </Button>
          )}
        </motion.div>
      </div>

      {/* Caption & Learning Objective */}
      <figcaption className="mt-2 px-2 space-y-1">
        {illustration.caption && (
          <p className="text-sm text-center text-muted-foreground">
            {illustration.caption}
          </p>
        )}

        {illustration.learningObjective && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-primary/70">
            <BookOpen className="h-3 w-3" />
            <span>{illustration.learningObjective}</span>
          </div>
        )}
      </figcaption>
    </motion.figure>
  );
}

export default IllustratedImage;
