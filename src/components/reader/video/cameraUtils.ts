import React from "react";

export function getCameraMoveStyle(move: string, progress: number): React.CSSProperties {
  const p = Math.min(1, Math.max(0, progress));
  switch (move) {
    case "slow_zoom_in":
      return { transform: `scale(${1 + p * 0.15})`, transformOrigin: "center" };
    case "slow_zoom_out":
      return { transform: `scale(${1.15 - p * 0.15})`, transformOrigin: "center" };
    case "pan_left":
      return { transform: `translateX(${-p * 5}%) scale(1.1)`, transformOrigin: "center" };
    case "pan_right":
      return { transform: `translateX(${p * 5}%) scale(1.1)`, transformOrigin: "center" };
    case "pan_up":
      return { transform: `translateY(${-p * 5}%) scale(1.1)`, transformOrigin: "center" };
    case "ken_burns_tl_to_br":
      return { transform: `scale(${1 + p * 0.12}) translate(${p * 3}%, ${p * 3}%)`, transformOrigin: "top left" };
    case "ken_burns_br_to_tl":
      return { transform: `scale(${1 + p * 0.12}) translate(${-p * 3}%, ${-p * 3}%)`, transformOrigin: "bottom right" };
    case "static_with_pulse":
      return { transform: `scale(${1 + Math.sin(p * Math.PI * 2) * 0.02})`, transformOrigin: "center" };
    default:
      return { transform: `scale(${1 + p * 0.08})`, transformOrigin: "center" };
  }
}

export const transitionVariants: Record<string, object> = {
  fade:       { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  crossfade:  { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  wipe_left:  { initial: { x: "100%", opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: "-100%", opacity: 0 } },
  zoom_in:    { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 1.1, opacity: 0 } },
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
  return lines.slice(0, 3);
}
