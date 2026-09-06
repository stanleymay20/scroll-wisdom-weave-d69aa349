export type ScrollIdentifierKind = "SLW" | "SLE" | "SLP";

const SCROLL_ID = /^(SLW|SLE|SLP)-([0-9A-F]{32})$/;

export function newScrollIdentifier(kind: ScrollIdentifierKind): string {
  return `${kind}-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
}

export function parseScrollIdentifier(value: string): { kind: ScrollIdentifierKind; token: string } | null {
  const match = String(value || "").trim().toUpperCase().match(SCROLL_ID);
  if (!match) return null;
  return { kind: match[1] as ScrollIdentifierKind, token: match[2] };
}

export function isScrollIdentifier(value: string, kind?: ScrollIdentifierKind): boolean {
  const parsed = parseScrollIdentifier(value);
  return !!parsed && (!kind || parsed.kind === kind);
}

export function scrollIdentityLabel(kind: ScrollIdentifierKind): string {
  if (kind === "SLW") return "ScrollLibrary Work ID";
  if (kind === "SLE") return "ScrollLibrary Edition ID";
  return "ScrollLibrary Product ID";
}
