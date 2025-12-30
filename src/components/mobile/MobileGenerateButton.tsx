import { useState } from "react";
import { Plus, BookOpen, Image, FileText, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const BOOK_TYPES = [
  { id: "text", label: "Text Book", icon: BookOpen, description: "Standard chapters" },
  { id: "comic", label: "Comic", icon: Image, description: "Visual story" },
  { id: "workbook", label: "Workbook", icon: FileText, description: "Exercises & quizzes" },
];

export function MobileGenerateButton() {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const navigate = useNavigate();

  const handleGenerate = () => {
    if (!selectedType || !title.trim()) return;
    
    // Navigate to generate page with pre-filled params
    const params = new URLSearchParams({
      type: selectedType,
      title: title.trim(),
    });
    navigate(`/generate?${params.toString()}`);
    setOpen(false);
    setSelectedType(null);
    setTitle("");
  };

  return (
    <>
      {/* Floating Button */}
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg shadow-scroll-gold/30 bg-scroll-gold hover:bg-scroll-gold-light text-background md:hidden"
        aria-label="Generate new book"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center font-display text-xl">
              Create New Book
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Book Type Selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-muted-foreground">
                Choose type
              </label>
              <div className="grid grid-cols-3 gap-3">
                {BOOK_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = selectedType === type.id;
                  
                  return (
                    <button
                      key={type.id}
                      onClick={() => setSelectedType(type.id)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
                        isSelected
                          ? "border-scroll-gold bg-scroll-gold/10"
                          : "border-border hover:border-scroll-gold/50"
                      )}
                    >
                      <Icon className={cn(
                        "h-6 w-6",
                        isSelected ? "text-scroll-gold" : "text-muted-foreground"
                      )} />
                      <span className={cn(
                        "text-xs font-medium",
                        isSelected ? "text-scroll-gold" : "text-foreground"
                      )}>
                        {type.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title Input */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-muted-foreground">
                Book title
              </label>
              <Input
                placeholder="Enter your book title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={!selectedType || !title.trim()}
              className="w-full h-12 rounded-xl bg-scroll-gold hover:bg-scroll-gold-light text-background font-medium"
            >
              Generate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
