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

type PersonInput = z.infer<typeof Person>;

type ProvisionResult = {
  email: string;
  ok: boolean;
  user_id?: string;
  invited?: boolean;
  error?: string;
};

type ResolvedPerson = {
  index: number;
  email: string;
  user_id: string;
  invited: boolean;
  person: PersonInput;
};

type ResolvedAuthUserRow = {
  email: string;
  user_id: string;
};

type ProvisionBatchRow = {
  user_id: string;
  ok: boolean;
  error_message: string | null;
};

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

    const requestedEmails = Array.from(
      new Set(parsed.people.map((person) => person.email.trim().toLowerCase())),
    );
    const { data: existingUsers, error: existingUsersError } = await sc.rpc(
      "resolve_university_auth_users",
      { _emails: requestedEmails },
    );
    if (existingUsersError) throw existingUsersError;

    const existingUserRows = (Array.isArray(existingUsers) ? existingUsers : []) as ResolvedAuthUserRow[];
    const usersByEmail = new Map<string, string>(
      existingUserRows.map((row) => [String(row.email).toLowerCase(), String(row.user_id)]),
    );
    const seen = new Set<string>();
    const resultSlots: Array<ProvisionResult | null> = Array(parsed.people.length).fill(null);
    const resolved: ResolvedPerson[] = [];

    for (const [index, person] of parsed.people.entries()) {
      const email = person.email.trim().toLowerCase();
      if (seen.has(email)) {
        resultSlots[index] = { email, ok: false, error: "Duplicate email in request" };
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

        resolved.push({ index, email, user_id: userId, invited, person });
      } catch (error) {
        resultSlots[index] = {
          email,
          ok: false,
          error: error instanceof Error ? error.message : "Invitation failed",
        };
      }
    }

    if (resolved.length > 0) {
      const rosterPayload = resolved.map((entry) => ({
        user_id: entry.user_id,
        university_role: entry.person.role,
        display_name: entry.person.display_name,
        student_number: entry.person.student_number ?? null,
        staff_number: entry.person.staff_number ?? null,
        initial_status: entry.invited ? "invited" : "active",
      }));

      const { data: provisionRows, error: provisionError } = await sc.rpc(
        "provision_university_roster_batch",
        {
          _organization_id: parsed.organization_id,
          _actor_id: auth.userId,
          _people: rosterPayload,
        },
      );

      if (provisionError) {
        for (const entry of resolved) {
          resultSlots[entry.index] = {
            email: entry.email,
            ok: false,
            user_id: entry.user_id,
            invited: entry.invited,
            error: provisionError.message,
          };
        }
      } else {
        const batchRows = (Array.isArray(provisionRows) ? provisionRows : []) as ProvisionBatchRow[];
        const provisionByUser = new Map<string, ProvisionBatchRow>(
          batchRows.map((row) => [String(row.user_id), row]),
        );
        for (const entry of resolved) {
          const row = provisionByUser.get(entry.user_id);
          resultSlots[entry.index] = {
            email: entry.email,
            ok: Boolean(row?.ok),
            user_id: entry.user_id,
            invited: entry.invited,
            error: row?.ok ? undefined : (row?.error_message || "Provisioning failed"),
          };
        }
      }
    }

    const results = resultSlots.filter((result): result is ProvisionResult => result !== null);
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
