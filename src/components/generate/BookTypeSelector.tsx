import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  BookOpen, BookImage, Image as ImageIcon, 
  GraduationCap, Briefcase, FileEdit, BookText, FileSpreadsheet 
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export type ExtendedBookType = 
  | "academic" 
  | "professional" 
  | "workbook" 
  | "comic" 
  | "reference"
  | "text"
  | "illustrated";

interface BookTypeSelectorProps {
  value: ExtendedBookType;
  onChange: (value: ExtendedBookType) => void;
  disabled?: boolean;
}

const BOOK_TYPES = [
  {
    value: "academic" as const,
    labelKey: "Academic / Research",
    descKey: "Scholarly content with citations",
    icon: GraduationCap,
  },
  {
    value: "professional" as const,
    labelKey: "Professional Guide",
    descKey: "Business & industry guides",
    icon: Briefcase,
  },
  {
    value: "workbook" as const,
    labelKey: "Workbook / Fill-In",
    descKey: "Interactive templates",
    icon: FileEdit,
  },
  {
    value: "comic" as const,
    labelKey: "Comic / Illustrated",
    descKey: "Visual storytelling",
    icon: ImageIcon,
  },
  {
    value: "reference" as const,
    labelKey: "Reference / Handbook",
    descKey: "Quick reference materials",
    icon: FileSpreadsheet,
  },
  {
    value: "text" as const,
    labelKey: "Standard Text",
    descKey: "Traditional book format",
    icon: BookText,
  },
];

export function BookTypeSelector({ value, onChange, disabled }: BookTypeSelectorProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <Label className="text-foreground font-medium">Book Type *</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as ExtendedBookType)}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        disabled={disabled}
      >
        {BOOK_TYPES.map((type) => (
          <div
            key={type.value}
            className={`flex items-center space-x-2 p-3 rounded-lg border transition-colors cursor-pointer ${
              value === type.value
                ? "border-primary bg-primary/10"
                : "border-border/50 hover:border-primary/50"
            }`}
            onClick={() => !disabled && onChange(type.value)}
          >
            <RadioGroupItem value={type.value} id={`type-${type.value}`} />
            <Label
              htmlFor={`type-${type.value}`}
              className="flex items-center gap-2 cursor-pointer flex-1"
            >
              <type.icon className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{type.labelKey}</p>
                <p className="text-xs text-muted-foreground truncate">{type.descKey}</p>
              </div>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
