import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  preflight,
  json,
  serverError,
  requireUser,
  validateBody,
  enforceRateLimit,
  serviceClient,
  z,
} from "../_shared/http.ts";

const BodySchema = z.object({
  content: z.string().min(1).max(200_000),
  title: z.string().max(500).optional().default(""),
  contentType: z.string().max(64).optional().default("unknown"),
  contentId: z.string().uuid().optional(),
});

const harmfulPatterns = {
  hate_speech: [
    /\b(hate|kill|murder)\s+(all\s+)?(jews|muslims|christians|blacks|whites|gays|women|men)\b/gi,
    /\b(racial|ethnic)\s+cleansing\b/gi,
    /\bnazi\s+(propaganda|ideology)\b/gi,
  ],
  explicit: [
    /\b(pornographic|sexually\s+explicit)\s+content\b/gi,
    /\bchild\s+(porn|exploitation|abuse)\b/gi,
  ],
  violence: [
    /\b(instructions|how)\s+to\s+(kill|murder|harm)\b/gi,
    /\b(bomb|weapon)\s+making\s+(instructions|guide)\b/gi,
    /\bterrorism\s+(guide|manual)\b/gi,
  ],
  illegal: [
    /\b(drug)\s+(manufacturing|production)\s+(guide|instructions)\b/gi,
    /\bhacking\s+(into|attack)\s+(bank|government)\b/gi,
  ],
};

const disclaimerCategories = {
  medical: [/\b(diagnosis|treatment|medication|prescription|surgery|disease|illness)\b/gi],
  legal: [/\b(legal\s+advice|lawsuit|litigation|court|attorney|lawyer)\b/gi],
  financial: [/\b(investment\s+advice|trading\s+strategy|stock\s+picks|guaranteed\s+returns)\b/gi],
};

interface ContentFilterResult {
  approved: boolean;
  flagged: boolean;
  severity: "low" | "medium" | "high" | "critical";
  reasons: string[];
  disclaimersNeeded: string[];
  autoReject: boolean;
}

function analyzeContent(text: string, title: string): ContentFilterResult {
  const combined = `${title} ${text}`.toLowerCase();
  const result: ContentFilterResult = {
    approved: true,
    flagged: false,
    severity: "low",
    reasons: [],
    disclaimersNeeded: [],
    autoReject: false,
  };

  for (const [category, patterns] of Object.entries(harmfulPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        result.flagged = true;
        result.reasons.push(category);
        if (category === "hate_speech" || category === "explicit") {
          result.severity = "critical";
          result.autoReject = true;
        } else if (category === "violence" || category === "illegal") {
          result.severity = "high";
          result.autoReject = true;
        }
        break;
      }
    }
  }

  for (const [category, patterns] of Object.entries(disclaimerCategories)) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        result.disclaimersNeeded.push(category);
        break;
      }
    }
  }

  result.approved = !result.autoReject;
  if (result.flagged && !result.autoReject) {
    result.severity = result.severity === "low" ? "medium" : result.severity;
  }
  return result;
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const limited = enforceRateLimit({
      name: "content-filter",
      key: auth.userId,
      limit: 60,
      windowSec: 60,
    });
    if (limited) return limited;

    const body = await validateBody(req, BodySchema);
    if (body instanceof Response) return body;

    console.log("[content-filter] analyzing", {
      userId: auth.userId,
      contentType: body.contentType,
      length: body.content.length,
    });

    const result = analyzeContent(body.content, body.title ?? "");

    if (result.flagged && body.contentId) {
      try {
        const admin = serviceClient();
        await admin.from("moderation_queue").insert({
          content_type: body.contentType,
          content_id: body.contentId,
          flagged_reason: result.reasons.join(", "),
          severity: result.severity,
          status: result.autoReject ? "auto_rejected" : "pending",
        });
      } catch (qerr) {
        console.error("[content-filter] moderation queue insert failed", qerr);
      }
    }

    return json({ success: true, result });
  } catch (err) {
    console.error("[content-filter] error", err);
    return serverError(err);
  }
});
