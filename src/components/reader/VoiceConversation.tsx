import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  X, 
  Loader2,
  MessageCircle,
  Sparkles,
  Brain,
  BookOpen,
  Settings,
  Crown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
}

const VOICES = [
  { id: "nova", name: "Nova (Female)" },
  { id: "shimmer", name: "Shimmer (Soft)" },
  { id: "alloy", name: "Alloy (Neutral)" },
];

// Voice usage limits per tier (minutes per month)
const VOICE_LIMITS: Record<string, number> = {
  free: 5,
  student: 30,
  premium: 120,
  prophet_tier: -1, // unlimited
};

export function VoiceConversation({
  chapterContent,
  chapterTitle,
  bookTitle,
  cognitiveLevel,
  bookId,
  chapterId,
  onClose,
}: VoiceConversationProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [proactiveMode, setProactiveMode] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("nova");
  const [transcript, setTranscript] = useState("");
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);
  const { toast } = useToast();
  const entitlements = useEntitlements();
  const { t } = useLanguage();

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const levelData = COGNITIVE_LEVELS.find(l => l.id === cognitiveLevel) || COGNITIVE_LEVELS[1];
  const LevelIcon = levelData.icon;

  // Check if interactive voice is available for this cognitive level
  const isInteractiveMode = cognitiveLevel !== "familiarisation";

  // Get voice limits based on tier
  const getVoiceLimit = () => {
    if (entitlements.isAdmin || entitlements.isProphet) return -1;
    if (entitlements.isPremium) return VOICE_LIMITS.premium;
    if (entitlements.isScrollStudent) return VOICE_LIMITS.student;
    return VOICE_LIMITS.free;
  };

  const voiceLimit = getVoiceLimit();

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      // Check for supported MIME types
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        if (!isMountedRef.current || audioChunksRef.current.length === 0) return;
        
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        
        // Convert to base64 and send for transcription
        const reader = new FileReader();
        reader.onloadend = async () => {
          if (!isMountedRef.current) return;
          const base64 = (reader.result as string).split(",")[1];
          await processAudio(base64);
        };
        reader.onerror = () => {
          console.error("FileReader error");
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

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  // Process recorded audio
  const processAudio = async (base64Audio: string) => {
    if (!isMountedRef.current) return;
    
    setIsProcessing(true);
    setTranscript(t('voice.processing'));

    try {
      // First, transcribe the audio
      const { data: sttData, error: sttError } = await supabase.functions.invoke("voice-stt", {
        body: { audio: base64Audio },
      });

      if (!isMountedRef.current) return;

      if (sttError || !sttData?.text) {
        throw new Error(sttData?.error || "Failed to transcribe audio");
      }

      const userMessage = sttData.text;
      setTranscript(userMessage);

      // Add user message
      const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
      setMessages(newMessages);

      // Get AI response
      const { data: convData, error: convError } = await supabase.functions.invoke("voice-conversation", {
        body: {
          userMessage,
          chapterContent: chapterContent.slice(0, 8000), // Limit content size
          chapterTitle,
          bookTitle,
          cognitiveLevel,
          conversationHistory: newMessages.slice(-10),
          voice: selectedVoice,
          generateAudio: true,
        },
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

      // Add assistant message
      setMessages([...newMessages, { 
        role: "assistant", 
        content: convData.text,
        audio: convData.audio,
      }]);

      // Play audio response
      if (convData.audio && isMountedRef.current) {
        playAudio(convData.audio);
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
      if (isMountedRef.current) {
        setIsProcessing(false);
      }
    }
  };

  // Play audio response
  const playAudio = useCallback((base64Audio: string) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }

      const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
      const audio = new Audio(audioUrl);
      
      audio.onplay = () => {
        if (isMountedRef.current) setIsSpeaking(true);
      };
      audio.onended = () => {
        if (isMountedRef.current) setIsSpeaking(false);
      };
      audio.onerror = () => {
        if (isMountedRef.current) setIsSpeaking(false);
      };
      
      audioRef.current = audio;
      audio.play().catch(console.error);
    } catch (error) {
      console.error("Audio playback error:", error);
    }
  }, []);

  // Stop audio
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // Toggle recording
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
      
      // Clean up audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      
      // Clean up media recorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch { /* ignore */ }
      }
      
      // Clean up stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Initial greeting based on mode
  useEffect(() => {
    if (messages.length === 0) {
      const greeting = isInteractiveMode
        ? t('voice.greetingInteractive').replace('{chapterTitle}', chapterTitle).replace('{modeName}', levelData.name).replace('{modeDescription}', 
            cognitiveLevel === "applied" ? t('voice.modeApplied') :
            cognitiveLevel === "analytical" ? t('voice.modeAnalytical') :
            t('voice.modeSynthesis')
          )
        : t('voice.greetingFamiliarisation');

      setMessages([{ role: "assistant", content: greeting }]);
    }
  }, [t]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
      <motion.div 
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg overflow-hidden"
        initial={{ y: 50 }}
        animate={{ y: 0 }}
      >
        {/* Header */}
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", "bg-scroll-gold/20")}>
                <LevelIcon className={cn("h-5 w-5", levelData.color)} />
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  {t('voice.title')}
                  {!isInteractiveMode && (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">{t('voice.readOnly')}</span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">{levelData.name} {t('voice.mode')}</p>
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
                      <label className="text-sm font-medium">{t('voice.voiceLabel')}</label>
                      <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VOICES.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {isInteractiveMode && (
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">{t('voice.proactiveTeaching')}</label>
                        <Switch 
                          checked={proactiveMode} 
                          onCheckedChange={setProactiveMode}
                        />
                      </div>
                    )}

                    {voiceLimit > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {voiceLimit} {t('voice.minMonthLimit')}
                        {entitlements.tier === "free" && (
                          <span className="block mt-1 text-scroll-gold">
                            {t('voice.upgradeForMore')}
                          </span>
                        )}
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
        <div className="h-64 overflow-y-auto p-4 space-y-3">
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
              <p className="text-sm">{msg.content}</p>
              {msg.audio && msg.role === "assistant" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => playAudio(msg.audio!)}
                  className="mt-2 h-6 text-xs"
                >
                  <Volume2 className="h-3 w-3 mr-1" />
                  {t('voice.replay')}
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
        </div>

        {/* Controls */}
        <div className="p-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-center gap-4">
            {/* Main mic button */}
            <motion.button
              onClick={toggleRecording}
              disabled={isProcessing}
              className={cn(
                "relative w-20 h-20 rounded-full flex items-center justify-center transition-all",
                isListening 
                  ? "bg-destructive text-destructive-foreground" 
                  : "bg-primary text-primary-foreground",
                isProcessing && "opacity-50 cursor-not-allowed"
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isProcessing ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : isListening ? (
                <>
                  <MicOff className="h-8 w-8" />
                  {/* Pulse animation */}
                  <motion.div
                    className="absolute inset-0 rounded-full bg-destructive"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                </>
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </motion.button>

            {/* Stop speaking button */}
            {isSpeaking && (
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Button
                  variant="outline"
                  size="icon"
                  onClick={stopAudio}
                  className="h-12 w-12 rounded-full"
                >
                  <VolumeX className="h-5 w-5" />
                </Button>
              </motion.div>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-3">
            {isListening 
              ? t('voice.listening') 
              : isSpeaking 
                ? t('voice.aiSpeaking') 
                : t('voice.tapToSpeak')}
          </p>

          {/* Mode indicator */}
          <div className="flex items-center justify-center gap-2 mt-3">
            {isInteractiveMode ? (
              <span className="flex items-center gap-1 text-xs text-scroll-gold">
                <Sparkles className="h-3 w-3" />
                {t('voice.interactiveMode')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <BookOpen className="h-3 w-3" />
                {t('voice.textReadingMode')}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Button to open voice conversation
export function VoiceConversationButton({ 
  onClick,
  cognitiveLevel,
}: { 
  onClick: () => void;
  cognitiveLevel: string;
}) {
  const isInteractive = cognitiveLevel !== "familiarisation";
  const { t } = useLanguage();
  
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2"
    >
      <Mic className="h-4 w-4" />
      {isInteractive ? t('voice.voiceAI') : t('voice.listen')}
    </Button>
  );
}
