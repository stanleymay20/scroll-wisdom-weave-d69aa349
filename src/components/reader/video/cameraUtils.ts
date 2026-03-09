import React from "react";

/**
 * Advanced cinematic camera moves — 12 distinct movements for photorealistic scenes.
 */
export function getCameraMoveStyle(move: string, progress: number): React.CSSProperties {
  const p = Math.min(1, Math.max(0, progress));
  const ease = (t: number) => t * t * (3 - 2 * t); // smoothstep
  const ep = ease(p);

  switch (move) {
    case "slow_zoom_in":
      return { transform: `scale(${1 + ep * 0.18})`, transformOrigin: "center" };
    case "slow_zoom_out":
      return { transform: `scale(${1.18 - ep * 0.18})`, transformOrigin: "center" };
    case "pan_left":
      return { transform: `translateX(${-ep * 6}%) scale(1.12)`, transformOrigin: "center" };
    case "pan_right":
      return { transform: `translateX(${ep * 6}%) scale(1.12)`, transformOrigin: "center" };
    case "pan_up":
      return { transform: `translateY(${-ep * 6}%) scale(1.12)`, transformOrigin: "center" };
    case "ken_burns_tl_to_br":
      return { transform: `scale(${1 + ep * 0.15}) translate(${ep * 4}%, ${ep * 4}%)`, transformOrigin: "top left" };
    case "ken_burns_br_to_tl":
      return { transform: `scale(${1 + ep * 0.15}) translate(${-ep * 4}%, ${-ep * 4}%)`, transformOrigin: "bottom right" };
    case "static_with_pulse":
      return { transform: `scale(${1 + Math.sin(p * Math.PI * 2) * 0.015})`, transformOrigin: "center" };
    case "dolly_forward":
      return { transform: `scale(${1 + ep * 0.25}) translateY(${-ep * 2}%)`, transformOrigin: "center 60%" };
    case "orbital_slow":
      return { 
        transform: `scale(${1.08 + Math.sin(p * Math.PI) * 0.04}) translate(${Math.sin(p * Math.PI * 2) * 3}%, ${Math.cos(p * Math.PI * 2) * 1.5}%)`,
        transformOrigin: "center" 
      };
    case "rack_focus":
      return { 
        transform: `scale(${1.05 + ep * 0.1})`,
        filter: `blur(${Math.max(0, 3 - ep * 4)}px)`,
        transformOrigin: "center" 
      };
    case "crane_up":
      return { transform: `translateY(${(1 - ep) * 8}%) scale(${1 + ep * 0.12})`, transformOrigin: "center bottom" };
    default:
      return { transform: `scale(${1 + ep * 0.1})`, transformOrigin: "center" };
  }
}

// All transition variants for cinematic scene changes
export const transitionVariants: Record<string, object> = {
  fade:       { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  crossfade:  { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  wipe_left:  { initial: { x: "100%", opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: "-100%", opacity: 0 } },
  zoom_in:    { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 1.1, opacity: 0 } },
  slide_left: { initial: { x: "100%", opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: "-100%", opacity: 0 } },
  slide_up:   { initial: { y: "100%", opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: "-100%", opacity: 0 } },
  dissolve:   { initial: { opacity: 0, scale: 1.03, filter: "blur(8px)" }, animate: { opacity: 1, scale: 1, filter: "blur(0px)" }, exit: { opacity: 0, scale: 0.97, filter: "blur(8px)" } },
  zoom:       { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 1.3, opacity: 0 } },
};

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 4);
}
