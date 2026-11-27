import { readVisibleEntityRecords } from "@/entities/access";
import {
  SYSTEM_USERS_FIELD_NAME_ID,
  getSystemUsersEntity,
  type Entity,
} from "@/entities/entity";

export type MessengerUserOption = {
  authUserId: string;
  recordId: string;
  name: string;
};

/** Active CRM users available for starting / joining chats. */
export async function listMessengerUserOptions(
  entities: readonly Entity[],
  excludeAuthIds: ReadonlySet<string> = new Set(),
): Promise<MessengerUserOption[]> {
  const users = getSystemUsersEntity(entities);
  if (!users) return [];
  const options: MessengerUserOption[] = [];
  for (const record of await readVisibleEntityRecords(users)) {
    const authUserId = record.authUserId?.trim();
    if (!authUserId || excludeAuthIds.has(authUserId)) continue;
    const name =
      record.values[SYSTEM_USERS_FIELD_NAME_ID]?.trim() ||
      authUserId.slice(0, 8);
    options.push({ authUserId, recordId: record.id, name });
  }
  return options.sort((a, b) =>
    a.name.localeCompare(b.name, "ru", { sensitivity: "base" }),
  );
}

export function filterMessengerUserOptions(
  options: MessengerUserOption[],
  query: string,
): MessengerUserOption[] {
  const q = query.trim().toLocaleLowerCase("ru");
  if (!q) return options;
  return options.filter((item) =>
    item.name.toLocaleLowerCase("ru").includes(q),
  );
}
