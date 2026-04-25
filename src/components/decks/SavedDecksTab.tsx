/**
 * Saved Decks Tab Component
 * Displays previously generated learning decks for quick access
 */

import { useState, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Presentation,
  Download,
  Eye,
  Trash2,
  Clock,
  Layers,
  FileDown,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { SavedDeck, useSavedDecks } from '@/hooks/useSavedDecks';
import { exportToPowerPoint, downloadBlob } from '@/lib/exportLearningDeck';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import SlideViewer from './SlideViewer';

interface SavedDecksTabProps {
  bookId: string;
  bookTitle: string;
  userId: string | null;
  className?: string;
}

const SavedDecksTab = forwardRef<HTMLDivElement, SavedDecksTabProps>(({
  bookId,
  bookTitle,
  userId,
  className,
}, ref) => {
  const { decks, isLoading, deleteDeck } = useSavedDecks({ bookId, userId });
  const [viewingDeck, setViewingDeck] = useState<SavedDeck | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleExport = async (deck: SavedDeck) => {
    setExportingId(deck.id);
    try {
      const blob = await exportToPowerPoint(deck.deck_data, bookTitle);
      const filename = `${deck.title.replace(/[^a-zA-Z0-9]/g, '_')}.pptx`;
      downloadBlob(blob, filename);
      toast({ title: 'Exported!', description: 'PowerPoint downloaded successfully.' });
    } catch (err) {
      console.error('[SavedDecks] Export error:', err);
      toast({ title: 'Export Failed', variant: 'destructive' });
    } finally {
      setExportingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (!userId) {
    return (
      <div ref={ref} className={cn('p-6 text-center', className)}>
        <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">Sign in to view saved decks</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div ref={ref} className={cn('p-6 text-center', className)}>
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-2">Loading saved decks...</p>
      </div>
    );
  }

  if (decks.length === 0) {
    return (
      <div ref={ref} className={cn('p-6 text-center', className)}>
        <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground mb-1">No saved decks yet</p>
        <p className="text-sm text-muted-foreground/70">
          Generate a learning deck and save it for quick access
        </p>
      </div>
    );
  }

  return (
    <div ref={ref} className={cn('space-y-3', className)}>
      <AnimatePresence mode="popLayout">
        {decks.map((deck, index) => (
          <motion.div
            key={deck.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ delay: index * 0.05 }}
            className="p-4 rounded-lg border bg-card hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Presentation className="h-4 w-4 text-primary shrink-0" />
                  <h4 className="font-medium truncate">{deck.title}</h4>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {deck.slide_count} slides
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(deck.created_at)}
                  </span>
                  <Badge variant={deck.tier === 'premium' ? 'default' : 'secondary'} className="text-[10px]">
                    {deck.tier === 'premium' ? '⭐ Premium' : 'Basic'}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewingDeck(deck)}
                  title="View slides"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleExport(deck)}
                  disabled={exportingId === deck.id}
                  title="Export PPTX"
                >
                  {exportingId === deck.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Delete deck" title="Delete deck">
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Saved Deck?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove "{deck.title}" from your saved decks.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteDeck(deck.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Slide Viewer Modal */}
      <AnimatePresence>
        {viewingDeck && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setViewingDeck(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-4xl max-h-[90vh] overflow-auto bg-card rounded-xl border shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <SlideViewer
                deck={viewingDeck.deck_data}
                onClose={() => setViewingDeck(null)}
                className="min-h-[500px]"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

SavedDecksTab.displayName = 'SavedDecksTab';

export default SavedDecksTab;
