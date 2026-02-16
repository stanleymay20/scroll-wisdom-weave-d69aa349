import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  HardDrive, Trash2, BookOpen, Volume2, Image, FileText, 
  Loader2, CheckCircle, Download
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CacheCategory {
  name: string;
  displayName: string;
  icon: React.ReactNode;
  size: number;
  itemCount: number;
}

interface StorageManagerProps {
  onClear?: () => void;
}

export function StorageManager({ onClear }: StorageManagerProps) {
  const { toast } = useToast();
  const [storageInfo, setStorageInfo] = useState({ usage: 0, quota: 0 });
  const [cacheCategories, setCacheCategories] = useState<CacheCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [clearing, setClearing] = useState<string | null>(null);
  const [offlineBooks, setOfflineBooks] = useState<{ id: string; title: string; offline: boolean }[]>([]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const loadStorageInfo = async () => {
    setIsLoading(true);
    try {
      // Get storage estimate
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        setStorageInfo({
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
        });
      }

      // Get cache categories
      const cacheNames = await caches.keys();
      const categories: CacheCategory[] = [];
      
      const categoryMap: Record<string, { displayName: string; icon: React.ReactNode }> = {
        'chapters-cache': { displayName: 'Chapters', icon: <BookOpen className="h-4 w-4" /> },
        'book-chapters-cache': { displayName: 'Book Content', icon: <BookOpen className="h-4 w-4" /> },
        'audio-cache': { displayName: 'Audio Files', icon: <Volume2 className="h-4 w-4" /> },
        'images-cache': { displayName: 'Images', icon: <Image className="h-4 w-4" /> },
        'exports-cache': { displayName: 'Exports (PDF/EPUB)', icon: <FileText className="h-4 w-4" /> },
        'books-cache': { displayName: 'Book Metadata', icon: <BookOpen className="h-4 w-4" /> },
        'user-library-cache': { displayName: 'Library Data', icon: <BookOpen className="h-4 w-4" /> },
      };

      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        const mapping = categoryMap[name] || { displayName: name, icon: <HardDrive className="h-4 w-4" /> };
        
        // Estimate size (rough approximation based on item count)
        const estimatedSize = keys.length * 50000; // ~50KB per cached item average
        
        categories.push({
          name,
          displayName: mapping.displayName,
          icon: mapping.icon,
          size: estimatedSize,
          itemCount: keys.length,
        });
      }

      setCacheCategories(categories.filter(c => c.itemCount > 0));

      // Load user's books for offline toggle
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: library } = await supabase
          .from("user_library")
          .select("book_id, books(id, title)")
          .eq("user_id", user.id)
          .limit(20);

        if (library) {
          const offlineStatus = localStorage.getItem('offline-books');
          const offlineBookIds = offlineStatus ? JSON.parse(offlineStatus) : [];
          
          setOfflineBooks(
            library
              .filter(item => item.books)
              .map(item => ({
                id: (item.books as any).id,
                title: (item.books as any).title,
                offline: offlineBookIds.includes((item.books as any).id),
              }))
          );
        }
      }
    } catch (error) {
      console.error('Error loading storage info:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadStorageInfo();
  }, []);

  const clearCache = async (cacheName: string) => {
    setClearing(cacheName);
    try {
      await caches.delete(cacheName);
      toast({
        title: "Cache Cleared",
        description: `${cacheName} cache has been cleared successfully.`,
      });
      await loadStorageInfo();
      onClear?.();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear cache.",
        variant: "destructive",
      });
    }
    setClearing(null);
  };

  const clearAllCaches = async () => {
    setClearing('all');
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      toast({
        title: "All Caches Cleared",
        description: "All cached data has been cleared successfully.",
      });
      await loadStorageInfo();
      onClear?.();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear all caches.",
        variant: "destructive",
      });
    }
    setClearing(null);
  };

  const toggleOfflineBook = async (bookId: string, enabled: boolean) => {
    const offlineStatus = localStorage.getItem('offline-books');
    let offlineBookIds: string[] = offlineStatus ? JSON.parse(offlineStatus) : [];

    if (enabled) {
      if (!offlineBookIds.includes(bookId)) {
        offlineBookIds.push(bookId);
      }
      // Prefetch book data and persist to IndexedDB
      try {
        const { data: book } = await supabase
          .from("books")
          .select("id, title, cover_image_url")
          .eq("id", bookId)
          .single();

        const { data: chapters } = await supabase
          .from("chapters")
          .select("*")
          .eq("book_id", bookId);
        
        if (chapters && chapters.length > 0) {
          // Persist each chapter to IndexedDB for true offline access
          const { offlineStorage } = await import("@/lib/offlineStorage");
          await Promise.all(
            chapters.map(ch =>
              offlineStorage.cacheChapter({
                id: ch.id,
                bookId: ch.book_id,
                title: ch.title,
                content: ch.content || '',
                chapterNumber: ch.chapter_number,
              })
            )
          );
          // Also cache book metadata
          if (book) {
            await offlineStorage.cacheBook({
              id: book.id,
              title: book.title,
              coverUrl: book.cover_image_url || undefined,
              chapters: chapters.map(ch => ({
                id: ch.id,
                bookId: ch.book_id,
                title: ch.title,
                content: ch.content || '',
                chapterNumber: ch.chapter_number,
                cachedAt: Date.now(),
              })),
            });
          }
        }

        toast({
          title: "Book Downloaded",
          description: "This book is now available offline.",
        });
      } catch (error) {
        toast({
          title: "Download Failed",
          description: "Could not download book for offline use.",
          variant: "destructive",
        });
      }
    } else {
      offlineBookIds = offlineBookIds.filter(id => id !== bookId);
      toast({
        title: "Offline Access Removed",
        description: "This book will no longer be stored for offline use.",
      });
    }

    localStorage.setItem('offline-books', JSON.stringify(offlineBookIds));
    setOfflineBooks(prev => prev.map(b => b.id === bookId ? { ...b, offline: enabled } : b));
  };

  if (isLoading) {
    return (
      <Card className="bg-gradient-card border-border/50">
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const usagePercent = storageInfo.quota > 0 ? (storageInfo.usage / storageInfo.quota) * 100 : 0;

  return (
    <Card className="bg-gradient-card border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          Storage Manager
        </CardTitle>
        <CardDescription>
          Manage cached content for offline access
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Storage Usage Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Storage Used</span>
            <span className="text-muted-foreground">
              {formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.quota)}
            </span>
          </div>
          <Progress value={usagePercent} className="h-3" />
        </div>

        <Separator className="bg-border/50" />

        {/* Cache Categories */}
        {cacheCategories.length > 0 && (
          <div className="space-y-4">
            <Label>Cached Content</Label>
            <div className="space-y-2">
              {cacheCategories.map((category) => (
                <div
                  key={category.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    {category.icon}
                    <div>
                      <p className="font-medium text-sm">{category.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {category.itemCount} items • ~{formatBytes(category.size)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearCache(category.name)}
                    disabled={clearing === category.name}
                  >
                    {clearing === category.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {cacheCategories.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No cached content yet. Browse books to cache them for offline use.
          </p>
        )}

        <Separator className="bg-border/50" />

        {/* Offline Books Toggle */}
        {offlineBooks.length > 0 && (
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Download Books for Offline
            </Label>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {offlineBooks.map((book) => (
                <div
                  key={book.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <span className="text-sm font-medium truncate max-w-[200px]">{book.title}</span>
                  <Switch
                    checked={book.offline}
                    onCheckedChange={(checked) => toggleOfflineBook(book.id, checked)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator className="bg-border/50" />

        {/* Clear All Button */}
        <Button
          variant="destructive"
          className="w-full"
          onClick={clearAllCaches}
          disabled={clearing === 'all' || cacheCategories.length === 0}
        >
          {clearing === 'all' ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Clearing...
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Cached Data
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
