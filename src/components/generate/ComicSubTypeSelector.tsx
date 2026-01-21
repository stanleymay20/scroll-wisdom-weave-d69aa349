import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Baby, GraduationCap, Users, Sparkles, Heart, Gamepad2 
} from "lucide-react";

/**
 * COMIC SUB-TYPE SELECTOR
 * Defines the specific comic genre and audience, controlling:
 * - Language level
 * - Art style defaults
 * - Panel density
 * - Dialogue complexity
 * - Learning objectives
 * - Assessment eligibility
 */

export type ComicSubType = 
  | "children_story"      // Ages 4-7, simple visual stories
  | "children_learning"   // Ages 7-12, educational with learning objectives
  | "teen_graphic"        // Teen graphic novel, more complex narratives
  | "educational"         // Any age, concept-focused (science, history, math)
  | "moral_values"        // Faith-based, moral lessons, values stories
  | "entertainment";      // Pure fiction/entertainment, no certification

export interface ComicSubTypeConfig {
  subType: ComicSubType;
  ageRange: string;
  languageLevel: "simple" | "moderate" | "advanced";
  panelDensity: number; // 3-6 panels per page
  dialogueComplexity: "minimal" | "moderate" | "rich";
  hasLearningObjectives: boolean;
  certificationEligible: boolean;
  certificationType?: "creative_learning" | "literacy_engagement" | "concept_mastery" | null;
}

interface ComicSubTypeSelectorProps {
  value: ComicSubType;
  onChange: (subType: ComicSubType, config: ComicSubTypeConfig) => void;
  disabled?: boolean;
}

interface SubTypeOption {
  value: ComicSubType;
  label: string;
  description: string;
  ageRange: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  config: Omit<ComicSubTypeConfig, 'subType'>;
}

const COMIC_SUB_TYPES: SubTypeOption[] = [
  {
    value: "children_story",
    label: "Children's Story",
    description: "Simple visual stories with minimal text for early readers",
    ageRange: "Ages 4-7",
    icon: Baby,
    badge: "Visual-First",
    badgeVariant: "secondary",
    config: {
      ageRange: "4-7",
      languageLevel: "simple",
      panelDensity: 3,
      dialogueComplexity: "minimal",
      hasLearningObjectives: false,
      certificationEligible: true,
      certificationType: "literacy_engagement",
    },
  },
  {
    value: "children_learning",
    label: "Children's Learning Comic",
    description: "Educational stories with embedded learning objectives",
    ageRange: "Ages 7-12",
    icon: GraduationCap,
    badge: "Educational",
    badgeVariant: "default",
    config: {
      ageRange: "7-12",
      languageLevel: "moderate",
      panelDensity: 4,
      dialogueComplexity: "moderate",
      hasLearningObjectives: true,
      certificationEligible: true,
      certificationType: "creative_learning",
    },
  },
  {
    value: "teen_graphic",
    label: "Teen Graphic Novel",
    description: "Complex narratives with mature themes for teenagers",
    ageRange: "Ages 13-17",
    icon: Users,
    badge: "Narrative",
    config: {
      ageRange: "13-17",
      languageLevel: "advanced",
      panelDensity: 5,
      dialogueComplexity: "rich",
      hasLearningObjectives: false,
      certificationEligible: false,
      certificationType: null,
    },
  },
  {
    value: "educational",
    label: "Educational Comic",
    description: "Concept-focused: science, history, math, language learning",
    ageRange: "All Ages",
    icon: Sparkles,
    badge: "Concepts",
    badgeVariant: "default",
    config: {
      ageRange: "all",
      languageLevel: "moderate",
      panelDensity: 5,
      dialogueComplexity: "moderate",
      hasLearningObjectives: true,
      certificationEligible: true,
      certificationType: "concept_mastery",
    },
  },
  {
    value: "moral_values",
    label: "Moral / Values Comic",
    description: "Faith-based stories, moral lessons, character building",
    ageRange: "All Ages",
    icon: Heart,
    badge: "Values",
    badgeVariant: "outline",
    config: {
      ageRange: "all",
      languageLevel: "moderate",
      panelDensity: 4,
      dialogueComplexity: "moderate",
      hasLearningObjectives: true,
      certificationEligible: true,
      certificationType: "creative_learning",
    },
  },
  {
    value: "entertainment",
    label: "Entertainment Comic",
    description: "Pure fiction, adventure, superhero stories for fun",
    ageRange: "All Ages",
    icon: Gamepad2,
    badge: "No Cert",
    badgeVariant: "destructive",
    config: {
      ageRange: "all",
      languageLevel: "moderate",
      panelDensity: 5,
      dialogueComplexity: "rich",
      hasLearningObjectives: false,
      certificationEligible: false,
      certificationType: null,
    },
  },
];

export function ComicSubTypeSelector({ value, onChange, disabled }: ComicSubTypeSelectorProps) {
  const selectedOption = COMIC_SUB_TYPES.find(t => t.value === value);

  const handleChange = (subType: ComicSubType) => {
    const option = COMIC_SUB_TYPES.find(t => t.value === subType)!;
    onChange(subType, {
      subType,
      ...option.config,
    });
  };

  return (
    <Card className="bg-gradient-card border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Comic Type & Audience
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Select the comic genre and target audience — this controls language, complexity, and certification eligibility
        </p>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={value}
          onValueChange={(v) => handleChange(v as ComicSubType)}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          disabled={disabled}
        >
          {COMIC_SUB_TYPES.map((option) => (
            <div
              key={option.value}
              className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                value === option.value
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border/50 hover:border-primary/50 hover:bg-muted/30"
              }`}
              onClick={() => !disabled && handleChange(option.value)}
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value={option.value} id={`comic-subtype-${option.value}`} className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <option.icon className="h-4 w-4 text-primary flex-shrink-0" />
                    <Label htmlFor={`comic-subtype-${option.value}`} className="font-medium cursor-pointer">
                      {option.label}
                    </Label>
                    {option.badge && (
                      <Badge variant={option.badgeVariant || "secondary"} className="text-[10px] px-1.5 py-0">
                        {option.badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                  <p className="text-[10px] text-primary/80 mt-1">{option.ageRange}</p>
                </div>
              </div>
            </div>
          ))}
        </RadioGroup>

        {/* Selected Config Summary */}
        {selectedOption && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border/30">
            <p className="text-xs font-medium mb-2">Configuration for "{selectedOption.label}":</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>• Language: {selectedOption.config.languageLevel}</span>
              <span>• Panels/page: {selectedOption.config.panelDensity}</span>
              <span>• Dialogue: {selectedOption.config.dialogueComplexity}</span>
              <span>• Learning: {selectedOption.config.hasLearningObjectives ? "Yes" : "No"}</span>
            </div>
            {selectedOption.config.certificationEligible ? (
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                ✓ Eligible for "{selectedOption.config.certificationType?.replace(/_/g, ' ')}" certificate
              </p>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                ⚠ Not eligible for certification (entertainment only)
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
