import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { User, Feather, Bot, Building2, Eye, Lock } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { supabase } from "@/integrations/supabase/client";

export type AuthorMode = "user_name" | "pen_name" | "ai" | "hidden";

interface AuthorImprintProps {
  authorMode: AuthorMode;
  authorDisplayName: string;
  penName: string;
  publisherImprint: string;
  onAuthorModeChange: (mode: AuthorMode) => void;
  onAuthorDisplayNameChange: (name: string) => void;
  onPenNameChange: (name: string) => void;
  onPublisherImprintChange: (imprint: string) => void;
  disabled?: boolean;
}

export function AuthorImprint({
  authorMode,
  authorDisplayName,
  penName,
  publisherImprint,
  onAuthorModeChange,
  onAuthorDisplayNameChange,
  onPenNameChange,
  onPublisherImprintChange,
  disabled = false,
}: AuthorImprintProps) {
  const { tier } = useSubscription();
  const { isAdmin, isProphet, isPremium, isStudent } = useEntitlements();
  const [profileName, setProfileName] = useState<string>("");

  // Fetch user's profile name
  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        
        if (profile?.full_name) {
          setProfileName(profile.full_name);
        }
      }
    };
    fetchProfile();
  }, []);

  // Determine what options are available based on tier
  const canUsePenName = isPremium || isStudent || isProphet || isAdmin;
  const canUsePublisherImprint = isProphet || isAdmin;

  // Resolve the author display name for preview
  const resolvedAuthorName = (() => {
    switch (authorMode) {
      case "user_name":
        return authorDisplayName || profileName || "Your Name";
      case "pen_name":
        return penName || "Your Pen Name";
      case "ai":
        return "ScrollAuthorGPT";
      case "hidden":
        return "Anonymous";
      default:
        return "ScrollAuthorGPT";
    }
  })();

  return (
    <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-scroll-gold" />
        <Label className="text-foreground font-medium">Author & Imprint</Label>
      </div>

      <RadioGroup
        value={authorMode}
        onValueChange={(v) => onAuthorModeChange(v as AuthorMode)}
        className="space-y-2"
        disabled={disabled}
      >
        {/* Option: Use profile name */}
        <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="user_name" id="author-user" />
          <Label htmlFor="author-user" className="flex items-center gap-2 cursor-pointer flex-1">
            <User className="h-4 w-4 text-primary" />
            <span>Use my profile name</span>
          </Label>
        </div>
        
        {authorMode === "user_name" && (
          <div className="ml-8 space-y-2">
            <Input
              value={authorDisplayName}
              onChange={(e) => onAuthorDisplayNameChange(e.target.value)}
              placeholder={profileName || "Your name"}
              disabled={disabled}
              className="bg-background/50"
            />
          </div>
        )}

        {/* Option: Pen name (Premium+) */}
        <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="pen_name" id="author-pen" disabled={!canUsePenName} />
          <Label 
            htmlFor="author-pen" 
            className={`flex items-center gap-2 cursor-pointer flex-1 ${!canUsePenName ? 'opacity-50' : ''}`}
          >
            <Feather className="h-4 w-4 text-amber-500" />
            <span>Use pen name</span>
            {!canUsePenName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" /> Premium+
              </span>
            )}
          </Label>
        </div>
        
        {authorMode === "pen_name" && canUsePenName && (
          <div className="ml-8 space-y-2">
            <Input
              value={penName}
              onChange={(e) => onPenNameChange(e.target.value)}
              placeholder="Your pen name"
              disabled={disabled}
              className="bg-background/50"
            />
          </div>
        )}

        {/* Option: AI Author */}
        <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="ai" id="author-ai" />
          <Label htmlFor="author-ai" className="flex items-center gap-2 cursor-pointer flex-1">
            <Bot className="h-4 w-4 text-green-500" />
            <span>AI Author (ScrollAuthorGPT)</span>
          </Label>
        </div>

        {/* Option: Hidden/Anonymous */}
        <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
          <RadioGroupItem value="hidden" id="author-hidden" />
          <Label htmlFor="author-hidden" className="flex items-center gap-2 cursor-pointer flex-1">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span>Anonymous</span>
          </Label>
        </div>
      </RadioGroup>

      {/* Publisher Imprint (Prophet/Admin only) */}
      {canUsePublisherImprint && (
        <div className="space-y-2 pt-2 border-t border-border/30">
          <Label className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-purple-500" />
            Publisher Imprint (Optional)
          </Label>
          <Input
            value={publisherImprint}
            onChange={(e) => onPublisherImprintChange(e.target.value)}
            placeholder="e.g., Scroll Publishing House"
            disabled={disabled}
            className="bg-background/50"
          />
        </div>
      )}

      {/* Preview */}
      <div className="pt-3 border-t border-border/30">
        <p className="text-sm text-muted-foreground">
          Preview: <span className="text-foreground font-medium">By {resolvedAuthorName}</span>
          {publisherImprint && (
            <span className="text-muted-foreground"> • Published by {publisherImprint}</span>
          )}
        </p>
      </div>
    </div>
  );
}
