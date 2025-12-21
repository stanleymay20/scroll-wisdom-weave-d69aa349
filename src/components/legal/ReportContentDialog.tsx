import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Flag, Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

interface ReportContentDialogProps {
  contentType: "book" | "chapter" | "comment";
  contentId: string;
  contentTitle?: string;
  trigger?: React.ReactNode;
}

export function ReportContentDialog({ 
  contentType, 
  contentId, 
  contentTitle,
  trigger 
}: ReportContentDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const reportReasons = [
    { value: "hate_speech", label: t('report.hateSpeech') },
    { value: "explicit", label: t('report.explicit') },
    { value: "copyright", label: t('report.copyright') },
    { value: "misinformation", label: t('report.misinformation') },
    { value: "violence", label: t('report.violence') },
    { value: "spam", label: t('report.spam') },
    { value: "other", label: t('report.other') },
  ];

  const handleSubmit = async () => {
    if (!reason) {
      toast({
        title: t('report.selectReason'),
        description: t('report.selectReasonDesc'),
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("content_reports")
        .insert({
          reporter_id: user?.id || null,
          content_type: contentType,
          content_id: contentId,
          reason,
          description: description || null,
        });

      if (error) throw error;

      setIsSubmitted(true);
      toast({
        title: t('report.submitted'),
        description: t('report.submittedDesc'),
      });

      setTimeout(() => {
        setOpen(false);
        setIsSubmitted(false);
        setReason("");
        setDescription("");
      }, 2000);
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('report.submitError'),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Flag className="h-4 w-4 mr-2" />
            {t('common.report')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            {t('report.title')}
          </DialogTitle>
          <DialogDescription>
            {contentTitle 
              ? t('report.description').replace('{title}', contentTitle)
              : t('report.descriptionGeneric')
            }
          </DialogDescription>
        </DialogHeader>

        {isSubmitted ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p className="text-foreground font-medium">{t('report.reportSubmitted')}</p>
            <p className="text-sm text-muted-foreground">{t('report.teamReview')}</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>{t('report.whyReporting')}</Label>
              <RadioGroup value={reason} onValueChange={setReason}>
                {reportReasons.map((item) => (
                  <div key={item.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={item.value} id={item.value} />
                    <Label htmlFor={item.value} className="font-normal cursor-pointer">
                      {item.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('report.additionalDetails')}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('report.detailsPlaceholder')}
                className="min-h-[80px] bg-muted/50 border-border/50"
              />
            </div>
          </div>
        )}

        {!isSubmitted && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleSubmit} 
              disabled={isSubmitting || !reason}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.submitting')}
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4 mr-2" />
                  {t('report.submitReport')}
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
