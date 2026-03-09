/**
 * Cinematic Scene Renderer — Photorealistic viewport with layered parallax,
 * animated overlays, film grain, and professional subtitle presentation.
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
        transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="absolute inset-0"
      >
        {/* Primary image layer with camera movement */}
        {scene.imageUrl ? (
          <div className="absolute inset-0 will-change-transform overflow-hidden"
            style={getCameraMoveStyle(scene.cameraMove, isPlaying ? cameraProgress : 0)}>
            <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" 
              style={{ imageRendering: "auto" }} />
          </div>
        ) : (
          <div className={cn("absolute inset-0 bg-gradient-to-br", themeGradient)} />
        )}

        {/* Cinematic vignette — dark edges for film look */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)",
          }} />

        {/* Bottom gradient for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30 pointer-events-none" />

        {/* Subtle film grain overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: "128px 128px",
          }} />

        {/* Content overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 md:p-16 z-10">
          {/* Scene type badge */}
          <Badge className="absolute top-14 right-4 bg-black/50 backdrop-blur-md text-white/50 text-[10px] border-white/10 font-light tracking-wider uppercase">
            {scene.visualType.replace(/_/g, " ")}
          </Badge>

          {/* Emoji with cinematic entrance */}
          {scene.emoji && (
            <motion.div 
              initial={{ scale: 0, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 150, damping: 15 }} 
              className="text-5xl md:text-6xl mb-5"
              style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.6))" }}>
              {scene.emoji}
            </motion.div>
          )}

          {/* Scene title with cinematic typography */}
          <motion.h2 
            initial={{ y: 40, opacity: 0, filter: "blur(8px)" }} 
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            transition={{ delay: 0.4, duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="text-3xl md:text-5xl lg:text-6xl font-bold text-white text-center mb-4 max-w-4xl leading-[1.08] tracking-tight"
            style={{ 
              textShadow: "0 4px 30px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8)",
              fontVariationSettings: "'wght' 700",
            }}>
            {scene.title}
          </motion.h2>

          {/* Key insight overlay */}
          {scene.textOverlay && scene.textOverlay !== scene.title && (
            <motion.p 
              initial={{ opacity: 0, y: 15, filter: "blur(4px)" }} 
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.7, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-base md:text-xl lg:text-2xl text-white/90 text-center mb-8 max-w-2xl font-medium tracking-wide"
              style={{ textShadow: "0 2px 16px rgba(0,0,0,0.8)" }}>
              {scene.textOverlay}
            </motion.p>
          )}

          {/* Professional subtitle bar */}
          <motion.div 
            initial={{ y: 30, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} 
            className="absolute bottom-20 left-4 right-4 md:left-8 md:right-8 lg:left-16 lg:right-16">
            <div className="relative max-w-4xl mx-auto">
              <p className="text-white text-sm md:text-base lg:text-lg text-center leading-relaxed px-8 py-4 rounded-lg line-clamp-3"
                style={{ 
                  background: "linear-gradient(135deg, rgba(0,0,0,0.82), rgba(0,0,0,0.72))",
                  backdropFilter: "blur(16px) saturate(1.2)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
                  textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                  letterSpacing: "0.01em",
                }}>
                {scene.narration}
              </p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
