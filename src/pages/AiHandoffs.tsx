import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Bot,
  Check,
  ExternalLink,
  GitCompareArrows,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

type ProposalStatus = "proposed" | "accepted" | "rejected" | "superseded";

interface BookContext {
  book: {
    id: string;
    title: string;
    work_id: string | null;
    current_publication_id: string | null;
    certified_live: boolean;
    updated_at: string | null;
  };
  chapters: Array<{
    id: string;
    chapter_number: number;
    title: string;
    word_count: number | null;
    version_number: number | null;
    updated_at: string | null;
  }>;
  publication_scope_hash: string | null;
}

interface ProposalSummary {
  id: string;
  chapter_id: string;
  provider: string;
  source_model: string | null;
  status: ProposalStatus;
  proposed_title: string | null;
  rationale: string | null;
  proposed_content_preview: string;
  proposed_content_hash: string;
  base_content_hash: string;
  source_conversation_ref: string | null;
  created_at: string;
  decided_at: string | null;
}

interface ProposalDetail {
  proposal: ProposalSummary & {
    proposed_content: string;
    metadata: Record<string, unknown>;
  };
  current_chapter: {
    id: string;
    chapter_number: number;
    title: string;
    content: string | null;
    version_number: number | null;
    updated_at: string | null;
  } | null;
  current_base_hash: string | null;
  certified_live: boolean;
}

const STATUS_OPTIONS: Array<{ value: ProposalStatus; label: string }> = [
  { value: "proposed", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "superseded", label: "Superseded" },
];

function shortHash(value: string | null | undefined) {
  if (!value) return "—";
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function providerLabel(provider: string, model: string | null) {
  const base = provider === "chatgpt"
    ? "ChatGPT"
    : provider === "claude"
      ? "Claude"
      : provider === "gemini"
        ? "Gemini"
        : "External AI";
  return model ? `${base} · ${model}` : base;
}

export default function AiHandoffs() {
  const { bookId } = useParams<{ bookId: string }>();
  const { toast } = useToast();
  const [context, setContext] = useState<BookContext | null>(null);
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [status, setStatus] = useState<ProposalStatus>("proposed");
  const [selected, setSelected] = useState<ProposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);

  const chapterById = useMemo(
    () => new Map((context?.chapters ?? []).map((chapter) => [chapter.id, chapter])),
    [context?.chapters],
  );

  const invoke = useCallback(async <T,>(body: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.functions.invoke("ai-publishing-bridge", { body });
    if (error) throw error;
    if (data?.error) {
      const message = typeof data.error === "string" ? data.error : "AI handoff request failed";
      throw new Error(message);
    }
    return data as T;
  }, []);

  const load = useCallback(async () => {
    if (!bookId) return;
    setLoading(true);
    try {
      const [bookContext, proposalData] = await Promise.all([
        invoke<BookContext>({ action: "book_context", book_id: bookId }),
        invoke<{ proposals: ProposalSummary[] }>({
          action: "list_proposals",
          book_id: bookId,
          status,
          limit: 100,
        }),
      ]);
      setContext(bookContext);
      setProposals(proposalData.proposals ?? []);
      setSelected((current) => {
        if (!current) return null;
        const stillVisible = (proposalData.proposals ?? []).some(
          (proposal) => proposal.id === current.proposal.id,
        );
        return stillVisible ? current : null;
      });
    } catch (error) {
      toast({
        title: "Could not load AI handoffs",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [bookId, invoke, status, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openProposal = async (proposalId: string) => {
    setDetailLoading(true);
    try {
      const detail = await invoke<ProposalDetail>({
        action: "proposal_detail",
        proposal_id: proposalId,
      });
      setSelected(detail);
    } catch (error) {
      toast({
        title: "Could not open proposal",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const decide = async (action: "accept_proposal" | "reject_proposal") => {
    if (!selected) return;
    setDecisionLoading(true);
    try {
      const result = await invoke<Record<string, unknown>>({
        action,
        proposal_id: selected.proposal.id,
      });
      toast({
        title: action === "accept_proposal" ? "Revision accepted" : "Proposal rejected",
        description: action === "accept_proposal"
          ? "The canonical chapter was versioned and the prior publication trust scope is now stale."
          : "The external proposal was retained in the provenance record but not applied.",
      });
      setSelected(null);
      await load();
      if (result.reason === "certified_revision_required") {
        toast({
          title: "Revision edition required",
          description: "Certified live manuscript content cannot be changed in place.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: action === "accept_proposal" ? "Revision not accepted" : "Could not reject proposal",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDecisionLoading(false);
    }
  };

  if (!bookId) return null;

  return (
    <div className="container max-w-7xl py-10 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-3 mb-2">
            <Link to={`/book/${bookId}/publishing`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Publishing Command Center
            </Link>
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-4 w-4" />
            External AI → canonical publishing workflow
          </div>
          <h1 className="text-3xl font-semibold mt-1">
            AI Handoff Inbox
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            ChatGPT, Claude and other AI systems may propose manuscript changes here.
            Nothing becomes canonical until ScrollLibrary verifies the base version and you accept it.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {context && (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Canonical book</div>
              <div className="text-xl font-semibold">{context.book.title}</div>
              <div className="text-xs text-muted-foreground mt-1 font-mono">
                publication scope {shortHash(context.publication_scope_hash)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {context.book.certified_live ? (
                <Badge variant="outline" className="border-amber-500/40 text-amber-700">
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                  Certified live — immutable
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">
                  Draft manuscript — proposals may be accepted
                </Badge>
              )}
              <Button asChild size="sm" variant="ghost">
                <Link to={`/book/${bookId}`}>
                  Open book <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
          {context.book.certified_live && (
            <p className="text-sm text-muted-foreground mt-4">
              You can still collect and review external AI proposals. Direct mutation is blocked;
              applying one requires a revision/new-edition workflow so the certified release remains immutable.
            </p>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={status === option.value ? "default" : "outline"}
            onClick={() => {
              setStatus(option.value);
              setSelected(null);
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <Card className="p-4 min-h-[520px]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold">Proposals</h2>
              <p className="text-xs text-muted-foreground">
                {proposals.length} {status}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : proposals.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">
              No {status} AI handoffs for this book.
            </div>
          ) : (
            <div className="space-y-3">
              {proposals.map((proposal) => {
                const chapter = chapterById.get(proposal.chapter_id);
                return (
                  <button
                    key={proposal.id}
                    type="button"
                    onClick={() => void openProposal(proposal.id)}
                    className="w-full text-left rounded-lg border p-4 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">
                          Chapter {chapter?.chapter_number ?? "?"}: {proposal.proposed_title || chapter?.title || "Revision"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {providerLabel(proposal.provider, proposal.source_model)}
                        </div>
                      </div>
                      <Badge variant="secondary">{proposal.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-3">
                      {proposal.proposed_content_preview}
                    </p>
                    {proposal.rationale && (
                      <p className="text-xs mt-2">
                        <span className="text-muted-foreground">Rationale:</span>{" "}
                        {proposal.rationale}
                      </p>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-3">
                      {new Date(proposal.created_at).toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5 min-h-[520px]">
          {detailLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !selected ? (
            <div className="h-full min-h-[450px] flex items-center justify-center text-center">
              <div className="max-w-md">
                <GitCompareArrows className="h-9 w-9 mx-auto text-muted-foreground mb-3" />
                <h2 className="font-semibold">Review before canonicalization</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Select a proposal to compare the current chapter with the external AI revision.
                  ScrollLibrary checks the base hash again at acceptance time.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {providerLabel(selected.proposal.provider, selected.proposal.source_model)}
                  </div>
                  <h2 className="text-xl font-semibold">
                    Chapter {selected.current_chapter?.chapter_number ?? "?"}:{" "}
                    {selected.proposal.proposed_title || selected.current_chapter?.title}
                  </h2>
                </div>
                <Badge variant="outline">{selected.proposal.status}</Badge>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="text-muted-foreground">Proposal base</div>
                  <div className="font-mono mt-1">{shortHash(selected.proposal.base_content_hash)}</div>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="text-muted-foreground">Current canonical base</div>
                  <div className="font-mono mt-1">{shortHash(selected.current_base_hash)}</div>
                </div>
              </div>

              {selected.current_base_hash !== selected.proposal.base_content_hash && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  This proposal is stale. The canonical chapter changed after the AI read it.
                  Refresh the context and generate a new proposal instead of overwriting newer work.
                </div>
              )}

              <div className="grid xl:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium mb-2">Current canonical chapter</div>
                  <div className="rounded-lg border bg-muted/20 p-4 max-h-[520px] overflow-auto whitespace-pre-wrap text-sm leading-6">
                    {selected.current_chapter?.content || "No canonical content"}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Proposed revision</div>
                  <div className="rounded-lg border bg-muted/20 p-4 max-h-[520px] overflow-auto whitespace-pre-wrap text-sm leading-6">
                    {selected.proposal.proposed_content}
                  </div>
                </div>
              </div>

              {selected.proposal.rationale && (
                <div className="rounded-lg border p-4">
                  <div className="text-sm font-medium">Rationale</div>
                  <p className="text-sm text-muted-foreground mt-1">{selected.proposal.rationale}</p>
                </div>
              )}

              {selected.proposal.status === "proposed" && (
                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    onClick={() => void decide("reject_proposal")}
                    disabled={decisionLoading}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => void decide("accept_proposal")}
                    disabled={
                      decisionLoading ||
                      selected.certified_live ||
                      selected.current_base_hash !== selected.proposal.base_content_hash
                    }
                  >
                    {decisionLoading
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <Check className="h-4 w-4 mr-2" />}
                    Accept into canonical manuscript
                  </Button>
                </div>
              )}

              {selected.certified_live && selected.proposal.status === "proposed" && (
                <p className="text-xs text-muted-foreground text-right">
                  Acceptance is disabled because this is a certified live publication.
                  The proposal is preserved for the future revision-edition workflow.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
