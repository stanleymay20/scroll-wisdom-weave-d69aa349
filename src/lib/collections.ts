// Creator-side collection management. RLS scopes writes to the owner.
// Public reads of public collections go through storefrontApi.
import { supabase } from "@/integrations/supabase/client";

export interface BookCollection {
  id: string;
  owner_user_id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  sort_index: number;
  created_at: string;
  updated_at: string;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "").trim()
    .replace(/\s+/g, "-").slice(0, 60) || "collection";
}

export async function listMyCollections(): Promise<BookCollection[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("book_collections")
    .select("*")
    .eq("owner_user_id", user.id)
    .order("sort_index", { ascending: true });
  return (data as BookCollection[]) ?? [];
}

export async function createCollection(input: {
  title: string;
  description?: string;
  is_public?: boolean;
  cover_image_url?: string | null;
}): Promise<BookCollection | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const slug = slugify(input.title);
  const { data, error } = await supabase
    .from("book_collections")
    .insert({
      owner_user_id: user.id,
      slug,
      title: input.title,
      description: input.description ?? null,
      cover_image_url: input.cover_image_url ?? null,
      is_public: input.is_public ?? false,
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as BookCollection;
}

export async function updateCollection(id: string, patch: Partial<BookCollection>): Promise<void> {
  const { error } = await supabase.from("book_collections").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from("book_collections").delete().eq("id", id);
  if (error) throw error;
}

export async function addBookToCollection(collection_id: string, book_id: string): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const { error } = await supabase
    .from("book_collection_items")
    .insert({ collection_id, book_id });
  if (error) {
    if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
      return { ok: false, duplicate: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeBookFromCollection(collection_id: string, book_id: string): Promise<void> {
  const { error } = await supabase
    .from("book_collection_items")
    .delete()
    .eq("collection_id", collection_id)
    .eq("book_id", book_id);
  if (error) throw error;
}
