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
  const { toast } = useToast();
  const entitlements = useEntitlements();

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

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(track => track.stop());
        
        // Convert to base64 and send for transcription
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          await processAudio(base64);
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
        title: "Microphone Error",
        description: "Please allow microphone access to use voice mode",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  // Process recorded audio
  const processAudio = async (base64Audio: string) => {
    setIsProcessing(true);
    setTranscript("Processing...");

    try {
      // First, transcribe the audio
      const { data: sttData, error: sttError } = await supabase.functions.invoke("voice-stt", {
        body: { audio: base64Audio },
      });

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
          chapterContent,
          chapterTitle,
          bookTitle,
          cognitiveLevel,
          conversationHistory: newMessages.slice(-10),
          voice: selectedVoice,
          generateAudio: true,
        },
      });

      if (convError || !convData?.text) {
        throw new Error(convData?.error || "Failed to get response");
      }

      // Add assistant message
      setMessages([...newMessages, { 
        role: "assistant", 
        content: convData.text,
        audio: convData.audio,
      }]);

      // Play audio response
      if (convData.audio) {
        playAudio(convData.audio);
      }

      setTranscript("");

    } catch (error) {
      console.error("Voice processing error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process voice",
        variant: "destructive",
      });
      setTranscript("");
    } finally {
      setIsProcessing(false);
    }
  };

  // Play audio response
  const playAudio = (base64Audio: string) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
      const audio = new Audio(audioUrl);
      
      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      
      audioRef.current = audio;
      audio.play();
    } catch (error) {
      console.error("Audio playback error:", error);
    }
  };

  // Stop audio
  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsSpeaking(false);
    }
  };

  // Toggle recording
  const toggleRecording = () => {
    if (isListening) {
      stopRecording();
    } else {
      if (isSpeaking) stopAudio();
      startRecording();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Initial greeting based on mode
  useEffect(() => {
    if (messages.length === 0) {
      const greeting = isInteractiveMode
        ? `Hello! I'm your AI learning companion for "${chapterTitle}". In ${levelData.name} mode, I'll help you ${
            cognitiveLevel === "applied" ? "apply these concepts to real situations" :
            cognitiveLevel === "analytical" ? "analyze and critique the material deeply" :
            "synthesize and create new knowledge"
          }. Ask me anything, or just start talking!`
        : `I'm in Familiarisation mode. I'll read the chapter content to you clearly. Say "read" to start, or ask me to explain any term from the text.`;

      setMessages([{ role: "assistant", content: greeting }]);
    }
  }, []);

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
                  Voice Learning
                  {!isInteractiveMode && (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">Read Only</span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">{levelData.name} Mode</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="end">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Voice</label>
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
                        <label className="text-sm font-medium">Proactive Teaching</label>
                        <Switch 
                          checked={proactiveMode} 
                          onCheckedChange={setProactiveMode}
                        />
                      </div>
                    )}

                    {voiceLimit > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {voiceLimit} min/month limit
                        {entitlements.tier === "free" && (
                          <span className="block mt-1 text-scroll-gold">
                            Upgrade for more voice time
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
              ? "Listening... Tap to stop" 
              : isSpeaking 
                ? "AI is speaking..." 
                : "Tap to speak"}
          </p>

          {/* Mode indicator */}
          <div className="flex items-center justify-center gap-2 mt-3">
            {isInteractiveMode ? (
              <span className="flex items-center gap-1 text-xs text-scroll-gold">
                <Sparkles className="h-3 w-3" />
                Interactive Teaching Mode
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <BookOpen className="h-3 w-3" />
                Text Reading Mode
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
  
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2"
    >
      <Mic className="h-4 w-4" />
      {isInteractive ? "Voice AI" : "Listen"}
    </Button>
  );
}
