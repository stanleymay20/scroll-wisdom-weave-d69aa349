import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Image, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CoverUploadProps {
  onCoverSelect: (coverData: string | null) => void;
  currentCover: string | null;
}

export function CoverUpload({ onCoverSelect, currentCover }: CoverUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentCover);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file (JPG, PNG)", variant: "destructive" });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select an image under 5MB", variant: "destructive" });
      return;
    }

    setIsProcessing(true);

    try {
      // Convert to base64 and resize
      const base64 = await fileToBase64(file);
      const resized = await resizeImage(base64, 800, 1200);
      
      setPreview(resized);
      onCoverSelect(resized);
      
      toast({ title: "Cover uploaded", description: "Your custom cover has been selected" });
    } catch (error) {
      toast({ title: "Upload failed", description: "Failed to process the image", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };

  const resizeImage = (base64: string, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Calculate book aspect ratio (3:4)
        const targetRatio = 3 / 4;
        const currentRatio = width / height;

        if (currentRatio > targetRatio) {
          width = height * targetRatio;
        } else {
          height = width / targetRatio;
        }

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
    });
  };

  const handleRemove = () => {
    setPreview(null);
    onCoverSelect(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card className="bg-muted/30 border-border/50 border-dashed">
      <CardContent className="p-4">
        {preview ? (
          <div className="relative">
            <img src={preview} alt="Book cover preview" className="w-full aspect-[3/4] object-cover rounded-lg" />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2"
              onClick={handleRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center py-8 cursor-pointer hover:bg-muted/50 rounded-lg transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {isProcessing ? (
              <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
            ) : (
              <>
                <div className="bg-primary/10 p-3 rounded-full mb-3">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <p className="font-medium text-foreground mb-1">Upload Custom Cover</p>
                <p className="text-xs text-muted-foreground text-center">
                  JPG or PNG, max 5MB<br />Recommended: 800x1200px
                </p>
              </>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />
      </CardContent>
    </Card>
  );
}