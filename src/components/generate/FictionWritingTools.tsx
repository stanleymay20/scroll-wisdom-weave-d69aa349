import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Users, Map, BookOpen, Sparkles, Drama } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================
// TYPES
// ============================================

export type FictionGenre =
  | "literary"
  | "thriller"
  | "romance"
  | "sci_fi"
  | "fantasy"
  | "mystery"
  | "horror"
  | "historical";

export type NarrativePOV = "first" | "third_limited" | "third_omniscient" | "second";

export interface FictionCharacter {
  id: string;
  name: string;
  role: "protagonist" | "antagonist" | "supporting" | "mentor";
  description: string;
  motivation: string;
  arc: string;
}

export interface PlotPoint {
  id: string;
  label: string;
  description: string;
}

export interface FictionConfig {
  genre: FictionGenre;
  pov: NarrativePOV;
  tone: string;
  setting: string;
  characters: FictionCharacter[];
  plotPoints: PlotPoint[];
  themes: string;
}

const GENRES: { value: FictionGenre; label: string }[] = [
  { value: "literary", label: "Literary Fiction" },
  { value: "thriller", label: "Thriller / Suspense" },
  { value: "romance", label: "Romance" },
  { value: "sci_fi", label: "Science Fiction" },
  { value: "fantasy", label: "Fantasy" },
  { value: "mystery", label: "Mystery / Detective" },
  { value: "horror", label: "Horror" },
  { value: "historical", label: "Historical Fiction" },
];

const POV_OPTIONS: { value: NarrativePOV; label: string; desc: string }[] = [
  { value: "first", label: "First Person", desc: '"I walked into the room..."' },
  { value: "third_limited", label: "Third Limited", desc: '"She walked into the room..."' },
  { value: "third_omniscient", label: "Third Omniscient", desc: "All-knowing narrator" },
  { value: "second", label: "Second Person", desc: '"You walk into the room..."' },
];

const PLOT_TEMPLATE: { label: string; desc: string }[] = [
  { label: "Hook / Inciting Incident", desc: "What disrupts the protagonist's world?" },
  { label: "Rising Action", desc: "Escalating stakes and complications" },
  { label: "Midpoint Twist", desc: "A revelation that changes everything" },
  { label: "Crisis / Dark Moment", desc: "The protagonist's lowest point" },
  { label: "Climax", desc: "The decisive confrontation or choice" },
  { label: "Resolution", desc: "How the story world settles" },
];

const ROLE_COLORS: Record<FictionCharacter["role"], string> = {
  protagonist: "bg-primary/20 text-primary border-primary/30",
  antagonist: "bg-destructive/20 text-destructive border-destructive/30",
  supporting: "bg-muted text-muted-foreground border-border",
  mentor: "bg-accent/20 text-accent-foreground border-accent/30",
};

// ============================================
// COMPONENT
// ============================================

interface FictionWritingToolsProps {
  value: FictionConfig;
  onChange: (config: FictionConfig) => void;
  disabled?: boolean;
}

export function FictionWritingTools({ value, onChange, disabled }: FictionWritingToolsProps) {
  const [expandedSection, setExpandedSection] = useState<"characters" | "plot" | null>("characters");

  const update = (patch: Partial<FictionConfig>) => onChange({ ...value, ...patch });

  const addCharacter = () => {
    const char: FictionCharacter = {
      id: crypto.randomUUID(),
      name: "",
      role: "supporting",
      description: "",
      motivation: "",
      arc: "",
    };
    update({ characters: [...value.characters, char] });
  };

  const updateCharacter = (id: string, patch: Partial<FictionCharacter>) => {
    update({
      characters: value.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const removeCharacter = (id: string) => {
    update({ characters: value.characters.filter((c) => c.id !== id) });
  };

  const initPlotFromTemplate = () => {
    update({
      plotPoints: PLOT_TEMPLATE.map((p) => ({
        id: crypto.randomUUID(),
        label: p.label,
        description: "",
      })),
    });
  };

  const updatePlotPoint = (id: string, description: string) => {
    update({
      plotPoints: value.plotPoints.map((p) => (p.id === id ? { ...p, description } : p)),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div className="flex items-center gap-2 mb-1">
        <Drama className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Fiction Writing Tools</h3>
      </div>

      {/* Genre & POV row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Genre *</Label>
          <Select value={value.genre} onValueChange={(v) => update({ genre: v as FictionGenre })} disabled={disabled}>
            <SelectTrigger className="bg-muted/50 border-border/50">
              <SelectValue placeholder="Select genre" />
            </SelectTrigger>
            <SelectContent>
              {GENRES.map((g) => (
                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Narrative POV *</Label>
          <Select value={value.pov} onValueChange={(v) => update({ pov: v as NarrativePOV })} disabled={disabled}>
            <SelectTrigger className="bg-muted/50 border-border/50">
              <SelectValue placeholder="Select POV" />
            </SelectTrigger>
            <SelectContent>
              {POV_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <span>{p.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">{p.desc}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tone & Setting */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tone / Voice</Label>
          <Input
            placeholder="e.g. Dark & atmospheric, witty, lyrical..."
            value={value.tone}
            onChange={(e) => update({ tone: e.target.value })}
            disabled={disabled}
            className="bg-muted/50 border-border/50"
          />
        </div>
        <div className="space-y-2">
          <Label>Themes</Label>
          <Input
            placeholder="e.g. Redemption, identity, power..."
            value={value.themes}
            onChange={(e) => update({ themes: e.target.value })}
            disabled={disabled}
            className="bg-muted/50 border-border/50"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Map className="h-4 w-4 text-primary" /> World / Setting
        </Label>
        <Textarea
          placeholder="Describe the world, time period, key locations..."
          value={value.setting}
          onChange={(e) => update({ setting: e.target.value })}
          disabled={disabled}
          className="bg-muted/50 border-border/50 min-h-[80px]"
        />
      </div>

      {/* ——— CHARACTER SHEET ——— */}
      <Card className="p-4 space-y-3 border-border/50">
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setExpandedSection(expandedSection === "characters" ? null : "characters")}
        >
          <Users className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm text-foreground">
            Characters ({value.characters.length})
          </span>
        </button>

        <AnimatePresence>
          {expandedSection === "characters" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {value.characters.map((char) => (
                <div key={char.id} className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Character name"
                      value={char.name}
                      onChange={(e) => updateCharacter(char.id, { name: e.target.value })}
                      disabled={disabled}
                      className="flex-1 h-8 text-sm bg-background/50"
                    />
                    <Select
                      value={char.role}
                      onValueChange={(v) => updateCharacter(char.id, { role: v as FictionCharacter["role"] })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="protagonist">Protagonist</SelectItem>
                        <SelectItem value="antagonist">Antagonist</SelectItem>
                        <SelectItem value="supporting">Supporting</SelectItem>
                        <SelectItem value="mentor">Mentor</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[char.role]}`}>
                      {char.role}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeCharacter(char.id)}
                      disabled={disabled}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Brief description & backstory"
                    value={char.description}
                    onChange={(e) => updateCharacter(char.id, { description: e.target.value })}
                    disabled={disabled}
                    className="min-h-[50px] text-xs bg-background/50"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Core motivation"
                      value={char.motivation}
                      onChange={(e) => updateCharacter(char.id, { motivation: e.target.value })}
                      disabled={disabled}
                      className="h-7 text-xs bg-background/50"
                    />
                    <Input
                      placeholder="Character arc (e.g. coward → hero)"
                      value={char.arc}
                      onChange={(e) => updateCharacter(char.id, { arc: e.target.value })}
                      disabled={disabled}
                      className="h-7 text-xs bg-background/50"
                    />
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={addCharacter}
                disabled={disabled || value.characters.length >= 8}
                className="w-full"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Character
                {value.characters.length >= 8 && <span className="ml-1 text-xs text-muted-foreground">(max 8)</span>}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* ——— PLOT ARC ——— */}
      <Card className="p-4 space-y-3 border-border/50">
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setExpandedSection(expandedSection === "plot" ? null : "plot")}
        >
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm text-foreground">
            Plot Arc ({value.plotPoints.length} beats)
          </span>
        </button>

        <AnimatePresence>
          {expandedSection === "plot" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {value.plotPoints.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={initPlotFromTemplate}
                  disabled={disabled}
                  className="w-full"
                >
                  <Sparkles className="h-3 w-3 mr-1" /> Use Story Arc Template
                </Button>
              )}

              {value.plotPoints.map((point, i) => (
                <div key={point.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </div>
                    {i < value.plotPoints.length - 1 && (
                      <div className="w-px h-full bg-border/50 min-h-[20px]" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="text-xs font-medium text-foreground">{point.label}</span>
                    <Textarea
                      placeholder={PLOT_TEMPLATE[i]?.desc || "Describe this beat..."}
                      value={point.description}
                      onChange={(e) => updatePlotPoint(point.id, e.target.value)}
                      disabled={disabled}
                      className="min-h-[50px] text-xs bg-muted/30 border-border/30"
                    />
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

export const DEFAULT_FICTION_CONFIG: FictionConfig = {
  genre: "literary",
  pov: "third_limited",
  tone: "",
  setting: "",
  characters: [],
  plotPoints: [],
  themes: "",
};
