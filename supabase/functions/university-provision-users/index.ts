import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  preflight,
  json,
  badRequest,
  forbidden,
  serverError,
  requireUser,
  validateBody,
  z,
  serviceClient,
} from "../_shared/http.ts";

const UniversityRole = z.enum([
  "chancellor",
  "registrar",
  "dean",
  "programme_lead",
  "lecturer",
  "teaching_assistant",
  "advisor",
  "student",
  "auditor",
]);

const Person = z.object({
  email: z.string().email(),
  display_name: z.string().min(1).max(200),
  role: UniversityRole,
  student_number: z.string().max(100).optional(),
  staff_number: z.string().max(100).optional(),
});

const Body = z.object({
  organization_id: z.string().uuid(),
  people: z.array(Person).min(1).max(500),
});

type ProvisionResult = {
  email: string;
  ok: boolean;
  user_id?: string;
  invited?: boolean;
  error?: string;
};

async function loadUsersByEmail(sc: ReturnType<typeof serviceClient>) {
  const users = new Map<string, string>();
  let page = 1;
  const perPage = 1000;

  while (page <= 100) {
    const { data, error } = await sc.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email) users.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length < perPage) break;
    page += 1;
  }

  return users;
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
    const { data: membership, error: membershipError } = await sc
      .from("organization_members")
      .select("role")
      .eq("organization_id", parsed.organization_id)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return forbidden("Organization owner or admin required");
    }

    const usersByEmail = await loadUsersByEmail(sc);

    // Academic titles must never implicitly change organization-wide authority.
    // Preserve existing owner/admin/member roles and add new roster users only as
    // ordinary organization members. ScrollUniversity privileges are governed by
    // university_role and its dedicated RLS policies.
    const { data: existingMemberships, error: existingMembershipsError } = await sc
      .from("organization_members")
      .select("user_id,role")
      .eq("organization_id", parsed.organization_id);
    if (existingMembershipsError) throw existingMembershipsError;
    const membershipByUser = new Map(
      (existingMemberships || []).map((row) => [row.user_id as string, row.role as string]),
    );

    // Roster provisioning may update academic identity fields, but it must not
    // silently reactivate suspended/alumni/inactive records. Lifecycle state is
    // controlled separately by registrar/admin workflows.
    const { data: existingPeople, error: existingPeopleError } = await sc
      .from("university_people")
      .select("user_id,status")
      .eq("organization_id", parsed.organization_id);
    if (existingPeopleError) throw existingPeopleError;
    const peopleStatusByUser = new Map(
      (existingPeople || []).map((row) => [row.user_id as string, row.status as string]),
    );

    const seen = new Set<string>();
    const results: ProvisionResult[] = [];

    for (const person of parsed.people) {
      const email = person.email.trim().toLowerCase();
      if (seen.has(email)) {
        results.push({ email, ok: false, error: "Duplicate email in request" });
        continue;
      }
      seen.add(email);

      try {
        let userId = usersByEmail.get(email);
        let invited = false;

        if (!userId) {
          const { data: invite, error: inviteError } = await sc.auth.admin.inviteUserByEmail(email, {
            data: { full_name: person.display_name },
          });
          if (inviteError) throw inviteError;
          userId = invite.user?.id;
          if (!userId) throw new Error("Invitation did not return a user id");
          usersByEmail.set(email, userId);
          invited = true;
        }

        if (!membershipByUser.has(userId)) {
          const { error: orgError } = await sc
            .from("organization_members")
            .insert({
              organization_id: parsed.organization_id,
              user_id: userId,
              role: "member",
              invited_by: auth.userId,
            });
          if (orgError) throw orgError;
          membershipByUser.set(userId, "member");
        }

        if (peopleStatusByUser.has(userId)) {
          const { error: personError } = await sc
            .from("university_people")
            .update({
              university_role: person.role,
              display_name: person.display_name,
              student_number: person.student_number || null,
              staff_number: person.staff_number || null,
            })
            .eq("organization_id", parsed.organization_id)
            .eq("user_id", userId);
          if (personError) throw personError;
        } else {
          const initialStatus = invited ? "invited" : "active";
          const { error: personError } = await sc
            .from("university_people")
            .insert({
              organization_id: parsed.organization_id,
              user_id: userId,
              university_role: person.role,
              display_name: person.display_name,
              student_number: person.student_number || null,
              staff_number: person.staff_number || null,
              status: initialStatus,
            });
          if (personError) throw personError;
          peopleStatusByUser.set(userId, initialStatus);
        }

        results.push({ email, ok: true, user_id: userId, invited });
      } catch (error) {
        results.push({
          email,
          ok: false,
          error: error instanceof Error ? error.message : "Provisioning failed",
        });
      }
    }

    const succeeded = results.filter((result) => result.ok).length;
    const invited = results.filter((result) => result.ok && result.invited).length;
    const failed = results.length - succeeded;

    await sc.rpc("log_audit_event", {
      _event_type: "university.roster.provisioned",
      _actor_id: auth.userId,
      _organization_id: parsed.organization_id,
      _resource_type: "university_roster",
      _resource_id: parsed.organization_id,
      _severity: failed > 0 ? "warn" : "info",
      _metadata: {
        requested: parsed.people.length,
        succeeded,
        invited,
        failed,
      },
    });

    return json({ ok: failed === 0, succeeded, invited, failed, results });
  } catch (error) {
    return serverError(error);
  }
});
