import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  X, 
  Loader2,
  Sparkles,
  Brain,
  BookOpen,
  Settings,
  Send,
  Keyboard,
  AudioLines,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEntitlements } from "@/hooks/useEntitlements";
import { cn } from "@/lib/utils";
import { COGNITIVE_LEVELS } from "./CognitiveLevelSelector";
import { useLanguage } from "@/contexts/LanguageContext";

interface Message {
  role: "user" | "assistant";
  content: string;
  audio?: string;
}

interface VoiceConversationProps {
  chapterContent: string;
  chapterTitle: string;
  bookTitle: string;
  cognitiveLevel: string;
  bookId: string;
  chapterId?: string;
  onClose: () => void;
  onResumeTTS?: () => void;
}

const VOICES = [
  { id: "nova", name: "Nova (Female)" },
  { id: "shimmer", name: "Shimmer (Soft)" },
  { id: "alloy", name: "Alloy (Neutral)" },
];

const VOICE_LIMITS: Record<string, number> = {
  free: 5,
  student: 30,
  premium: 120,
  prophet_tier: -1,
};

export function VoiceConversation({
  chapterContent,
  chapterTitle,
  bookTitle,
  cognitiveLevel,
  bookId,
  chapterId,
  onClose,
  onResumeTTS,
}: VoiceConversationProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [proactiveMode, setProactiveMode] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("nova");
  const [transcript, setTranscript] = useState("");
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [textInput, setTextInput] = useState("");
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const entitlements = useEntitlements();
  const { t } = useLanguage();

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, transcript]);

  const levelData = COGNITIVE_LEVELS.find(l => l.id === cognitiveLevel) || COGNITIVE_LEVELS[1];
  const LevelIcon = levelData.icon;
  const isInteractiveMode = cognitiveLevel !== "familiarisation";

  const getVoiceLimit = () => {
    if (entitlements.isAdmin || entitlements.isProphet) return -1;
    if (entitlements.isPremium) return VOICE_LIMITS.premium;
    if (entitlements.isScrollStudent) return VOICE_LIMITS.student;
    return VOICE_LIMITS.free;
  };
  const voiceLimit = getVoiceLimit();

  // Send a text message to the AI
  const sendTextMessage = useCallback(async (text: string) => {
    if (!text.trim() || isProcessing) return;
    
    if (!isMountedRef.current) return;
    setIsProcessing(true);

    const userMsg = text.trim();
    const newMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setTextInput("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("You need to sign in again to use AI voice tools.");
      }

      const authHeaders = { Authorization: `Bearer ${accessToken}` };
      const { data: convData, error: convError } = await supabase.functions.invoke("voice-conversation", {
        body: {
          userMessage: userMsg,
          chapterContent: chapterContent.slice(0, 1800),
          chapterTitle,
          bookTitle,
          cognitiveLevel,
          conversationHistory: newMessages.slice(-6),
          voice: selectedVoice,
          generateAudio: true,
        },
        headers: authHeaders,
      });

      if (!isMountedRef.current) return;

      if (convError) {
        const errorMsg = convData?.error || convError.message || "Failed to get response";
        if (errorMsg.includes("429") || errorMsg.includes("Rate limit")) {
          throw new Error(t('voice.rateLimited'));
        }
        if (errorMsg.includes("402") || errorMsg.includes("Payment")) {
          throw new Error(t('voice.creditsRequired'));
        }
        throw new Error(errorMsg);
      }

      if (!convData?.text) {
        throw new Error("No response received");
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: convData.text,
        audio: convData.audio,
      };

      setMessages([...newMessages, assistantMessage]);

      if (convData.audio && isMountedRef.current) {
        playAudio(convData.audio);
        return;
      }

      const { data: ttsData, error: ttsError } = await supabase.functions.invoke("voice-tts", {
        body: {
          text: convData.text,
          voice: selectedVoice,
        },
        headers: authHeaders,
      });

      if (!isMountedRef.current) return;
      if (ttsError) throw new Error(ttsData?.error || ttsError.message || "Voice playback unavailable");

      if (ttsData?.audioContent) {
        setMessages([...newMessages, { ...assistantMessage, audio: ttsData.audioContent }]);
        playAudio(ttsData.audioContent);
      }
    } catch (error) {
      console.error("Voice processing error:", error);
      if (isMountedRef.current) {
        toast({
          title: t('common.error'),
          description: error instanceof Error ? error.message : t('voice.processingFailed'),
          variant: "destructive",
        });
      }
    } finally {
      if (isMountedRef.current) {
        setIsProcessing(false);
      }
    }
  }, [messages, chapterContent, chapterTitle, bookTitle, cognitiveLevel, selectedVoice, isProcessing, toast, t, playAudio]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });

      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        if (!isMountedRef.current || audioChunksRef.current.length === 0) return;
        
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          if (!isMountedRef.current) return;
          const base64 = (reader.result as string).split(",")[1];
          await processAudio(base64);
        };
        reader.onerror = () => {
          if (isMountedRef.current) {
            setIsProcessing(false);
            setTranscript("");
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
      setTranscript("");
    } catch (error) {
      console.error("Microphone error:", error);
      toast({
        title: t('voice.microphoneError'),
        description: t('voice.allowMicAccess'),
        variant: "destructive",
      });
    }
  }, [toast, t]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  // Process recorded audio (STT + AI + TTS)
  const processAudio = async (base64Audio: string) => {
    if (!isMountedRef.current) return;
    setIsProcessing(true);
    setTranscript(t('voice.processing'));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("You need to sign in again to use AI voice tools.");
      }

      const authHeaders = { Authorization: `Bearer ${accessToken}` };

      // Transcribe
      const { data: sttData, error: sttError } = await supabase.functions.invoke("voice-stt", {
        body: { audio: base64Audio },
        headers: authHeaders,
      });

      if (!isMountedRef.current) return;
      if (sttError || !sttData?.text) throw new Error(sttData?.error || "Failed to transcribe audio");

      const userMessage = sttData.text;
      setTranscript(userMessage);

      const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
      setMessages(newMessages);

      const { data: convData, error: convError } = await supabase.functions.invoke("voice-conversation", {
        body: {
          userMessage,
          chapterContent: chapterContent.slice(0, 1800),
          chapterTitle,
          bookTitle,
          cognitiveLevel,
          conversationHistory: newMessages.slice(-6),
          voice: selectedVoice,
          generateAudio: true,
        },
        headers: authHeaders,
      });

      if (!isMountedRef.current) return;

      if (convError) {
        const errorMsg = convData?.error || convError.message || "Failed to get response";
        if (errorMsg.includes("429") || errorMsg.includes("Rate limit")) throw new Error(t('voice.rateLimited'));
        if (errorMsg.includes("402") || errorMsg.includes("Payment")) throw new Error(t('voice.creditsRequired'));
        throw new Error(errorMsg);
      }

      if (!convData?.text) throw new Error("No response received");

      const assistantMessage: Message = {
        role: "assistant",
        content: convData.text,
        audio: convData.audio,
      };

      setMessages([...newMessages, assistantMessage]);

      if (convData.audio && isMountedRef.current) {
        playAudio(convData.audio);
      } else {
        const { data: ttsData, error: ttsError } = await supabase.functions.invoke("voice-tts", {
          body: {
            text: convData.text,
            voice: selectedVoice,
          },
          headers: authHeaders,
        });

        if (!isMountedRef.current) return;
        if (ttsError) throw new Error(ttsData?.error || ttsError.message || "Voice playback unavailable");

        if (ttsData?.audioContent) {
          setMessages([...newMessages, { ...assistantMessage, audio: ttsData.audioContent }]);
          playAudio(ttsData.audioContent);
        }
      }

      setTranscript("");
    } catch (error) {
      console.error("Voice processing error:", error);
      if (isMountedRef.current) {
        toast({
          title: t('common.error'),
          description: error instanceof Error ? error.message : t('voice.processingFailed'),
          variant: "destructive",
        });
        setTranscript("");
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  };

  const playAudio = useCallback((base64Audio: string) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
      const audio = new Audio(audioUrl);
      audio.onplay = () => { if (isMountedRef.current) setIsSpeaking(true); };
      audio.onended = () => { if (isMountedRef.current) setIsSpeaking(false); };
      audio.onerror = () => { if (isMountedRef.current) setIsSpeaking(false); };
      audioRef.current = audio;
      audio.play().catch(console.error);
    } catch (error) {
      console.error("Audio playback error:", error);
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const toggleRecording = useCallback(() => {
    if (isListening) {
      stopRecording();
    } else {
      if (isSpeaking) stopAudio();
      startRecording();
    }
  }, [isListening, isSpeaking, stopRecording, stopAudio, startRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      const greeting = isInteractiveMode
        ? `I'm your AI study companion for "${chapterTitle}". Ask me anything — type a question or tap the mic to speak. I'll respond with both text and voice! 🎙️`
        : "I'm in reading mode. I'll help you follow along with the chapter content.";
      setMessages([{ role: "assistant", content: greeting }]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendTextMessage(textInput);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-3 sm:p-4"
    >
      <motion.div 
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        style={{ maxHeight: "min(85vh, 720px)" }}
        initial={{ y: 50 }}
        animate={{ y: 0 }}
      >
        {/* Header */}
        <div className="p-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", "bg-primary/20")}>
                <LevelIcon className={cn("h-5 w-5", levelData.color)} />
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  Voice AI
                  {!isInteractiveMode && (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">Read Only</span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">{levelData.name} · Interactive</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger>
                  <span className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer">
                    <Settings className="h-4 w-4" />
                  </span>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="end">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Voice</label>
                      <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {VOICES.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {isInteractiveMode && (
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Proactive Teaching</label>
                        <Switch checked={proactiveMode} onCheckedChange={setProactiveMode} />
                      </div>
                    )}
                    {voiceLimit > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {voiceLimit} min/month limit
                      </p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 min-h-0">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "p-3 rounded-lg max-w-[85%]",
                msg.role === "user" 
                  ? "ml-auto bg-primary text-primary-foreground" 
                  : "bg-muted"
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.audio && msg.role === "assistant" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => playAudio(msg.audio!)}
                  className="mt-2 h-6 text-xs gap-1"
                >
                  <Volume2 className="h-3 w-3" />
                  Replay
                </Button>
              )}
            </motion.div>
          ))}
          
          {transcript && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-3 rounded-lg bg-muted/50 border border-dashed border-border"
            >
              <p className="text-sm text-muted-foreground italic">{transcript}</p>
            </motion.div>
          )}

          {isProcessing && !transcript && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-3 rounded-lg bg-muted flex items-center gap-2"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area — toggle between voice and text */}
        <div className="p-3 sm:p-4 border-t border-border bg-muted/30 shrink-0">
          {/* Input mode toggle */}
          <div className="flex items-center justify-center gap-2 mb-3">
            <Button
              variant={inputMode === "voice" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setInputMode("voice")}
            >
              <Mic className="h-3 w-3" /> Voice
            </Button>
            <Button
              variant={inputMode === "text" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setInputMode("text")}
            >
              <Keyboard className="h-3 w-3" /> Type
            </Button>
          </div>

          {inputMode === "voice" ? (
            /* Voice input mode */
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center gap-4">
                {/* Main mic button */}
                <motion.button
                  onClick={toggleRecording}
                  disabled={isProcessing}
                  className={cn(
                    "relative w-16 h-16 rounded-full flex items-center justify-center transition-all",
                    isListening 
                      ? "bg-destructive text-destructive-foreground" 
                      : "bg-primary text-primary-foreground",
                    isProcessing && "opacity-50 cursor-not-allowed"
                  )}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isProcessing ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : isListening ? (
                    <>
                      <MicOff className="h-7 w-7" />
                      <motion.div
                        className="absolute inset-0 rounded-full bg-destructive"
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    </>
                  ) : (
                    <Mic className="h-7 w-7" />
                  )}
                </motion.button>

                {/* Stop speaking */}
                {isSpeaking && (
                  <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}>
                    <Button variant="outline" size="icon" onClick={stopAudio} className="h-12 w-12 rounded-full">
                      <VolumeX className="h-5 w-5" />
                    </Button>
                  </motion.div>
                )}
              </div>

              <p className="text-center text-xs text-muted-foreground mt-2">
                {isListening ? "Listening... tap to stop" 
                  : isSpeaking ? "AI is speaking..." 
                  : "Tap to speak"}
              </p>
            </div>
          ) : (
            /* Text input mode — NotebookLM style */
            <form onSubmit={handleTextSubmit} className="flex gap-2">
              <Textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Ask a question about this chapter..."
                className="min-h-[44px] max-h-24 resize-none text-sm flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleTextSubmit(e);
                  }
                }}
              />
              <Button 
                type="submit" 
                size="icon"
                disabled={!textInput.trim() || isProcessing}
                className="flex-shrink-0 h-11 w-11"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          )}

          {/* Speaking indicator */}
          {isSpeaking && inputMode === "text" && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <AudioLines className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-xs text-muted-foreground">AI is speaking...</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={stopAudio}>
                Stop
              </Button>
            </div>
          )}

          {/* Resume TTS button */}
          {onResumeTTS && messages.length > 1 && !isListening && !isProcessing && !isSpeaking && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { onResumeTTS(); onClose(); }}
                className="gap-2 border-primary/50 text-primary hover:bg-primary/10"
              >
                <Volume2 className="h-4 w-4" />
                Resume Reading
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Button to open voice conversation
export function VoiceConversationButton({ onClick, cognitiveLevel }: { onClick: () => void; cognitiveLevel: string }) {
  const isInteractive = cognitiveLevel !== "familiarisation";
  const { t } = useLanguage();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2 justify-start"
    >
      <Mic className="h-4 w-4" />
      {isInteractive ? t('voice.voiceAI') : t('voice.listen')}
    </Button>
  );
}
