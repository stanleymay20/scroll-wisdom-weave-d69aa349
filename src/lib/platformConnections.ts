import { supabase } from "@/integrations/supabase/client";

export type PlatformConnection = {
  platform: string;
  connection_status: "connected" | "expired" | "revoked" | "error";
  external_creator_name: string | null;
  scopes: string[] | null;
  connected_at: string;
  last_used_at: string | null;
  last_error: string | null;
};

export async function listMyPlatformConnections(): Promise<PlatformConnection[]> {
  const { data, error } = await supabase.rpc("get_my_platform_connections");
  if (error) throw error;
  return (data ?? []) as PlatformConnection[];
}

export async function startGumroadConnect(returnUrl: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("connect-gumroad", {
    body: { return_url: returnUrl },
  });
  if (error) throw error;
  const url = (data as any)?.url;
  if (!url) throw new Error("No OAuth URL returned");
  return url as string;
}

export async function disconnectPlatform(platform: string): Promise<void> {
  const { error } = await supabase.functions.invoke("disconnect-platform", { body: { platform } });
  if (error) throw error;
}

export type GumroadPublishResult = {
  ok: boolean;
  external_url?: string;
  external_id?: string;
  edit_url?: string;
  bundle_hint?: string | null;
  note?: string;
  idempotent?: boolean;
};

export async function publishToGumroad(listingId: string, exportJobId?: string): Promise<GumroadPublishResult> {
  const { data, error } = await supabase.functions.invoke("publish-to-gumroad", {
    body: { listing_id: listingId, export_job_id: exportJobId },
  });
  if (error) {
    // Supabase wraps non-2xx; surface message
    throw new Error((error as any)?.message ?? "Publish failed");
  }
  return data as GumroadPublishResult;
}
