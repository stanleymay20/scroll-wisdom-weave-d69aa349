import { createClient } from "@supabase/supabase-js";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const supabaseUrl = required("E2E_SUPABASE_URL");
const serviceRoleKey = required("E2E_SUPABASE_SERVICE_ROLE_KEY");
const userOneEmail = required("E2E_USER_ONE_EMAIL");
const userOnePassword = required("E2E_USER_ONE_PASSWORD");
const userTwoEmail = required("E2E_USER_TWO_EMAIL");
const userTwoPassword = required("E2E_USER_TWO_PASSWORD");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function createConfirmedUser(email, password, fullName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, accepted_terms: true },
  });

  if (error) throw error;
  if (!data.user?.id) throw new Error(`Supabase did not return an id for ${email}`);
  return data.user.id;
}

const userOneId = await createConfirmedUser(userOneEmail, userOnePassword, "GA E2E One");
const userTwoId = await createConfirmedUser(userTwoEmail, userTwoPassword, "GA E2E Two");
const month = new Date().toISOString().slice(0, 7);

const { error: usageError } = await admin.from("interactive_voice_usage").upsert([
  { user_id: userOneId, month, seconds_used: 11 },
  { user_id: userTwoId, month, seconds_used: 22 },
]);
if (usageError) throw usageError;

const { data: rows, error: readError } = await admin
  .from("interactive_voice_usage")
  .select("user_id,month,seconds_used")
  .order("seconds_used");
if (readError) throw readError;
if (!rows || rows.length !== 2) {
  throw new Error(`Expected exactly two seeded voice rows, got ${rows?.length ?? 0}`);
}

console.log(`Seeded isolated GA E2E users for ${month}.`);
