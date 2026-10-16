/** Extract a human-readable message from Error, Postgrest, or plain `{ message }`. */
export function getErrorMessage(error: unknown, fallback = "Ошибка"): string {
  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed || fallback;
  }
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    return trimmed || fallback;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return fallback;
}

/** Friendly copy for known automation RPC / trigger failures. */
export function getAutomationErrorMessage(
  error: unknown,
  fallback = "Ошибка",
): string {
  const raw = getErrorMessage(error, fallback);
  if (raw.includes("AUTOMATION_ORDER")) {
    return "Сначала выполните предыдущие блокирующие задачи";
  }
  if (raw.includes("AUTOMATION_BLOCKED")) {
    return "Сначала выполните блокирующие задачи автоматизации";
  }
  if (/task is not pending/i.test(raw)) {
    return "Задача уже завершена или отменена";
  }
  if (/task not found/i.test(raw)) {
    return "Задача не найдена";
  }
  if (/outcome not found/i.test(raw)) {
    return "Не выбран результат";
  }
  if (/record not found/i.test(raw)) {
    return "Запись не найдена";
  }
  if (/could not find the function/i.test(raw) || /PGRST202/i.test(raw)) {
    return "На сервере нет функции завершения задачи. Примените миграции Supabase";
  }
  if (/column .*description.* does not exist/i.test(raw)) {
    return "На сервере нет поля description. Примените миграции Supabase";
  }
  return raw
    .replace(/^AUTOMATION_ORDER:\s*/i, "")
    .replace(/^AUTOMATION_BLOCKED:\s*/i, "");
}
