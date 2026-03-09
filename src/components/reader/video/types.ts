export interface CinematicScene {
  sceneNumber: number;
  title: string;
  narration: string;
  visualType: string;
  imagePrompt: string;
  textOverlay: string;
  cameraMove: string;
  duration: number;
  transition: string;
  emoji: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
}

export interface ChapterVideoGeneratorProps {
  bookId: string;
  bookTitle: string;
  bookType: string;
  chapterTitle: string;
  chapterContent: string;
  chapterNumber: number;
  language?: string;
  onClose: () => void;
}

export type VideoPhase = "idle" | "scripting" | "imaging" | "narrating" | "ready" | "playing" | "recording";

export const BOOK_TYPE_THEMES: Record<string, { gradient: string; icon: string; label: string }> = {
  standard:     { gradient: "from-blue-600 to-indigo-700",    icon: "📚", label: "Academic Lecture" },
  professional: { gradient: "from-slate-800 to-zinc-900",     icon: "💼", label: "Executive Briefing" },
  children:     { gradient: "from-amber-400 via-pink-400 to-purple-400", icon: "🌈", label: "Animated Story" },
  reference:    { gradient: "from-emerald-600 to-teal-700",   icon: "📖", label: "Reference Guide" },
  comic:        { gradient: "from-purple-600 via-pink-500 to-red-500", icon: "💥", label: "Visual Narrative" },
  workbook:     { gradient: "from-orange-500 to-red-600",     icon: "✏️", label: "Tutorial" },
  illustrated:  { gradient: "from-cyan-500 to-blue-600",      icon: "🎨", label: "Illustrated Guide" },
  bestseller:   { gradient: "from-yellow-600 via-amber-600 to-orange-700", icon: "🔥", label: "TED-Talk Style" },
};

export const CAMERA_MOVES = [
  "slow_zoom_in", "slow_zoom_out", "pan_left", "pan_right",
  "pan_up", "ken_burns_tl_to_br", "ken_burns_br_to_tl", "static_with_pulse",
  "dolly_forward", "orbital_slow", "rack_focus", "crane_up",
] as const;
