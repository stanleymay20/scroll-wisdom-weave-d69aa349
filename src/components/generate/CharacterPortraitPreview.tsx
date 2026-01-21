import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Sparkles, RefreshCw, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ComicCharacter } from "./ComicCharacterSheet";

/**
 * CHARACTER PORTRAIT PREVIEW
 * Generates AI portraits for characters based on their descriptions
 * before locking the character sheet for visual consistency
 */

interface CharacterPortraitPreviewProps {
  characters: ComicCharacter[];
  styleId: string;
  paletteHint: string;
  onPortraitsGenerated?: (portraits: Map<string, string>) => void;
  disabled?: boolean;
}

interface PortraitState {
  url: string | null;
  isGenerating: boolean;
  error: string | null;
}

export function CharacterPortraitPreview({
  characters,
  styleId,
  paletteHint,
  onPortraitsGenerated,
  disabled
}: CharacterPortraitPreviewProps) {
  const [portraits, setPortraits] = useState<Map<string, PortraitState>>(new Map());
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const { toast } = useToast();

  const STYLE_PROMPTS: Record<string, string> = {
    modern_superhero: "Modern American superhero comic style, dynamic pose, bold lines, vibrant colors",
    african_superhero: "Afrofuturistic art style, rich earth tones, gold accents, African-inspired patterns",
    manga: "Japanese manga style, expressive eyes, clean lines, soft colors",
    children_book: "Friendly children's book illustration, rounded shapes, bright cheerful colors",
    graphic_novel: "Realistic graphic novel style, detailed, muted sophisticated palette",
  };

  const generatePortrait = async (character: ComicCharacter) => {
    if (!character.name || !character.physicalDescription) {
      toast({
        title: "Missing information",
        description: "Character needs a name and physical description",
        variant: "destructive",
      });
      return;
    }

    // Set generating state
    setPortraits(prev => new Map(prev).set(character.id, {
      url: null,
      isGenerating: true,
      error: null,
    }));

    try {
      const stylePrompt = STYLE_PROMPTS[styleId] || STYLE_PROMPTS.children_book;
      
      const prompt = `Character portrait of ${character.name}. ${character.physicalDescription}. ${
        character.clothingDescription ? `Wearing: ${character.clothingDescription}.` : ''
      } ${character.distinctiveFeatures ? `Distinctive features: ${character.distinctiveFeatures}.` : ''} ${
        character.colorAccent ? `Color accent: ${character.colorAccent}.` : ''
      } ${stylePrompt}. ${paletteHint || ''}. Portrait view, character centered, detailed face, expressive. High quality illustration.`;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      // Call generate-image edge function
      const response = await supabase.functions.invoke("generate-image", {
        body: {
          prompt,
          style: styleId,
          width: 512,
          height: 512,
          purpose: "character_portrait",
        },
      });

      if (response.error) throw response.error;
      
      const imageUrl = response.data?.imageUrl;
      
      if (!imageUrl) {
        throw new Error("No image URL returned");
      }

      setPortraits(prev => new Map(prev).set(character.id, {
        url: imageUrl,
        isGenerating: false,
        error: null,
      }));

      toast({
        title: "Portrait generated",
        description: `Portrait for ${character.name} is ready`,
      });

    } catch (error: any) {
      console.error("Portrait generation error:", error);
      setPortraits(prev => new Map(prev).set(character.id, {
        url: null,
        isGenerating: false,
        error: error.message || "Generation failed",
      }));

      toast({
        title: "Generation failed",
        description: error.message || "Could not generate portrait",
        variant: "destructive",
      });
    }
  };

  const generateAllPortraits = async () => {
    setIsGeneratingAll(true);
    
    for (const character of characters) {
      if (character.name && character.physicalDescription) {
        await generatePortrait(character);
        // Small delay between generations
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    setIsGeneratingAll(false);

    // Collect all generated portraits
    const generatedPortraits = new Map<string, string>();
    portraits.forEach((state, id) => {
      if (state.url) {
        generatedPortraits.set(id, state.url);
      }
    });
    
    onPortraitsGenerated?.(generatedPortraits);
  };

  const validCharacters = characters.filter(c => c.name && c.physicalDescription);

  if (validCharacters.length === 0) {
    return (
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-8 text-center">
          <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Add characters with names and physical descriptions to preview portraits
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-card border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Character Portrait Preview
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={generateAllPortraits}
            disabled={disabled || isGeneratingAll || validCharacters.length === 0}
          >
            {isGeneratingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate All
              </>
            )}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Preview AI-generated portraits before locking your character sheet
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {validCharacters.map((character) => {
            const state = portraits.get(character.id);
            
            return (
              <div key={character.id} className="flex flex-col items-center">
                {/* Portrait Container */}
                <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                  {state?.url ? (
                    <img 
                      src={state.url} 
                      alt={character.name}
                      className="w-full h-full object-cover"
                    />
                  ) : state?.isGenerating ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : state?.error ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2">
                      <p className="text-xs text-destructive text-center mb-2">{state.error}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generatePortrait(character)}
                        disabled={disabled}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center">
                      <User className="h-8 w-8 text-muted-foreground mb-2" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generatePortrait(character)}
                        disabled={disabled || isGeneratingAll}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        Generate
                      </Button>
                    </div>
                  )}
                  
                  {/* Role Badge */}
                  <Badge 
                    className="absolute top-2 left-2 text-[10px]"
                    variant={character.role === 'protagonist' ? 'default' : 'secondary'}
                  >
                    {character.role}
                  </Badge>
                  
                  {/* Generated Check */}
                  {state?.url && (
                    <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>
                
                {/* Character Name */}
                <p className="mt-2 text-sm font-medium text-center truncate w-full">
                  {character.name}
                </p>
                <p className="text-xs text-muted-foreground text-center line-clamp-1">
                  {character.physicalDescription.slice(0, 30)}...
                </p>
              </div>
            );
          })}
        </div>

        {/* Info Banner */}
        <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> Generate portraits before locking your character sheet. 
            These portraits help ensure visual consistency across all comic panels.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
