import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, UserPlus, Trash2, Crown, Mail, Check, X } from "lucide-react";
import { useCollaboration, Collaborator } from "@/hooks/useCollaboration";

interface CollaborationPanelProps {
  bookId: string;
  userId: string;
}

const ROLE_LABELS: Record<string, string> = {
  editor: "Can edit",
  viewer: "View only",
  commenter: "Can comment",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-600 border-amber-500/30",
  accepted: "bg-green-500/20 text-green-600 border-green-500/30",
  declined: "bg-destructive/20 text-destructive border-destructive/30",
};

export function CollaborationPanel({ bookId, userId }: CollaborationPanelProps) {
  const {
    collaborators,
    isOwner,
    loading,
    inviteCollaborator,
    removeCollaborator,
    updateRole,
  } = useCollaboration(bookId, userId);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer" | "commenter">("editor");
  const [sending, setSending] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSending(true);
    await inviteCollaborator(email.trim(), role);
    setEmail("");
    setSending(false);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="h-4 w-4" />
          Collaborate
          {collaborators.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {collaborators.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Collaborators
          </DialogTitle>
          <DialogDescription>
            Invite others to view or edit this book together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Invite form — owner only */}
          {isOwner && (
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Email address</label>
                <Input
                  placeholder="collaborator@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-muted/50"
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
              </div>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="commenter">Commenter</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={!email.trim() || sending} size="icon" aria-label="Send invite">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}

          {/* Collaborator list */}
          <div className="space-y-2">
            {/* Owner row */}
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/20 text-primary text-xs">
                  <Crown className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <span className="text-sm font-medium">You (Owner)</span>
              </div>
              <Badge variant="outline" className="text-[10px]">Owner</Badge>
            </div>

            {loading && (
              <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
            )}

            {collaborators.map((collab) => (
              <CollaboratorRow
                key={collab.id}
                collab={collab}
                isOwner={isOwner}
                onRemove={() => removeCollaborator(collab.id)}
                onRoleChange={(r) => updateRole(collab.id, r)}
              />
            ))}

            {!loading && collaborators.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No collaborators yet. Invite someone to get started.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CollaboratorRow({
  collab,
  isOwner,
  onRemove,
  onRoleChange,
}: {
  collab: Collaborator;
  isOwner: boolean;
  onRemove: () => void;
  onRoleChange: (role: "editor" | "viewer" | "commenter") => void;
}) {
  const initials = (collab.invited_email || "??").slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 border border-border/30">
      <Avatar className="h-8 w-8">
        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Mail className="h-3 w-3 text-muted-foreground" />
          <span className="text-sm truncate">{collab.invited_email || "Unknown"}</span>
        </div>
      </div>
      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[collab.status]}`}>
        {collab.status}
      </Badge>
      {isOwner && (
        <>
          <Select value={collab.role} onValueChange={(v) => onRoleChange(v as any)}>
            <SelectTrigger className="w-[100px] h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="commenter">Commenter</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove} aria-label={`Remove ${collab.invited_email || "collaborator"}`}>
            <Trash2 className="h-3 w-3 text-destructive" aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  );
}
