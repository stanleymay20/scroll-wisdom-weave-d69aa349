import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, ExternalLink, Copy, CheckCircle2, AlertTriangle, 
  BookOpen, FileText, GraduationCap, Link2, Database,
  ChevronDown, ChevronUp, Shield, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { 
  AcademicSource, 
  CitationStyle, 
  formatBibliographyEntry, 
  formatInTextCitation,
  getCitationConfidence,
  formatConfidenceLabel 
} from "@/lib/citations";
import { cn } from "@/lib/utils";

interface DeepResearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sources: AcademicSource[];
  metadata: {
    totalSources: number;
    verifiedSources: number;
    peerReviewedSources: number;
    databasesCovered: string[];
    researchDate: string;
    confidenceScore: 'high' | 'moderate' | 'low' | 'insufficient';
    topicCoverage: number;
  };
  citationStyle: CitationStyle;
  suggestedRefinements?: string[];
}

const SOURCE_TYPE_ICONS: Record<string, any> = {
  journal: FileText,
  book: BookOpen,
  article: FileText,
  conference: GraduationCap,
  preprint: Clock,
  thesis: GraduationCap,
  report: FileText,
};

const DATABASE_COLORS: Record<string, string> = {
  'OpenAlex': 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  'CrossRef': 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  'Semantic Scholar': 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  'arXiv': 'bg-red-500/20 text-red-400 border-red-500/50',
  'PubMed': 'bg-green-500/20 text-green-400 border-green-500/50',
  'Perplexity Academic': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50',
};

const CONFIDENCE_COLORS = {
  high: 'text-green-400 bg-green-500/20 border-green-500/50',
  moderate: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50',
  low: 'text-orange-400 bg-orange-500/20 border-orange-500/50',
  insufficient: 'text-red-400 bg-red-500/20 border-red-500/50',
};

export function DeepResearchPanel({
  isOpen,
  onClose,
  sources,
  metadata,
  citationStyle,
  suggestedRefinements,
}: DeepResearchPanelProps) {
  const { toast } = useToast();
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyReference = async (source: AcademicSource) => {
    const reference = formatBibliographyEntry(source, citationStyle);
    await navigator.clipboard.writeText(reference);
    setCopiedId(source.id);
    toast({
      title: "Reference copied",
      description: `${citationStyle} format copied to clipboard`,
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyInText = async (source: AcademicSource) => {
    const citation = formatInTextCitation(source, citationStyle);
    await navigator.clipboard.writeText(citation);
    toast({
      title: "In-text citation copied",
      description: citation,
    });
  };

  const handleCopyAllReferences = async () => {
    const allRefs = sources
      .map(s => formatBibliographyEntry(s, citationStyle))
      .join('\n\n');
    await navigator.clipboard.writeText(allRefs);
    toast({
      title: "All references copied",
      description: `${sources.length} references in ${citationStyle} format`,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed right-0 top-0 h-full w-full max-w-lg bg-background/95 backdrop-blur-xl border-l border-border shadow-2xl z-50 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Database className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <h2 className="font-semibold">Deep Research Sources</h2>
                <p className="text-xs text-muted-foreground">
                  {metadata.verifiedSources} verified • {metadata.peerReviewedSources} peer-reviewed
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Confidence Score */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Research Confidence</span>
              <Badge className={cn("capitalize", CONFIDENCE_COLORS[metadata.confidenceScore])}>
                <Shield className="h-3 w-3 mr-1" />
                {metadata.confidenceScore}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {formatConfidenceLabel(metadata.confidenceScore)}
            </p>
            
            {/* Progress bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${metadata.topicCoverage}%` }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className={cn(
                  "h-full rounded-full",
                  metadata.confidenceScore === 'high' ? 'bg-green-500' :
                  metadata.confidenceScore === 'moderate' ? 'bg-yellow-500' :
                  metadata.confidenceScore === 'low' ? 'bg-orange-500' : 'bg-red-500'
                )}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Topic Coverage</span>
              <span>{metadata.topicCoverage}%</span>
            </div>
          </div>

          {/* Databases Covered */}
          <div className="p-4 border-b border-border">
            <p className="text-xs text-muted-foreground mb-2">Databases Queried</p>
            <div className="flex flex-wrap gap-2">
              {metadata.databasesCovered.map((db) => (
                <Badge 
                  key={db} 
                  variant="outline" 
                  className={cn("text-[10px]", DATABASE_COLORS[db] || '')}
                >
                  {db}
                </Badge>
              ))}
            </div>
          </div>

          {/* Suggested Refinements */}
          {suggestedRefinements && suggestedRefinements.length > 0 && metadata.confidenceScore !== 'high' && (
            <div className="p-4 border-b border-border bg-amber-500/5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-400">Improve Source Coverage</p>
                  <ul className="mt-2 space-y-1">
                    {suggestedRefinements.map((suggestion, i) => (
                      <li key={i} className="text-xs text-muted-foreground">• {suggestion}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Sources List */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{citationStyle} References ({sources.length})</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCopyAllReferences}
                  className="text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy All
                </Button>
              </div>

              {sources.map((source) => {
                const TypeIcon = SOURCE_TYPE_ICONS[source.type] || FileText;
                const confidence = getCitationConfidence(source);
                const isExpanded = expandedSource === source.id;

                return (
                  <motion.div
                    key={source.id}
                    layout
                    className={cn(
                      "p-3 rounded-lg border transition-colors",
                      source.verified 
                        ? "bg-card border-border hover:border-green-500/50" 
                        : "bg-muted/50 border-border/50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-1.5 rounded",
                        confidence === 'verified' ? "bg-green-500/20" :
                        confidence === 'partial' ? "bg-yellow-500/20" : "bg-muted"
                      )}>
                        <TypeIcon className={cn(
                          "h-4 w-4",
                          confidence === 'verified' ? "text-green-500" :
                          confidence === 'partial' ? "text-yellow-500" : "text-muted-foreground"
                        )} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium line-clamp-2">{source.title}</h4>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-[10px] flex-shrink-0",
                                    confidence === 'verified' ? "border-green-500/50 text-green-400" :
                                    confidence === 'partial' ? "border-yellow-500/50 text-yellow-400" : 
                                    "border-red-500/50 text-red-400"
                                  )}
                                >
                                  {confidence === 'verified' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                  {confidence}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {confidence === 'verified' && "DOI verified, peer-reviewed"}
                                {confidence === 'partial' && "Partially verified - check before use"}
                                {confidence === 'unverified' && "Unverified - manual verification required"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        
                        <p className="text-xs text-muted-foreground mt-1">
                          {source.authors.slice(0, 3).join(', ')}
                          {source.authors.length > 3 && ' et al.'} ({source.year})
                        </p>
                        
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge 
                            variant="outline" 
                            className={cn("text-[10px]", DATABASE_COLORS[source.database] || '')}
                          >
                            {source.database}
                          </Badge>
                          {source.journal && (
                            <span className="text-[10px] text-muted-foreground italic truncate max-w-[150px]">
                              {source.journal}
                            </span>
                          )}
                          {source.citationCount && source.citationCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {source.citationCount} citations
                            </span>
                          )}
                        </div>

                        {/* Expandable details */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 pt-3 border-t border-border space-y-2">
                                {source.abstract && (
                                  <p className="text-xs text-muted-foreground line-clamp-3">
                                    {source.abstract}
                                  </p>
                                )}
                                <div className="p-2 rounded bg-muted/50 text-xs font-mono break-all">
                                  {formatBibliographyEntry(source, citationStyle)}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Actions */}
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedSource(isExpanded ? null : source.id)}
                            className="h-7 text-xs"
                          >
                            {isExpanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                            {isExpanded ? 'Less' : 'More'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyReference(source)}
                            className="h-7 text-xs"
                          >
                            {copiedId === source.id ? (
                              <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3 mr-1" />
                            )}
                            Ref
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyInText(source)}
                            className="h-7 text-xs"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            In-text
                          </Button>
                          {(source.doi || source.url) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(
                                source.doi ? `https://doi.org/${source.doi}` : source.url,
                                '_blank'
                              )}
                              className="h-7 text-xs"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              {source.doi ? 'DOI' : 'Link'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="p-4 border-t border-border bg-muted/30">
            <p className="text-[10px] text-muted-foreground text-center">
              Sources retrieved from verified academic databases on {new Date(metadata.researchDate).toLocaleDateString()}.
              <br />
              ScrollLibrary does not replace academic judgment. Verify all citations before submission.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
