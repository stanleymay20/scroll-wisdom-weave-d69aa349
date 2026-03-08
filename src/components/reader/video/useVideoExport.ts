/**
 * Video export hook — renders scenes to canvas and records as WebM with audio.
 */
import { useState, useCallback } from "react";
import type { CinematicScene } from "./types";
import { wrapText } from "./cameraUtils";

export function useVideoExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const exportAsMP4 = useCallback(async (
    scenes: CinematicScene[],
    chapterTitle: string,
    toast: (opts: any) => void,
  ) => {
    if (scenes.length === 0) {
      toast({ title: "Wait for all scenes", description: "Export available once all scenes finish generating." });
      return;
    }
    setIsExporting(true);
    setExportProgress(0);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1920; canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9" : "video/webm";
      const videoStream = canvas.captureStream(30);

      const audioCtx = new AudioContext();
      const destination = audioCtx.createMediaStreamDestination();

      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);

      const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 5000000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      // Preload images with CORS fallback
      const loadedImages: Record<number, HTMLImageElement> = {};
      await Promise.all(scenes.map(async (s) => {
        if (!s.imageUrl) return;
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => { loadedImages[s.sceneNumber] = img; resolve(); };
          img.onerror = () => {
            const img2 = new Image();
            img2.onload = () => { loadedImages[s.sceneNumber] = img2; resolve(); };
            img2.onerror = () => resolve();
            img2.src = s.imageUrl!;
          };
          img.src = s.imageUrl!;
        });
      }));

      // Preload audio as AudioBuffers
      const audioBuffers: Record<number, AudioBuffer> = {};
      await Promise.all(scenes.map(async (s) => {
        if (!s.audioUrl) return;
        try {
          const resp = await fetch(s.audioUrl);
          const arrayBuf = await resp.arrayBuffer();
          const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
          audioBuffers[s.sceneNumber] = audioBuf;
        } catch (e) {
          console.warn(`Failed to decode audio for scene ${s.sceneNumber}:`, e);
        }
      }));

      recorder.start();

      for (let si = 0; si < scenes.length; si++) {
        const s = scenes[si];
        const fps = 30;
        const totalFrames = Math.round(s.duration * fps);
        const img = loadedImages[s.sceneNumber];

        const audioBuf = audioBuffers[s.sceneNumber];
        let audioSource: AudioBufferSourceNode | null = null;
        if (audioBuf) {
          audioSource = audioCtx.createBufferSource();
          audioSource.buffer = audioBuf;
          audioSource.connect(destination);
          audioSource.start();
        }

        for (let f = 0; f < totalFrames; f++) {
          const p = f / totalFrames;
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1920, 1080);
          if (img) {
            ctx.save();
            const move = s.cameraMove;
            const scale = move === "slow_zoom_in" ? 1 + p * 0.15
              : move === "slow_zoom_out" ? 1.15 - p * 0.15 : 1 + p * 0.08;
            const tx = move === "pan_left" ? -p * 96 : move === "pan_right" ? p * 96
              : move === "ken_burns_tl_to_br" ? p * 58 : move === "ken_burns_br_to_tl" ? -p * 58 : 0;
            const ty = move === "pan_up" ? -p * 54
              : move === "ken_burns_tl_to_br" ? p * 32 : move === "ken_burns_br_to_tl" ? -p * 32 : 0;
            ctx.translate(960 + tx, 540 + ty); ctx.scale(scale, scale); ctx.translate(-960, -540);
            const imgAspect = img.width / img.height; const canvasAspect = 1920 / 1080;
            let dw: number, dh: number, dx: number, dy: number;
            if (imgAspect > canvasAspect) { dh = 1080; dw = 1080 * imgAspect; dx = (1920 - dw) / 2; dy = 0; }
            else { dw = 1920; dh = 1920 / imgAspect; dx = 0; dy = (1080 - dh) / 2; }
            ctx.drawImage(img, dx, dy, dw, dh); ctx.restore();
            ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, 1920, 1080);
          } else {
            const grad = ctx.createLinearGradient(0, 0, 1920, 1080);
            grad.addColorStop(0, "#1e3a5f"); grad.addColorStop(1, "#0d1b2a");
            ctx.fillStyle = grad; ctx.fillRect(0, 0, 1920, 1080);
          }
          const textAlpha = Math.min(1, f / (fps * 0.8));
          ctx.globalAlpha = textAlpha;
          if (s.emoji) { ctx.font = "72px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText(s.emoji, 960, 380); }
          ctx.font = "bold 56px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 12;
          ctx.fillText(s.title, 960, 470, 1600); ctx.shadowBlur = 0;
          if (s.textOverlay) { ctx.font = "36px system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillText(s.textOverlay, 960, 540, 1500); }
          ctx.font = "italic 28px system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.6)";
          const narrationLines = wrapText(ctx, s.narration, 1400);
          const displayLines = narrationLines.slice(0, 4);
          displayLines.forEach((line, li) => { ctx.fillText(line, 960, 820 + li * 36, 1500); });
          ctx.font = "20px system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.textAlign = "right";
          ctx.fillText(`${si + 1} / ${scenes.length}`, 1880, 1050);
          ctx.globalAlpha = 1;
          await new Promise(r => setTimeout(r, 1000 / fps));
        }

        if (audioSource) {
          try { audioSource.stop(); } catch {}
        }
        setExportProgress(Math.round(((si + 1) / scenes.length) * 100));
      }

      recorder.stop();
      await new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
      await audioCtx.close();
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `${chapterTitle.replace(/[^a-zA-Z0-9]/g, "_")}_cinematic.webm`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "🎬 Video exported!", description: "Cinematic WebM video with audio saved." });
    } catch (err) {
      console.error("Export error:", err);
      toast({ variant: "destructive", title: "Export failed", description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { isExporting, exportProgress, exportAsMP4 };
}
