import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Book, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileBookCardProps {
  id: string;
  title: string;
  coverImageUrl?: string;
  category?: string;
  bookType?: string;
  /** If provided, shows Resume Reading button */
  lastReadChapter?: number | null;
  progressPercent?: number | null;
}

export const MobileBookCard = React.forwardRef<HTMLAnchorElement, MobileBookCardProps>(
  ({ id, title, coverImageUrl, bookType, lastReadChapter, progressPercent }, ref) => {
    const navigate = useNavigate();
    
    // Determine tag based on book type
    const getTag = () => {
      if (bookType === "comic") return "Comic";
      if (bookType === "workbook") return "Workbook";
      return null;
    };
    
    const tag = getTag();
    const hasProgress = lastReadChapter && lastReadChapter > 0 && progressPercent && progressPercent > 0 && progressPercent < 100;

    const handleResumeReading = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(`/read/${id}/${lastReadChapter}`);
    };

    return (
      <Link ref={ref} to={`/book/${id}`} className="block group">
        <div className="relative">
          {/* Cover Image */}
          <div className="aspect-[3/4] rounded-xl overflow-hidden bg-muted shadow-md group-active:scale-[0.98] transition-transform duration-150">
            {coverImageUrl ? (
              <img
                src={coverImageUrl}
                alt={title}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                <Book className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
            
            {/* Resume Reading Button Overlay */}
            {hasProgress && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5 bg-scroll-gold text-background hover:bg-scroll-gold-light shadow-lg"
                  onClick={handleResumeReading}
                >
                  <PlayCircle className="h-4 w-4" />
                  Resume
                </Button>
              </div>
            )}
          </div>

          {/* Tag Badge */}
          {tag && (
            <span className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-medium rounded-full bg-scroll-gold/90 text-background">
              {tag}
            </span>
          )}
          
          {/* Progress indicator */}
          {hasProgress && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
              <div 
                className="h-full bg-scroll-gold transition-all" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="mt-2 text-sm font-medium text-foreground line-clamp-2 leading-tight">
          {title}
        </h3>
      </Link>
    );
  }
);

MobileBookCard.displayName = "MobileBookCard";
