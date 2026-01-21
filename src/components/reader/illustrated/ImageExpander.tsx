/**
 * IMAGE EXPANDER COMPONENT
 * 
 * Full-screen modal for viewing and interacting with illustrations
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn, ZoomOut, Lightbulb, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ImageExpanderProps } from './types';

export function ImageExpander({
  illustration,
  isOpen,
  onClose,
  onExplain,
  onStepThrough,
}: ImageExpanderProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
    if (zoomLevel <= 1) {
      setPosition({ x: 0, y: 0 });
    }
  };

  const handleReset = () => {
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleDownload = () => {
    if (illustration.imageUrl) {
      const link = document.createElement('a');
      link.href = illustration.imageUrl;
      link.download = `${illustration.caption || 'illustration'}.png`;
      link.click();
    }
  };

  const getTypeColor = () => {
    switch (illustration.type) {
      case 'chart': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      case 'diagram': return 'bg-purple-500/10 text-purple-500 border-purple-500/30';
      case 'technical': return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
      case 'illustration': return 'bg-green-500/10 text-green-500 border-green-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          {/* Header Controls */}
          <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={cn("capitalize", getTypeColor())}>
                {illustration.type}
              </Badge>
              {illustration.subType && (
                <Badge variant="outline" className="bg-muted/50">
                  {illustration.subType}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
                className="text-white hover:bg-white/20"
                disabled={zoomLevel <= 0.5}
              >
                <ZoomOut className="h-5 w-5" />
              </Button>
              <span className="text-white text-sm min-w-[4rem] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
                className="text-white hover:bg-white/20"
                disabled={zoomLevel >= 3}
              >
                <ZoomIn className="h-5 w-5" />
              </Button>
              <div className="w-px h-6 bg-white/20 mx-2" />
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                className="text-white hover:bg-white/20"
              >
                <Download className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                className="text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Image Container */}
          <motion.div
            className="relative max-w-[90vw] max-h-[80vh] overflow-hidden cursor-move"
            onClick={(e) => e.stopPropagation()}
            drag={zoomLevel > 1}
            dragConstraints={{
              left: -200 * zoomLevel,
              right: 200 * zoomLevel,
              top: -200 * zoomLevel,
              bottom: 200 * zoomLevel,
            }}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
            style={{
              x: position.x,
              y: position.y,
            }}
          >
            <motion.img
              src={illustration.imageUrl}
              alt={illustration.altText || illustration.caption}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
              initial={{ scale: 0.9 }}
              animate={{ scale: zoomLevel }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onDoubleClick={handleReset}
            />
          </motion.div>

          {/* Footer with Caption & Actions */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="max-w-3xl mx-auto text-center space-y-3">
              {illustration.caption && (
                <p className="text-white text-lg">
                  {illustration.caption}
                </p>
              )}

              {illustration.learningObjective && (
                <p className="text-white/70 text-sm">
                  📚 {illustration.learningObjective}
                </p>
              )}

              <div className="flex items-center justify-center gap-3 pt-2">
                {onExplain && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onExplain(); }}
                    className="gap-1.5"
                  >
                    <Lightbulb className="h-4 w-4" />
                    Explain This
                  </Button>
                )}

                {onStepThrough && illustration.type === 'technical' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); onStepThrough(); }}
                    className="gap-1.5"
                  >
                    <ChevronRight className="h-4 w-4" />
                    Step Through
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Zoom hint */}
          {zoomLevel === 1 && (
            <motion.p
              className="absolute bottom-24 left-1/2 -translate-x-1/2 text-white/50 text-xs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              Double-click to reset zoom • Scroll or buttons to zoom
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ImageExpander;
