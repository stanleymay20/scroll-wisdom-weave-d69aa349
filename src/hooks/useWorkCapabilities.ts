import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * useWorkCapabilities()
 *
 * SINGLE source of truth for authorship/rights/publishing UI gating.
 * No component should inline role-string comparisons — consume this hook.
 *
 * Backend (`_shared/permissions.ts`) remains the actual authorization
 * boundary; this hook only mirrors the decision for UI affordances.
 */
export type WorkCapability =
  | "canEditWork"
  | "canEditAuthorship"
  | "canEditRights"
  | "canPublishWork"
  | "canUnpublishWork"
  | "canExportPublication"
  | "canTransferOwnership";

export interface WorkCapabilities {
  loading: boolean;
  workId: string | null;
  isOwner: boolean;
  isAuthor: boolean;
  isCollaborator: boolean;
  publishLocked: boolean;
  capabilities: Record<WorkCapability, boolean>;
}

const DEFAULT: WorkCapabilities = {
  loading: false,
  workId: null,
  isOwner: false,
  isAuthor: false,
  isCollaborator: false,
  publishLocked: false,
  capabilities: {
    canEditWork: false,
    canEditAuthorship: false,
    canEditRights: false,
    canPublishWork: false,
    canUnpublishWork: false,
    canExportPublication: false,
    canTransferOwnership: false,
  },
};

export function useWorkCapabilities(workId: string | null | undefined): WorkCapabilities {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["work-capabilities", workId, user?.id],
    enabled: !!workId && !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<WorkCapabilities> => {
      if (!workId || !user?.id) return DEFAULT;

      const [{ data: work }, { data: author }, { data: collab }] = await Promise.all([
        supabase
          .from("works")
          .select("id, owner_rights_holder_id, created_by, publish_locked_at")
          .eq("id", workId)
          .maybeSingle(),
        supabase
          .from("work_authors")
          .select("id")
          .eq("work_id", workId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("book_collaborators")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle(),
      ]);

      if (!work) return DEFAULT;

      let ownerUserId: string | null = null;
      if (work.owner_rights_holder_id) {
        const { data: rh } = await supabase
          .from("rights_holders")
          .select("user_id, holder_type")
          .eq("id", work.owner_rights_holder_id)
          .maybeSingle();
        if (rh?.holder_type === "individual") ownerUserId = rh.user_id ?? null;
      }
      if (!ownerUserId) ownerUserId = work.created_by ?? null;

      const isOwner = ownerUserId === user.id;
      const isAuthor = !!author;
      const isCollaborator = !!collab;
      const publishLocked = !!work.publish_locked_at;

      return {
        loading: false,
        workId,
        isOwner,
        isAuthor,
        isCollaborator,
        publishLocked,
        capabilities: {
          canEditWork: isOwner || isAuthor || isCollaborator,
          canEditAuthorship: isOwner && !publishLocked,
          canEditRights: isOwner,
          canPublishWork: isOwner,
          canUnpublishWork: isOwner,
          canExportPublication: isOwner || isAuthor || isCollaborator,
          canTransferOwnership: isOwner,
        },
      };
    },
  });

  return data ?? { ...DEFAULT, loading: isLoading };
}
