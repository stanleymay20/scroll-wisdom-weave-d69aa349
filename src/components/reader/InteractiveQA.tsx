import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MessageCircle, 
  Send, 
  Loader2, 
  X, 
  Lightbulb,
  HelpCircle,
  Sparkles,
  Volume2,
  VolumeX,
  Save,
  BookmarkPlus
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { HighlightedTextContext } from "./TextHighlighter";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  audioContent?: string;
}

interface InteractiveQAProps {
  chapterContent: string;
  chapterTitle: string;
  bookTitle: string;
  bookId?: string;
  chapterId?: string;
  isOpen: boolean;
  onClose: () => void;
  highlightedText?: string;
  onClearHighlight?: () => void;
}

const SUGGESTED_QUESTIONS = [
  "Explain this in simpler terms",
  "What are the key takeaways?",
  "How does this apply in practice?",
  "Can you give me an example?",
];

export function InteractiveQA({ 
  chapterContent, 
  chapterTitle, 
  bookTitle,
  bookId,
  chapterId,
  isOpen, 
  onClose,
  highlightedText,
  onClearHighlight,
}: InteractiveQAProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [speakResponses, setSpeakResponses] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Play audio response
  const playAudio = useCallback((audioContent: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(`data:audio/mpeg;base64,${audioContent}`);
    audio.onplay = () => setIsPlayingAudio(true);
    audio.onended = () => setIsPlayingAudio(false);
    audio.onerror = () => setIsPlayingAudio(false);
    audioRef.current = audio;
    audio.play().catch(console.error);
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlayingAudio(false);
  }, []);

  const sendMessage = async (question: string) => {
    if (!question.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("interactive-qa", {
        body: {
          question: question.trim(),
          chapterContent: chapterContent.slice(0, 8000),
          chapterTitle,
          bookTitle,
          conversationHistory: messages.slice(-6),
          highlightedText: highlightedText || undefined,
          speakResponse: speakResponses,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data?.answer || "I couldn't generate a response. Please try again.",
        audioContent: data?.audioContent,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Auto-play audio if enabled
      if (speakResponses && data?.audioContent) {
        playAudio(data.audioContent);
      }

      // Clear highlighted text after asking about it
      if (highlightedText && onClearHighlight) {
        onClearHighlight();
      }
    } catch (err) {
      console.error("[InteractiveQA] Error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to get answer";
      
      if (errorMessage.includes("429") || errorMessage.includes("Rate limit")) {
        toast({
          title: "Rate Limited",
          description: "Too many requests. Please wait a moment.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("402") || errorMessage.includes("Payment")) {
        toast({
          title: "Credits Required",
          description: "Please add funds to continue using AI features.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const saveAsNote = async () => {
    if (messages.length < 2) {
      toast({ title: "Nothing to save", description: "Have a conversation first." });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Sign in required", description: "Please sign in to save notes.", variant: "destructive" });
        return;
      }

      if (!bookId) {
        toast({ title: "Error", description: "Book information missing.", variant: "destructive" });
        return;
      }

      await (supabase.from("study_notes") as any).insert({
        user_id: user.id,
        book_id: bookId,
        chapter_id: chapterId || null,
        note_type: highlightedText ? "highlight_qa" : "qa_conversation",
        title: `Q&A: ${messages[0]?.content.slice(0, 50)}...`,
        content: { messages },
        highlighted_text: highlightedText || null,
      });

      toast({ title: "Saved!", description: "Conversation saved to your study notes." });
    } catch (err) {
      console.error("Save error:", err);
      toast({ title: "Save failed", description: "Could not save notes.", variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="fixed bottom-20 right-4 md:right-8 z-50 w-[calc(100%-2rem)] max-w-md"
      >
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-scroll-gold/10">
                <Sparkles className="h-4 w-4 text-scroll-gold" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Ask AI</h3>
                <p className="text-xs text-muted-foreground">Get explanations as you read</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Voice toggle */}
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", speakResponses && "text-primary")}
                onClick={() => {
                  if (isPlayingAudio) stopAudio();
                  setSpeakResponses(!speakResponses);
                }}
                title={speakResponses ? "Voice responses on" : "Voice responses off"}
              >
                {isPlayingAudio ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              {/* Save button */}
              {messages.length >= 2 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={saveAsNote}
                  title="Save as study note"
                >
                  <BookmarkPlus className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages Area */}
          <ScrollArea className="h-64 p-4" ref={scrollRef}>
            {/* Show highlighted text context */}
            {highlightedText && (
              <HighlightedTextContext text={highlightedText} />
            )}

            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <HelpCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {highlightedText 
                      ? "Ask about the highlighted text"
                      : "Ask questions about what you're reading"}
                  </p>
                </div>
                
                {/* Suggested Questions */}
                {!highlightedText && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" />
                      Try asking:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_QUESTIONS.map((q, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="text-xs h-auto py-1.5 px-3"
                          onClick={() => sendMessage(q)}
                        >
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {message.content}
                      {message.role === "assistant" && message.audioContent && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 ml-2 inline-flex"
                          onClick={() => playAudio(message.audioContent!)}
                        >
                          <Volume2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-border">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={highlightedText ? "Ask about this selection..." : "Ask a question about this chapter..."}
                className="min-h-[44px] max-h-24 resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <Button 
                type="submit" 
                size="icon"
                disabled={!input.trim() || isLoading}
                className="flex-shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Floating button to open Q&A
export function InteractiveQAButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      className="h-12 w-12 rounded-full bg-scroll-gold hover:bg-scroll-gold/90 text-scroll-dark shadow-lg"
    >
      <MessageCircle className="h-5 w-5" />
    </Button>
  );
}
