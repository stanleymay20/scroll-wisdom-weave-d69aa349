// AES-256-GCM helper for encrypting OAuth tokens at rest.
// Key source: PLATFORM_TOKEN_ENCRYPTION_KEY (base64-encoded 32 bytes).
// Output format: base64( iv(12) || ciphertext || tag(16) ) as a single string.

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  // Accept either standard base64 or base64url; tolerate missing padding and whitespace.
  let t = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4 !== 0) t += "=";
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("PLATFORM_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("PLATFORM_TOKEN_ENCRYPTION_KEY not configured");
  let keyBytes: Uint8Array;
  try {
    keyBytes = b64decode(raw.trim());
  } catch {
    throw new Error("PLATFORM_TOKEN_ENCRYPTION_KEY is not valid base64");
  }
  if (keyBytes.length !== 32) {
    throw new Error(
      `PLATFORM_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${keyBytes.length})`,
    );
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await loadKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return b64encode(out);
}

export async function decryptToken(blob: string): Promise<string> {
  const key = await loadKey();
  const raw = b64decode(blob);
  if (raw.length < 13) throw new Error("ciphertext too short");
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
