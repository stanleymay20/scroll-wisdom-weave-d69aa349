/**
 * SCORM Export Dialog
 * ====================
 * Lets a book owner package their book (+ optional certificate) into a
 * SCORM 1.2 zip suitable for upload to Moodle, Canvas, Blackboard, etc.
 */
import { useState } from 'react';
import { Loader2, Download, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  buildScormPackage,
  downloadBlob,
  suggestedFilename,
  type ScormBook,
  type ScormChapter,
  type ScormCertificate,
} from '@/lib/scormExport';
import { logAudit } from '@/lib/auditLog';

interface ScormExportDialogProps {
  book: ScormBook;
  trigger?: React.ReactNode;
}

export function ScormExportDialog({ book, trigger }: ScormExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [includeCertificate, setIncludeCertificate] = useState(true);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const { data: chapters, error: chErr } = await supabase
        .from('chapters')
        .select('chapter_number,title,content')
        .eq('book_id', book.id)
        .order('chapter_number', { ascending: true });
      if (chErr) throw chErr;
      if (!chapters || chapters.length === 0) {
        toast.error('No chapters to export');
        return;
      }

      let certificate: ScormCertificate | null = null;
      if (includeCertificate) {
        const { data: cert } = await supabase
          .from('competency_certificates')
          .select('certificate_number,competency_level,issued_at,verification_hash')
          .eq('book_id', book.id)
          .is('revoked_at', null)
          .order('issued_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cert) {
          certificate = {
            certificate_number: cert.certificate_number,
            competency_level: cert.competency_level,
            issued_at: cert.issued_at,
            verification_hash: cert.verification_hash ?? undefined,
          };
        }
      }

      const blob = await buildScormPackage({
        book,
        chapters: chapters as ScormChapter[],
        certificate,
        verificationBaseUrl: 'https://scrolllibrary.org/certificate',
      });
      downloadBlob(blob, suggestedFilename(book));

      await logAudit({
        eventType: 'book.exported.scorm',
        resourceType: 'book',
        resourceId: book.id,
        severity: 'info',
        metadata: {
          chapters: chapters.length,
          includedCertificate: !!certificate,
        },
      }).catch(() => undefined);

      toast.success('SCORM package downloaded');
      setOpen(false);
    } catch (e) {
      console.error('SCORM export failed', e);
      toast.error('Export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Package className="mr-2 h-4 w-4" />
            Export SCORM
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export to LMS (SCORM 1.2)</DialogTitle>
          <DialogDescription>
            Download a SCORM 1.2 package you can upload to Moodle, Canvas, Blackboard,
            TalentLMS, or any SCORM-compatible LMS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-medium">{book.title}</div>
            {book.description && (
              <div className="text-muted-foreground line-clamp-2">{book.description}</div>
            )}
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="include-cert"
              checked={includeCertificate}
              onCheckedChange={(v) => setIncludeCertificate(v === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="include-cert" className="cursor-pointer">
                Include latest certificate
              </Label>
              <p className="text-xs text-muted-foreground">
                Adds your most recent valid competency certificate as the final SCO,
                with a public verification link.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Packaging…
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" /> Download SCORM zip
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
