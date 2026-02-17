import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  BookOpen, BookImage, Image as ImageIcon, 
  GraduationCap, Briefcase, FileEdit, BookText, FileSpreadsheet,
  Code, Baby, Sparkles, BookMarked
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
import { FEATURES } from "@/lib/config";

/**
 * Book Type Selector
 * Determines the structure and style of generated content.
 */
export type ExtendedBookType = 
  | "academic"      // Academic Textbook
  | "professional"  // Professional / Business Guide
  | "workbook"      // Workbook / Fill-In Guide
  | "bestseller"    // Mass-Market Bestseller
  | "comic"         // Comic / Graphic Novel
  | "children"      // Children's Book
  | "technical"     // Technical / Hands-On Guide
  | "reference"     // Reference / Handbook
  | "text";         // Standard Text (legacy)

interface BookTypeSelectorProps {
  value?: ExtendedBookType;
  onChange: (value: ExtendedBookType) => void;
  disabled?: boolean;
  required?: boolean;
  showError?: boolean;
}

interface BookTypeOption {
  value: ExtendedBookType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
  badge?: string;
  featureFlag?: boolean;
}

const ALL_BOOK_TYPES: BookTypeOption[] = [
  {
    value: "academic",
    label: "Academic Textbook",
    description: "Scholarly content with citations",
    icon: GraduationCap,
    hint: "Formal tone, structured references, no storytelling",
    badge: "Academic",
  },
  {
    value: "bestseller",
    label: "Trade / General",
    description: "Narrative-driven, accessible writing",
    icon: Sparkles,
    hint: "Engaging hooks, stories, practical advice",
  },
  {
    value: "technical",
    label: "Technical Guide",
    description: "Code-heavy, hands-on learning",
    icon: Code,
    hint: "Code examples, exercises, step-by-step tutorials",
  },
  {
    value: "professional",
    label: "Professional Guide",
    description: "Business & industry frameworks",
    icon: Briefcase,
    hint: "Frameworks, actionable advice, decision tools",
  },
  {
    value: "workbook",
    label: "Workbook / Fill-In",
    description: "Interactive templates (max 1800 words)",
    icon: FileEdit,
    hint: "Mostly interactive elements, minimal prose",
    featureFlag: FEATURES.enableWorkbooks,
  },
  {
    value: "comic",
    label: "Comic / Graphic",
    description: "Visual storytelling with dialogue",
    icon: ImageIcon,
    hint: "Panel-based layout with dialogue",
    badge: "Visual",
    featureFlag: FEATURES.enableComics,
  },
  {
    value: "children",
    label: "Children's Book",
    description: "Simple, visual-first storytelling",
    icon: Baby,
    hint: "Short sentences, high image ratio",
    badge: "Visual",
    featureFlag: FEATURES.enableIllustrated,
  },
  {
    value: "reference",
    label: "Reference / Handbook",
    description: "Quick reference materials",
    icon: FileSpreadsheet,
    hint: "Structured lookup, comprehensive coverage",
  },
  {
    value: "text",
    label: "Standard Text",
    description: "Traditional book format",
    icon: BookText,
    hint: "Flexible structure, general purpose",
  },
];

// Filter by feature flags
const BOOK_TYPES = ALL_BOOK_TYPES.filter(t => t.featureFlag !== false);


export function BookTypeSelector({
  value,
  onChange,
  disabled,
  required = true,
  showError,
}: BookTypeSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-foreground font-medium">
            Book Type {required ? "*" : ""}
          </Label>
          <span className="text-xs text-muted-foreground">(Determines content structure)</span>
        </div>
        {showError && (
          <span className="text-xs text-destructive">Required</span>
        )}
      </div>
      
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as ExtendedBookType)}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        disabled={disabled}
        aria-invalid={showError ? true : undefined}
      >
        {BOOK_TYPES.map((type) => (
          <div
            key={type.value}
            className={`relative flex items-start space-x-2 p-3 rounded-lg border transition-colors cursor-pointer ${
              value === type.value
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : showError
                  ? "border-destructive/50"
                  : "border-border/50 hover:border-primary/50 hover:bg-muted/30"
            }`}
            onClick={() => !disabled && onChange(type.value)}
          >
            <RadioGroupItem value={type.value} id={`type-${type.value}`} className="mt-1" />
            <Label
              htmlFor={`type-${type.value}`}
              className="flex flex-col gap-1 cursor-pointer flex-1"
            >
              <div className="flex items-center gap-2">
                <type.icon className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium">{type.label}</span>
                {type.badge && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    {type.badge}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{type.description}</p>
              {value === type.value && (
                <p className="text-[10px] text-primary/80 mt-1 border-t border-primary/20 pt-1">
                  {type.hint}
                </p>
              )}
            </Label>
          </div>
        ))}
      </RadioGroup>
      
      {value && (
        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
          The selected book type determines the writing style, structure, and content format of your generated book.
        </p>
      )}
    </div>
  );
}
