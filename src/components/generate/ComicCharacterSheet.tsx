import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Trash2, Lock, Sparkles } from "lucide-react";

/**
 * CHARACTER SHEET MANAGER
 * Enforces visual consistency by defining characters upfront.
 * Once locked, characters cannot be changed mid-book.
 */

export interface ComicCharacter {
  id: string;
  name: string;
  role: "protagonist" | "antagonist" | "supporting" | "mentor" | "sidekick";
  physicalDescription: string;
  clothingDescription: string;
  personalityTraits: string;
  distinctiveFeatures: string;
  colorAccent?: string;
}

export interface CharacterSheetConfig {
  characters: ComicCharacter[];
  isLocked: boolean;
  settingDescription: string;
  visualConsistencyNotes: string;
}

interface ComicCharacterSheetProps {
  value: CharacterSheetConfig;
  onChange: (config: CharacterSheetConfig) => void;
  disabled?: boolean;
  onLock?: () => void;
}

const ROLE_OPTIONS: { value: ComicCharacter['role']; label: string; color: string }[] = [
  { value: "protagonist", label: "Protagonist", color: "bg-primary text-primary-foreground" },
  { value: "antagonist", label: "Antagonist", color: "bg-destructive text-destructive-foreground" },
  { value: "mentor", label: "Mentor", color: "bg-blue-500 text-white" },
  { value: "sidekick", label: "Sidekick", color: "bg-green-500 text-white" },
  { value: "supporting", label: "Supporting", color: "bg-muted text-muted-foreground" },
];

const generateId = () => Math.random().toString(36).substring(2, 9);

export function ComicCharacterSheet({ value, onChange, disabled, onLock }: ComicCharacterSheetProps) {
  const [expandedCharacter, setExpandedCharacter] = useState<string | null>(null);

  const addCharacter = () => {
    if (value.isLocked) return;
    const newCharacter: ComicCharacter = {
      id: generateId(),
      name: "",
      role: "supporting",
      physicalDescription: "",
      clothingDescription: "",
      personalityTraits: "",
      distinctiveFeatures: "",
    };
    onChange({
      ...value,
      characters: [...value.characters, newCharacter],
    });
    setExpandedCharacter(newCharacter.id);
  };

  const updateCharacter = (id: string, updates: Partial<ComicCharacter>) => {
    if (value.isLocked) return;
    onChange({
      ...value,
      characters: value.characters.map(c => 
        c.id === id ? { ...c, ...updates } : c
      ),
    });
  };

  const removeCharacter = (id: string) => {
    if (value.isLocked) return;
    onChange({
      ...value,
      characters: value.characters.filter(c => c.id !== id),
    });
  };

  const handleLock = () => {
    onChange({ ...value, isLocked: true });
    onLock?.();
  };

  return (
    <Card className="bg-gradient-card border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Character Sheet
            {value.isLocked && (
              <Badge variant="secondary" className="ml-2">
                <Lock className="h-3 w-3 mr-1" />
                Locked
              </Badge>
            )}
          </CardTitle>
          {!value.isLocked && value.characters.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleLock}
              disabled={disabled}
            >
              <Lock className="h-3 w-3 mr-1" />
              Lock Characters
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Define characters upfront to ensure visual consistency across all panels.
          {!value.isLocked && " Lock when finalized to prevent mid-book changes."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Characters List */}
        <div className="space-y-3">
          {value.characters.map((character) => (
            <div 
              key={character.id}
              className={`border rounded-lg transition-all ${
                value.isLocked ? "border-border/30 bg-muted/20" : "border-border/50"
              }`}
            >
              {/* Character Header */}
              <div 
                className="flex items-center justify-between p-3 cursor-pointer"
                onClick={() => !value.isLocked && setExpandedCharacter(
                  expandedCharacter === character.id ? null : character.id
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={`px-2 py-0.5 rounded text-xs ${
                    ROLE_OPTIONS.find(r => r.value === character.role)?.color || "bg-muted"
                  }`}>
                    {character.role}
                  </div>
                  <span className="font-medium">{character.name || "Unnamed Character"}</span>
                </div>
                {!value.isLocked && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCharacter(character.id);
                    }}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>

              {/* Character Details (Expanded) */}
              {expandedCharacter === character.id && !value.isLocked && (
                <div className="p-3 pt-0 space-y-3 border-t border-border/30">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Character Name *</Label>
                      <Input
                        value={character.name}
                        onChange={(e) => updateCharacter(character.id, { name: e.target.value })}
                        placeholder="e.g., Amara, The Elder"
                        disabled={disabled}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Role</Label>
                      <select
                        value={character.role}
                        onChange={(e) => updateCharacter(character.id, { role: e.target.value as ComicCharacter['role'] })}
                        className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                        disabled={disabled}
                      >
                        {ROLE_OPTIONS.map(role => (
                          <option key={role.value} value={role.value}>{role.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Physical Description *</Label>
                    <Textarea
                      value={character.physicalDescription}
                      onChange={(e) => updateCharacter(character.id, { physicalDescription: e.target.value })}
                      placeholder="e.g., Tall, dark skin, short locs, bright eyes, athletic build"
                      className="mt-1 min-h-[60px]"
                      disabled={disabled}
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Clothing / Costume</Label>
                    <Textarea
                      value={character.clothingDescription}
                      onChange={(e) => updateCharacter(character.id, { clothingDescription: e.target.value })}
                      placeholder="e.g., Red cape, gold armor, traditional African patterns"
                      className="mt-1 min-h-[60px]"
                      disabled={disabled}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Personality Traits</Label>
                      <Input
                        value={character.personalityTraits}
                        onChange={(e) => updateCharacter(character.id, { personalityTraits: e.target.value })}
                        placeholder="e.g., Brave, curious, kind"
                        disabled={disabled}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Distinctive Features</Label>
                      <Input
                        value={character.distinctiveFeatures}
                        onChange={(e) => updateCharacter(character.id, { distinctiveFeatures: e.target.value })}
                        placeholder="e.g., Scar on left cheek, glowing amulet"
                        disabled={disabled}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Color Accent (optional)</Label>
                    <Input
                      value={character.colorAccent || ""}
                      onChange={(e) => updateCharacter(character.id, { colorAccent: e.target.value })}
                      placeholder="e.g., Gold, crimson, electric blue"
                      disabled={disabled}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}

              {/* Locked View */}
              {value.isLocked && (
                <div className="px-3 pb-3 text-xs text-muted-foreground">
                  <p>{character.physicalDescription}</p>
                  {character.clothingDescription && <p className="mt-1">{character.clothingDescription}</p>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add Character Button */}
        {!value.isLocked && (
          <Button
            variant="outline"
            onClick={addCharacter}
            disabled={disabled}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Character
          </Button>
        )}

        {/* Setting Description */}
        <div className="pt-3 border-t border-border/30">
          <Label className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4" />
            Story Setting
          </Label>
          <Textarea
            value={value.settingDescription}
            onChange={(e) => onChange({ ...value, settingDescription: e.target.value })}
            placeholder="Describe the main setting/world for visual consistency. e.g., 'Futuristic African metropolis with floating buildings, holographic billboards, and traditional architecture blended with technology'"
            className="min-h-[80px]"
            disabled={disabled || value.isLocked}
          />
        </div>

        {/* Visual Consistency Notes */}
        <div>
          <Label className="text-xs">Additional Visual Consistency Notes</Label>
          <Textarea
            value={value.visualConsistencyNotes}
            onChange={(e) => onChange({ ...value, visualConsistencyNotes: e.target.value })}
            placeholder="Any other notes for maintaining visual consistency across panels..."
            className="mt-1 min-h-[60px]"
            disabled={disabled || value.isLocked}
          />
        </div>

        {/* Lock Warning */}
        {value.isLocked && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-xs text-amber-600 dark:text-amber-400">
              <Lock className="h-3 w-3 inline mr-1" />
              <strong>Character Sheet Locked:</strong> Characters and setting cannot be modified after locking.
              This ensures visual consistency across all generated panels.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
