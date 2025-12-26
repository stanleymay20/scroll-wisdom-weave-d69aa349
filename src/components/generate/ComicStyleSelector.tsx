import { useState } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Palette, Users, LayoutGrid } from "lucide-react";

export type ComicStyle = 
  | "modern_superhero" 
  | "african_superhero" 
  | "manga" 
  | "children_book" 
  | "graphic_novel";

export interface ComicStyleConfig {
  styleId: ComicStyle;
  paletteHint: string;
  lineWeightHint: "thin" | "medium" | "bold";
  characterSheet: string;
  layoutTemplate: number; // 3-6 panels per page
}

interface ComicStyleSelectorProps {
  value: ComicStyleConfig;
  onChange: (config: ComicStyleConfig) => void;
  disabled?: boolean;
}

const COMIC_STYLES: Array<{
  id: ComicStyle;
  name: string;
  description: string;
  palette: string;
  lineWeight: "thin" | "medium" | "bold";
}> = [
  {
    id: "modern_superhero",
    name: "Modern Superhero",
    description: "Bold outlines, dramatic lighting, cinematic framing",
    palette: "Primary colors with deep shadows",
    lineWeight: "bold",
  },
  {
    id: "african_superhero",
    name: "African Superhero",
    description: "Vibrant colors, cultural motifs, powerful poses",
    palette: "Earth tones, gold accents, vibrant fabrics",
    lineWeight: "bold",
  },
  {
    id: "manga",
    name: "Manga",
    description: "Clean lines, expressive eyes, dynamic action",
    palette: "High contrast black/white with tone screens",
    lineWeight: "thin",
  },
  {
    id: "children_book",
    name: "Children's Book",
    description: "Soft colors, rounded shapes, friendly characters",
    palette: "Pastel and bright primary colors",
    lineWeight: "medium",
  },
  {
    id: "graphic_novel",
    name: "Graphic Novel",
    description: "Detailed art, mature themes, realistic proportions",
    palette: "Muted tones with selective color emphasis",
    lineWeight: "medium",
  },
];

export function ComicStyleSelector({ value, onChange, disabled }: ComicStyleSelectorProps) {
  const selectedStyle = COMIC_STYLES.find(s => s.id === value.styleId) || COMIC_STYLES[0];

  const handleStyleChange = (styleId: ComicStyle) => {
    const style = COMIC_STYLES.find(s => s.id === styleId)!;
    onChange({
      ...value,
      styleId,
      paletteHint: style.palette,
      lineWeightHint: style.lineWeight,
    });
  };

  return (
    <Card className="bg-gradient-card border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          Comic Style Configuration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Style settings are locked for the entire book to ensure visual consistency
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Style Selection */}
        <div className="space-y-3">
          <Label>Art Style</Label>
          <RadioGroup
            value={value.styleId}
            onValueChange={(v) => handleStyleChange(v as ComicStyle)}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            disabled={disabled}
          >
            {COMIC_STYLES.map((style) => (
              <div
                key={style.id}
                className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                  value.styleId === style.id
                    ? "border-primary bg-primary/10"
                    : "border-border/50 hover:border-primary/50"
                }`}
                onClick={() => !disabled && handleStyleChange(style.id)}
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value={style.id} id={`style-${style.id}`} className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor={`style-${style.id}`} className="font-medium cursor-pointer">
                      {style.name}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{style.description}</p>
                    <Badge variant="outline" className="text-xs mt-2">
                      {style.palette}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Custom Palette Hint */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Color Palette Hint
          </Label>
          <Input
            value={value.paletteHint}
            onChange={(e) => onChange({ ...value, paletteHint: e.target.value })}
            placeholder="e.g., Warm earth tones with gold accents"
            disabled={disabled}
            className="bg-muted/50"
          />
        </div>

        {/* Line Weight */}
        <div className="space-y-2">
          <Label>Line Weight</Label>
          <div className="flex gap-2">
            {(["thin", "medium", "bold"] as const).map((weight) => (
              <button
                key={weight}
                onClick={() => !disabled && onChange({ ...value, lineWeightHint: weight })}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  value.lineWeightHint === weight
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 hover:border-primary/50"
                }`}
                disabled={disabled}
              >
                {weight.charAt(0).toUpperCase() + weight.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Panels Per Page */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Panels Per Page
            </Label>
            <Badge variant="secondary">{value.layoutTemplate} panels</Badge>
          </div>
          <Slider
            value={[value.layoutTemplate]}
            onValueChange={(v) => onChange({ ...value, layoutTemplate: v[0] })}
            min={3}
            max={6}
            step={1}
            disabled={disabled}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>3 (large panels)</span>
            <span>6 (detailed sequence)</span>
          </div>
        </div>

        {/* Character Sheet */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Character Sheet (Optional)
          </Label>
          <Textarea
            value={value.characterSheet}
            onChange={(e) => onChange({ ...value, characterSheet: e.target.value })}
            placeholder={`Describe main characters for consistency:
- Hero: Dark skin, short locs, red cape, gold armor
- Mentor: Elder woman, white hair, blue robes
- Villain: Masked, shadow cloak, glowing red eyes`}
            className="bg-muted/50 min-h-[100px]"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Character descriptions ensure consistent appearance across all panels
          </p>
        </div>

        {/* Consistency Lock Notice */}
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <p className="text-xs text-green-400">
            <strong>Style Lock Active:</strong> All panels will maintain consistent art style, 
            character designs, color palette, and line weight throughout the book.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
