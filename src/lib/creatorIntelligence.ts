/**
 * creatorIntelligence — client helpers for Phase 3.1 publishing intelligence RPCs.
 * All RPCs are SECURITY DEFINER and enforce caller == user_id (or admin).
 */
import { supabase } from "@/integrations/supabase/client";

export interface ChannelRow {
  channel: string;
  exports_total: number;
  exports_completed: number;
  exports_failed: number;
  time_to_publish_seconds: number;
  publications: number;
  live: number;
}

export interface PublishingAnalytics {
  window_days: number;
  channels: ChannelRow[];
  revenue: { net_cents: number; sales: number; refunds: number };
  generated_at: string;
}

export interface PublishingFunnel {
  window_days: number;
  generated: number;
  published: number;
  viewed: number;
  sampled: number;
  cta: number;
  checkout: number;
  purchased: number;
  refunded: number;
  followers_gained: number;
  generated_at: string;
}

export interface ChannelSuggestion {
  category: string;
  channel: string;
  publications: number;
  live: number;
  reason: string;
}

export async function fetchPublishingAnalytics(userId: string, windowDays = 30) {
  const { data, error } = await supabase.rpc("get_creator_publishing_analytics", {
    _user_id: userId,
    _window_days: windowDays,
  });
  if (error) throw error;
  return data as unknown as PublishingAnalytics;
}

export async function fetchPublishingFunnel(userId: string, windowDays = 30) {
  const { data, error } = await supabase.rpc("get_creator_publishing_funnel", {
    _user_id: userId,
    _window_days: windowDays,
  });
  if (error) throw error;
  return data as unknown as PublishingFunnel;
}

export async function fetchChannelRecommendations(userId: string, windowDays = 60) {
  const { data, error } = await supabase.rpc("get_creator_channel_recommendations", {
    _user_id: userId,
    _window_days: windowDays,
  });
  if (error) throw error;
  return data as unknown as { window_days: number; suggestions: ChannelSuggestion[]; generated_at: string };
}
