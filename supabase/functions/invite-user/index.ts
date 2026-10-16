import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SYSTEM_USERS_ENTITY_ID = "entity-system-users";
const SYSTEM_USERS_FIELD_NAME_ID = "field-system-users-name";
const SYSTEM_USERS_FIELD_EMAIL_ID = "field-system-users-email";
const SYSTEM_USERS_FIELD_PHONE_ID = "field-system-users-phone";
const SYSTEM_USERS_FIELD_ROLE_ID = "field-system-users-role";
const DEFAULT_ROLE_ID = "role-system-employee";

type InviteBody = {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  roleId?: string;
  values?: Record<string, string>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: canInvite, error: canInviteError } = await callerClient.rpc(
      "app_can_invite_users",
    );
    if (canInviteError) {
      return jsonResponse(
        { error: canInviteError.message ?? "Не удалось проверить права" },
        403,
      );
    }
    if (canInvite !== true) {
      return jsonResponse(
        { error: "Недостаточно прав для приглашения пользователей" },
        403,
      );
    }

    const body = (await req.json()) as InviteBody;
    const values = body.values ?? {};
    const name = (body.name ?? values[SYSTEM_USERS_FIELD_NAME_ID] ?? "").trim();
    const email = (body.email ?? values[SYSTEM_USERS_FIELD_EMAIL_ID] ?? "")
      .trim()
      .toLowerCase();
    const phone = (
      body.phone ??
      values[SYSTEM_USERS_FIELD_PHONE_ID] ??
      ""
    ).trim();
    const password = typeof body.password === "string" ? body.password : "";
    const roleId =
      (
        body.roleId ??
        values[SYSTEM_USERS_FIELD_ROLE_ID] ??
        DEFAULT_ROLE_ID
      ).trim() || DEFAULT_ROLE_ID;

    if (!name) return jsonResponse({ error: "Укажите ФИО" }, 400);
    if (!email) return jsonResponse({ error: "Укажите email" }, 400);
    if (password.length < 6) {
      return jsonResponse(
        { error: "Пароль должен быть не короче 6 символов" },
        400,
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: createdAuth, error: createAuthError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });

    if (createAuthError || !createdAuth.user) {
      return jsonResponse(
        { error: createAuthError?.message ?? "Не удалось создать аккаунт" },
        400,
      );
    }

    const fieldValues: Record<string, string> = {
      ...values,
      [SYSTEM_USERS_FIELD_NAME_ID]: name,
      [SYSTEM_USERS_FIELD_EMAIL_ID]: email,
      [SYSTEM_USERS_FIELD_PHONE_ID]: phone,
      [SYSTEM_USERS_FIELD_ROLE_ID]: roleId,
    };

    const recordId = `record-${crypto.randomUUID()}`;
    const { data: recordRow, error: recordError } = await admin
      .from("entity_records")
      .insert({
        id: recordId,
        entity_id: SYSTEM_USERS_ENTITY_ID,
        field_values: fieldValues,
        auth_user_id: createdAuth.user.id,
        created_by: caller.id,
        updated_at: new Date().toISOString(),
      })
      .select("id, entity_id, field_values, auth_user_id, created_by")
      .single();

    if (recordError) {
      await admin.auth.admin.deleteUser(createdAuth.user.id);
      return jsonResponse(
        { error: recordError.message ?? "Не удалось создать запись" },
        400,
      );
    }

    return jsonResponse({
      id: recordRow.id,
      entity_id: recordRow.entity_id,
      field_values: recordRow.field_values,
      auth_user_id: recordRow.auth_user_id,
      created_by: recordRow.created_by,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
