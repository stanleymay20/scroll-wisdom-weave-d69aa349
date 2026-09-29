export type ClientBookType =
  | "academic"
  | "technical"
  | "reference"
  | "professional"
  | "bestseller"
  | "workbook"
  | "illustrated"
  | "children"
  | "comic"
  | "fiction"
  | "text";

const ADVANCED_BOOK_TYPES = new Set<ClientBookType>([
  "academic",
  "technical",
  "reference",
  "professional",
  "bestseller",
  "workbook",
  "illustrated",
  "children",
  "comic",
  "fiction",
]);

export function parseQualifiedBookTypes(value?: string | null): Set<ClientBookType> {
  const raw = value ?? "";
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is ClientBookType => ADVANCED_BOOK_TYPES.has(item as ClientBookType)),
  );
}

export function isBookTypeReleasedForClient(
  bookType: ClientBookType,
  advancedAuthoringEnabled: boolean,
  qualifiedTypesValue: string | null | undefined = import.meta.env.VITE_QUALIFIED_BOOK_TYPES,
): boolean {
  if (bookType === "text") return true;
  if (!advancedAuthoringEnabled || !ADVANCED_BOOK_TYPES.has(bookType)) return false;
  return parseQualifiedBookTypes(qualifiedTypesValue).has(bookType);
}
