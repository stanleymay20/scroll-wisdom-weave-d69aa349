/**
 * EvidenceVisual — renders a single ScrollVision asset with full
 * source attribution + license badge. Use inside reader panels.
 */
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ChapterAsset } from "@/lib/scrollvision";

interface Props {
  asset: ChapterAsset;
}

export function EvidenceVisual({ asset }: Props) {
  const sourceLabel =
    asset.source === "met_museum"
      ? "The Met"
      : asset.source === "wikimedia"
        ? "Wikimedia Commons"
        : asset.source;

  return (
    <figure className="my-6 overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-video w-full overflow-hidden bg-muted">
        <img
          src={asset.image_url}
          alt={asset.caption ?? asset.title ?? asset.entity ?? "Historical evidence"}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      <figcaption className="space-y-2 p-3 text-sm">
        <div className="font-medium text-foreground">
          {asset.caption ?? asset.title ?? asset.entity}
        </div>
        {asset.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{asset.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="secondary" className="text-[10px]">
            {sourceLabel}
          </Badge>
          {asset.license && (
            <Badge variant="outline" className="text-[10px]">
              {asset.license}
            </Badge>
          )}
          <a
            href={asset.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Source <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {asset.attribution && (
          <div className="text-[10px] text-muted-foreground">© {asset.attribution}</div>
        )}
      </figcaption>
    </figure>
  );
}
