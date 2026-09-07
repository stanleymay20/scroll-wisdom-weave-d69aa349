import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  badRequest,
  corsHeaders,
  forbidden,
  json,
  preflight,
  requireUser,
  serverError,
  serviceClient,
} from "../_shared/http.ts";
import {
  MAX_SCORM_ARCHIVE_BYTES,
  mimeForPath,
  parseScormManifest,
  sha256Hex,
  unpackScormArchive,
} from "../_shared/university-scorm.ts";

const BUCKET = "university-scorm";

function stringField(form: FormData, name: string, required = true): string | null {
  const value = form.get(name);
  if (typeof value !== "string") {
    if (required) throw new Error(`${name} is required.`);
    return null;
  }
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${name} is required.`);
  return trimmed || null;
}

async function canManageCourse(sc: ReturnType<typeof serviceClient>, userId: string, organizationId: string, courseId: string) {
  const [{ data: orgMember, error: orgError }, { data: person, error: personError }, { data: offeringRows, error: offeringError }] = await Promise.all([
    sc.from("organization_members").select("role").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    sc.from("university_people").select("university_role,status").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    sc.from("university_course_offerings").select("id").eq("organization_id", organizationId).eq("course_id", courseId),
  ]);
  if (orgError) throw orgError;
  if (personError) throw personError;
  if (offeringError) throw offeringError;
  if (orgMember && ["owner", "admin"].includes(orgMember.role)) return true;
  if (person?.status === "active" && ["chancellor", "registrar", "dean", "programme_lead"].includes(person.university_role)) return true;

  const offeringIds = (offeringRows || []).map((row) => row.id);
  if (offeringIds.length === 0) return false;
  const { data: teaching, error: teachingError } = await sc
    .from("university_teaching_assignments")
    .select("id")
    .in("offering_id", offeringIds)
    .eq("user_id", userId)
    .in("teaching_role", ["lead_lecturer", "lecturer"])
    .limit(1);
  if (teachingError) throw teachingError;
  return Boolean(teaching?.length);
}

async function ensurePrivateBucket(sc: ReturnType<typeof serviceClient>) {
  const { data, error } = await sc.storage.getBucket(BUCKET);
  if (!error && data) {
    if (data.public) throw new Error("SCORM storage bucket must remain private.");
    return;
  }
  const { error: createError } = await sc.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_SCORM_ARCHIVE_BYTES,
  });
  if (createError && !createError.message.toLowerCase().includes("already exists")) throw createError;
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return badRequest("SCORM import requires multipart/form-data.");
  }
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_SCORM_ARCHIVE_BYTES + 2 * 1024 * 1024) {
    return badRequest("SCORM upload exceeds the server import limit.");
  }

  const sc = serviceClient();
  let packageId: string | null = null;
  let uploadedPaths: string[] = [];

  try {
    const form = await req.formData();
    const organizationId = stringField(form, "organization_id")!;
    const courseId = stringField(form, "course_id")!;
    const moduleId = stringField(form, "module_id", false);
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("A SCORM ZIP file is required.");
    if (file.size <= 0 || file.size > MAX_SCORM_ARCHIVE_BYTES) return badRequest("SCORM ZIP size is outside the permitted range.");
    if (!file.name.toLowerCase().endsWith(".zip")) return badRequest("SCORM package must be uploaded as a .zip archive.");

    const { data: course, error: courseError } = await sc
      .from("university_courses")
      .select("id,organization_id")
      .eq("id", courseId)
      .maybeSingle();
    if (courseError) throw courseError;
    if (!course || course.organization_id !== organizationId) return badRequest("Course does not belong to the selected institution.");

    if (!(await canManageCourse(sc, auth.userId, organizationId, courseId))) {
      return forbidden("Only trusted course managers can import executable SCORM content.");
    }

    if (moduleId) {
      const { data: module, error: moduleError } = await sc
        .from("university_modules")
        .select("id,organization_id,course_id")
        .eq("id", moduleId)
        .maybeSingle();
      if (moduleError) throw moduleError;
      if (!module || module.organization_id !== organizationId || module.course_id !== courseId) {
        return badRequest("Module does not belong to the selected course.");
      }
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentHash = await sha256Hex(bytes);
    const { data: existing, error: existingError } = await sc
      .from("university_scorm_packages")
      .select("id,status,title,scorm_version")
      .eq("course_id", courseId)
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "ready") {
      return json({ package: existing, duplicate: true });
    }

    const files = await unpackScormArchive(bytes);
    const manifestBytes = files.get("imsmanifest.xml");
    if (!manifestBytes) throw new Error("SCORM manifest was not extracted.");
    const manifestXml = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes);
    const parsed = parseScormManifest(manifestXml);
    if (!files.has(parsed.entrypoint)) {
      throw new Error(`SCORM launch resource is missing from the archive: ${parsed.entrypoint}`);
    }
    for (const item of parsed.items) {
      if (item.launchPath && !files.has(item.launchPath)) {
        throw new Error(`SCORM item launch resource is missing from the archive: ${item.launchPath}`);
      }
    }

    packageId = crypto.randomUUID();
    const storagePrefix = `${organizationId}/${packageId}`;
    const { error: packageError } = await sc.from("university_scorm_packages").insert({
      id: packageId,
      organization_id: organizationId,
      course_id: courseId,
      module_id: moduleId,
      title: parsed.title,
      scorm_version: parsed.version,
      manifest_identifier: parsed.identifier,
      entrypoint: parsed.entrypoint,
      storage_prefix: storagePrefix,
      content_hash: contentHash,
      manifest: {
        source_filename: file.name,
        item_count: parsed.items.length,
        compressed_bytes: bytes.byteLength,
      },
      status: "processing",
      imported_by: auth.userId,
    });
    if (packageError) throw packageError;

    await ensurePrivateBucket(sc);
    for (const [path, body] of files) {
      const objectPath = `${storagePrefix}/${path}`;
      const { error: uploadError } = await sc.storage.from(BUCKET).upload(objectPath, body, {
        contentType: mimeForPath(path),
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadedPaths.push(objectPath);
    }

    const itemRows = parsed.items.map((item) => ({
      organization_id: organizationId,
      package_id: packageId,
      identifier: item.identifier,
      parent_identifier: item.parentIdentifier,
      title: item.title,
      launch_path: item.launchPath,
      parameters: item.parameters,
      sequence: item.sequence,
      visible: item.visible,
      metadata: item.metadata,
    }));
    const { error: itemError } = await sc.from("university_scorm_items").insert(itemRows);
    if (itemError) throw itemError;

    const { data: readyPackage, error: readyError } = await sc
      .from("university_scorm_packages")
      .update({ status: "ready", error_message: null })
      .eq("id", packageId)
      .select("id,title,scorm_version,status,course_id,module_id,imported_at")
      .single();
    if (readyError) throw readyError;

    return json({ package: readyPackage, duplicate: false, item_count: parsed.items.length }, 201, {
      "Cache-Control": "no-store",
      ...corsHeaders,
    });
  } catch (error) {
    if (uploadedPaths.length) {
      await sc.storage.from(BUCKET).remove(uploadedPaths).catch(() => undefined);
      uploadedPaths = [];
    }
    if (packageId) {
      await sc.from("university_scorm_packages").update({
        status: "error",
        error_message: error instanceof Error ? error.message.slice(0, 1000) : "SCORM import failed",
      }).eq("id", packageId);
    }
    return serverError(error, "scorm_import_failed");
  }
});
