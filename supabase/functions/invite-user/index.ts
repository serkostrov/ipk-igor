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

    // Prefer DB RPC — upserts auth + Users profile in one place.
    const { data: rpcData, error: rpcError } = await callerClient.rpc(
      "app_invite_user",
      {
        p_name: name,
        p_email: email,
        p_password: password,
        p_phone: phone || null,
        p_role_id: roleId,
        p_values: {
          ...values,
          [SYSTEM_USERS_FIELD_NAME_ID]: name,
          [SYSTEM_USERS_FIELD_EMAIL_ID]: email,
          [SYSTEM_USERS_FIELD_PHONE_ID]: phone,
          [SYSTEM_USERS_FIELD_ROLE_ID]: roleId,
        },
      },
    );
    if (!rpcError && rpcData?.id) {
      return jsonResponse(rpcData);
    }
    if (
      rpcError &&
      !/could not find the function|PGRST202/i.test(rpcError.message)
    ) {
      return jsonResponse(
        { error: rpcError.message ?? "Не удалось создать пользователя" },
        400,
      );
    }

    // Fallback when RPC is not deployed yet: admin upsert + profile ensure.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: listed, error: listError } = await admin.auth.admin.listUsers(
      {
        page: 1,
        perPage: 1000,
      },
    );
    if (listError) {
      return jsonResponse(
        { error: listError.message ?? "Не удалось проверить аккаунты" },
        400,
      );
    }

    const existingAuth = (listed.users ?? []).find(
      (user) => (user.email ?? "").trim().toLowerCase() === email,
    );

    let authUserId = existingAuth?.id ?? null;
    if (authUserId) {
      const { error: updateError } = await admin.auth.admin.updateUserById(
        authUserId,
        {
          password,
          email_confirm: true,
          user_metadata: { full_name: name },
        },
      );
      if (updateError) {
        return jsonResponse(
          { error: updateError.message ?? "Не удалось обновить аккаунт" },
          400,
        );
      }
    } else {
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
      authUserId = createdAuth.user.id;
    }

    const fieldValues: Record<string, string> = {
      ...values,
      [SYSTEM_USERS_FIELD_NAME_ID]: name,
      [SYSTEM_USERS_FIELD_EMAIL_ID]: email,
      [SYSTEM_USERS_FIELD_PHONE_ID]: phone,
      [SYSTEM_USERS_FIELD_ROLE_ID]: roleId,
    };

    const { data: byAuth } = await admin
      .from("entity_records")
      .select("id, entity_id, field_values, auth_user_id, created_by")
      .eq("entity_id", SYSTEM_USERS_ENTITY_ID)
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    let recordRow = byAuth;
    if (!recordRow) {
      const { data: orphans } = await admin
        .from("entity_records")
        .select("id, entity_id, field_values, auth_user_id, created_by")
        .eq("entity_id", SYSTEM_USERS_ENTITY_ID)
        .is("auth_user_id", null)
        .filter(
          `field_values->>"${SYSTEM_USERS_FIELD_EMAIL_ID}"`,
          "ilike",
          email,
        )
        .limit(5);
      const orphan = (orphans ?? []).find((row) => {
        const fv = (row.field_values ?? {}) as Record<string, unknown>;
        return (
          String(fv[SYSTEM_USERS_FIELD_EMAIL_ID] ?? "")
            .trim()
            .toLowerCase() === email
        );
      });
      if (orphan) {
        const { data: claimed, error: claimError } = await admin
          .from("entity_records")
          .update({
            auth_user_id: authUserId,
            field_values: {
              ...((orphan.field_values ?? {}) as Record<string, string>),
              ...fieldValues,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", orphan.id)
          .select("id, entity_id, field_values, auth_user_id, created_by")
          .single();
        if (claimError) {
          return jsonResponse(
            { error: claimError.message ?? "Не удалось связать профиль" },
            400,
          );
        }
        recordRow = claimed;
      }
    } else {
      const { data: updated, error: updateProfileError } = await admin
        .from("entity_records")
        .update({
          field_values: {
            ...((byAuth.field_values ?? {}) as Record<string, string>),
            ...fieldValues,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", byAuth.id)
        .select("id, entity_id, field_values, auth_user_id, created_by")
        .single();
      if (updateProfileError) {
        return jsonResponse(
          {
            error: updateProfileError.message ?? "Не удалось обновить профиль",
          },
          400,
        );
      }
      recordRow = updated;
    }

    if (!recordRow) {
      const recordId = `record-${crypto.randomUUID()}`;
      const { data: inserted, error: recordError } = await admin
        .from("entity_records")
        .insert({
          id: recordId,
          entity_id: SYSTEM_USERS_ENTITY_ID,
          field_values: fieldValues,
          auth_user_id: authUserId,
          created_by: caller.id,
          updated_at: new Date().toISOString(),
        })
        .select("id, entity_id, field_values, auth_user_id, created_by")
        .single();
      if (recordError) {
        return jsonResponse(
          { error: recordError.message ?? "Не удалось создать запись" },
          400,
        );
      }
      recordRow = inserted;
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
