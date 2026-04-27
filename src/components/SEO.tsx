import { useEffect } from "react";

/**
 * SITE_URL — the production canonical origin used for all per-page canonical/og:url tags.
 * Picks the custom domain in production; falls back to the lovable preview URL otherwise.
 */
export const SITE_URL = "https://scrolllibrary.org";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

export interface SEOProps {
  /** <title> — keep under 60 chars including site suffix */
  title: string;
  /** <meta name="description"> — keep under 160 chars */
  description: string;
  /** Path-only canonical (e.g. "/pricing"). The site origin is added automatically. Leave undefined to skip. */
  canonical?: string;
  /** og:image absolute URL (defaults to the homepage social image) */
  image?: string;
  /** og:type (default "website"; use "article" for content, "profile" for users) */
  type?: "website" | "article" | "profile" | "book";
  /** Optional JSON-LD structured data object — will be JSON.stringified into a script tag */
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  /** Set true on routes that shouldn't be indexed (auth, dashboard, admin, gated content) */
  noindex?: boolean;
}

const TAG_ID_PREFIX = "sl-seo-";

/**
 * Upsert a single managed <meta>/<link> element in document.head.
 * We mark our tags with a stable id so we can update them on route change
 * without leaving stale entries behind.
 */
function upsert(tag: "meta" | "link" | "script", id: string, attrs: Record<string, string>, text?: string) {
  const elementId = `${TAG_ID_PREFIX}${id}`;
  let el = document.getElementById(elementId) as HTMLMetaElement | HTMLLinkElement | HTMLScriptElement | null;
  if (!el) {
    el = document.createElement(tag) as typeof el;
    el!.id = elementId;
    document.head.appendChild(el!);
  }
  for (const [k, v] of Object.entries(attrs)) {
    el!.setAttribute(k, v);
  }
  if (text !== undefined) {
    el!.textContent = text;
  }
}

function remove(id: string) {
  const el = document.getElementById(`${TAG_ID_PREFIX}${id}`);
  if (el) el.remove();
}

/**
 * <SEO /> — declarative per-route head management without react-helmet.
 *
 * Renders nothing. Mutates document.head on mount and on prop change,
 * and resets to safe defaults on unmount so SPAs don't leak stale meta
 * to the next route.
 */
export function SEO({
  title,
  description,
  canonical,
  image = DEFAULT_OG_IMAGE,
  type = "website",
  jsonLd,
  noindex = false,
}: SEOProps) {
  useEffect(() => {
    // <title>
    document.title = title;

    // Description
    upsert("meta", "description", { name: "description", content: description });

    // Canonical
    if (canonical) {
      const href = canonical.startsWith("http") ? canonical : `${SITE_URL}${canonical}`;
      upsert("link", "canonical", { rel: "canonical", href });
    } else {
      remove("canonical");
    }

    // Robots
    upsert("meta", "robots", {
      name: "robots",
      content: noindex ? "noindex,nofollow" : "index,follow",
    });

    // Open Graph
    upsert("meta", "og-title", { property: "og:title", content: title });
    upsert("meta", "og-description", { property: "og:description", content: description });
    upsert("meta", "og-type", { property: "og:type", content: type });
    upsert("meta", "og-image", { property: "og:image", content: image });
    if (canonical) {
      const href = canonical.startsWith("http") ? canonical : `${SITE_URL}${canonical}`;
      upsert("meta", "og-url", { property: "og:url", content: href });
    }

    // Twitter
    upsert("meta", "tw-title", { name: "twitter:title", content: title });
    upsert("meta", "tw-description", { name: "twitter:description", content: description });
    upsert("meta", "tw-image", { name: "twitter:image", content: image });
    upsert("meta", "tw-card", { name: "twitter:card", content: "summary_large_image" });

    // JSON-LD
    if (jsonLd) {
      upsert(
        "script",
        "jsonld",
        { type: "application/ld+json" },
        JSON.stringify(jsonLd),
      );
    } else {
      remove("jsonld");
    }
  }, [title, description, canonical, image, type, jsonLd, noindex]);

  return null;
}
