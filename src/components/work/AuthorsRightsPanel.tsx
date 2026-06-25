import { useWorkCapabilities } from "@/hooks/useWorkCapabilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, ShieldCheck } from "lucide-react";

/**
 * AuthorsRightsPanel
 *
 * Minimal Phase 1 surface that demonstrates capability-gated UI.
 * Collaborators see clearly locked fields; only the verified owner can edit.
 *
 * TODO(phase2): full author ordering UI, role chips, rights matrix editor,
 * organization inheritance display.
 */
export function AuthorsRightsPanel({ workId }: { workId: string | null | undefined }) {
  const caps = useWorkCapabilities(workId);

  if (!workId) return null;

  const canEditAuthorship = caps.capabilities.canEditAuthorship;
  const canEditRights = caps.capabilities.canEditRights;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-foreground">
          <span>Authorship & Rights</span>
          {caps.publishLocked && (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="w-3 h-3" /> Published — locked
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <LockedRow
          label="Author identity"
          locked={!canEditAuthorship}
          lockReason={caps.publishLocked ? "Locked because this work is published" : "Only the verified owner can change authorship"}
        />
        <LockedRow
          label="Copyright holder"
          locked={!canEditRights}
          lockReason="Only the verified owner can change rights"
        />
        <LockedRow
          label="Publisher / ISBN"
          locked={!canEditRights}
          lockReason="Only the verified owner can change publishing metadata"
        />
        <LockedRow
          label="Royalty configuration"
          locked={!canEditRights}
          lockReason="Only the verified owner can change rights"
        />

        {caps.isCollaborator && !caps.isOwner && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            You're a collaborator on this work. You can edit content, but author
            identity, rights, and publishing metadata are reserved for the owner.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LockedRow({ label, locked, lockReason }: { label: string; locked: boolean; lockReason: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-foreground">{label}</div>
      {locked ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={lockReason}>
          <Lock className="w-3 h-3" /> Locked
        </span>
      ) : (
        <span className="text-xs text-emerald-600">Editable</span>
      )}
    </div>
  );
}
