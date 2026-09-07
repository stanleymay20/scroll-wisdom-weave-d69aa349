import { unzip } from "https://esm.sh/fflate@0.8.3?target=deno";
import { XMLParser, XMLValidator } from "https://esm.sh/fast-xml-parser@5.11.1?target=deno";

export const MAX_SCORM_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const MAX_SCORM_EXPANDED_BYTES = 500 * 1024 * 1024;
export const MAX_SCORM_FILES = 5_000;
export const MAX_SCORM_MANIFEST_BYTES = 5 * 1024 * 1024;

export type ScormVersion = "scorm_1_2" | "scorm_2004";

export interface ParsedScormItem {
  identifier: string;
  parentIdentifier: string | null;
  title: string;
  launchPath: string | null;
  parameters: string | null;
  sequence: number;
  visible: boolean;
  metadata: Record<string, unknown>;
}

export interface ParsedScormManifest {
  identifier: string | null;
  title: string;
  version: ScormVersion;
  entrypoint: string;
  items: ParsedScormItem[];
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  const object = asObject(value);
  for (const key of ["#text", "__text"]) {
    if (typeof object[key] === "string" || typeof object[key] === "number") {
      return String(object[key]).trim();
    }
  }
  return "";
}

export function normalizeScormPath(raw: string): string {
  const decoded = raw.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!decoded || decoded.includes("\0")) throw new Error("SCORM package contains an invalid empty or NUL path.");
  if (/^[A-Za-z]:\//.test(decoded)) throw new Error("SCORM package contains an absolute drive path.");

  const parts = decoded.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`SCORM package contains an unsafe path: ${raw}`);
  }
  return parts.join("/");
}

function unzipAsync(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, data) => error ? reject(error) : resolve(data));
  });
}

export async function unpackScormArchive(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (bytes.byteLength === 0) throw new Error("SCORM archive is empty.");
  if (bytes.byteLength > MAX_SCORM_ARCHIVE_BYTES) {
    throw new Error(`SCORM archive exceeds the ${MAX_SCORM_ARCHIVE_BYTES / 1024 / 1024} MB compressed limit.`);
  }

  const archive = await unzipAsync(bytes);
  const entries = Object.entries(archive);
  if (entries.length === 0) throw new Error("SCORM archive contains no files.");
  if (entries.length > MAX_SCORM_FILES) throw new Error(`SCORM archive exceeds the ${MAX_SCORM_FILES} file limit.`);

  const files = new Map<string, Uint8Array>();
  let expandedBytes = 0;
  for (const [rawPath, body] of entries) {
    if (rawPath.endsWith("/")) continue;
    const safePath = normalizeScormPath(rawPath);
    expandedBytes += body.byteLength;
    if (expandedBytes > MAX_SCORM_EXPANDED_BYTES) {
      throw new Error(`SCORM archive exceeds the ${MAX_SCORM_EXPANDED_BYTES / 1024 / 1024} MB expanded limit.`);
    }
    if (files.has(safePath)) throw new Error(`SCORM archive contains a duplicate normalized path: ${safePath}`);
    files.set(safePath, body);
  }

  if (!files.has("imsmanifest.xml")) {
    throw new Error("SCORM package must contain imsmanifest.xml at the archive root.");
  }
  return files;
}

function detectVersion(manifest: Record<string, unknown>, rawXml: string): ScormVersion {
  const metadata = asObject(manifest.metadata);
  const schemaVersion = text(metadata.schemaversion).toLowerCase();
  const schema = text(metadata.schema).toLowerCase();
  const lowerXml = rawXml.toLowerCase();

  if (schemaVersion.includes("2004") || schemaVersion.includes("1.3") || lowerXml.includes("adlcp_v1p3")) {
    return "scorm_2004";
  }
  if (schemaVersion.includes("1.2") || schema.includes("scorm") || lowerXml.includes("adlcp_rootv1p2")) {
    return "scorm_1_2";
  }
  throw new Error("Manifest does not declare a supported SCORM 1.2 or SCORM 2004 version.");
}

function resourceMap(manifest: Record<string, unknown>): Map<string, { href: string | null; metadata: Record<string, unknown> }> {
  const resourcesNode = asObject(manifest.resources);
  const map = new Map<string, { href: string | null; metadata: Record<string, unknown> }>();
  for (const raw of asArray(resourcesNode.resource as unknown)) {
    const resource = asObject(raw);
    const identifier = text(resource["@_identifier"]);
    if (!identifier) continue;
    const hrefRaw = text(resource["@_href"]);
    map.set(identifier, {
      href: hrefRaw ? normalizeScormPath(hrefRaw.split(/[?#]/, 1)[0]) : null,
      metadata: {
        type: text(resource["@_type"]),
        scormType: text(resource["@_adlcp:scormtype"] || resource["@_adlcp:scormType"]),
      },
    });
  }
  return map;
}

export function parseScormManifest(xml: string): ParsedScormManifest {
  if (!xml.trim()) throw new Error("SCORM manifest is empty.");
  if (new TextEncoder().encode(xml).byteLength > MAX_SCORM_MANIFEST_BYTES) {
    throw new Error(`SCORM manifest exceeds ${MAX_SCORM_MANIFEST_BYTES / 1024 / 1024} MB.`);
  }
  // SCORM manifests do not need custom DTD entities. Rejecting DOCTYPE closes
  // entity-expansion/XXE classes before parsing untrusted package metadata.
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    throw new Error("SCORM manifests containing DOCTYPE or ENTITY declarations are not accepted.");
  }
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error("SCORM imsmanifest.xml is not well-formed XML.");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    processEntities: false,
    parseTagValue: false,
    parseAttributeValue: false,
    allowBooleanAttributes: true,
  });
  const parsed = asObject(parser.parse(xml));
  const manifest = asObject(parsed.manifest);
  if (Object.keys(manifest).length === 0) throw new Error("SCORM manifest root element is missing.");

  const version = detectVersion(manifest, xml);
  const resources = resourceMap(manifest);
  const organizations = asObject(manifest.organizations);
  const organizationList = asArray(organizations.organization as unknown).map(asObject);
  if (organizationList.length === 0) throw new Error("SCORM manifest contains no organization.");

  const defaultId = text(organizations["@_default"]);
  const activeOrganization = organizationList.find((org) => text(org["@_identifier"]) === defaultId) || organizationList[0];
  const packageTitle = text(activeOrganization.title) || "Imported SCORM package";

  const items: ParsedScormItem[] = [];
  let sequence = 0;
  const walk = (rawItems: unknown, parentIdentifier: string | null) => {
    for (const rawItem of asArray(rawItems as unknown)) {
      const item = asObject(rawItem);
      const identifier = text(item["@_identifier"]);
      if (!identifier) throw new Error("SCORM item is missing its identifier.");
      const identifierRef = text(item["@_identifierref"]);
      const resource = identifierRef ? resources.get(identifierRef) : undefined;
      const parameters = text(item["@_parameters"]);
      const visibleRaw = text(item["@_isvisible"] || item["@_isVisible"]).toLowerCase();
      sequence += 1;
      items.push({
        identifier,
        parentIdentifier,
        title: text(item.title) || identifier,
        launchPath: resource?.href || null,
        parameters: parameters || null,
        sequence,
        visible: visibleRaw !== "false",
        metadata: { identifierRef: identifierRef || null, resource: resource?.metadata || {} },
      });
      walk(item.item, identifier);
    }
  };
  walk(activeOrganization.item, null);

  if (items.length === 0) throw new Error("SCORM manifest contains no launchable organization items.");
  const launchable = items.find((item) => item.visible && item.launchPath) || items.find((item) => item.launchPath);
  if (!launchable?.launchPath) throw new Error("SCORM manifest contains no launchable SCO resource.");

  return {
    identifier: text(manifest["@_identifier"]) || null,
    title: packageTitle,
    version,
    entrypoint: launchable.launchPath,
    items,
  };
}

export async function sha256Hex(value: Uint8Array | string): Promise<string> {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomRuntimeToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  return ({
    html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
    js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", json: "application/json",
    xml: "application/xml; charset=utf-8", txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
    svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm",
    pdf: "application/pdf", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  } as Record<string, string>)[ext || ""] || "application/octet-stream";
}

export function safeRelativeAssetPath(baseFile: string, requested: string): string {
  const baseParts = normalizeScormPath(baseFile).split("/");
  baseParts.pop();
  const raw = requested.replaceAll("\\", "/");
  if (raw.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) {
    throw new Error("SCORM asset path must be relative to the package.");
  }
  const parts = [...baseParts];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) throw new Error("SCORM asset path escapes the package root.");
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return normalizeScormPath(parts.join("/"));
}
