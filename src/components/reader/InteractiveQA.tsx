import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
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
  BookmarkPlus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { HighlightedTextContext } from "./TextHighlighter";
import { useLanguage } from "@/contexts/LanguageContext";

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
  cognitiveLevel?: string;
}

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
  cognitiveLevel = "functional",
}: InteractiveQAProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [speakResponses, setSpeakResponses] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMountedRef = useRef(true);
  const { toast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
    };
  }, []);

  const SUGGESTED_QUESTIONS = [
    t('qa.explain'),
    t('qa.keyTakeaways'),
    t('qa.apply'),
    t('qa.example'),
  ];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    // Small delay to ensure DOM has updated
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isLoading]);

  // Play audio response
  const playAudio = useCallback((audioContent: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    const audio = new Audio(`data:audio/mpeg;base64,${audioContent}`);
    audio.onplay = () => { if (isMountedRef.current) setIsPlayingAudio(true); };
    audio.onended = () => { if (isMountedRef.current) setIsPlayingAudio(false); };
    audio.onerror = () => { if (isMountedRef.current) setIsPlayingAudio(false); };
    audioRef.current = audio;
    audio.play().catch(console.error);
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsPlayingAudio(false);
  }, []);

  // Send message (works for both text and transcribed voice)
  const sendMessage = async (question: string) => {
    if (!question.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question.trim(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("You need to sign in again to use AI voice tools.");
      }

      // Ask AI stays text-first; optional TTS is generated separately only when enabled
      const authHeaders = { Authorization: `Bearer ${accessToken}` };

      let responseText = "";
      let responseAudio: string | undefined;

      const { data, error } = await supabase.functions.invoke("interactive-qa", {
        body: {
          question: question.trim(),
          chapterContent: chapterContent.slice(0, 8000),
          chapterTitle,
          bookTitle,
          conversationHistory: messages.slice(-6),
          highlightedText: highlightedText || undefined,
          speakResponse: false,
        },
        headers: authHeaders,
      });
      if (!isMountedRef.current) return;
      if (error) throw new Error(data?.error || error.message);
      responseText = data?.answer || "";
      responseAudio = data?.audioContent;

      if (!responseAudio && speakResponses && responseText) {
        const { data: ttsData, error: ttsError } = await supabase.functions.invoke("voice-tts", {
          body: { text: responseText, voice: "nova" },
          headers: authHeaders,
        });
        if (!isMountedRef.current) return;
        if (ttsError) throw new Error(ttsData?.error || ttsError.message);
        responseAudio = ttsData?.audioContent;
      }

      if (!responseText) throw new Error("No response received");

      setMessages([...newMessages, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: responseText,
        audioContent: responseAudio,
      }]);

      // Auto-play audio if enabled
      if (speakResponses && responseAudio && isMountedRef.current) {
        playAudio(responseAudio);
      }

      if (highlightedText && onClearHighlight) {
        onClearHighlight();
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("[InteractiveQA] Error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to get answer";
      toast({
        title: t('common.error'),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const saveAsNote = async () => {
    if (messages.length < 2) {
      toast({ title: t('qa.nothingToSave'), description: t('qa.conversationFirst') });
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !bookId) return;

      const { error } = await supabase.from("study_notes").insert([{
        user_id: user.id,
        book_id: bookId,
        chapter_id: chapterId || null,
        note_type: highlightedText ? "highlight_qa" : "qa_conversation",
        title: `Q&A: ${messages[0]?.content.slice(0, 50)}...`,
        content: { messages },
        highlighted_text: highlightedText || null,
      } as any]);
      if (error) throw error;
      toast({ title: t('qa.saved'), description: t('qa.savedDesc') });
    } catch (err) {
      toast({ title: t('qa.saveFailed'), description: t('qa.saveFailedDesc'), variant: "destructive" });
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
        className="fixed bottom-20 left-4 right-4 md:left-auto md:right-8 z-50 w-auto md:w-[calc(100%-2rem)] md:max-w-md"
      >
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{t('qa.title')}</h3>
                <p className="text-xs text-muted-foreground">
                  Text-first chapter Q&A
                </p>
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
                title={speakResponses ? "Voice responses ON" : "Voice responses OFF"}
              >
                {isPlayingAudio ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              {messages.length >= 2 && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={saveAsNote} title={t('qa.saveNote')}>
                  <BookmarkPlus className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages Area */}
          <ScrollArea className="h-[min(56vh,26rem)] p-4">
            {highlightedText && <HighlightedTextContext text={highlightedText} />}

            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <HelpCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {highlightedText ? t('qa.askHighlighted') : "Ask questions by typing or using voice 🎙️"}
                  </p>
                </div>
                {!highlightedText && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" /> {t('qa.tryAsking')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_QUESTIONS.map((q, i) => (
                        <Button key={i} variant="outline" size="sm" className="text-xs h-auto py-1.5 px-3" onClick={() => sendMessage(q)}>
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
                  <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {message.role === "assistant" && message.audioContent && (
                        <Button variant="ghost" size="sm" className="mt-1 h-6 text-xs gap-1" onClick={() => playAudio(message.audioContent!)}>
                          <Volume2 className="h-3 w-3" /> Replay
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input Area — text-only Ask AI */}
          <div className="p-3 sm:p-4 border-t border-border">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={highlightedText ? t('qa.placeholderHighlight') : t('qa.placeholder')}
                className="min-h-[44px] max-h-24 resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={!input.trim() || isLoading} className="flex-shrink-0">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Floating button to open Q&A
export const InteractiveQAButton = forwardRef<HTMLButtonElement, { onClick: () => void }>(
  function InteractiveQAButton({ onClick }, ref) {
    return (
      <Button ref={ref} onClick={onClick} variant="outline" size="sm" className="gap-2 justify-start">
        <MessageCircle className="h-4 w-4" />
        <span className="text-xs">Ask AI</span>
      </Button>
    );
  }
);
