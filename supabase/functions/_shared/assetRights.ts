export interface AssetRightsInput {
  source?: string | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  license?: string | null;
  attribution?: string | null;
}

export type AssetRightsCode =
  | "rights_ok"
  | "missing_source"
  | "missing_source_url"
  | "missing_image_url"
  | "missing_license"
  | "missing_attribution"
  | "ambiguous_license"
  | "noncommercial_license"
  | "no_derivatives_license"
  | "unsupported_license";

export interface AssetRightsDecision {
  allowed: boolean;
  code: AssetRightsCode;
  normalizedLicense: string;
  reason: string;
}

function normalize(value: string | null | undefined): string {
  return (value || "").trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toUpperCase();
}

function present(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Conservative publication-rights policy for externally retrieved media.
 *
 * We intentionally do NOT infer rights from the host/source. A Wikimedia, NASA,
 * museum, library, or archive URL is provenance, not permission. The individual
 * asset must carry an explicit license that permits commercial publication.
 *
 * Current trusted classes:
 *   - Public Domain / Public Domain Mark
 *   - CC0
 *   - CC BY
 *   - CC BY-SA
 *
 * We reject NC and ND variants. ND can be incompatible with cropping, resizing,
 * overlays, or other production transforms, so ScrollLibrary fails closed rather
 * than trying to prove that every downstream render remained unmodified.
 */
export function evaluateAssetRights(input: AssetRightsInput): AssetRightsDecision {
  if (!present(input.source)) {
    return { allowed: false, code: "missing_source", normalizedLicense: "", reason: "Asset source is missing." };
  }
  if (!present(input.sourceUrl)) {
    return { allowed: false, code: "missing_source_url", normalizedLicense: "", reason: "Canonical source URL is missing." };
  }
  if (!present(input.imageUrl)) {
    return { allowed: false, code: "missing_image_url", normalizedLicense: "", reason: "Image URL is missing." };
  }
  if (!present(input.license)) {
    return { allowed: false, code: "missing_license", normalizedLicense: "", reason: "Asset license is missing." };
  }
  if (!present(input.attribution)) {
    return { allowed: false, code: "missing_attribution", normalizedLicense: normalize(input.license), reason: "Asset attribution/credit is missing." };
  }

  const license = normalize(input.license);

  if (/UNKNOWN|UNSPECIFIED|NO KNOWN|ALL RIGHTS RESERVED|COPYRIGHTED/.test(license)) {
    return {
      allowed: false,
      code: "ambiguous_license",
      normalizedLicense: license,
      reason: "Asset rights are ambiguous or reserved.",
    };
  }

  if (/(^|\s)NC(\s|$)|NONCOMMERCIAL|NON COMMERCIAL/.test(license)) {
    return {
      allowed: false,
      code: "noncommercial_license",
      normalizedLicense: license,
      reason: "Non-commercial licenses are not publication-safe for commercial distribution.",
    };
  }

  if (/(^|\s)ND(\s|$)|NO DERIVATIVES|NODERIVATIVES/.test(license)) {
    return {
      allowed: false,
      code: "no_derivatives_license",
      normalizedLicense: license,
      reason: "No-derivatives licenses are rejected because production may resize, crop, or otherwise transform assets.",
    };
  }

  const publicDomain = /PUBLIC DOMAIN|PUBLIC DOMAIN MARK|\bPDM\b/.test(license);
  const cc0 = /\bCC\s*0\b|CREATIVE COMMONS ZERO/.test(license);
  const ccBySa = /\bCC\s+BY\s+SA\b|CREATIVE COMMONS ATTRIBUTION SHAREALIKE/.test(license);
  const ccBy = /\bCC\s+BY\b|CREATIVE COMMONS ATTRIBUTION/.test(license);

  if (publicDomain || cc0 || ccBySa || ccBy) {
    return {
      allowed: true,
      code: "rights_ok",
      normalizedLicense: license,
      reason: "Asset has explicit provenance, attribution, and a publication-safe license class.",
    };
  }

  return {
    allowed: false,
    code: "unsupported_license",
    normalizedLicense: license,
    reason: `License '${input.license}' is not in ScrollLibrary's publication-safe allowlist.`,
  };
}
