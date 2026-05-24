// Follow / unfollow button for an author profile.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { followAuthor, getFollowerCount, isFollowing, unfollowAuthor } from "@/lib/authorFollow";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface Props {
  authorUserId: string;
  className?: string;
}

export function FollowAuthorButton({ authorUserId, className }: Props) {
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState<number>(0);
  const [pending, setPending] = useState(false);
  const [selfFollow, setSelfFollow] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const [{ data: { user } }, c, f] = await Promise.all([
        supabase.auth.getUser(),
        getFollowerCount(authorUserId),
        isFollowing(authorUserId),
      ]);
      setCount(c);
      setFollowing(f);
      setSelfFollow(!!user && user.id === authorUserId);
    })();
  }, [authorUserId]);

  async function onClick() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth?redirect=" + encodeURIComponent(window.location.pathname));
      return;
    }
    if (selfFollow) return;
    setPending(true);
    if (following) {
      const r = await unfollowAuthor(authorUserId);
      if (r.ok) { setFollowing(false); setCount((n) => Math.max(0, n - 1)); }
      else toast({ title: "Couldn't unfollow", description: r.error, variant: "destructive" });
    } else {
      const r = await followAuthor(authorUserId);
      if (r.ok) { setFollowing(true); setCount((n) => n + 1); }
      else toast({ title: "Couldn't follow", description: r.error, variant: "destructive" });
    }
    setPending(false);
  }

  return (
    <div className={"flex items-center gap-3 " + (className ?? "")}>
      <Button
        size="sm"
        variant={following ? "outline" : "default"}
        onClick={onClick}
        disabled={pending || selfFollow}
      >
        {selfFollow ? "Your profile" : following ? "Following" : "Follow"}
      </Button>
      <span className="text-sm text-muted-foreground">
        {count} follower{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}
