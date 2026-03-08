import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Collaborator {
  id: string;
  book_id: string;
  user_id: string;
  invited_by: string;
  role: "editor" | "viewer" | "commenter";
  status: "pending" | "accepted" | "declined";
  invited_email: string | null;
  created_at: string;
  accepted_at: string | null;
}

export interface ActiveEditor {
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  chapter_id: string;
  is_active: boolean;
  last_heartbeat: string;
}

export function useCollaboration(bookId: string | undefined, userId: string | undefined) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [myRole, setMyRole] = useState<"owner" | "editor" | "viewer" | "commenter" | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCollaborators = useCallback(async () => {
    if (!bookId || !userId) return;
    
    // Check ownership
    const { data: book } = await supabase
      .from("books")
      .select("user_id")
      .eq("id", bookId)
      .single();

    const ownerFlag = book?.user_id === userId;
    setIsOwner(ownerFlag);

    // Fetch collaborators
    const { data, error } = await supabase
      .from("book_collaborators")
      .select("*")
      .eq("book_id", bookId);

    if (!error && data) {
      setCollaborators(data as unknown as Collaborator[]);
      const mine = data.find((c: any) => c.user_id === userId);
      setMyRole(ownerFlag ? "owner" : mine ? (mine as any).role : null);
    }
    setLoading(false);
  }, [bookId, userId]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  // Realtime subscription for collaborator changes
  useEffect(() => {
    if (!bookId) return;

    const channel = supabase
      .channel(`collab-${bookId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "book_collaborators",
        filter: `book_id=eq.${bookId}`,
      }, () => {
        fetchCollaborators();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [bookId, fetchCollaborators]);

  const inviteCollaborator = async (email: string, role: "editor" | "viewer" | "commenter") => {
    if (!bookId || !userId) return;

    // Look up user by email in profiles (we store email from auth)
    // For now, create a pending invite with email
    const { error } = await supabase.from("book_collaborators").insert({
      book_id: bookId,
      user_id: crypto.randomUUID(), // placeholder until user accepts
      invited_by: userId,
      role,
      status: "pending",
      invited_email: email,
    });

    if (error) {
      toast({ title: "Failed to invite", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Invitation sent", description: `Invited ${email} as ${role}` });
      fetchCollaborators();
    }
  };

  const removeCollaborator = async (collaboratorId: string) => {
    const { error } = await supabase
      .from("book_collaborators")
      .delete()
      .eq("id", collaboratorId);

    if (!error) {
      toast({ title: "Collaborator removed" });
      fetchCollaborators();
    }
  };

  const updateRole = async (collaboratorId: string, role: "editor" | "viewer" | "commenter") => {
    const { error } = await supabase
      .from("book_collaborators")
      .update({ role })
      .eq("id", collaboratorId);

    if (!error) fetchCollaborators();
  };

  const canEdit = myRole === "owner" || myRole === "editor";

  return {
    collaborators,
    isOwner,
    myRole,
    canEdit,
    loading,
    inviteCollaborator,
    removeCollaborator,
    updateRole,
    refetch: fetchCollaborators,
  };
}

// ============================================
// PRESENCE HOOK
// ============================================

export function useEditorPresence(
  bookId: string | undefined,
  chapterId: string | undefined,
  userId: string | undefined,
  userName: string | undefined,
  userAvatar: string | undefined
) {
  const [activeEditors, setActiveEditors] = useState<ActiveEditor[]>([]);

  // Register presence via Supabase Realtime Presence
  useEffect(() => {
    if (!bookId || !chapterId || !userId) return;

    const channel = supabase.channel(`presence-${bookId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{
          user_id: string;
          user_name: string;
          user_avatar: string;
          chapter_id: string;
          is_active: boolean;
          last_heartbeat: string;
        }>();

        const editors: ActiveEditor[] = [];
        for (const [, presences] of Object.entries(state)) {
          for (const p of presences) {
            if (p.user_id !== userId) {
              editors.push({
                user_id: p.user_id,
                user_name: p.user_name,
                user_avatar: p.user_avatar,
                chapter_id: p.chapter_id,
                is_active: p.is_active,
                last_heartbeat: p.last_heartbeat,
              });
            }
          }
        }
        setActiveEditors(editors);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            user_name: userName || "Anonymous",
            user_avatar: userAvatar || "",
            chapter_id: chapterId,
            is_active: true,
            last_heartbeat: new Date().toISOString(),
          });
        }
      });

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      channel.track({
        user_id: userId,
        user_name: userName || "Anonymous",
        user_avatar: userAvatar || "",
        chapter_id: chapterId,
        is_active: true,
        last_heartbeat: new Date().toISOString(),
      });
    }, 30000);

    return () => {
      clearInterval(heartbeat);
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [bookId, chapterId, userId, userName, userAvatar]);

  const editorsOnChapter = activeEditors.filter((e) => e.chapter_id === chapterId);
  const editorsOnOtherChapters = activeEditors.filter((e) => e.chapter_id !== chapterId);

  return { activeEditors, editorsOnChapter, editorsOnOtherChapters };
}
