import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Book, Bookmark, ChevronRight } from "lucide-react";
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
      transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.4, ease: "easeOut" }}
      className="h-full"
    >
      <Link to={`/book/${id}`} className="block group h-full">
        <div className="relative h-full bg-gradient-card rounded-xl overflow-hidden border border-border/50 book-card-hover shadow-card flex flex-col">
          {/* Book Cover */}
          <div className="aspect-[3/4] relative overflow-hidden flex-shrink-0">
            {coverImageUrl ? (
              <img
                src={coverImageUrl}
                alt={title}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                <Book className="h-16 w-16 text-primary/20" />
              </div>
            )}
            
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            {/* Category badge */}
            <div className="absolute top-3 left-3 z-10">
              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-background/80 text-foreground backdrop-blur-md border border-border/50 shadow-sm">
                {categoryFormatted}
              </span>
            </div>

            {/* Bookmark button */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-background/80 backdrop-blur-md hover:bg-background shadow-sm z-10"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // TODO: Add to library
              }}
              aria-label="Add to library"
            >
              <Bookmark className="h-4 w-4" />
            </Button>
          </div>

          {/* Book Info */}
          <div className="p-4 space-y-2 flex-1 flex flex-col">
            <h3 className="font-display text-base font-semibold line-clamp-2 text-foreground group-hover:text-primary transition-colors leading-tight">
              {title}
            </h3>
            {description && (
              <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                {description}
              </p>
            )}
            <div className="flex items-center justify-between pt-2 mt-auto">
              <span className="text-xs text-muted-foreground">
                {totalChapters} {totalChapters === 1 ? "Chapter" : "Chapters"}
              </span>
              <span className="text-xs text-primary font-medium group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                Read <ChevronRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
