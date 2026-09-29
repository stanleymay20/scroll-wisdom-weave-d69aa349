export type FictionGenre =
  | "literary"
  | "thriller"
  | "romance"
  | "sci_fi"
  | "fantasy"
  | "mystery"
  | "horror"
  | "historical";

export type NarrativePOV = "first" | "third_limited" | "third_omniscient" | "second";

export interface FictionCharacterContract {
  id: string;
  name: string;
  role: "protagonist" | "antagonist" | "supporting" | "mentor";
  description: string;
  motivation: string;
  arc: string;
}

export interface FictionPlotPointContract {
  id: string;
  label: string;
  description: string;
}

export interface FictionContract {
  genre: FictionGenre;
  pov: NarrativePOV;
  tone: string;
  setting: string;
  characters: FictionCharacterContract[];
  plotPoints: FictionPlotPointContract[];
  themes: string;
}

export interface FictionMemoryChapter {
  chapter_number: number;
  title: string;
  content: string | null;
}

const GENRES = new Set<FictionGenre>([
  "literary", "thriller", "romance", "sci_fi", "fantasy", "mystery", "horror", "historical",
]);
const POVS = new Set<NarrativePOV>(["first", "third_limited", "third_omniscient", "second"]);
const ROLES = new Set<FictionCharacterContract["role"]>(["protagonist", "antagonist", "supporting", "mentor"]);

function clean(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/\0/g, "").trim().slice(0, max)
    : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function sanitizeFictionContract(raw: unknown): FictionContract {
  const input = object(raw);
  const requestedGenre = clean(input.genre, 32) as FictionGenre;
  const requestedPov = clean(input.pov, 32) as NarrativePOV;

  const characters = Array.isArray(input.characters)
    ? input.characters.slice(0, 24).map((entry, index) => {
        const item = object(entry);
        const requestedRole = clean(item.role, 32) as FictionCharacterContract["role"];
        return {
          id: clean(item.id, 120) || "character-" + (index + 1),
          name: clean(item.name, 120),
          role: ROLES.has(requestedRole) ? requestedRole : "supporting",
          description: clean(item.description, 1200),
          motivation: clean(item.motivation, 1000),
          arc: clean(item.arc, 1200),
        };
      }).filter((entry) => entry.name.length > 0)
    : [];

  const plotPoints = Array.isArray(input.plotPoints)
    ? input.plotPoints.slice(0, 30).map((entry, index) => {
        const item = object(entry);
        return {
          id: clean(item.id, 120) || "plot-" + (index + 1),
          label: clean(item.label, 200) || "Plot Point " + (index + 1),
          description: clean(item.description, 1600),
        };
      }).filter((entry) => entry.description.length > 0 || entry.label.length > 0)
    : [];

  return {
    genre: GENRES.has(requestedGenre) ? requestedGenre : "literary",
    pov: POVS.has(requestedPov) ? requestedPov : "third_limited",
    tone: clean(input.tone, 500),
    setting: clean(input.setting, 5000),
    characters,
    plotPoints,
    themes: clean(input.themes, 1500),
  };
}

function oneLine(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function buildFictionContinuityContext(
  rawConfig: unknown,
  priorChapters: FictionMemoryChapter[],
): string {
  const config = sanitizeFictionContract(rawConfig);
  const ordered = [...priorChapters].sort((a, b) => a.chapter_number - b.chapter_number);

  const characterLines = config.characters.length > 0
    ? config.characters.map((character) =>
        "- " + character.name + " [" + character.role + "]: " + oneLine(character.description, 260)
        + (character.motivation ? " | Motivation: " + oneLine(character.motivation, 220) : "")
        + (character.arc ? " | Arc: " + oneLine(character.arc, 260) : "")
      ).join("\n")
    : "- No explicit character sheet was supplied; preserve all names and traits established in prior chapters.";

  const plotLines = config.plotPoints.length > 0
    ? config.plotPoints.map((point, index) =>
        (index + 1) + ". " + point.label + ": " + oneLine(point.description, 320)
      ).join("\n")
    : "- No explicit plot roadmap was supplied; do not invent retroactive contradictions.";

  const ledger = ordered.length > 0
    ? ordered.map((chapter) => {
        const content = chapter.content || "";
        const opening = oneLine(content.slice(0, 500), 320);
        const ending = oneLine(content.slice(-700), 420);
        return "Ch." + chapter.chapter_number + " \"" + oneLine(chapter.title, 180)
          + "\" | opening: " + (opening || "n/a")
          + " | ending/state: " + (ending || "n/a");
      }).join("\n")
    : "- This is the opening chapter; establish canon carefully.";

  const recent = ordered.slice(-2).map((chapter) =>
    "### Recent Chapter " + chapter.chapter_number + ": " + oneLine(chapter.title, 180)
      + "\n" + (chapter.content || "").slice(-2400)
  ).join("\n\n");

  return [
    "===========================================",
    "FICTION STORY BIBLE — AUTHORITATIVE CONTINUITY",
    "===========================================",
    "Genre: " + config.genre,
    "POV: " + config.pov,
    "Tone: " + (config.tone || "Not specified; infer conservatively from established prose."),
    "Themes: " + (config.themes || "Not explicitly specified."),
    "Setting / world rules:",
    config.setting || "Use only setting facts established by the outline and prior chapters.",
    "",
    "CHARACTER CANON:",
    characterLines,
    "",
    "PLOT ROADMAP:",
    plotLines,
    "",
    "WHOLE-MANUSCRIPT CONTINUITY LEDGER:",
    ledger,
    "",
    "RECENT SCENE CONTEXT:",
    recent || "No previous scene context.",
    "",
    "HARD CONTINUITY RULES:",
    "1. Preserve POV and tense unless the story bible explicitly calls for a change.",
    "2. Never rename, resurrect, relocate, or alter a character trait without narrative cause.",
    "3. Track unresolved promises, injuries, possessions, relationships, knowledge, and secrets.",
    "4. Do not repeat a reveal the reader already received.",
    "5. Advance the current plot beat rather than restarting the premise.",
    "6. Respect world rules and chronology already established.",
    "7. If the roadmap conflicts with already-published chapter canon, preserve published canon and adapt the roadmap.",
    "===========================================",
    "",
  ].join("\n");
}
