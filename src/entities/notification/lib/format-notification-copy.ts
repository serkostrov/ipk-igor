import type { Entity } from "@/entities/entity";
import { resolveStoredNotificationText } from "./render-template";

/**
 * Soft-clean awkward assignment copy in the inbox.
 *
 * Templates like «Вам назначена задача {{name}}» + name «Задача …»
 * produce «задача Задача …». Prefer the task/record name as the headline.
 */

function stripAssignedPrefix(text: string): string | null {
  const match =
    /^(?:вам\s+)?назначена\s+задача[:\s]+(.+)$/iu.exec(text.trim()) ??
    /^вам\s+назначено(?:\s+задание)?[:\s]+(.+)$/iu.exec(text.trim());
  const rest = match?.[1]?.trim();
  return rest ? rest : null;
}

function stripAssignedMessageNoise(message: string, taskTitle: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "Вам назначено";

  // «назначил Вам задачу Задача …» without actor → short status.
  const orphanAssign =
    /^(?:\s*)назначил(?:а|о|и)?\s+вам\s+задачу\s+(.+)$/iu.exec(trimmed);
  if (orphanAssign) {
    return "Вам назначено";
  }

  // Message repeats the same title after a status verb — keep status only.
  const withTitle =
    /^(.*?)\s+задачу\s+(.+)$/iu.exec(trimmed) ??
    /^(.*?):\s*(.+)$/u.exec(trimmed);
  if (withTitle) {
    const head = withTitle[1]?.trim() ?? "";
    const tail = withTitle[2]?.trim() ?? "";
    if (
      tail === taskTitle ||
      tail.toLocaleLowerCase("ru") === taskTitle.toLocaleLowerCase("ru")
    ) {
      if (!head || /^(назначил|назначила|назначили|назначило)$/iu.test(head)) {
        return "Вам назначено";
      }
      if (/назначил/iu.test(head)) return head;
      return head;
    }
  }

  if (trimmed === taskTitle) return "Вам назначено";
  return trimmed;
}

export function formatNotificationCopy(input: {
  title: string;
  message: string;
  entityId?: string | null;
  recordId?: string | null;
  entities?: readonly Entity[];
}): { title: string; message: string } {
  const resolveOpts = {
    entityId: input.entityId,
    recordId: input.recordId,
    entities: input.entities,
  };
  const rawTitle = resolveStoredNotificationText(input.title, resolveOpts);
  const rawMessage = resolveStoredNotificationText(input.message, resolveOpts);

  const fromTitle = stripAssignedPrefix(rawTitle);
  if (fromTitle) {
    return {
      title: fromTitle,
      message: stripAssignedMessageNoise(rawMessage, fromTitle),
    };
  }

  // Legacy automation defaults: title «Назначена задача», message «Назначена задача: …».
  if (/^назначена задача$/iu.test(rawTitle)) {
    const fromMessage = stripAssignedPrefix(rawMessage);
    if (fromMessage) {
      return { title: fromMessage, message: "Вам назначено" };
    }
  }

  if (/^завершена задача$/iu.test(rawTitle)) {
    const fromMessage =
      /^завершена задача[:\s]+(.+)$/iu.exec(rawMessage)?.[1]?.trim() ?? null;
    if (fromMessage) {
      return { title: fromMessage, message: "Задание выполнено" };
    }
  }

  if (/^просрочена задача$/iu.test(rawTitle)) {
    const fromMessage =
      /^просрочена задача[:\s]+(.+)$/iu.exec(rawMessage)?.[1]?.trim() ?? null;
    if (fromMessage) {
      return { title: fromMessage, message: "Просрочено" };
    }
  }

  return {
    title: rawTitle || "Уведомление",
    message: rawMessage,
  };
}
