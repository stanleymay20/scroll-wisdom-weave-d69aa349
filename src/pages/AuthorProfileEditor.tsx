import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export default function AuthorProfileEditor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    slug: "", display_name: "", bio: "", avatar_url: "", website_url: "", linkedin_url: "", x_url: "",
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      const { data } = await supabase.from("author_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (data) setForm({
        slug: data.slug, display_name: data.display_name, bio: data.bio ?? "", avatar_url: data.avatar_url ?? "",
        website_url: data.website_url ?? "", linkedin_url: data.linkedin_url ?? "", x_url: data.x_url ?? "",
      });
      else {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
        const name = profile?.full_name ?? user.email?.split("@")[0] ?? "Author";
        setForm((f) => ({ ...f, display_name: name, slug: slugify(name) }));
      }
      setLoading(false);
    })();
  }, [navigate]);

  async function save() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = { ...form, user_id: user.id, slug: form.slug || slugify(form.display_name) };
      const { error } = await supabase.from("author_profiles").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      toast.success("Author profile saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="container mx-auto max-w-2xl p-8">Loading…</div>;

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Author profile — ScrollLibrary" description="Edit your public author profile." noindex />
      <div className="container mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-bold">Author profile</h1>
        <p className="text-muted-foreground mt-1">This appears on your public storefront pages.</p>
        <Card className="mt-6 p-6 space-y-4">
          <div>
            <Label>Display name</Label>
            <Input className="text-foreground caret-foreground" value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </div>
          <div>
            <Label>Profile slug</Label>
            <Input className="text-foreground caret-foreground" value={form.slug}
              onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} placeholder="your-name" />
            <p className="text-xs text-muted-foreground mt-1">URL: /authors/{form.slug || "your-name"}</p>
          </div>
          <div>
            <Label>Bio</Label>
            <Textarea className="text-foreground caret-foreground min-h-32" value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </div>
          <div>
            <Label>Avatar URL</Label>
            <Input className="text-foreground caret-foreground" value={form.avatar_url}
              onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Website</Label><Input className="text-foreground caret-foreground" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} /></div>
            <div><Label>LinkedIn</Label><Input className="text-foreground caret-foreground" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} /></div>
            <div><Label>X / Twitter</Label><Input className="text-foreground caret-foreground" value={form.x_url} onChange={(e) => setForm({ ...form, x_url: e.target.value })} /></div>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button>
        </Card>
      </div>
    </div>
  );
}
