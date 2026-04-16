/**
 * Organizations — user-facing org management (create, switch, view members)
 */
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Building2, Plus, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Organizations() {
  const { memberships, activeOrgId, setActiveOrgId, createOrganization, isLoading } = useOrganization();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) {
      toast({ title: "Name and slug required", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await createOrganization(name.trim(), slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"));
      toast({ title: "Organization created" });
      setOpen(false);
      setName("");
      setSlug("");
    } catch (e: any) {
      toast({ title: "Failed to create", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <Helmet>
        <title>Organizations — ScrollLibrary</title>
        <meta name="description" content="Manage your ScrollLibrary organizations and team memberships." />
      </Helmet>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Group your books, share libraries, and enable institutional oversight.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New organization
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create organization</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="org-name">Name</Label>
                <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme University" />
              </div>
              <div>
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="acme-university"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lowercase letters, numbers, and hyphens only.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : memberships.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <CardTitle className="mb-2">No organizations yet</CardTitle>
            <CardDescription className="mb-4">
              Create one to share books with a team or institution.
            </CardDescription>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create your first organization
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {memberships.map((m) => {
            const isActive = m.organization_id === activeOrgId;
            return (
              <Card key={m.organization_id} className={isActive ? "border-primary" : ""}>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      {m.organization.name}
                      {isActive && (
                        <Badge variant="default" className="text-xs">
                          <Check className="h-3 w-3 mr-1" /> Active
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs">@{m.organization.slug}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{m.role}</Badge>
                    {!isActive && (
                      <Button variant="outline" size="sm" onClick={() => setActiveOrgId(m.organization_id)}>
                        Switch to
                      </Button>
                    )}
                  </div>
                </CardHeader>
              </Card>
            );
          })}
          {activeOrgId && (
            <Button variant="ghost" size="sm" onClick={() => setActiveOrgId(null)}>
              Clear active organization (use personal)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
