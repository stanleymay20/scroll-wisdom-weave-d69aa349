import { useState } from "react";
import { motion } from "framer-motion";
import { 
  BookMarked, 
  X, 
  ExternalLink, 
  FileText, 
  BookOpen, 
  Newspaper,
  Building,
  CheckCircle,
  AlertCircle,
  Copy,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatReference, getConfidenceLabel, CitationStyle } from "@/lib/academicCategories";
import { useToast } from "@/hooks/use-toast";

interface Reference {
  author: string;
  title: string;
  year: number;
  type: string;
  doi?: string;
  url?: string;
  journal?: string;
  publisher?: string;
  requires_verification?: boolean;
}

interface ResearchMetadata {
  source_count?: number;
  source_types?: Record<string, number>;
  confidence_score?: string;
  research_date?: string;
}

interface ResearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  references: Reference[];
  metadata: ResearchMetadata;
  citationStyle: CitationStyle;
  isAcademicMode: boolean;
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  journal: <Newspaper className="h-4 w-4" />,
  book: <BookOpen className="h-4 w-4" />,
  article: <FileText className="h-4 w-4" />,
  report: <Building className="h-4 w-4" />,
  web: <ExternalLink className="h-4 w-4" />,
};

export function ResearchPanel({ 
  isOpen, 
  onClose, 
  references = [], 
  metadata = {},
  citationStyle,
  isAcademicMode 
}: ResearchPanelProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const handleCopyReference = (ref: Reference, index: number) => {
    const formatted = formatReference(ref, citationStyle);
    navigator.clipboard.writeText(formatted);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast({ title: "Reference copied", description: `${citationStyle} format` });
  };

  const confidence = getConfidenceLabel(references.length);
  const sourceTypes = metadata.source_types || {};

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className="fixed top-14 right-0 bottom-16 w-96 z-40 bg-card border-l border-border shadow-xl flex flex-col"
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium flex items-center gap-2">
            <BookMarked className="h-5 w-5 text-scroll-gold" />
            Research Panel
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-lg font-bold text-scroll-gold">{references.length}</p>
            <p className="text-[10px] text-muted-foreground">Sources</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-lg font-bold text-scroll-gold">{Object.keys(sourceTypes).length}</p>
            <p className="text-[10px] text-muted-foreground">Types</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-sm font-medium">{citationStyle}</p>
            <p className="text-[10px] text-muted-foreground">Style</p>
          </div>
        </div>

        {/* Confidence Score */}
        <div className="mt-3 flex items-center justify-between p-2 rounded-lg bg-muted/30">
          <span className="text-xs text-muted-foreground">Citation Density</span>
          <span className={`text-xs font-medium ${confidence.color}`}>
            {confidence.label}
          </span>
        </div>

        {metadata.research_date && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Research synthesized: {new Date(metadata.research_date).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Source Type Breakdown */}
      {Object.keys(sourceTypes).length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs text-muted-foreground mb-2">Source Types</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(sourceTypes).map(([type, count]) => (
              <Badge key={type} variant="secondary" className="text-xs">
                {SOURCE_ICONS[type] || <FileText className="h-3 w-3" />}
                <span className="ml-1 capitalize">{type}</span>
                <span className="ml-1 opacity-70">({count})</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* References List */}
      <ScrollArea className="flex-1 p-4">
        {references.length === 0 ? (
          <div className="text-center py-8">
            <BookMarked className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {isAcademicMode 
                ? "References will appear here after chapter generation"
                : "Enable Academic Research Mode for citations"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {references.map((ref, index) => (
              <div 
                key={index} 
                className="p-3 rounded-lg bg-muted/30 border border-border/50 group"
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    {SOURCE_ICONS[ref.type] || <FileText className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">{ref.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ref.author} ({ref.year})
                    </p>
                    {ref.journal && (
                      <p className="text-xs text-muted-foreground italic">{ref.journal}</p>
                    )}
                    
                    <div className="flex items-center gap-2 mt-2">
                      {ref.doi && (
                        <a 
                          href={`https://doi.org/${ref.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          DOI
                        </a>
                      )}
                      {ref.url && !ref.doi && (
                        <a 
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Link
                        </a>
                      )}
                      {ref.requires_verification && (
                        <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/50">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Verify
                        </Badge>
                      )}
                      {!ref.requires_verification && (
                        <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/50">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                    onClick={() => handleCopyReference(ref, index)}
                  >
                    {copiedIndex === index ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-muted/30">
        <p className="text-[10px] text-muted-foreground text-center">
          References sourced via Perplexity AI academic search. Verify before publication.
        </p>
      </div>
    </motion.div>
  );
}
