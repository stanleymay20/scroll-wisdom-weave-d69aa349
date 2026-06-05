/**
 * SocialProofBadges — renders live marketplace social proof for a listing.
 *
 * Hard rules:
 *  - Only metrics > 0 are rendered. No placeholder/skeleton labels with zeros.
 *  - All numbers come from `get_listing_social_proof` (server-aggregated).
 *  - Returns null when no metric is meaningful, so cards collapse gracefully.
 */
import { useEffect, useState } from "react";
import { BookOpen, Download, Users, Eye } from "lucide-react";
import { fetchSocialProofOne, formatCount, type SocialProof } from "@/lib/socialProof";

interface Props {
  listingId: string;
  /** "row" = full row with icons + labels (book page). "compact" = inline dot-separated (cards). */
  variant?: "row" | "compact";
  /** Override metrics to show. Defaults to all four. */
  show?: Array<"readers" | "downloads" | "followers" | "views">;
  className?: string;
}

const DEFAULTS: Array<"readers" | "downloads" | "followers" | "views"> = [
  "readers", "downloads", "followers", "views",
];

export function SocialProofBadges({ listingId, variant = "row", show = DEFAULTS, className }: Props) {
  const [data, setData] = useState<SocialProof | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!listingId) return;
    fetchSocialProofOne(listingId).then((r) => { if (!cancelled) setData(r); });
    return () => { cancelled = true; };
  }, [listingId]);

  if (!data) return null;

  const items = show
    .map((key) => {
      const value = data[key];
      if (!value || value <= 0) return null;
      const Icon = ICONS[key];
      return { key, value, Icon };
    })
    .filter((x): x is { key: typeof DEFAULTS[number]; value: number; Icon: typeof BookOpen } => x !== null);

  if (items.length === 0) return null;

  if (variant === "compact") {
    return (
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground ${className ?? ""}`}>
        {items.map((it, i) => (
          <span key={it.key} className="inline-flex items-center gap-1">
            {i > 0 && <span aria-hidden className="text-muted-foreground/50">·</span>}
            <it.Icon className="h-3 w-3" aria-hidden />
            <span>{it.label}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 text-sm text-muted-foreground ${className ?? ""}`}>
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center gap-1.5">
          <it.Icon className="h-4 w-4 text-foreground/70" aria-hidden />
          <span><span className="font-semibold text-foreground tabular-nums">{formatCount(it.value)}</span> {SUFFIX[it.key](it.value)}</span>
        </span>
      ))}
    </div>
  );
}

const ICONS = {
  readers: BookOpen,
  downloads: Download,
  followers: Users,
  views: Eye,
} as const;

const LABELS: Record<string, (n: number) => string> = {
  readers:   (n) => `${formatCount(n)} reader${n === 1 ? "" : "s"}`,
  downloads: (n) => `${formatCount(n)} download${n === 1 ? "" : "s"}`,
  followers: (n) => `${formatCount(n)} follower${n === 1 ? "" : "s"}`,
  views:     (n) => `${formatCount(n)} view${n === 1 ? "" : "s"}`,
};

const SUFFIX: Record<string, (n: number) => string> = {
  readers:   (n) => `reader${n === 1 ? "" : "s"}`,
  downloads: (n) => `download${n === 1 ? "" : "s"}`,
  followers: (n) => `follower${n === 1 ? "" : "s"}`,
  views:     (n) => `view${n === 1 ? "" : "s"}`,
};
