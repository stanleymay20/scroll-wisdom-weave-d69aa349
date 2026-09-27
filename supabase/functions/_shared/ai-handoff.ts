export type ExternalAiProvider = "chatgpt" | "claude" | "gemini" | "other";

const PROVIDERS = new Set<ExternalAiProvider>([
  "chatgpt",
  "claude",
  "gemini",
  "other",
]);

export function normalizeProvider(value: string): ExternalAiProvider {
  const normalized = value.trim().toLowerCase();
  return PROVIDERS.has(normalized as ExternalAiProvider)
    ? (normalized as ExternalAiProvider)
    : "other";
}

export function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/u).length;
}

export function proposalPreview(value: string, maxLength = 280): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length <= maxLength) return compact;
  return compact.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
}
