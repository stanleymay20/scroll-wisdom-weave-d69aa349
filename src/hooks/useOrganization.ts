/**
 * useOrganization — fetch current user's organizations and active org context
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  verbose_audit: boolean;
  created_at: string;
}

export interface OrgMembership {
  organization_id: string;
  role: "owner" | "admin" | "member";
  organization: Organization;
}

const ACTIVE_ORG_KEY = "sl_active_org_id";

export function useOrganization() {
  const { user } = useSubscription();
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ORG_KEY) : null
  );
  const [isLoading, setIsLoading] = useState(true);

  const fetchMemberships = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, role, organizations:organization_id(*)")
      .eq("user_id", user.id);

    if (!error && data) {
      const mapped = data
        .filter((r: any) => r.organizations)
        .map((r: any) => ({
          organization_id: r.organization_id,
          role: r.role,
          organization: r.organizations,
        })) as OrgMembership[];
      setMemberships(mapped);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchMemberships();
  }, [fetchMemberships]);

  const setActiveOrgId = useCallback((orgId: string | null) => {
    setActiveOrgIdState(orgId);
    if (typeof window !== "undefined") {
      if (orgId) localStorage.setItem(ACTIVE_ORG_KEY, orgId);
      else localStorage.removeItem(ACTIVE_ORG_KEY);
    }
  }, []);

  const activeOrg = memberships.find((m) => m.organization_id === activeOrgId)?.organization || null;
  const activeRole = memberships.find((m) => m.organization_id === activeOrgId)?.role || null;
  const isOrgAdmin = activeRole === "owner" || activeRole === "admin";

  const createOrganization = useCallback(
    async (name: string, slug: string) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("organizations")
        .insert({ name, slug, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      await fetchMemberships();
      setActiveOrgId(data.id);
      return data as Organization;
    },
    [user, fetchMemberships, setActiveOrgId]
  );

  return {
    memberships,
    activeOrg,
    activeOrgId,
    activeRole,
    isOrgAdmin,
    isLoading,
    setActiveOrgId,
    refresh: fetchMemberships,
    createOrganization,
  };
}
