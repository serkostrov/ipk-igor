import { FunctionsHttpError } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import type { EntityRecord } from "../model/types";
import { normalizeEntityRecord } from "../lib/parse-entity-config";
import {
  SYSTEM_USERS_ENTITY_ID,
  SYSTEM_USERS_FIELD_EMAIL_ID,
  SYSTEM_USERS_FIELD_NAME_ID,
  SYSTEM_USERS_FIELD_PHONE_ID,
  SYSTEM_USERS_FIELD_ROLE_ID,
} from "../model/system-entities";

export type InviteUserInput = {
  values: Record<string, string>;
  password: string;
};

type InviteUserResponse = {
  id: string;
  entity_id: string;
  field_values: unknown;
  auth_user_id: string | null;
  created_by?: string | null;
  error?: string;
};

function parseFieldValues(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const values: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") values[key] = item;
    else if (item != null) values[key] = String(item);
  }
  return values;
}

function toRecord(data: InviteUserResponse): EntityRecord {
  return normalizeEntityRecord({
    id: data.id,
    values: parseFieldValues(data.field_values),
    authUserId: data.auth_user_id,
    createdBy:
      typeof data.created_by === "string" && data.created_by.trim().length > 0
        ? data.created_by.trim()
        : null,
    schemaVersion: 1,
  });
}

async function readFunctionsError(error: unknown): Promise<string | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  try {
    const body = await error.context.json();
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      if (typeof record.error === "string" && record.error.trim()) {
        return record.error.trim();
      }
      if (typeof record.msg === "string" && record.msg.trim()) {
        if (/entrypoint|InvalidWorkerCreation/i.test(record.msg)) {
          return "Функция invite-user на сервере не запущена. Примените миграцию app_invite_user.";
        }
        return record.msg.trim();
      }
      if (typeof record.message === "string" && record.message.trim()) {
        return record.message.trim();
      }
    }
  } catch {
    // ignore parse failures
  }
  return null;
}

/** Creates auth.users + Users entity record via RPC (preferred) or edge function. */
export async function inviteSystemUser(
  input: InviteUserInput,
): Promise<EntityRecord> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase не настроен");
  }

  const name = (input.values[SYSTEM_USERS_FIELD_NAME_ID] ?? "").trim();
  const email = (input.values[SYSTEM_USERS_FIELD_EMAIL_ID] ?? "")
    .trim()
    .toLowerCase();
  const phone = (input.values[SYSTEM_USERS_FIELD_PHONE_ID] ?? "").trim();
  const roleId = (input.values[SYSTEM_USERS_FIELD_ROLE_ID] ?? "").trim();

  // Prefer DB RPC — works without Edge Runtime deploy.
  const rpc = await supabase.rpc("app_invite_user", {
    p_name: name,
    p_email: email,
    p_password: input.password,
    p_phone: phone || null,
    p_role_id: roleId || null,
    p_values: input.values,
  });

  if (!rpc.error) {
    const data = rpc.data as InviteUserResponse | null;
    if (!data?.id) {
      throw new Error("Не удалось создать пользователя");
    }
    return toRecord(data);
  }

  // Fallback for envs that still only have the edge function.
  if (!/could not find the function|PGRST202/i.test(rpc.error.message)) {
    throw new Error(rpc.error.message || "Не удалось создать пользователя");
  }

  const { data, error } = await supabase.functions.invoke<InviteUserResponse>(
    "invite-user",
    {
      body: {
        name,
        email,
        phone,
        roleId: roleId || undefined,
        password: input.password,
        values: input.values,
      },
    },
  );

  if (error) {
    const detailed = await readFunctionsError(error);
    throw new Error(
      detailed ||
        error.message ||
        "Не удалось создать пользователя. Примените миграцию app_invite_user.",
    );
  }
  if (!data || data.error) {
    throw new Error(data?.error || "Не удалось создать пользователя");
  }

  return toRecord(data);
}

export function isUsersEntityId(entityId: string) {
  return entityId === SYSTEM_USERS_ENTITY_ID;
}
