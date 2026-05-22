// Fire-and-forget telemetry for storefront search.
// Logs every committed query + every result click. Never throws.
import { supabase } from "@/integrations/supabase/client";

function sessionId(): string {
  const KEY = "sl_session_id";
  let s = sessionStorage.getItem(KEY);
  if (!s) { s = crypto.randomUUID(); sessionStorage.setItem(KEY, s); }
  return s;
}

export async function logSearchQuery(opts: {
  query: string;
  results_count: number;
  source?: string;
  clicked_book_id?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.functions.invoke("log-search-query", {
      body: {
        query: opts.query,
        results_count: opts.results_count,
        source: opts.source ?? "storefront",
        clicked_book_id: opts.clicked_book_id ?? null,
        session_id: sessionId(),
        user_id: user?.id ?? null,
        metadata: opts.metadata ?? {},
      },
    });
  } catch { /* swallow */ }
}

export async function logSearchClick(opts: {
  query: string;
  clicked_book_id: string;
  position?: number;
  source?: string;
}): Promise<void> {
  return logSearchQuery({
    query: opts.query,
    results_count: 0, // ignored on click rows; clicked_book_id is the signal
    clicked_book_id: opts.clicked_book_id,
    source: opts.source ?? "storefront",
    metadata: { position: opts.position ?? null, kind: "click" },
  });
}
