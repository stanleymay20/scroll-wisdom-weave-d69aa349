import { Link } from "react-router-dom";
import { Book } from "lucide-react";

interface MobileBookCardProps {
  id: string;
  title: string;
  coverImageUrl?: string;
  category?: string;
  bookType?: string;
}

export function MobileBookCard({
  id,
  title,
  coverImageUrl,
  category,
  bookType,
}: MobileBookCardProps) {
  const categoryLabel = category?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  
  // Determine tag based on book type
  const getTag = () => {
    if (bookType === "comic") return "Comic";
    if (bookType === "workbook") return "Workbook";
    return null;
  };
  
  const tag = getTag();

  return (
    <Link to={`/book/${id}`} className="block group">
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
        </div>

        {/* Tag Badge */}
        {tag && (
          <span className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-medium rounded-full bg-scroll-gold/90 text-background">
            {tag}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="mt-2 text-sm font-medium text-foreground line-clamp-2 leading-tight">
        {title}
      </h3>
    </Link>
  );
}
