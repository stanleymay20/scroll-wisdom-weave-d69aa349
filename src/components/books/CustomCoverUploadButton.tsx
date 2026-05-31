import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CustomCoverUploadButtonProps {
  bookId: string;
  userId: string;
  onUploaded: (publicUrl: string) => void;
  size?: "sm" | "default";
  className?: string;
  label?: string;
}

export function CustomCoverUploadButton({
  bookId,
  userId,
  onUploaded,
  size = "sm",
  className,
  label = "Upload cover",
}: CustomCoverUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Select a JPG, PNG or WebP image.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB.", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/covers/${bookId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("book-images")
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from("book-images").getPublicUrl(path);

      const { error: dbErr } = await supabase
        .from("books")
        .update({ cover_image_url: publicUrl })
        .eq("id", bookId);
      if (dbErr) throw dbErr;

      onUploaded(publicUrl);
      toast({ title: "Cover updated", description: "Your custom cover is live." });
    } catch (err) {
      console.error("Cover upload failed", err);
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload cover.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={className}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5 mr-1.5" />
        )}
        {label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </>
  );
}
