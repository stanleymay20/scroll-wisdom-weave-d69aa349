/**
 * Scene playback viewport — renders current scene with camera moves,
 * transitions, text overlays, and subtitle bar.
 */
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CinematicScene } from "./types";
import { getCameraMoveStyle, transitionVariants } from "./cameraUtils";

interface VideoSceneRendererProps {
  scene: CinematicScene;
  currentScene: number;
  isPlaying: boolean;
  cameraProgress: number;
  themeGradient: string;
}

export function VideoSceneRenderer({
  scene, currentScene, isPlaying, cameraProgress, themeGradient,
}: VideoSceneRendererProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentScene}
        {...(transitionVariants[scene.transition] || transitionVariants.fade)}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        className="absolute inset-0"
      >
        {scene.imageUrl ? (
          <div className="absolute inset-0 will-change-transform"
            style={getCameraMoveStyle(scene.cameraMove, isPlaying ? cameraProgress : 0)}>
            <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className={cn("absolute inset-0 bg-gradient-to-br", themeGradient)} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 md:p-16 z-10">
          <Badge className="absolute top-14 right-4 bg-black/40 backdrop-blur-sm text-white/60 text-[10px] border-white/10">
            {scene.visualType.replace(/_/g, " ")}
          </Badge>
          {scene.emoji && (
            <motion.div initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }} className="text-6xl md:text-7xl mb-6 drop-shadow-2xl">
              {scene.emoji}
            </motion.div>
          )}
          <motion.h2 initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
            className="text-4xl md:text-6xl font-extrabold text-white text-center mb-4 max-w-4xl leading-[1.1] tracking-tight"
            style={{ textShadow: "0 4px 20px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.4)" }}>
            {scene.title}
          </motion.h2>
          {scene.textOverlay && scene.textOverlay !== scene.title && (
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="text-lg md:text-2xl text-white/90 text-center mb-8 max-w-2xl font-medium"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>
              {scene.textOverlay}
            </motion.p>
          )}
          {/* Subtitle bar */}
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }} className="absolute bottom-24 left-4 right-4 md:left-12 md:right-12">
            <p className="text-white text-sm md:text-lg text-center leading-relaxed px-6 py-3 rounded-md max-w-4xl mx-auto line-clamp-3 overflow-hidden"
              style={{ background: "rgba(0,0,0,0.75)", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
              {scene.narration}
            </p>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
