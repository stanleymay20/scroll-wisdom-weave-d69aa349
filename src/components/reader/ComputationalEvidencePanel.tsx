import { useState } from "react";
import { FlaskConical, Download, Copy, Check, ChevronDown, ChevronUp, Shield, AlertTriangle } from "lucide-react";
import { 
  type ParsedEvidenceBlock, 
  getEvidenceStatusColor, 
  getEvidenceStatusLabel,
  validateVisualizationCode,
} from "@/lib/computationalEvidence";
import { StructuredCodeBlock, type StructuredCodeBlockData } from "./StructuredCodeBlock";

interface ComputationalEvidencePanelProps {
  block: ParsedEvidenceBlock;
  index: number;
}

export function ComputationalEvidencePanel({ block, index }: ComputationalEvidencePanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const validation = validateVisualizationCode(block.code);
  const statusColor = getEvidenceStatusColor(block.status);
  const statusLabel = getEvidenceStatusLabel(block.status);

  const handleCopyNotebook = () => {
    const notebook = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
        language_info: { name: "python", version: "3.10.0" },
        scrollverified: {
          claim_id: block.claimId,
          seed: block.seed,
          status: block.status,
          generated_by: "ScrollVerified™ Computational Evidence Engine",
          timestamp: new Date().toISOString(),
        },
      },
      cells: [
        {
          cell_type: "markdown",
          metadata: {},
          source: [
            `# ScrollVerified™ Computational Evidence\n`,
            `**Claim ID:** ${block.claimId}\n`,
            `**Status:** ${statusLabel}\n`,
            `**Seed:** ${block.seed}\n`,
            `**Libraries:** ${block.libraries.join(', ')}\n`,
            `**Data:** ${block.dataDisclaimer}\n`,
          ],
        },
        {
          cell_type: "code",
          metadata: {},
          source: block.code.split('\n').map((l: string) => l + '\n'),
          outputs: [],
          execution_count: null,
        },
      ],
    }, null, 2);

    const blob = new Blob([notebook], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scrollverified_evidence_${block.claimId}.ipynb`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(block.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = block.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Build StructuredCodeBlockData for rendering
  const codeBlockData: StructuredCodeBlockData = {
    language: block.language,
    title: `Computational Evidence — ${block.claimId}`,
    purpose: block.dataDisclaimer,
    code: block.code,
    output: block.output || undefined,
    explanation: `Reproducibility seed: ${block.seed}. Libraries: ${block.libraries.join(', ')}.`,
  };

  return (
    <div className="my-6 rounded-lg border border-border/50 overflow-hidden bg-card/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border/30">
        <div className="flex items-center gap-3">
          <FlaskConical size={18} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">
            🔬 Computational Evidence #{index + 1}
          </span>
          <span className={`px-2 py-0.5 text-xs font-mono rounded border ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground bg-background/50 hover:bg-background/80 rounded transition-all"
            title="Copy code"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
          <button
            onClick={handleCopyNotebook}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground bg-background/50 hover:bg-background/80 rounded transition-all"
            title="Download as Jupyter Notebook"
          >
            <Download size={14} />
            <span>.ipynb</span>
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Audit metadata */}
          <div className="px-4 py-2 bg-muted/20 border-b border-border/20 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span><strong>Claim:</strong> {block.claimId}</span>
            <span><strong>Seed:</strong> {block.seed}</span>
            <span><strong>Libraries:</strong> {block.libraries.join(', ')}</span>
          </div>

          {/* Data source disclaimer */}
          <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/20 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              <strong>Data Source:</strong> {block.dataDisclaimer}
            </p>
          </div>

          {/* Code block */}
          <StructuredCodeBlock data={codeBlockData} />

          {/* Validation warnings */}
          {!validation.valid && (
            <div className="px-4 py-2 bg-destructive/5 border-t border-destructive/20">
              <div className="flex items-center gap-2 mb-1">
                <Shield size={14} className="text-destructive" />
                <span className="text-xs font-medium text-destructive">Visualization Standards</span>
              </div>
              {validation.issues.map((issue, i) => (
                <p key={i} className="text-xs text-destructive/80 ml-6">⚠ {issue}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
