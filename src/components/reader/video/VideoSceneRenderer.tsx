/**
 * Cinematic Scene Renderer — Photorealistic viewport with parallax depth,
 * atmospheric particles, light leaks, film grain, and professional subtitles.
 */
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import type { CinematicScene } from "./types";
import { getCameraMoveStyle, transitionVariants } from "./cameraUtils";

interface VideoSceneRendererProps {
  scene: CinematicScene;
  currentScene: number;
  isPlaying: boolean;
  cameraProgress: number;
  themeGradient: string;
}

/** Generate deterministic floating particles for atmosphere */
function useParticles(sceneNumber: number) {
  return useMemo(() => {
    const seed = sceneNumber * 137;
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: ((seed + i * 47) % 100),
      y: ((seed + i * 73) % 100),
      size: 1 + ((seed + i * 31) % 3),
      duration: 8 + ((seed + i * 19) % 12),
      delay: ((seed + i * 53) % 6),
      opacity: 0.15 + ((seed + i * 11) % 20) / 100,
    }));
  }, [sceneNumber]);
}

/** Parallax layers: foreground moves faster, background moves slower */
function getParallaxStyle(move: string, progress: number, depth: "bg" | "fg"): React.CSSProperties {
  const p = Math.min(1, Math.max(0, progress));
  const ease = (t: number) => t * t * (3 - 2 * t);
  const ep = ease(p);
  const multiplier = depth === "fg" ? 1.6 : 0.6;

  switch (move) {
    case "slow_zoom_in":
      return { transform: `scale(${1 + ep * 0.18 * multiplier})` };
    case "slow_zoom_out":
      return { transform: `scale(${1 + (0.18 - ep * 0.18) * multiplier})` };
    case "pan_left":
      return { transform: `translateX(${-ep * 6 * multiplier}%) scale(${1 + 0.12 * multiplier})` };
    case "pan_right":
      return { transform: `translateX(${ep * 6 * multiplier}%) scale(${1 + 0.12 * multiplier})` };
    case "dolly_forward":
      return { transform: `scale(${1 + ep * 0.25 * multiplier}) translateY(${-ep * 2 * multiplier}%)` };
    case "crane_up":
      return { transform: `translateY(${(1 - ep) * 8 * multiplier}%) scale(${1 + ep * 0.12 * multiplier})` };
    default:
      return {};
  }
}

export function VideoSceneRenderer({
  scene, currentScene, isPlaying, cameraProgress, themeGradient,
}: VideoSceneRendererProps) {
  const particles = useParticles(currentScene);
  const cameraStyle = getCameraMoveStyle(scene.cameraMove, isPlaying ? cameraProgress : 0);
  const fgParallax = getParallaxStyle(scene.cameraMove, isPlaying ? cameraProgress : 0, "fg");

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentScene}
        {...(transitionVariants[scene.transition] || transitionVariants.fade)}
        transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="absolute inset-0"
      >
        {/* ── Background image layer (slower parallax) ── */}
        {scene.imageUrl ? (
          <div className="absolute inset-0 will-change-transform overflow-hidden"
            style={cameraStyle}>
            <img src={scene.imageUrl} alt="" className="w-full h-full object-cover"
              style={{ imageRendering: "auto" }} />
          </div>
        ) : (
          <div className={cn("absolute inset-0 bg-gradient-to-br", themeGradient)} />
        )}

        {/* ── Cinematic vignette ── */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 80% 70% at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
          }} />

        {/* ── Anamorphic light leak ── */}
        <motion.div
          className="absolute inset-0 pointer-events-none mix-blend-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.12, 0.06, 0.1, 0] }}
          transition={{ duration: scene.duration * 0.8, ease: "easeInOut" }}
          style={{
            background: `linear-gradient(${105 + currentScene * 30}deg, transparent 30%, rgba(255,200,100,0.15) 45%, rgba(255,150,50,0.08) 55%, transparent 70%)`,
          }} />

        {/* ── Floating atmospheric particles ── */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {particles.map(p => (
            <motion.div
              key={p.id}
              className="absolute rounded-full bg-white"
              style={{
                width: p.size,
                height: p.size,
                left: `${p.x}%`,
                top: `${p.y}%`,
                opacity: 0,
              }}
              animate={isPlaying ? {
                y: [0, -40, -80],
                x: [0, p.size > 2 ? 15 : -10, p.size > 2 ? 25 : -20],
                opacity: [0, p.opacity, 0],
              } : {}}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          ))}
        </div>

        {/* ── Bottom gradient for text ── */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/25 pointer-events-none" />

        {/* ── Film grain ── */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.035] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: "128px 128px",
          }} />

        {/* ── Foreground content with parallax offset ── */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 md:p-16 z-10"
          style={fgParallax}>

          {/* Scene type badge */}
          <Badge className="absolute top-14 right-4 bg-black/50 backdrop-blur-md text-white/50 text-[10px] border-white/10 font-light tracking-wider uppercase">
            {scene.visualType.replace(/_/g, " ")}
          </Badge>

          {/* Emoji */}
          {scene.emoji && (
            <motion.div
              initial={{ scale: 0, opacity: 0, rotate: -15 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 150, damping: 12 }}
              className="text-5xl md:text-6xl mb-5"
              style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.7))" }}>
              {scene.emoji}
            </motion.div>
          )}

          {/* Scene title */}
          <motion.h2
            initial={{ y: 50, opacity: 0, filter: "blur(12px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            transition={{ delay: 0.4, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-3xl md:text-5xl lg:text-6xl font-bold text-white text-center mb-4 max-w-4xl leading-[1.08] tracking-tight"
            style={{
              textShadow: "0 4px 30px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8), 0 0 80px rgba(0,0,0,0.3)",
            }}>
            {scene.title}
          </motion.h2>

          {/* Key insight */}
          {scene.textOverlay && scene.textOverlay !== scene.title && (
            <motion.p
              initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.7, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="text-base md:text-xl lg:text-2xl text-white/90 text-center mb-8 max-w-2xl font-medium tracking-wide"
              style={{ textShadow: "0 2px 16px rgba(0,0,0,0.8)" }}>
              {scene.textOverlay}
            </motion.p>
          )}
        </div>

        {/* ── Professional subtitle bar (outside parallax) ── */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="absolute bottom-20 left-4 right-4 md:left-8 md:right-8 lg:left-16 lg:right-16 z-20">
          <div className="relative max-w-4xl mx-auto">
            <p className="text-white text-sm md:text-base lg:text-lg text-center leading-relaxed px-8 py-4 rounded-lg line-clamp-3"
              style={{
                background: "linear-gradient(135deg, rgba(0,0,0,0.82), rgba(0,0,0,0.68))",
                backdropFilter: "blur(20px) saturate(1.3)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                letterSpacing: "0.015em",
                lineHeight: "1.7",
              }}>
              {scene.narration}
            </p>
          </div>
        </motion.div>

        {/* ── Scene progress indicator (thin bar at bottom) ── */}
        {isPlaying && (
          <motion.div
            className="absolute bottom-0 left-0 h-[2px] z-30"
            style={{
              width: `${cameraProgress * 100}%`,
              background: "linear-gradient(90deg, rgba(255,255,255,0.3), rgba(255,255,255,0.7))",
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
