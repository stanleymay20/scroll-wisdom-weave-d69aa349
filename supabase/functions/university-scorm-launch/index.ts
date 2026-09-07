import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  badRequest,
  forbidden,
  json,
  preflight,
  requireUser,
  serverError,
  serviceClient,
  validateBody,
  z,
} from "../_shared/http.ts";
import { randomRuntimeToken, sha256Hex } from "../_shared/university-scorm.ts";

const Body = z.object({
  package_id: z.string().uuid(),
  item_id: z.string().uuid().optional(),
  offering_id: z.string().uuid().optional(),
  mode: z.enum(["learner", "preview"]).default("learner"),
});

async function canManageCourse(sc: ReturnType<typeof serviceClient>, userId: string, organizationId: string, courseId: string) {
  const [{ data: orgMember, error: orgError }, { data: person, error: personError }, { data: offerings, error: offeringsError }] = await Promise.all([
    sc.from("organization_members").select("role").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    sc.from("university_people").select("university_role,status").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    sc.from("university_course_offerings").select("id").eq("organization_id", organizationId).eq("course_id", courseId),
  ]);
  if (orgError) throw orgError;
  if (personError) throw personError;
  if (offeringsError) throw offeringsError;
  if (orgMember && ["owner", "admin"].includes(orgMember.role)) return true;
  if (person?.status === "active" && ["chancellor", "registrar", "dean", "programme_lead"].includes(person.university_role)) return true;
  const offeringIds = (offerings || []).map((row) => row.id);
  if (!offeringIds.length) return false;
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

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;
  const sc = serviceClient();

  try {
    const { data: pkg, error: packageError } = await sc
      .from("university_scorm_packages")
      .select("id,organization_id,course_id,title,scorm_version,status")
      .eq("id", parsed.package_id)
      .maybeSingle();
    if (packageError) throw packageError;
    if (!pkg || pkg.status !== "ready") return badRequest("SCORM package is not available for launch.");

    let itemQuery = sc
      .from("university_scorm_items")
      .select("id,package_id,title,launch_path,parameters,sequence,visible")
      .eq("package_id", pkg.id)
      .not("launch_path", "is", null);
    if (parsed.item_id) itemQuery = itemQuery.eq("id", parsed.item_id);
    else itemQuery = itemQuery.eq("visible", true).order("sequence", { ascending: true }).limit(1);
    const { data: items, error: itemError } = await itemQuery;
    if (itemError) throw itemError;
    const item = items?.[0];
    if (!item?.launch_path) return badRequest("SCORM package has no launchable item matching the request.");

    let offeringId: string | null = null;
    let enrolmentId: string | null = null;
    if (parsed.mode === "preview") {
      if (!(await canManageCourse(sc, auth.userId, pkg.organization_id, pkg.course_id))) {
        return forbidden("Course-manager permission is required for SCORM preview.");
      }
    } else {
      if (!parsed.offering_id) return badRequest("offering_id is required for learner SCORM launches.");
      const { data: offering, error: offeringError } = await sc
        .from("university_course_offerings")
        .select("id,organization_id,course_id")
        .eq("id", parsed.offering_id)
        .maybeSingle();
      if (offeringError) throw offeringError;
      if (!offering || offering.organization_id !== pkg.organization_id || offering.course_id !== pkg.course_id) {
        return badRequest("Offering does not match the SCORM package course.");
      }
      const { data: enrolment, error: enrolmentError } = await sc
        .from("university_enrolments")
        .select("id,status")
        .eq("offering_id", offering.id)
        .eq("user_id", auth.userId)
        .in("status", ["enrolled", "completed"])
        .maybeSingle();
      if (enrolmentError) throw enrolmentError;
      if (!enrolment) return forbidden("An enrolled course membership is required for this SCORM launch.");
      offeringId = offering.id;
      enrolmentId = enrolment.id;
    }

    const { data: previousAttempts, error: previousError } = await sc
      .from("university_scorm_attempts")
      .select("id,attempt_number,completion_status,success_status")
      .eq("item_id", item.id)
      .eq("user_id", auth.userId)
      .order("attempt_number", { ascending: false })
      .limit(1);
    if (previousError) throw previousError;
    const previous = previousAttempts?.[0];
    const resumable = previous
      && ["not_attempted", "incomplete", "browsed", "unknown"].includes(previous.completion_status)
      && previous.success_status === "unknown";

    let attemptId: string;
    let attemptNumber: number;
    if (resumable && parsed.mode === "learner") {
      attemptId = previous.id;
      attemptNumber = previous.attempt_number;
    } else {
      attemptNumber = (previous?.attempt_number || 0) + 1;
      attemptId = crypto.randomUUID();
      const { error: attemptError } = await sc.from("university_scorm_attempts").insert({
        id: attemptId,
        organization_id: pkg.organization_id,
        package_id: pkg.id,
        item_id: item.id,
        course_id: pkg.course_id,
        offering_id: offeringId,
        enrolment_id: enrolmentId,
        user_id: auth.userId,
        launch_mode: parsed.mode,
        attempt_number: attemptNumber,
        completion_status: "not_attempted",
        success_status: "unknown",
      });
      if (attemptError) throw attemptError;
    }

    await sc.from("university_scorm_runtime_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("attempt_id", attemptId)
      .is("revoked_at", null);

    const token = randomRuntimeToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    const { error: sessionError } = await sc.from("university_scorm_runtime_sessions").insert({
      attempt_id: attemptId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (sessionError) throw sessionError;

    const baseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
    if (!baseUrl) throw new Error("SUPABASE_URL is not configured.");
    const runtimeUrl = `${baseUrl}/functions/v1/university-scorm-runtime/session/${encodeURIComponent(token)}/`;

    return json({
      runtime_url: runtimeUrl,
      expires_at: expiresAt,
      attempt: { id: attemptId, number: attemptNumber, mode: parsed.mode },
      package: { id: pkg.id, title: pkg.title, version: pkg.scorm_version },
      item: { id: item.id, title: item.title },
    }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return serverError(error, "scorm_launch_failed");
  }
});
