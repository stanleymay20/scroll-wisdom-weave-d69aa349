import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Plus, Trash2, Target, Lightbulb } from "lucide-react";

/**
 * LEARNING OBJECTIVES FOR EDUCATIONAL COMICS
 * Only shown for comic sub-types that have hasLearningObjectives: true
 * Injects structured learning moments into the comic narrative
 */

export interface LearningObjective {
  id: string;
  objective: string;
  chapter?: number; // Optional: specific chapter to emphasize this
  visualCue?: string; // How to visually represent this concept
}

export interface LearningMoment {
  id: string;
  concept: string;
  explanation: string;
  panelHint: string; // How this should appear in a panel
}

export interface ComicLearningConfig {
  objectives: LearningObjective[];
  learningMoments: LearningMoment[];
  moralLesson?: string;
  keyVocabulary?: string[];
  ageAppropriateComplexity: "simple" | "moderate" | "advanced";
}

interface ComicLearningObjectivesProps {
  value: ComicLearningConfig;
  onChange: (config: ComicLearningConfig) => void;
  disabled?: boolean;
  subType: "children_learning" | "educational" | "moral_values";
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export function ComicLearningObjectives({ 
  value, 
  onChange, 
  disabled,
  subType 
}: ComicLearningObjectivesProps) {
  const addObjective = () => {
    const newObjective: LearningObjective = {
      id: generateId(),
      objective: "",
    };
    onChange({
      ...value,
      objectives: [...value.objectives, newObjective],
    });
  };

  const updateObjective = (id: string, updates: Partial<LearningObjective>) => {
    onChange({
      ...value,
      objectives: value.objectives.map(o => 
        o.id === id ? { ...o, ...updates } : o
      ),
    });
  };

  const removeObjective = (id: string) => {
    onChange({
      ...value,
      objectives: value.objectives.filter(o => o.id !== id),
    });
  };

  const addLearningMoment = () => {
    const newMoment: LearningMoment = {
      id: generateId(),
      concept: "",
      explanation: "",
      panelHint: "",
    };
    onChange({
      ...value,
      learningMoments: [...value.learningMoments, newMoment],
    });
  };

  const updateLearningMoment = (id: string, updates: Partial<LearningMoment>) => {
    onChange({
      ...value,
      learningMoments: value.learningMoments.map(m => 
        m.id === id ? { ...m, ...updates } : m
      ),
    });
  };

  const removeLearningMoment = (id: string) => {
    onChange({
      ...value,
      learningMoments: value.learningMoments.filter(m => m.id !== id),
    });
  };

  const addVocabulary = (word: string) => {
    if (!word.trim()) return;
    const current = value.keyVocabulary || [];
    if (!current.includes(word.trim())) {
      onChange({
        ...value,
        keyVocabulary: [...current, word.trim()],
      });
    }
  };

  const removeVocabulary = (word: string) => {
    onChange({
      ...value,
      keyVocabulary: (value.keyVocabulary || []).filter(w => w !== word),
    });
  };

  return (
    <Card className="bg-gradient-card border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          Learning Objectives
          <Badge variant="secondary" className="ml-2">
            {subType === "moral_values" ? "Values-Based" : "Educational"}
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Define what readers should learn from this comic. These will be woven into the narrative.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Learning Objectives */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Learning Objectives
          </Label>
          
          {value.objectives.map((objective) => (
            <div key={objective.id} className="flex items-start gap-2">
              <Input
                value={objective.objective}
                onChange={(e) => updateObjective(objective.id, { objective: e.target.value })}
                placeholder={
                  subType === "moral_values" 
                    ? "e.g., Understand the importance of honesty"
                    : "e.g., Understand how photosynthesis works"
                }
                disabled={disabled}
                className="flex-1"
              />
              <Input
                value={objective.visualCue || ""}
                onChange={(e) => updateObjective(objective.id, { visualCue: e.target.value })}
                placeholder="Visual hint"
                disabled={disabled}
                className="w-32"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeObjective(objective.id)}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          
          <Button
            variant="outline"
            size="sm"
            onClick={addObjective}
            disabled={disabled}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Objective
          </Button>
        </div>

        {/* Learning Moments */}
        <div className="space-y-3 pt-3 border-t border-border/30">
          <Label className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Learning Moments (Explicit Teaching Points)
          </Label>
          <p className="text-xs text-muted-foreground">
            These are specific concepts that will be explicitly taught within panels
          </p>
          
          {value.learningMoments.map((moment) => (
            <div key={moment.id} className="p-3 rounded-lg border border-border/50 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={moment.concept}
                  onChange={(e) => updateLearningMoment(moment.id, { concept: e.target.value })}
                  placeholder="Concept name (e.g., 'Gravity')"
                  disabled={disabled}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeLearningMoment(moment.id)}
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Input
                value={moment.explanation}
                onChange={(e) => updateLearningMoment(moment.id, { explanation: e.target.value })}
                placeholder="Simple explanation for the audience"
                disabled={disabled}
              />
              <Input
                value={moment.panelHint}
                onChange={(e) => updateLearningMoment(moment.id, { panelHint: e.target.value })}
                placeholder="How to show this in a panel (e.g., 'Character demonstrating with apple falling')"
                disabled={disabled}
              />
            </div>
          ))}
          
          <Button
            variant="outline"
            size="sm"
            onClick={addLearningMoment}
            disabled={disabled}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Learning Moment
          </Button>
        </div>

        {/* Moral Lesson (for moral_values type) */}
        {subType === "moral_values" && (
          <div className="pt-3 border-t border-border/30">
            <Label>Core Moral Lesson</Label>
            <Input
              value={value.moralLesson || ""}
              onChange={(e) => onChange({ ...value, moralLesson: e.target.value })}
              placeholder="e.g., Kindness is more powerful than strength"
              disabled={disabled}
              className="mt-1"
            />
          </div>
        )}

        {/* Key Vocabulary (for educational types) */}
        {(subType === "children_learning" || subType === "educational") && (
          <div className="pt-3 border-t border-border/30">
            <Label>Key Vocabulary Words</Label>
            <div className="flex flex-wrap gap-2 mt-2 mb-2">
              {(value.keyVocabulary || []).map((word) => (
                <Badge 
                  key={word} 
                  variant="secondary"
                  className="cursor-pointer hover:bg-destructive/20"
                  onClick={() => !disabled && removeVocabulary(word)}
                >
                  {word}
                  <Trash2 className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add vocabulary word..."
                disabled={disabled}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addVocabulary((e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  const input = (e.target as HTMLElement).parentElement?.querySelector('input');
                  if (input) {
                    addVocabulary(input.value);
                    input.value = "";
                  }
                }}
                disabled={disabled}
              >
                Add
              </Button>
            </div>
          </div>
        )}

        {/* Complexity Level */}
        <div className="pt-3 border-t border-border/30">
          <Label>Content Complexity</Label>
          <div className="flex gap-2 mt-2">
            {(["simple", "moderate", "advanced"] as const).map((level) => (
              <button
                key={level}
                onClick={() => !disabled && onChange({ ...value, ageAppropriateComplexity: level })}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  value.ageAppropriateComplexity === level
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 hover:border-primary/50"
                }`}
                disabled={disabled}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
