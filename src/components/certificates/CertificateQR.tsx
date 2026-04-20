/**
 * CertificateQR — small QR code badge that encodes the public verification URL.
 * Render on the verification page so employers can deep-link into the cert from print/PDF.
 */
import { QRCodeSVG } from "qrcode.react";
import { Card } from "@/components/ui/card";
import { ScanLine } from "lucide-react";

interface CertificateQRProps {
  certificateNumber: string;
  size?: number;
  showLabel?: boolean;
}

export function CertificateQR({ certificateNumber, size = 128, showLabel = true }: CertificateQRProps) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/certificate/${encodeURIComponent(certificateNumber)}`
      : `/certificate/${encodeURIComponent(certificateNumber)}`;

  return (
    <Card className="inline-flex flex-col items-center p-3 gap-2 bg-background">
      <QRCodeSVG
        value={url}
        size={size}
        level="M"
        includeMargin={false}
        className="rounded"
      />
      {showLabel && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <ScanLine className="h-3 w-3" />
          Scan to verify
        </p>
      )}
    </Card>
  );
}
