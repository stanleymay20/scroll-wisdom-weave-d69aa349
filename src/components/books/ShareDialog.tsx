import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Share2, Copy, Check, Twitter, Facebook, Linkedin, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface ShareDialogProps {
  title: string;
  bookId: string;
  description?: string;
}

export function ShareDialog({ title, bookId, description }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();
  
  const bookUrl = `${window.location.origin}/book/${bookId}`;
  const shareText = t('share.checkOut').replace('{title}', title);
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(bookUrl);
      setCopied(true);
      toast({ title: t('share.copied') });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: t('share.failed'), variant: "destructive" });
    }
  };
  
  const shareToTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(bookUrl)}`;
    window.open(url, "_blank", "width=550,height=420");
  };
  
  const shareToFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(bookUrl)}`;
    window.open(url, "_blank", "width=550,height=420");
  };
  
  const shareToLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(bookUrl)}`;
    window.open(url, "_blank", "width=550,height=420");
  };
  
  const shareViaEmail = () => {
    const subject = encodeURIComponent(`Check out: ${title}`);
    const body = encodeURIComponent(`I thought you might enjoy this book from ScrollLibrary™:\n\n${title}\n\n${description || ""}\n\nRead it here: ${bookUrl}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="muted" size="lg">
          <Share2 className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('share.title')}</DialogTitle>
          <DialogDescription>
            {t('share.description').replace('{title}', title)}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          {/* Copy Link */}
          <div className="flex items-center gap-2">
            <Input
              value={bookUrl}
              readOnly
              className="bg-muted/50"
            />
            <Button
              variant="gold-outline"
              size="icon"
              onClick={copyToClipboard}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          {/* Social Share Buttons */}
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Button
              variant="outline"
              size="lg"
              onClick={shareToTwitter}
              className="flex-1 min-w-[120px]"
            >
              <Twitter className="h-4 w-4 mr-2" />
              Twitter
            </Button>
            
            <Button
              variant="outline"
              size="lg"
              onClick={shareToFacebook}
              className="flex-1 min-w-[120px]"
            >
              <Facebook className="h-4 w-4 mr-2" />
              Facebook
            </Button>
            
            <Button
              variant="outline"
              size="lg"
              onClick={shareToLinkedIn}
              className="flex-1 min-w-[120px]"
            >
              <Linkedin className="h-4 w-4 mr-2" />
              LinkedIn
            </Button>
            
            <Button
              variant="outline"
              size="lg"
              onClick={shareViaEmail}
              className="flex-1 min-w-[120px]"
            >
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
