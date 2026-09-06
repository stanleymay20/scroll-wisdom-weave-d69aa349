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

    const rightsConfirmed = window.confirm(
      "Publication rights confirmation:\n\nI confirm that I created/own this cover, or I have sufficient permission or license to publish and commercially distribute it.\n\nChoose OK only if this is true.",
    );
    if (!rightsConfirmed) {
      toast({
        title: "Cover not uploaded",
        description: "A custom cover can only be activated after publication rights are confirmed.",
      });
      if (inputRef.current) inputRef.current.value = "";
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

      // The browser does not write cover_image_url or provenance directly. The
      // server validates ownership + storage path, records the rights attestation,
      // then activates this exact URL on the book.
      const { data, error } = await supabase.functions.invoke("register-custom-cover", {
        body: {
          bookId,
          assetUrl: publicUrl,
          confirmPublicationRights: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (typeof data?.coverUrl !== "string" || !data.coverUrl) {
        throw new Error("Server did not confirm the registered cover URL.");
      }

      onUploaded(data.coverUrl);
      toast({
        title: "Cover updated",
        description: "Your custom cover is active and its publication-rights attestation was recorded.",
      });
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
