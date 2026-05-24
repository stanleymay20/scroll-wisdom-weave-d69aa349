// Authenticated, per-user recommendation client.
// Uses supabase.functions.invoke so the user's JWT is attached automatically.
// Responses are NEVER cached client-side or via CDN.

import { supabase } from "@/integrations/supabase/client";
import type { StoreListing } from "@/lib/storefrontApi";

type ItemsResp = { items: StoreListing[]; source?: string };

async function call(path: string, params: Record<string, string | number> = {}): Promise<ItemsResp> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => search.set(k, String(v)));
  const qs = search.toString();
  const { data, error } = await supabase.functions.invoke(
    `storefront-user-api/${path}${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
  if (error) throw error;
  return (data ?? { items: [] }) as ItemsResp;
}

export const storefrontUserApi = {
  recommendedForUser: (limit = 12) => call("recommended-for-user", { limit }),
  continueSeries:     (limit = 8)  => call("continue-series",      { limit }),
  fromFollowedAuthors:(limit = 12) => call("from-followed-authors",{ limit }),
};
