import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Flag, Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ReportContentDialogProps {
  contentType: "book" | "chapter" | "comment";
  contentId: string;
  contentTitle?: string;
  trigger?: React.ReactNode;
}

const reportReasons = [
  { value: "hate_speech", label: "Hate speech or discrimination" },
  { value: "explicit", label: "Explicit or inappropriate content" },
  { value: "copyright", label: "Copyright infringement" },
  { value: "misinformation", label: "Misinformation or false claims" },
  { value: "violence", label: "Violence or harmful content" },
  { value: "spam", label: "Spam or misleading" },
  { value: "other", label: "Other" },
];

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

  const handleSubmit = async () => {
    if (!reason) {
      toast({
        title: "Please select a reason",
        description: "Choose why you're reporting this content",
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
        title: "Report submitted",
        description: "Thank you for helping keep ScrollLibrary safe.",
      });

      setTimeout(() => {
        setOpen(false);
        setIsSubmitted(false);
        setReason("");
        setDescription("");
      }, 2000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit report. Please try again.",
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
            Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Report Content
          </DialogTitle>
          <DialogDescription>
            {contentTitle 
              ? `Report "${contentTitle}" for policy violation`
              : "Report this content for policy violation"
            }
          </DialogDescription>
        </DialogHeader>

        {isSubmitted ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p className="text-foreground font-medium">Report Submitted</p>
            <p className="text-sm text-muted-foreground">Our team will review this content.</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Why are you reporting this?</Label>
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
              <Label htmlFor="description">Additional details (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide more context about your report..."
                className="min-h-[80px] bg-muted/50 border-border/50"
              />
            </div>
          </div>
        )}

        {!isSubmitted && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleSubmit} 
              disabled={isSubmitting || !reason}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4 mr-2" />
                  Submit Report
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}