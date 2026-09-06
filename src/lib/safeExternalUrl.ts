const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["https:", "http:"]);

/** Return a normalized absolute web URL, rejecting javascript:, data:, file:, etc. */
export function getSafeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Open a web URL in a new tab without giving it access to window.opener. */
export function openSafeExternalUrl(value: string | null | undefined): boolean {
  const url = getSafeExternalUrl(value);
  if (!url) return false;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
  return opened !== null;
}
