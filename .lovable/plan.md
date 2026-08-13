# Kokoro TTS Migration — Audit and Implementation Plan

## What exists today (verified by reading the code)

Playback layer (mature, keep it):
- `src/contexts/AudioContext.tsx` — single app-lifetime `HTMLAudioElement`, playsinline for iOS, state derived from native events, position persistence on chunk change/pause, `registerControls` handoff, `stopAndClear`.
- `src/components/audio/TTSMiniPlayer.tsx` (1682 lines) — the real reader player, wired in `src/pages/Reader.tsx:1434` with `stopKey={bookId-chapter}`. Owns chunking, sequential playback, prefetch, media session, progress/elapsed, voice select.
- `src/components/audio/GlobalAudioPlayer.tsx` — cross-route mini bar.
- `src/hooks/useMediaSession.ts`, `src/hooks/useAudioSync.ts`, `src/hooks/useAudioReliability.ts`, `src/lib/audioPositionPersistence.ts`.
- `src/components/audio/TextToSpeechPlayer.tsx` — a second, older player. Only re-exported through `src/components/audio/index.ts` and `src/engines/scroll-publish.ts`; no page renders it.

Generation layer:
- `supabase/functions/text-to-speech` — OpenAI `tts-1`, plan gating via `tts_usage` + `TIER_TTS_LIMITS`, markdown cleaning, 4096-char truncation, base64 MP3 in JSON, returns `{ fallback: true }` on quota/provider failure.
- `supabase/functions/elevenlabs-tts` — premium-only path, unused by the reader.
- `supabase/functions/voice-tts` — third duplicate (advertises ElevenLabs, actually only calls OpenAI; the ElevenLabs branch is dead code).
- `supabase/functions/voice-conversation` — its own inline OpenAI/ElevenLabs TTS.
- `src/components/reader/video/useVideoNarration.ts`, `src/components/decks/SlideViewer.tsx` — additional `text-to-speech` callers.

## Bugs and inconsistencies found

1. **The browser fallback is dead in the player that actually ships.** `TTSMiniPlayer.tsx:438` converts `{ fallback: true }` into a thrown `PROVIDER_FALLBACK` error, and nothing anywhere in that file references `speechSynthesis`. The working SpeechSynthesis fallback lives only in `TextToSpeechPlayer.tsx:397-431`, which no route renders. So when OpenAI is out of credits, reader audio simply errors.
2. **`elevenlabs-tts` queries `profiles` by `id`**, but project convention (and every other function) is `user_id` — premium checks there are unreliable.
3. **Four separate TTS implementations** with divergent voice maps, cleaning rules, and limits; only `text-to-speech` enforces quota, so `voice-tts` and `voice-conversation` bypass billing entirely.
4. **No audio cache.** Identical text+voice is regenerated and re-billed every play.
5. **4096-char hard truncation** in `text-to-speech` silently drops text if a caller sends a large chunk (the mini player chunks smaller, other callers do not).
6. `voice-tts` claims ElevenLabs support but the branch is unreachable.

## Can Kokoro run on Supabase Edge Functions?

No. Kokoro-82M needs ONNX/WASM inference with ~300 MB weights and multi-second CPU bursts; Lovable-managed Deno edge isolates have a short CPU budget and no persistent model cache (we already hit `WORKER_RESOURCE_LIMIT` on much lighter work). Kokoro must run in a **separate inference service**. Two supported placements, both behind one edge proxy:

- **Server Kokoro (primary):** a container running `kokoro-fastapi` (or ONNX runtime) on Fly.io / Modal / Runpod / HF Inference Endpoint, reachable over HTTPS with a shared secret. Warm CPU inference is roughly real-time; a 600-char chunk lands in ~1–3 s, comparable to today.
- **Client Kokoro (optional, later):** `kokoro-js` via transformers.js WebGPU in the browser — zero marginal cost and offline, but a one-time ~80–300 MB model download and no iOS Safari WebGPU guarantee. Ship as an opt-in "on-device voice" setting, not the default.

Licensing: Kokoro-82M is Apache-2.0 (weights and code), commercial use allowed; voice packs ship with the model. No per-character fee — cost becomes fixed compute (roughly $5–30/month for a small always-warm CPU instance, or scale-to-zero with a cold-start penalty).

## Target architecture

```text
TTSMiniPlayer / GlobalAudioPlayer / narration callers
        |  supabase.functions.invoke("tts-generate", {text, voice, speed})
        v
supabase/functions/tts-generate     <- single entry point
  |- quota gate (tts_usage, TIER_TTS_LIMITS)   [unchanged semantics]
  |- cache lookup: storage bucket tts-cache/<sha256(text|voice|speed|model)>.mp3
  |- provider registry (_shared/tts/registry.ts)
       1. kokoro   -> KOKORO_TTS_URL + KOKORO_TTS_TOKEN   (primary, all tiers)
       2. openai   -> premium adapter                      (opt-in / premium voices)
       3. elevenlabs -> premium adapter                    (opt-in / premium voices)
  |- on total failure: 200 { fallback: true, reason }
        v
client: browser SpeechSynthesis fallback (now actually wired into TTSMiniPlayer)
```

Contract stays byte-compatible with today's response (`{ audioContent: base64, ... }`) so the playback layer is untouched except for the fallback wiring and voice list.

## Files to change

New:
- `supabase/functions/tts-generate/index.ts` — the unified endpoint.
- `supabase/functions/_shared/tts/registry.ts`, `kokoro.ts`, `openai.ts`, `elevenlabs.ts`, `clean.ts`, `cache.ts`.
- `src/lib/tts/browserSpeech.ts` — extracted, testable SpeechSynthesis engine (chunk-aware, cancellable, promise-per-chunk).
- Storage bucket `tts-cache` (private) + migration adding `provider` and `cache_hit` columns to TTS telemetry.

Modified:
- `src/components/audio/TTSMiniPlayer.tsx` — call `tts-generate`; catch `PROVIDER_FALLBACK` and route the chunk through `browserSpeech.ts` while keeping chunk index, progress, elapsed, pause/resume, and `stopKey` behavior; new Kokoro voice list.
- `src/components/audio/TextToSpeechPlayer.tsx` — reuse `browserSpeech.ts`, point at `tts-generate` (kept as legacy/simple player).
- `src/components/reader/video/useVideoNarration.ts`, `src/components/decks/SlideViewer.tsx` — switch to `tts-generate`.
- `supabase/functions/text-to-speech/index.ts` — becomes a thin alias to the shared pipeline (backwards compatibility for the live app during rollout).
- `supabase/functions/voice-conversation/index.ts` — use the shared registry so its audio is quota-counted.
- `src/hooks/useEntitlements.ts` / `src/lib/subscription.ts` — Kokoro minutes are cheap: keep tier caps as the surface but raise free/student allowances; `openaiTTS` / `elevenLabsTTS` entitlements now mean "premium voice adapter", not "audio at all".
- Delete `supabase/functions/voice-tts` after callers are migrated.

Untouched by design: `AudioContext.tsx`, `GlobalAudioPlayer.tsx`, `useMediaSession.ts`, `useAudioSync.ts`, `useAudioReliability.ts`, `audioPositionPersistence.ts`.

## Security, caching, latency, cost

- Kokoro service is never called from the browser. `KOKORO_TTS_URL` / `KOKORO_TTS_TOKEN` are edge-only secrets (added in Project Settings → Secrets); the service also allowlists the shared token and rejects anything else.
- Cache key includes text hash + voice + speed + provider version; `tts-cache` bucket is private and served to the client as a short-lived signed URL or inline base64 (unchanged shape). TTL cleanup via a scheduled purge of objects older than 30 days.
- Quota still counts **generated** minutes only; cache hits are free and logged as `cache_hit`.
- Latency budget: cache hit < 300 ms; warm Kokoro 1–3 s per 600-char chunk; the existing prefetch-next-chunk logic covers the gap. Cold start on scale-to-zero hosting can reach 10–20 s — mitigate with a keep-warm ping or a min-instance-1 plan.
- Failure ladder: cache -> Kokoro -> (premium adapter if entitled) -> `fallback: true` -> device SpeechSynthesis -> visible non-blocking error.

## Phased rollout

- **Phase 0 — de-risk.** Stand up the Kokoro service, verify voices/latency from an edge function with a scratch call. No client changes.
- **Phase 1 — fallback repair (ships alone, valuable today).** Extract `browserSpeech.ts` and wire it into `TTSMiniPlayer`, so quota exhaustion degrades instead of erroring.
- **Phase 2 — unified endpoint.** Ship `tts-generate` with the provider registry, cache, and quota gate; keep OpenAI as provider #1 so behavior is identical. Verify parity.
- **Phase 3 — flip primary.** Kokoro becomes provider #1 behind a server-side flag (percentage rollout by user id); OpenAI stays as automatic secondary.
- **Phase 4 — consolidate.** Migrate narration/slide/voice-conversation callers, delete `voice-tts`, fix the `elevenlabs-tts` `user_id` bug or fold it into the adapter, adjust tier minutes.
- **Phase 5 — optional on-device Kokoro** as a Settings toggle.

## Acceptance tests

Functional (manual, in the reader):
1. Play a chapter: audio starts, chunks advance sequentially with no gap, progress and elapsed increase monotonically.
2. Pause mid-chunk, resume: playback continues from the same position, not from chunk start.
3. Navigate away mid-play: `GlobalAudioPlayer` bar appears and controls work; changing chapter (`stopKey`) stops audio and resets state.
4. Reload after pause: resume offer appears from `audioPositionManager` at the saved chunk.
5. iOS Safari: first tap starts audio (silent-WAV priming intact), lock screen shows media-session metadata, play/pause from lock screen works.
6. Force `tts-generate` to return `{ fallback: true }`: device voice speaks the same chunks, UI shows a "using device voice" notice, pause/stop still work — no thrown error.
7. Free-tier user past the minute cap: gate message and upgrade path, no crash.
8. Screen reader: play/pause/stop buttons keep accessible names and `aria-pressed`/live-region status announcements.

Automated:
- Unit: `browserSpeech.ts` (sequential chunks, cancellation, unsupported-browser returns false), cache key determinism, markdown cleaner idempotence, chunker never exceeds provider limit and never truncates.
- Contract: `tts-generate` returns the same JSON shape as `text-to-speech` for a fixed input; second identical call reports `cache_hit: true` and consumes zero quota.
- Regression: quota accounting for a 3-chunk chapter equals audio seconds generated, cache hits excluded.

## Open questions

1. Where should the Kokoro service live — Fly.io / Modal / Runpod / HF Endpoint? (affects cold start and cost)
2. Keep premium OpenAI/ElevenLabs voices as a paid perk, or retire them once Kokoro is primary?
3. With near-zero marginal cost, do you want to raise or remove free-tier listening minutes?
