import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Book, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BookCardProps {
  id: string;
  title: string;
  description?: string;
  category: string;
  coverImageUrl?: string;
  totalChapters?: number;
  index?: number;
}

export function BookCard({
  id,
  title,
  description,
  category,
  coverImageUrl,
  totalChapters = 0,
  index = 0,
}: BookCardProps) {
  const categoryFormatted = category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
    >
      <Link to={`/book/${id}`} className="block group">
        <div className="relative bg-gradient-card rounded-xl overflow-hidden border border-border/50 book-card-hover shadow-card">
          {/* Book Cover */}
          <div className="aspect-[3/4] relative overflow-hidden">
            {coverImageUrl ? (
              <img
                src={coverImageUrl}
                alt={title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-scroll-indigo to-scroll-indigo-deep flex items-center justify-center">
                <Book className="h-16 w-16 text-scroll-gold/30" />
              </div>
            )}
            
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60" />
            
            {/* Category badge */}
            <div className="absolute top-3 left-3">
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-scroll-gold/20 text-scroll-gold border border-scroll-gold/30 backdrop-blur-sm">
                {categoryFormatted}
              </span>
            </div>

            {/* Bookmark button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-background/50 backdrop-blur-sm hover:bg-background/80"
              onClick={(e) => {
                e.preventDefault();
                // TODO: Add to library
              }}
            >
              <Bookmark className="h-4 w-4" />
            </Button>
          </div>

          {/* Book Info */}
          <div className="p-4 space-y-2">
            <h3 className="font-display text-lg font-semibold line-clamp-2 text-foreground group-hover:text-scroll-gold transition-colors">
              {title}
            </h3>
            {description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {description}
              </p>
            )}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                {totalChapters} {totalChapters === 1 ? "Chapter" : "Chapters"}
              </span>
              <span className="text-xs text-scroll-gold font-medium">
                Read Now →
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
