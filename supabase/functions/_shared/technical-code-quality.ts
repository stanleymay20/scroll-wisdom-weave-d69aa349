export interface ExtractedCodeBlock {
  index: number;
  language: string;
  code: string;
}

export interface DeterministicCodeIssue {
  severity: "blocker" | "warning";
  code: string;
  message: string;
  blockIndex: number;
  language: string;
}

type PositionedBlock = {
  position: number;
  language: string;
  code: string;
};

function normalizeLanguage(value: string | undefined): string {
  const raw = (value || "unknown").trim().toLowerCase();
  if (raw === "py") return "python";
  if (raw === "js") return "javascript";
  if (raw === "ts") return "typescript";
  if (raw === "sh" || raw === "shell") return "bash";
  return raw || "unknown";
}

function parseStructuredBlock(blockContent: string): { language: string; code: string } | null {
  const langMatch = blockContent.match(/^language:\s*["']?([\w+.-]+)["']?\s*$/mi);
  const language = normalizeLanguage(langMatch?.[1]);

  const fenced = blockContent.match(/(?:^|\n)code:\s*\n\x60\x60\x60([\w+.-]*)\s*\n([\s\S]*?)\x60\x60\x60/i);
  if (fenced) {
    return {
      language: normalizeLanguage(fenced[1] || langMatch?.[1]),
      code: fenced[2].trim(),
    };
  }

  const inline = blockContent.match(
    /(?:^|\n)code:\s*\n([\s\S]*?)(?=\n(?:output|explanation|common_mistake|recommendations?):\s*|$)/i,
  );
  if (inline?.[1]?.trim()) {
    return { language, code: inline[1].trim() };
  }

  const hasMetadata = /^(?:language|title|purpose|code):\s/mi.test(blockContent);
  if (!hasMetadata && blockContent.trim()) {
    return { language: language === "unknown" ? "python" : language, code: blockContent.trim() };
  }

  return null;
}

export function extractTechnicalCodeBlocks(content: string): ExtractedCodeBlock[] {
  if (!content) return [];

  const positioned: PositionedBlock[] = [];
  const structuredRanges: Array<[number, number]> = [];

  const structuredRegex = /\[CODE_BLOCK\]([\s\S]*?)\[\/CODE_BLOCK\]/gi;
  let match: RegExpExecArray | null;
  while ((match = structuredRegex.exec(content)) !== null) {
    const parsed = parseStructuredBlock(match[1]);
    structuredRanges.push([match.index, structuredRegex.lastIndex]);
    if (parsed?.code) {
      positioned.push({ position: match.index, language: parsed.language, code: parsed.code });
    }
  }

  const fencedRegex = /\x60\x60\x60([\w+.-]*)\s*\n([\s\S]*?)\x60\x60\x60/g;
  while ((match = fencedRegex.exec(content)) !== null) {
    const insideStructured = structuredRanges.some(([start, end]) => match!.index >= start && match!.index < end);
    if (insideStructured) continue;
    positioned.push({
      position: match.index,
      language: normalizeLanguage(match[1]),
      code: match[2].trim(),
    });
  }

  positioned.sort((a, b) => a.position - b.position);
  return positioned.map((block, index) => ({
    index,
    language: block.language,
    code: block.code,
  }));
}

export function hasTechnicalCode(content: string): boolean {
  return extractTechnicalCodeBlocks(content).length > 0;
}

function add(
  issues: DeterministicCodeIssue[],
  block: ExtractedCodeBlock,
  code: string,
  message: string,
  severity: DeterministicCodeIssue["severity"] = "blocker",
) {
  issues.push({
    severity,
    code,
    message,
    blockIndex: block.index,
    language: block.language,
  });
}

export function detectDeterministicCodeIssues(content: string): DeterministicCodeIssue[] {
  const issues: DeterministicCodeIssue[] = [];

  for (const block of extractTechnicalCodeBlocks(content)) {
    if (block.language !== "python") continue;
    const source = block.code;

    if (/^\s*\d+\.\s+[A-Za-z][^\n]*$/m.test(source)) {
      add(
        issues,
        block,
        "python_uncommented_step",
        "Code block " + (block.index + 1) + " contains a numbered prose step that is not a Python comment.",
      );
    }

    if (/^\s*---[^\n]*---\s*$/m.test(source)) {
      add(
        issues,
        block,
        "python_uncommented_section_marker",
        "Code block " + (block.index + 1) + " contains an un-commented section marker that is invalid Python.",
      );
    }

    if (/\bif\s+name\s*==\s*(['"])main\1\s*:/i.test(source)) {
      add(
        issues,
        block,
        "python_main_guard_corrupted",
        "Code block " + (block.index + 1) + " uses if name == 'main' instead of the Python __name__ guard.",
      );
    }

    const mangledApis: Array<[RegExp, string]> = [
      [/\bsklearn\.modelselection\b/i, "sklearn.model_selection"],
      [/\btraintest_split\b/i, "train_test_split"],
      [/\bmeansquarederror\b/i, "mean_squared_error"],
      [/\.fittransform\s*\(/i, ".fit_transform("],
      [/\.readcsv\s*\(/i, ".read_csv("],
      [/\.tocsv\s*\(/i, ".to_csv("],
      [/\.frompretrained\s*\(/i, ".from_pretrained("],
    ];
    for (const [pattern, expected] of mangledApis) {
      if (pattern.test(source)) {
        add(
          issues,
          block,
          "python_api_identifier_mangled",
          "Code block " + (block.index + 1) + " contains a mangled Python/library API identifier; expected form includes " + expected + ".",
        );
      }
    }

  }

  return issues;
}
