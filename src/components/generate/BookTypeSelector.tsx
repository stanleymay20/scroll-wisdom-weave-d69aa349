import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  BookOpen, BookImage, Image as ImageIcon, 
  GraduationCap, Briefcase, FileEdit, BookText, FileSpreadsheet,
  Code, Baby, Sparkles, BookMarked
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";

/**
 * CONTRACT 3 — CONTENT-TYPE FIDELITY
 * Book Type is a GOVERNING CONSTITUTION, not a hint.
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
  labelKey: string;
  descKey: string;
  icon: React.ComponentType<{ className?: string }>;
  contractHint: string;
  badge?: string;
}

const BOOK_TYPES: BookTypeOption[] = [
  {
    value: "academic",
    labelKey: "Academic Textbook",
    descKey: "Scholarly content with citations",
    icon: GraduationCap,
    contractHint: "Formal tone, citations required, no storytelling",
    badge: "ARM",
  },
  {
    value: "bestseller",
    labelKey: "Bestseller / Trade",
    descKey: "Narrative-driven transformation",
    icon: Sparkles,
    contractHint: "Hooks, stories, emotional engagement",
  },
  {
    value: "technical",
    labelKey: "Technical Guide",
    descKey: "Code-heavy, hands-on learning",
    icon: Code,
    contractHint: "40%+ code, exercises, literal titles",
  },
  {
    value: "professional",
    labelKey: "Professional Guide",
    descKey: "Business & industry frameworks",
    icon: Briefcase,
    contractHint: "Frameworks, actionable, decision tools",
  },
  {
    value: "workbook",
    labelKey: "Workbook / Fill-In",
    descKey: "Interactive templates (max 1800 words)",
    icon: FileEdit,
    contractHint: "70%+ interactive, minimal prose",
  },
  {
    value: "comic",
    labelKey: "Comic / Graphic",
    descKey: "Visual storytelling with dialogue",
    icon: ImageIcon,
    contractHint: "4-6 panels, every panel has dialogue",
    badge: "Visual",
  },
  {
    value: "children",
    labelKey: "Children's Book",
    descKey: "Simple, visual-first storytelling",
    icon: Baby,
    contractHint: "Short sentences, high image ratio",
    badge: "Visual",
  },
  {
    value: "reference",
    labelKey: "Reference / Handbook",
    descKey: "Quick reference materials",
    icon: FileSpreadsheet,
    contractHint: "Structured lookup, comprehensive",
  },
  {
    value: "text",
    labelKey: "Standard Text",
    descKey: "Traditional book format",
    icon: BookText,
    contractHint: "Flexible structure",
  },
];

export function BookTypeSelector({
  value,
  onChange,
  disabled,
  required = true,
  showError,
}: BookTypeSelectorProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-foreground font-medium">
            Book Type {required ? "*" : ""}
          </Label>
          <span className="text-xs text-muted-foreground">(Governs all generation)</span>
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
                <span className="text-sm font-medium">{type.labelKey}</span>
                {type.badge && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    {type.badge}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{type.descKey}</p>
              {value === type.value && (
                <p className="text-[10px] text-primary/80 mt-1 border-t border-primary/20 pt-1">
                  📋 {type.contractHint}
                </p>
              )}
            </Label>
          </div>
        ))}
      </RadioGroup>
      
      {value && (
        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
          ⚠️ <strong>Contract 3:</strong> Once selected, book type governs all generation. 
          Content will be validated against {BOOK_TYPES.find(t => t.value === value)?.labelKey} rules.
        </p>
      )}
    </div>
  );
}
