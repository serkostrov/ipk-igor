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

/** Creates auth.users + Users entity record via edge function. */
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
    throw new Error(error.message || "Не удалось создать пользователя");
  }
  if (!data || data.error) {
    throw new Error(data?.error || "Не удалось создать пользователя");
  }

  return normalizeEntityRecord({
    id: data.id,
    values: parseFieldValues(data.field_values),
    authUserId: data.auth_user_id,
    createdBy:
      typeof data.created_by === "string" && data.created_by.trim().length > 0
        ? data.created_by.trim()
        : null,
  });
}

export function isUsersEntityId(entityId: string) {
  return entityId === SYSTEM_USERS_ENTITY_ID;
}
