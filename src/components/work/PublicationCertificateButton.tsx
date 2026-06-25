import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  publicationId?: string | null;
  certificateId?: string | null;
  filenameHint?: string | null;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  label?: string;
}

/**
 * PublicationCertificateButton
 *
 * Downloads the Publication Certificate PDF for a given publication or
 * certificate ID. Public endpoint — no auth required.
 */
export function PublicationCertificateButton({
  publicationId, certificateId, filenameHint, variant = "outline", size = "default",
  label = "Download Certificate",
}: Props) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    if (!publicationId && !certificateId) {
      toast.error("No publication or certificate id");
      return;
    }
    setLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const params = new URLSearchParams();
      if (publicationId) params.set("publication_id", publicationId);
      if (certificateId) params.set("certificate_id", certificateId);
      const url = `https://${projectId}.supabase.co/functions/v1/generate-publication-certificate?${params.toString()}`;
      const r = await fetch(url, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "" },
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `Failed (${r.status})`);
      }
      const blob = await r.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filenameHint
        ? `${filenameHint}.pdf`
        : `publication-certificate.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
      {label}
    </Button>
  );
}
