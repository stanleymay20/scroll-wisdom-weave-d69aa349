import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { 
  FileEdit, CheckSquare, PenLine, TableIcon, 
  MessageSquare, ListChecks, BookOpen 
} from "lucide-react";

interface WorkbookPreviewProps {
  title: string;
  numChapters: number;
  onDensityChange?: (density: "low" | "medium" | "high") => void;
}

const WORKBOOK_SKELETON = [
  {
    section: "Purpose",
    maxWords: 150,
    icon: BookOpen,
    description: "Clear chapter objective",
  },
  {
    section: "Key Concepts",
    maxWords: 300,
    icon: FileEdit,
    description: "Essential principles",
  },
  {
    section: "Fill-In Prompts",
    icon: PenLine,
    description: "Guided writing exercises",
    primary: true,
  },
  {
    section: "Tables / Worksheets",
    icon: TableIcon,
    description: "Structured data entry",
    primary: true,
  },
  {
    section: "Reflection Questions",
    icon: MessageSquare,
    description: "Deep thinking prompts",
  },
  {
    section: "Action Steps",
    icon: ListChecks,
    description: "Checkbox items with signature/date",
  },
];

const DENSITY_LABELS = {
  low: { label: "Low", prompts: "3-4", tables: "1" },
  medium: { label: "Medium", prompts: "5-7", tables: "2" },
  high: { label: "High", prompts: "8-10", tables: "3+" },
};

export function WorkbookPreview({ title, numChapters, onDensityChange }: WorkbookPreviewProps) {
  const [density, setDensity] = useState<"low" | "medium" | "high">("medium");

  const handleDensityChange = (value: number[]) => {
    const levels: ("low" | "medium" | "high")[] = ["low", "medium", "high"];
    const newDensity = levels[value[0]];
    setDensity(newDensity);
    onDensityChange?.(newDensity);
  };

  return (
    <Card className="bg-gradient-card border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileEdit className="h-5 w-5 text-primary" />
          Workbook Preview
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Each chapter will follow this exact structure (1,200-1,800 words max)
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Chapter Skeleton Preview */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Chapter Structure
          </Label>
          <div className="grid gap-2">
            {WORKBOOK_SKELETON.map((item) => (
              <div
                key={item.section}
                className={`flex items-center gap-3 p-2 rounded-lg ${
                  item.primary ? "bg-primary/10 border border-primary/30" : "bg-muted/30"
                }`}
              >
                <item.icon className={`h-4 w-4 flex-shrink-0 ${item.primary ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${item.primary ? "text-primary" : ""}`}>
                    {item.section}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                </div>
                {item.maxWords && (
                  <Badge variant="outline" className="text-xs">
                    ≤{item.maxWords}w
                  </Badge>
                )}
                {item.primary && (
                  <Badge className="text-xs bg-primary/20 text-primary border-0">
                    Primary
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Density Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Worksheet Density</Label>
            <Badge variant="secondary">{DENSITY_LABELS[density].label}</Badge>
          </div>
          <Slider
            value={[["low", "medium", "high"].indexOf(density)]}
            onValueChange={handleDensityChange}
            max={2}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Fewer prompts</span>
            <span>More prompts</span>
          </div>
          <p className="text-xs text-muted-foreground">
            ~{DENSITY_LABELS[density].prompts} fill-in prompts, ~{DENSITY_LABELS[density].tables} tables per chapter
          </p>
        </div>

        {/* Stats Preview */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/30">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{numChapters}</p>
            <p className="text-xs text-muted-foreground">Chapters</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">1,200-1,800</p>
            <p className="text-xs text-muted-foreground">Words/Chapter</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">≤30%</p>
            <p className="text-xs text-muted-foreground">Explanation</p>
          </div>
        </div>

        {/* Hard Cap Warning */}
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <p className="text-xs text-amber-400">
            <strong>Enforced:</strong> Workbook chapters are capped at 1,800 words. 
            Content that drifts into long narrative will be auto-regenerated with stricter constraints.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
