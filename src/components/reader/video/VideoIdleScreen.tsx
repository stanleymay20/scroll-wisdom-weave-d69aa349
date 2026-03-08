/**
 * Pre-generation CTA screen shown before video generation starts.
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface VideoIdleScreenProps {
  chapterTitle: string;
  themeIcon: string;
  themeLabel: string;
  onGenerate: () => void;
}

export function VideoIdleScreen({ chapterTitle, themeIcon, themeLabel, onGenerate }: VideoIdleScreenProps) {
  return (
    <div className="flex flex-col items-center gap-6 text-white p-8 text-center z-10">
      <div className="text-7xl">{themeIcon}</div>
      <h2 className="text-3xl font-bold tracking-tight">Cinematic Video Generator</h2>
      <p className="text-white/50 max-w-lg">
        Transform "{chapterTitle}" into a cinematic {themeLabel.toLowerCase()} video with
        AI visuals, Ken Burns camera effects, and voice narration
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        <Badge className="bg-white/10 text-white/80 border-white/10">⚡ Instant Playback</Badge>
        <Badge className="bg-white/10 text-white/80 border-white/10">Voice Narration</Badge>
        <Badge className="bg-white/10 text-white/80 border-white/10">Ken Burns Camera FX</Badge>
        <Badge className="bg-white/10 text-white/80 border-white/10">MP4 Export</Badge>
      </div>
      <Button size="lg" onClick={onGenerate}
        className="bg-white text-black hover:bg-white/90 font-semibold gap-2 rounded-full px-8">
        <Sparkles className="h-5 w-5" />
        Generate Cinematic Video
      </Button>
    </div>
  );
}
