/**
 * SocialProofBadges — renders live marketplace social proof for a listing.
 *
 * Hard rules:
 *  - Only metrics > 0 are rendered. No placeholder/skeleton labels with zeros.
 *  - All numbers come from `get_listing_social_proof` (server-aggregated).
 *  - Returns null when no metric is meaningful, so cards collapse gracefully.
 */
import { useEffect, useState } from "react";
import { BookOpen, Download, Users, Eye, Star } from "lucide-react";
import { fetchSocialProofOne, formatCount, type SocialProof } from "@/lib/socialProof";

interface Props {
  listingId: string;
  /** "row" = full row with icons + labels (book page). "compact" = inline dot-separated (cards). */
  variant?: "row" | "compact";
  /** Override metrics to show. Defaults to rating + all four counters. */
  show?: Array<"rating" | "readers" | "downloads" | "followers" | "views">;
  className?: string;
}

const DEFAULTS: Array<"rating" | "readers" | "downloads" | "followers" | "views"> = [
  "rating", "readers", "downloads", "followers", "views",
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

  const ratingVisible = (data.rating_count ?? 0) > 0 && data.rating_avg != null;

  if (variant === "compact") {
    const items: React.ReactNode[] = [];
    show.forEach((key) => {
      if (key === "rating") {
        if (!ratingVisible) return;
        items.push(
          <span key="rating" className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 fill-current" aria-hidden />
            <span className="tabular-nums">{data.rating_avg!.toFixed(1)}</span>
            <span className="text-muted-foreground/70">({formatCount(data.rating_count!)})</span>
          </span>,
        );
        return;
      }
      const value = data[key];
      if (!value || value <= 0) return;
      const Icon = ICONS[key];
      items.push(
        <span key={key} className="inline-flex items-center gap-1">
          <Icon className="h-3 w-3" aria-hidden />
          <span>{LABELS[key](value)}</span>
        </span>,
      );
    });
    if (items.length === 0) return null;
    return (
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground ${className ?? ""}`}>
        {items.map((node, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 && <span aria-hidden className="text-muted-foreground/50">·</span>}
            {node}
          </span>
        ))}
      </div>
    );
  }

  const rowItems: React.ReactNode[] = [];
  show.forEach((key) => {
    if (key === "rating") {
      if (!ratingVisible) return;
      rowItems.push(
        <span key="rating" className="inline-flex items-center gap-1.5">
          <Star className="h-4 w-4 fill-foreground text-foreground" aria-hidden />
          <span>
            <span className="font-semibold text-foreground tabular-nums">{data.rating_avg!.toFixed(1)}</span>{" "}
            <span className="text-muted-foreground">({formatCount(data.rating_count!)} review{data.rating_count === 1 ? "" : "s"})</span>
          </span>
        </span>,
      );
      return;
    }
    const value = data[key];
    if (!value || value <= 0) return;
    const Icon = ICONS[key];
    rowItems.push(
      <span key={key} className="inline-flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-foreground/70" aria-hidden />
        <span><span className="font-semibold text-foreground tabular-nums">{formatCount(value)}</span> {SUFFIX[key](value)}</span>
      </span>,
    );
  });
  if (rowItems.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-3 text-sm text-muted-foreground ${className ?? ""}`}>
      {rowItems}
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
