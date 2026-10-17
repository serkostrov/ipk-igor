import { createNotification } from "@/entities/notification";
import type { Entity } from "../model/types";
import {
  extractNewMentionedUserIds,
  listMentionableUsers,
} from "./record-mentions";

export type NotifyRecordMentionsInput = {
  entities: readonly Entity[];
  entityId: string;
  recordId: string;
  text: string;
  previousText?: string;
  /** Users-record id of the author — excluded from recipients. */
  authorId?: string | null;
  entityName?: string;
};

/**
 * Notify users newly mentioned via `@имя` in a records-tab note.
 * Uses auth user id when linked, otherwise the users-record id
 * (inbox listens to both).
 */
export async function notifyRecordMentions(
  input: NotifyRecordMentionsInput,
): Promise<void> {
  const users = listMentionableUsers(input.entities);
  const newIds = extractNewMentionedUserIds(
    input.previousText ?? "",
    input.text,
    users,
  );
  if (newIds.length === 0) return;

  const authorId = input.authorId?.trim() || null;
  const preview = input.text.trim().slice(0, 160);
  const where = input.entityName?.trim()
    ? `в «${input.entityName.trim()}»`
    : "в записи";

  await Promise.all(
    newIds.map(async (userId) => {
      if (authorId && userId === authorId) return;
      const user = users.find((item) => item.id === userId);
      if (!user) return;
      const recipientId = user.authUserId?.trim() || user.id;
      if (authorId && recipientId === authorId) return;
      try {
        await createNotification({
          userId: recipientId,
          title: "Вас упомянули",
          message: `Упоминание ${where}: ${preview}`,
          source: "action",
          entityId: input.entityId,
          recordId: input.recordId,
          showToast: true,
        });
      } catch (error: unknown) {
        console.error("[entity] mention notification failed", error);
      }
    }),
  );
}
