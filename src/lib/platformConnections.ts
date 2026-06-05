import { supabase } from "@/integrations/supabase/client";

export type PlatformId = "gumroad" | "shopify";

export type PlatformConnection = {
  platform: PlatformId | string;
  connection_status: "connected" | "expired" | "revoked" | "error";
  external_creator_name: string | null;
  /** Shopify shops only — prefills the Reconnect input after token expiry. */
  shop_domain: string | null;
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

export async function startShopifyConnect(shop: string, returnUrl: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("connect-shopify", {
    body: { shop, return_url: returnUrl },
  });
  if (error) throw error;
  const url = (data as any)?.url;
  if (!url) throw new Error("No OAuth URL returned");
  return url as string;
}

export async function disconnectPlatform(platform: PlatformId | string): Promise<DisconnectResult> {
  const { data, error } = await supabase.functions.invoke("disconnect-platform", { body: { platform } });
  if (error) throw error;
  return (data ?? { ok: true }) as DisconnectResult;
}

export type DirectPublishResult = {
  ok: boolean;
  external_url?: string;
  external_id?: string;
  edit_url?: string;
  bundle_hint?: string | null;
  note?: string;
  idempotent?: boolean;
  /** Stitched into publishing_audit_log + external_publications. Quote this in support tickets. */
  correlation_id?: string;
};

export type DisconnectResult = {
  ok: boolean;
  idempotent?: boolean;
  upstream_revoked?: boolean;
  upstream_revoke_attempted?: boolean;
  upstream_revoke_reason?: string | null;
  correlation_id?: string;
};

/** @deprecated use DirectPublishResult */
export type GumroadPublishResult = DirectPublishResult;

export async function publishToGumroad(listingId: string, exportJobId?: string): Promise<DirectPublishResult> {
  const { data, error } = await supabase.functions.invoke("publish-to-gumroad", {
    body: { listing_id: listingId, export_job_id: exportJobId },
  });
  if (error) throw new Error((error as any)?.message ?? "Publish failed");
  return data as DirectPublishResult;
}

export async function publishToShopify(listingId: string, exportJobId?: string): Promise<DirectPublishResult> {
  const { data, error } = await supabase.functions.invoke("publish-to-shopify", {
    body: { listing_id: listingId, export_job_id: exportJobId },
  });
  if (error) throw new Error((error as any)?.message ?? "Publish failed");
  return data as DirectPublishResult;
}
